import { posix } from "node:path";

import {
  buildImportedMarketMetadata,
  serializeImportedMarketMetadata,
} from "@/lib/data/datasets/registry/buildImportedMarketMetadata";
import { runHistoricalImportFromConfig } from "@/lib/data/importJobs";
import { serializeHistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";
import { resolveSeriesTicker } from "@/lib/data/audit/settlementTrace/settlementTraceUtils";
import { resolveEventTickerFromMarketTicker } from "@/lib/data/research/quoteFidelityGate/resolveEventTickerFromMarketTicker";
import type { CapturedMarketInventoryEntry } from "@/lib/data/research/forwardSettlementCoverage/forwardSettlementCoverageTypes";
import {
  createForwardSettlementBackfillCheckpoint,
  isCheckpointMarketEligible,
  loadForwardSettlementBackfillCheckpoint,
  mergeCheckpointWithMarkets,
  serializeForwardSettlementBackfillCheckpoint,
  updateCheckpointMarket,
} from "@/lib/data/research/forwardSettlementCoverage/checkpointForwardSettlementBackfill";
import {
  classifyBackfillErrorCategory,
  isBackfillErrorRetryable,
} from "@/lib/data/research/forwardSettlementCoverage/reconcileForwardSettlementCoverage";
import {
  buildCaptureMarketImportConfig,
  resolveMarketImportPaths,
} from "@/lib/data/research/forwardSettlementCoverage/buildCaptureMarketImportConfig";
import type { ForwardSettlementBackfillCheckpoint } from "@/lib/data/research/forwardSettlementCoverage/forwardSettlementCoverageTypes";
import { FORWARD_SETTLEMENT_BACKFILL_IMPLEMENTATION_VERSION } from "@/lib/data/research/forwardSettlementCoverage/forwardSettlementCoverageTypes";
import type { ForwardSettlementCoverageIo } from "@/lib/data/research/forwardSettlementCoverage/forwardSettlementCoverageTypes";

import { extractLabelFromImportResult, toSettlementLabelRecord } from "./extractLabelFromImport";
import {
  scanLocalSettlementLabels,
  tickersNeedingFetch,
  type LocalLabelScanResult,
} from "./scanLocalLabels";
import {
  SettlementFrictionLabelBackfillError,
  syntheticManifestCaptureRunDir,
  type EnrichedSettlementLabel,
  type TickerManifest,
} from "./types";

const DEFAULT_SLEEP = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export type LabelBackfillConfig = {
  importsDir: string;
  checkpointPath: string;
  dryRun: boolean;
  concurrency: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  limit?: number;
};

export type LabelBackfillPlan = {
  tickerManifestIdentity: string;
  targetTickerCount: number;
  localComplete: number;
  localPartial: number;
  localMissing: number;
  localConflicting: number;
  plannedFetchCount: number;
  plannedFetchTickers: string[];
  importsDir: string;
  checkpointPath: string;
  syntheticCaptureRunDir: string;
};

export type LabelBackfillSummary = {
  plan: LabelBackfillPlan;
  fetched: number;
  skippedComplete: number;
  skippedConflict: number;
  failed: number;
  dryRunPlanned: number;
  labels: EnrichedSettlementLabel[];
  unresolvedReasons: Record<string, number>;
  sourceCounts: {
    localImport: number;
    fetchedSettlementOnly: number;
    absent: number;
  };
};

function inventoryFromManifestEntry(
  entry: TickerManifest["tickers"][number],
): CapturedMarketInventoryEntry {
  const seriesTicker = resolveSeriesTicker(entry.marketTicker);
  return {
    marketTicker: entry.marketTicker,
    seriesTicker,
    firstObservedAt: new Date(entry.firstEntryTimestampMs).toISOString(),
    lastObservedAt: new Date(entry.lastEntryTimestampMs).toISOString(),
    marketCloseTime: null,
    observationCount: entry.sampleCount,
    expectedSettlementAvailability: "available",
    eventTicker: resolveEventTickerFromMarketTicker(entry.marketTicker),
    sourceArtifacts: [`ticker-manifest:${entry.marketTicker}`],
  };
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workerCount = Math.min(Math.max(1, concurrency), queue.length || 1);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    }),
  );
}

export function buildLabelBackfillPlan(input: {
  manifest: TickerManifest;
  scan: LocalLabelScanResult;
  config: LabelBackfillConfig;
}): LabelBackfillPlan {
  const conflictTickers = new Set(input.scan.conflicts.map((c) => c.marketTicker));
  let planned = tickersNeedingFetch(input.scan, conflictTickers);
  if (input.config.limit != null && input.config.limit >= 0) {
    planned = planned.slice(0, input.config.limit);
  }
  return {
    tickerManifestIdentity: input.manifest.tickerManifestIdentity,
    targetTickerCount: input.manifest.distinctTickers,
    localComplete: input.scan.complete,
    localPartial: input.scan.partial,
    localMissing: input.scan.missing,
    localConflicting: input.scan.conflicting,
    plannedFetchCount: planned.length,
    plannedFetchTickers: planned,
    importsDir: input.config.importsDir,
    checkpointPath: input.config.checkpointPath,
    syntheticCaptureRunDir: syntheticManifestCaptureRunDir(
      input.manifest.tickerManifestIdentity,
    ),
  };
}

function assertCheckpointMatchesManifest(input: {
  checkpoint: ForwardSettlementBackfillCheckpoint;
  manifest: TickerManifest;
  importsDir: string;
  dryRun: boolean;
}): void {
  const expectedDir = syntheticManifestCaptureRunDir(input.manifest.tickerManifestIdentity);
  if (input.checkpoint.captureRunDir !== expectedDir) {
    throw new SettlementFrictionLabelBackfillError(
      `Checkpoint captureRunDir mismatch: got ${input.checkpoint.captureRunDir}, `
        + `expected ${expectedDir} (ticker-manifest identity binding)`,
    );
  }
  if (input.checkpoint.importsDir !== input.importsDir) {
    throw new SettlementFrictionLabelBackfillError(
      `Checkpoint importsDir mismatch: got ${input.checkpoint.importsDir}, `
        + `expected ${input.importsDir}`,
    );
  }
  if (input.checkpoint.dryRun !== input.dryRun) {
    throw new SettlementFrictionLabelBackfillError(
      `Checkpoint dryRun mismatch: got ${input.checkpoint.dryRun}, expected ${input.dryRun}`,
    );
  }
  if (
    input.checkpoint.implementationVersion
    !== FORWARD_SETTLEMENT_BACKFILL_IMPLEMENTATION_VERSION
  ) {
    throw new SettlementFrictionLabelBackfillError(
      "Checkpoint implementation version is stale; refuse resume",
    );
  }
}

export async function runSettlementFrictionLabelBackfill(input: {
  manifest: TickerManifest;
  config: LabelBackfillConfig;
  io: ForwardSettlementCoverageIo;
  evaluatedAt: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<LabelBackfillSummary> {
  const scan = scanLocalSettlementLabels({
    manifest: input.manifest,
    deps: {
      fileExists: input.io.fileExists,
      readFile: input.io.readFile,
    },
    importRoots: [input.config.importsDir, "data/imports"],
  });
  const plan = buildLabelBackfillPlan({
    manifest: input.manifest,
    scan,
    config: input.config,
  });

  const syntheticCaptureRunDir = plan.syntheticCaptureRunDir;
  const existingCheckpoint = loadForwardSettlementBackfillCheckpoint({
    readFile: input.io.readFile,
    fileExists: input.io.fileExists,
    checkpointPath: input.config.checkpointPath,
  });
  if (existingCheckpoint) {
    assertCheckpointMatchesManifest({
      checkpoint: existingCheckpoint,
      manifest: input.manifest,
      importsDir: input.config.importsDir,
      dryRun: input.config.dryRun,
    });
  }
  let checkpoint =
    existingCheckpoint
    ?? createForwardSettlementBackfillCheckpoint({
      captureRunDir: syntheticCaptureRunDir,
      selectedRunId: input.manifest.tickerManifestIdentity,
      importsDir: input.config.importsDir,
      dryRun: input.config.dryRun,
      startedAt: input.evaluatedAt,
      marketTickers: input.manifest.tickers.map((t) => t.marketTicker),
    });

  checkpoint = mergeCheckpointWithMarkets(
    checkpoint,
    input.manifest.tickers.map((t) => t.marketTicker),
    input.evaluatedAt,
  );

  const writeCheckpoint = (() => {
    let chain: Promise<void> = Promise.resolve();
    return (next: ForwardSettlementBackfillCheckpoint) => {
      checkpoint = next;
      const run = chain.then(() => {
        if (!input.io.writeFile || !input.io.mkdirSync) {
          throw new SettlementFrictionLabelBackfillError("Filesystem writes required");
        }
        input.io.mkdirSync(posix.dirname(input.config.checkpointPath), { recursive: true });
        input.io.writeFile(
          input.config.checkpointPath,
          serializeForwardSettlementBackfillCheckpoint(next),
        );
      });
      chain = run.catch(() => undefined);
      return run;
    };
  })();
  await writeCheckpoint(checkpoint);

  const withCheckpointLock = (() => {
    let chain: Promise<unknown> = Promise.resolve();
    return async <T>(fn: () => T | Promise<T>): Promise<T> => {
      const run = chain.then(fn);
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run as Promise<T>;
    };
  })();

  const conflictTickers = new Set(scan.conflicts.map((c) => c.marketTicker));
  const byTicker = new Map(input.manifest.tickers.map((t) => [t.marketTicker, t]));

  /**
   * Reuse SETTLEMENT_ONLY import config + historical import runner.
   * Completeness for this study may exceed "settlement-ready", so we do not
   * inherit the forward-settlement skip-ready gate.
   */
  const runImport = async (market: CapturedMarketInventoryEntry) => {
    const paths = resolveMarketImportPaths({
      importsDir: input.config.importsDir,
      market,
    });
    if (input.io.fileExists(paths.importResultPath)) {
      const existing = extractLabelFromImportResult({
        marketTicker: market.marketTicker,
        importResultRaw: JSON.parse(input.io.readFile(paths.importResultPath)),
        source: "local-import",
        importResultPath: paths.importResultPath,
      });
      if (existing.completeness === "complete") {
        return { success: true as const, skipped: true as const };
      }
    }

    const config = buildCaptureMarketImportConfig({
      market,
      evaluatedAt: input.evaluatedAt,
    });
    const importResult = await runHistoricalImportFromConfig({
      config,
      fetchImpl: input.fetchImpl,
    });

    if (!input.io.writeFile || !input.io.mkdirSync) {
      throw new SettlementFrictionLabelBackfillError("Filesystem writes required");
    }
    input.io.mkdirSync(posix.dirname(paths.configPath), { recursive: true });
    input.io.writeFile(paths.configPath, serializeHistoricalBronzeImportConfig(config));
    input.io.writeFile(paths.importResultPath, importResult.serialized);
    input.io.writeFile(
      posix.join(posix.dirname(paths.importResultPath), "metadata.json"),
      serializeImportedMarketMetadata(
        buildImportedMarketMetadata({
          config,
          importResult,
        }),
      ),
    );

    return {
      success: importResult.metadata.valid !== false,
      errorMessage:
        importResult.metadata.valid === false
          ? "import validation failed"
          : undefined,
    };
  };

  let fetched = 0;
  let skippedComplete = 0;
  let skippedConflict = 0;
  let failed = 0;
  let dryRunPlanned = 0;
  const sleep = input.sleep ?? DEFAULT_SLEEP;
  const unresolvedReasons: Record<string, number> = {};

  const bumpReason = (reason: string) => {
    unresolvedReasons[reason] = (unresolvedReasons[reason] ?? 0) + 1;
  };

  const fetchTargets = plan.plannedFetchTickers;

  await runWithConcurrency(fetchTargets, input.config.concurrency, async (marketTicker) => {
    const entry = byTicker.get(marketTicker);
    if (!entry) return;
    const inventory = inventoryFromManifestEntry(entry);

    await withCheckpointLock(async () => {
      const existingCp = checkpoint.markets.find((m) => m.marketTicker === marketTicker);

      if (conflictTickers.has(marketTicker)) {
        skippedConflict += 1;
        bumpReason("local-conflict");
        await writeCheckpoint(
          updateCheckpointMarket(
            checkpoint,
            {
              marketTicker,
              status: "skipped-conflict",
              attempts: existingCp?.attempts ?? 0,
              lastAttemptAt: input.evaluatedAt,
              nextEligibleRetryAt: null,
              errorMessage: "conflicting local official records",
              errorCategory: null,
              importResultPath: null,
            },
            input.evaluatedAt,
          ),
        );
        return "done" as const;
      }

      const local = scan.byTicker.get(marketTicker);
      if (local?.completeness === "complete") {
        skippedComplete += 1;
        await writeCheckpoint(
          updateCheckpointMarket(
            checkpoint,
            {
              marketTicker,
              status: "skipped-ready",
              attempts: existingCp?.attempts ?? 0,
              lastAttemptAt: input.evaluatedAt,
              nextEligibleRetryAt: null,
              errorMessage: null,
              errorCategory: null,
              importResultPath: local.importResultPath,
            },
            input.evaluatedAt,
          ),
        );
        return "done" as const;
      }

      if (
        existingCp
        && !isCheckpointMarketEligible(existingCp, input.evaluatedAt, checkpoint)
        && (existingCp.status === "imported" || existingCp.status === "skipped-ready")
      ) {
        skippedComplete += 1;
        return "done" as const;
      }

      if (input.config.dryRun) {
        dryRunPlanned += 1;
        const paths = resolveMarketImportPaths({
          importsDir: input.config.importsDir,
          market: inventory,
        });
        buildCaptureMarketImportConfig({ market: inventory, evaluatedAt: input.evaluatedAt });
        await writeCheckpoint(
          updateCheckpointMarket(
            checkpoint,
            {
              marketTicker,
              status: "dry-run-planned",
              attempts: (existingCp?.attempts ?? 0) + 1,
              lastAttemptAt: input.evaluatedAt,
              nextEligibleRetryAt: null,
              errorMessage: null,
              errorCategory: null,
              importResultPath: paths.importResultPath,
            },
            input.evaluatedAt,
          ),
        );
        return "done" as const;
      }

      return {
        kind: "fetch" as const,
        attempts: existingCp?.attempts ?? 0,
        resetAttempts:
          existingCp?.status === "failed"
          && isCheckpointMarketEligible(existingCp, input.evaluatedAt, checkpoint),
      };
    }).then(async (gate) => {
      if (gate === "done" || gate == null) return;
      let attempts = gate.resetAttempts ? 0 : gate.attempts;
      let lastError: string | null = null;
      const paths = resolveMarketImportPaths({
        importsDir: input.config.importsDir,
        market: inventory,
      });

      while (attempts < input.config.maxRetries) {
        attempts += 1;
        try {
          const outcome = await runImport(inventory);
          if (outcome.skipped) {
            skippedComplete += 1;
            await withCheckpointLock(async () => {
              await writeCheckpoint(
                updateCheckpointMarket(
                  checkpoint,
                  {
                    marketTicker,
                    status: "skipped-ready",
                    attempts,
                    lastAttemptAt: input.evaluatedAt,
                    nextEligibleRetryAt: null,
                    errorMessage: null,
                    errorCategory: null,
                    importResultPath: paths.importResultPath,
                  },
                  input.evaluatedAt,
                ),
              );
            });
            return;
          }
          if (!outcome.success) {
            lastError = outcome.errorMessage ?? "import failed";
            const errorCategory = classifyBackfillErrorCategory(lastError);
            if (
              !isBackfillErrorRetryable({ errorMessage: lastError, errorCategory })
            ) {
              break;
            }
            if (attempts < input.config.maxRetries) {
              await sleep(input.config.retryBaseDelayMs * attempts);
              continue;
            }
            break;
          }
          fetched += 1;
          await withCheckpointLock(async () => {
            await writeCheckpoint(
              updateCheckpointMarket(
                checkpoint,
                {
                  marketTicker,
                  status: "imported",
                  attempts,
                  lastAttemptAt: input.evaluatedAt,
                  nextEligibleRetryAt: null,
                  errorMessage: null,
                  errorCategory: null,
                  importResultPath: paths.importResultPath,
                },
                input.evaluatedAt,
              ),
            );
          });
          return;
        } catch (error) {
          lastError = error instanceof Error ? error.message : "import failed";
          const errorCategory = classifyBackfillErrorCategory(lastError);
          if (
            !isBackfillErrorRetryable({ errorMessage: lastError, errorCategory })
          ) {
            break;
          }
          if (attempts < input.config.maxRetries) {
            await sleep(input.config.retryBaseDelayMs * attempts);
          }
        }
      }

      failed += 1;
      const errorCategory = classifyBackfillErrorCategory(lastError);
      bumpReason(errorCategory ?? "unknown");
      const retryable = isBackfillErrorRetryable({
        errorMessage: lastError,
        errorCategory,
      });
      await withCheckpointLock(async () => {
        await writeCheckpoint(
          updateCheckpointMarket(
            checkpoint,
            {
              marketTicker,
              status: "failed",
              attempts,
              lastAttemptAt: input.evaluatedAt,
              nextEligibleRetryAt: retryable
                ? new Date(
                    Date.parse(input.evaluatedAt)
                      + input.config.retryBaseDelayMs * attempts,
                  ).toISOString()
                : null,
              errorMessage: lastError,
              errorCategory,
              importResultPath: paths.importResultPath,
            },
            input.evaluatedAt,
          ),
        );
      });
    });
  });

  // Re-scan after fetches for final labels
  const finalScan = scanLocalSettlementLabels({
    manifest: input.manifest,
    deps: {
      fileExists: input.io.fileExists,
      readFile: input.io.readFile,
    },
    importRoots: [input.config.importsDir, "data/imports"],
  });

  const labels: EnrichedSettlementLabel[] = [];
  let localImport = 0;
  let fetchedSettlementOnly = 0;
  let absent = 0;
  const normalizedImportsDir = input.config.importsDir.replace(/\\/g, "/");

  for (const entry of input.manifest.tickers) {
    const label = finalScan.byTicker.get(entry.marketTicker)
      ?? extractLabelFromImportResult({
        marketTicker: entry.marketTicker,
        importResultRaw: null,
        source: "absent",
        importResultPath: null,
      });

    if (label.completeness === "missing") {
      absent += 1;
      bumpReason("still-missing");
      labels.push(label);
      continue;
    }

    const path = (label.importResultPath ?? "").replace(/\\/g, "/");
    const cp = checkpoint.markets.find((m) => m.marketTicker === entry.marketTicker);
    if (cp?.status === "imported" || path.includes(normalizedImportsDir)) {
      if (cp?.status === "imported") {
        fetchedSettlementOnly += 1;
        labels.push({ ...label, source: "fetched-settlement-only-import" });
      } else {
        localImport += 1;
        labels.push(label);
      }
    } else if (label.source === "local-import") {
      localImport += 1;
      labels.push(label);
    } else {
      fetchedSettlementOnly += 1;
      labels.push({ ...label, source: "fetched-settlement-only-import" });
    }
  }

  return {
    plan,
    fetched,
    skippedComplete,
    skippedConflict,
    failed,
    dryRunPlanned,
    labels,
    unresolvedReasons,
    sourceCounts: {
      localImport,
      fetchedSettlementOnly,
      absent,
    },
  };
}

export function exportLabelsFromSummary(
  summary: LabelBackfillSummary,
): import("@/lib/data/research/settlementFrictionCoverage").SettlementLabelRecord[] {
  return summary.labels
    .map(toSettlementLabelRecord)
    .filter(
      (row): row is NonNullable<ReturnType<typeof toSettlementLabelRecord>> => row != null,
    );
}
