import { posix } from "node:path";

import {
  buildImportedMarketMetadata,
  serializeImportedMarketMetadata,
} from "@/lib/data/datasets/registry";
import {
  BATCH_IMPORT_CONFIG_FILENAME,
  BATCH_IMPORT_METADATA_FILENAME,
} from "@/lib/data/importJobs/batchImport/batchImportTypes";
import { parseHistoricalExpansionImportConfigJson } from "@/lib/data/importJobs/expansionConfig";
import type { HistoricalExpansionImportJob } from "@/lib/data/importJobs/expansionConfig";
import {
  buildKalshiMarketDebugArtifactPath,
  buildKalshiMarketParseDiagnostic,
  findMissingKalshiMarketWireFields,
  saveKalshiMarketDebugArtifact,
} from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import { mergeKalshiMarketWireFromListDetail } from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";
import type { HistoricalImportProvenance } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import { buildHistoricalMarketPath } from "@/lib/data/importers/kalshi/historicalEndpoints";

import { buildExpansionMarketImportArtifacts } from "./buildExpansionMarketImportConfig";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import { resolveSeriesTickerFromMarketTicker } from "./fetchSingleMarketExpansionPayloads";
import type {
  RunSingleMarketExpansionImportDebugInput,
  SingleMarketExpansionImportDebugExpirationValueSource,
  SingleMarketExpansionImportDebugImportStatus,
  SingleMarketExpansionImportDebugReport,
  SingleMarketPayloadAvailability,
} from "./singleMarketExpansionImportDebugTypes";
import {
  SingleMarketExpansionImportDebugError,
  SingleMarketExpansionImportDebugErrorCode,
} from "./singleMarketExpansionImportDebugTypes";

function compareJobs(
  left: HistoricalExpansionImportJob,
  right: HistoricalExpansionImportJob,
): number {
  const byPriority = left.priority - right.priority;
  if (byPriority !== 0) {
    return byPriority;
  }

  return left.jobId.localeCompare(right.jobId);
}

function resolveExpansionJob(
  jobs: readonly HistoricalExpansionImportJob[],
  seriesTicker: string,
  jobIdFilter: string | null,
): HistoricalExpansionImportJob | null {
  let candidates = jobs.filter(
    (job) => job.status === "scheduled" && job.seriesTicker === seriesTicker,
  );

  if (jobIdFilter) {
    candidates = candidates.filter((job) => job.jobId === jobIdFilter);
  }

  return candidates.sort(compareJobs)[0] ?? null;
}

function buildPayloadAvailability(input: {
  wire: KalshiMarketWireShape | null;
  requestPath: string | null;
  unavailableReason: string | null;
}): SingleMarketPayloadAvailability {
  return {
    available: input.wire !== null,
    requestPath: input.requestPath,
    missingRequiredFields: input.wire
      ? findMissingKalshiMarketWireFields(input.wire)
      : [],
    unavailableReason: input.unavailableReason,
  };
}

function resolveExpirationValueSource(input: {
  detailWire: KalshiMarketWireShape | null;
  reconciliationMergedFields: readonly string[];
}): SingleMarketExpansionImportDebugExpirationValueSource {
  if (input.detailWire?.expiration_value?.trim()) {
    return "detail";
  }

  if (input.reconciliationMergedFields.includes("expiration_value")) {
    return "reconciled-from-list";
  }

  return "missing";
}

function buildDiscoveredMarket(input: {
  marketTicker: string;
  listWire: KalshiMarketWireShape | null;
  detailWire: KalshiMarketWireShape | null;
  listProvenance: HistoricalImportProvenance | null;
  generatedAt: string;
}): ExpansionDiscoveredMarket | null {
  const wire = input.listWire ?? input.detailWire;
  if (!wire?.ticker?.trim()) {
    return null;
  }

  const provenance = input.listProvenance ?? {
    source: "kalshi-historical-api",
    fetchedAt: input.generatedAt,
    requestPath: buildHistoricalMarketPath(input.marketTicker),
  };

  return {
    marketTicker: wire.ticker.trim(),
    seriesTicker:
      wire.series_ticker?.trim() || resolveSeriesTickerFromMarketTicker(wire.ticker),
    eventTicker: wire.event_ticker?.trim() ?? "",
    status: wire.status?.trim().toLowerCase() ?? "",
    openTime: wire.open_time ?? null,
    closeTime: wire.close_time ?? null,
    settlementTime: wire.settlement_ts ?? null,
    expirationValue: wire.expiration_value?.trim() ?? null,
    title: wire.title ?? null,
    subtitle: wire.subtitle ?? null,
    listMarketWire: input.listWire ?? wire,
    provenance,
  };
}

function maybePersistDebugArtifact(input: {
  marketTicker: string;
  endpoint: string;
  requestPath: string;
  httpStatus: number;
  body: unknown;
  missingRequiredFields: readonly string[];
  io: RunSingleMarketExpansionImportDebugInput["io"];
  debugArtifactPaths: string[];
}): void {
  const debugArtifactPath = buildKalshiMarketDebugArtifactPath(input.marketTicker);
  const diagnostic = buildKalshiMarketParseDiagnostic({
    ticker: input.marketTicker,
    endpoint: input.endpoint,
    requestContext: `GET ${input.requestPath}`,
    httpStatus: input.httpStatus,
    body: input.body,
    missingRequiredFields: input.missingRequiredFields,
    debugArtifactPath,
  });

  const savedPath = saveKalshiMarketDebugArtifact({
    ticker: input.marketTicker,
    diagnostic,
    writeFile: input.io.writeFile,
    mkdirSync: input.io.mkdirSync,
  });
  input.debugArtifactPaths.push(savedPath);
}

/** Runs a focused single-market expansion import smoke/debug path without full-window discovery. */
export async function runSingleMarketExpansionImportDebug(
  input: RunSingleMarketExpansionImportDebugInput,
): Promise<SingleMarketExpansionImportDebugReport> {
  const startedAtMs = Date.now();
  const marketTicker = input.config.marketTicker.trim();
  if (!marketTicker) {
    throw new SingleMarketExpansionImportDebugError(
      "Missing market ticker",
      SingleMarketExpansionImportDebugErrorCode.INVALID_MARKET_TICKER,
    );
  }

  const seriesTicker = resolveSeriesTickerFromMarketTicker(marketTicker);
  const manifest = parseHistoricalExpansionImportConfigJson(
    input.config.inputPath,
    input.expansionConfigJson,
  );
  const job = resolveExpansionJob(manifest.jobs, seriesTicker, input.config.jobId);
  if (!job) {
    throw new SingleMarketExpansionImportDebugError(
      `No scheduled expansion job found for series ${seriesTicker}`,
      SingleMarketExpansionImportDebugErrorCode.JOB_NOT_FOUND,
    );
  }

  const debugArtifactPaths: string[] = [];
  const listFetch = await input.deps.fetchListMarketWire({
    marketTicker,
    seriesTicker,
  });
  const detailFetch = await input.deps.fetchDetailMarketWire(marketTicker);

  const listPayload = buildPayloadAvailability({
    wire: listFetch.wire,
    requestPath: listFetch.requestPath,
    unavailableReason: listFetch.unavailableReason,
  });
  const detailPayload = buildPayloadAvailability({
    wire: detailFetch.wire,
    requestPath: detailFetch.requestPath,
    unavailableReason: detailFetch.unavailableReason,
  });

  const reconciliation = detailFetch.wire
    ? mergeKalshiMarketWireFromListDetail({
        listMarket: listFetch.wire,
        detailMarket: detailFetch.wire,
      })
    : {
        mergedWire: listFetch.wire ?? {},
        mergedFields: [],
        detailMissingRequiredFields: [],
        listMissingRequiredFields: listFetch.wire
          ? findMissingKalshiMarketWireFields(listFetch.wire)
          : [],
      };

  const mergedMissingRequiredFields = findMissingKalshiMarketWireFields(
    reconciliation.mergedWire,
  );
  const reconciliationSuccess = mergedMissingRequiredFields.length === 0;
  const expirationValueSource = resolveExpirationValueSource({
    detailWire: detailFetch.wire,
    reconciliationMergedFields: reconciliation.mergedFields,
  });

  if (
    detailFetch.wire
    && !reconciliationSuccess
    && input.config.execute
  ) {
    maybePersistDebugArtifact({
      marketTicker,
      endpoint: detailFetch.requestPath,
      requestPath: detailFetch.requestPath,
      httpStatus: detailFetch.httpStatus,
      body: {
        market: reconciliation.mergedWire,
        detailMarket: detailFetch.wire,
        listMarket: listFetch.wire,
        mergedFields: reconciliation.mergedFields,
      },
      missingRequiredFields: mergedMissingRequiredFields,
      io: input.io,
      debugArtifactPaths,
    });
  }

  let importStatus: SingleMarketExpansionImportDebugImportStatus = "skipped";
  let failureReason: string | null = null;
  let configPath: string | null = null;
  let importResultPath: string | null = null;

  if (!detailFetch.wire && !listFetch.wire) {
    failureReason = "Both list and detail payloads are unavailable";
  } else if (!reconciliationSuccess) {
    failureReason = `Schema reconciliation failed: missing ${mergedMissingRequiredFields.join(", ")}`;
  } else {
    const discoveredMarket = buildDiscoveredMarket({
      marketTicker,
      listWire: listFetch.wire,
      detailWire: detailFetch.wire,
      listProvenance: listFetch.provenance,
      generatedAt: input.generatedAt,
    });

    if (!discoveredMarket?.openTime || !discoveredMarket.closeTime) {
      importStatus = "skipped";
      failureReason = "Discovered market is missing openTime or closeTime";
    } else {
      const artifacts = buildExpansionMarketImportArtifacts(job, discoveredMarket, {
        importConfigsDir: input.config.importConfigsDir,
        importsDir: input.config.importsDir,
      });
      configPath = artifacts.configPath;
      importResultPath = artifacts.importResultPath;

      if (!input.config.execute) {
        importStatus = "planned";
      } else {
        try {
          const importResult = await input.deps.runImport(artifacts.config);
          const importDir = posix.dirname(artifacts.importResultPath);

          input.io.mkdirSync(posix.dirname(artifacts.configPath), { recursive: true });
          input.io.mkdirSync(importDir, { recursive: true });
          input.io.writeFile(artifacts.configPath, artifacts.serializedConfig);
          input.io.writeFile(artifacts.importResultPath, importResult.serialized);
          input.io.writeFile(
            posix.join(importDir, BATCH_IMPORT_METADATA_FILENAME),
            serializeImportedMarketMetadata(
              buildImportedMarketMetadata({
                config: artifacts.config,
                importResult,
              }),
            ),
          );
          input.io.writeFile(
            posix.join(importDir, BATCH_IMPORT_CONFIG_FILENAME),
            artifacts.serializedConfig,
          );

          importStatus = "imported";
        } catch (error) {
          importStatus = "failed";
          failureReason = error instanceof Error ? error.message : "Import failed";
        }
      }
    }
  }

  return {
    generatedAt: input.generatedAt,
    marketTicker,
    seriesTicker,
    execute: input.config.execute,
    inputPath: input.config.inputPath,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    jobId: job.jobId,
    listPayload,
    detailPayload,
    expirationValueSource,
    reconciliation: {
      success: reconciliationSuccess,
      mergedFields: reconciliation.mergedFields,
      mergedMissingRequiredFields,
      detailMissingRequiredFields: reconciliation.detailMissingRequiredFields,
      listMissingRequiredFields: reconciliation.listMissingRequiredFields,
    },
    importStatus,
    failureReason,
    debugArtifactPaths,
    configPath,
    importResultPath,
    durationMs: Date.now() - startedAtMs,
  };
}

export function serializeSingleMarketExpansionImportDebugReport(
  report: SingleMarketExpansionImportDebugReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
