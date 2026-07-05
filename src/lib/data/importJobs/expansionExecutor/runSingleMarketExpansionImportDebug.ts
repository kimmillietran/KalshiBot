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
import { readKalshiDiscoveryListMarketFromMetadata } from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";

import { buildExpansionMarketImportArtifacts } from "./buildExpansionMarketImportConfig";
import { evaluateExpansionMarketSchemaReconciliation } from "./evaluateExpansionMarketSchemaReconciliation";
import { resolveSeriesTickerFromMarketTicker } from "./fetchSingleMarketExpansionPayloads";
import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import type {
  RunSingleMarketExpansionImportDebugInput,
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
  const discoveryResult = await input.deps.discoverMarket({
    marketTicker,
    seriesTicker,
  });
  const detailFetch = await input.deps.fetchDetailMarketWire(marketTicker);
  const discoveredMarket: ExpansionDiscoveredMarket | null = discoveryResult?.market ?? null;
  const listMarketWire = discoveredMarket?.listMarketWire ?? null;

  const listPayload = buildPayloadAvailability({
    wire: listMarketWire,
    requestPath: discoveredMarket?.provenance.requestPath ?? null,
    unavailableReason: discoveredMarket
      ? null
      : "Market not found in discovery list pages",
  });
  const detailPayload = buildPayloadAvailability({
    wire: detailFetch.wire,
    requestPath: detailFetch.requestPath,
    unavailableReason: detailFetch.unavailableReason,
  });

  const reconciliationEvaluation = evaluateExpansionMarketSchemaReconciliation({
    listMarketWire,
    detailMarketWire: detailFetch.wire,
  });
  const {
    reconciliation,
    mergedMissingRequiredFields,
    reconciliationSuccess,
    expirationValueSource,
  } = reconciliationEvaluation;

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
        listMarket: listMarketWire,
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

  if (!detailFetch.wire && !listMarketWire) {
    failureReason = "Both list and detail payloads are unavailable";
  } else if (!reconciliationSuccess) {
    failureReason = `Schema reconciliation failed: missing ${mergedMissingRequiredFields.join(", ")}`;
  } else if (!discoveredMarket) {
    failureReason = "Discovery list payload is unavailable";
  } else if (!discoveredMarket.openTime || !discoveredMarket.closeTime) {
    importStatus = "skipped";
    failureReason = "Discovered market is missing openTime or closeTime";
  } else {
    const artifacts = buildExpansionMarketImportArtifacts(job, discoveredMarket, {
      importConfigsDir: input.config.importConfigsDir,
      importsDir: input.config.importsDir,
    });
    configPath = artifacts.configPath;
    importResultPath = artifacts.importResultPath;

    const metadataListWire = readKalshiDiscoveryListMarketFromMetadata(
      artifacts.config.metadata,
    );
    if (!metadataListWire?.expiration_value?.trim() && listMarketWire?.expiration_value?.trim()) {
      failureReason = "Import config metadata dropped discovery list payload";
      importStatus = "skipped";
    } else if (!input.config.execute) {
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

  return {
    generatedAt: input.generatedAt,
    marketTicker,
    seriesTicker,
    execute: input.config.execute,
    inputPath: input.config.inputPath,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    jobId: job.jobId,
    discoveryPagesFetched: discoveryResult?.pagesFetched ?? 0,
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
