import { posix } from "node:path";

import {
  buildImportedMarketMetadata,
  serializeImportedMarketMetadata,
} from "@/lib/data/datasets/registry/buildImportedMarketMetadata";
import { runHistoricalImportFromConfig } from "@/lib/data/importJobs";
import { serializeHistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";

import {
  classifyMarketSettlementCoverage,
  isBackfillCandidate,
} from "./classifyMarketSettlementCoverage";
import {
  buildCaptureMarketImportConfig,
  resolveMarketImportPaths,
} from "./buildCaptureMarketImportConfig";
import {
  createForwardSettlementBackfillCheckpoint,
  isCheckpointMarketEligible,
  loadForwardSettlementBackfillCheckpoint,
  mergeCheckpointWithMarkets,
  serializeForwardSettlementBackfillCheckpoint,
  updateCheckpointMarket,
} from "./checkpointForwardSettlementBackfill";
import type {
  BackfillMarketStatus,
  ForwardSettlementBackfillCheckpoint,
  ForwardSettlementBackfillCheckpointMarket,
  ForwardSettlementBackfillDeps,
  ForwardSettlementBackfillMarketResult,
  ForwardSettlementBackfillSummary,
  ForwardSettlementCoverageConfig,
  ForwardSettlementCoverageIo,
  MarketSettlementCoverageEntry,
} from "./forwardSettlementCoverageTypes";

const DEFAULT_SLEEP = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

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
        if (item === undefined) {
          return;
        }

        await worker(item);
      }
    }),
  );
}

function shouldSkipBackfill(
  market: MarketSettlementCoverageEntry,
): BackfillMarketStatus | null {
  if (market.classification === "settlement-ready") {
    return "skipped-ready";
  }

  if (market.classification === "market-not-yet-settled") {
    return "skipped-unsettled";
  }

  if (market.classification === "settlement-present-but-conflicting") {
    return "skipped-conflict";
  }

  if (!isBackfillCandidate(market.classification)) {
    return "skipped-not-candidate";
  }

  return null;
}

function checkpointTerminalStatusStillApplies(input: {
  entry: ForwardSettlementBackfillCheckpointMarket;
  market: MarketSettlementCoverageEntry;
  evaluatedAt: string;
}): boolean {
  if (input.entry.status === "failed") {
    return !isCheckpointMarketEligible(input.entry, input.evaluatedAt);
  }

  if (isBackfillCandidate(input.market.classification)) {
    return false;
  }

  if (input.entry.status === "imported" || input.entry.status === "skipped-ready") {
    return input.market.classification === "settlement-ready";
  }

  if (input.entry.status === "skipped-unsettled") {
    return input.market.classification === "market-not-yet-settled";
  }

  if (input.entry.status === "skipped-conflict") {
    return input.market.classification === "settlement-present-but-conflicting";
  }

  if (input.entry.status === "skipped-not-candidate") {
    return !isBackfillCandidate(input.market.classification);
  }

  return true;
}

async function backfillOneMarket(input: {
  market: MarketSettlementCoverageEntry;
  config: ForwardSettlementCoverageConfig;
  io: ForwardSettlementCoverageIo;
  deps: ForwardSettlementBackfillDeps;
  checkpoint: ForwardSettlementBackfillCheckpoint;
  evaluatedAt: string;
  existingImportResultContent: string | null;
}): Promise<{
  checkpoint: ForwardSettlementBackfillCheckpoint;
  result: ForwardSettlementBackfillMarketResult;
}> {
  const skipStatus = shouldSkipBackfill(input.market);
  const paths = resolveMarketImportPaths({
    importsDir: input.config.importsDir,
    market: input.market.inventory,
  });

  const existingEntry = input.checkpoint.markets.find(
    (entry) => entry.marketTicker === input.market.marketTicker,
  );

  if (skipStatus) {
    const result: ForwardSettlementBackfillMarketResult = {
      marketTicker: input.market.marketTicker,
      status: skipStatus,
      attempts: existingEntry?.attempts ?? 0,
      errorMessage: input.market.exclusionReason,
      importResultPath: input.market.sourceArtifact,
      nextEligibleRetryAt: input.market.nextEligibleRetryAt,
    };
    const updatedCheckpoint = updateCheckpointMarket(
      input.checkpoint,
      {
        marketTicker: input.market.marketTicker,
        status: skipStatus,
        attempts: existingEntry?.attempts ?? 0,
        lastAttemptAt: input.evaluatedAt,
        nextEligibleRetryAt: input.market.nextEligibleRetryAt,
        errorMessage: input.market.exclusionReason,
        importResultPath: input.market.sourceArtifact,
      },
      input.evaluatedAt,
    );
    return { checkpoint: updatedCheckpoint, result };
  }

  if (
    existingEntry
    && !isCheckpointMarketEligible(existingEntry, input.evaluatedAt)
    && checkpointTerminalStatusStillApplies({
      entry: existingEntry,
      market: input.market,
      evaluatedAt: input.evaluatedAt,
    })
  ) {
    return {
      checkpoint: input.checkpoint,
      result: {
        marketTicker: input.market.marketTicker,
        status: existingEntry.status,
        attempts: existingEntry.attempts,
        errorMessage: existingEntry.errorMessage,
        importResultPath: existingEntry.importResultPath,
        nextEligibleRetryAt: existingEntry.nextEligibleRetryAt,
      },
    };
  }

  if (
    input.market.classification === "settlement-ready"
    && input.existingImportResultContent
    && !input.config.dryRun
  ) {
    return {
      checkpoint: input.checkpoint,
      result: {
        marketTicker: input.market.marketTicker,
        status: "skipped-ready",
        attempts: existingEntry?.attempts ?? 0,
        errorMessage: null,
        importResultPath: paths.importResultPath,
        nextEligibleRetryAt: null,
      },
    };
  }

  if (input.config.dryRun) {
    const result: ForwardSettlementBackfillMarketResult = {
      marketTicker: input.market.marketTicker,
      status: "dry-run-planned",
      attempts: (existingEntry?.attempts ?? 0) + 1,
      errorMessage: null,
      importResultPath: paths.importResultPath,
      nextEligibleRetryAt: null,
    };
    return {
      checkpoint: updateCheckpointMarket(
        input.checkpoint,
        {
          marketTicker: input.market.marketTicker,
          status: "dry-run-planned",
          attempts: result.attempts,
          lastAttemptAt: input.evaluatedAt,
          nextEligibleRetryAt: null,
          errorMessage: null,
          importResultPath: paths.importResultPath,
        },
        input.evaluatedAt,
      ),
      result,
    };
  }

  const sleep = input.deps.sleep ?? DEFAULT_SLEEP;
  let attempts = existingEntry?.attempts ?? 0;
  if (
    existingEntry?.status === "failed"
    && isCheckpointMarketEligible(existingEntry, input.evaluatedAt)
  ) {
    attempts = 0;
  }
  let lastError: string | null = existingEntry?.status === "failed"
    ? existingEntry.errorMessage
    : null;

  while (attempts < input.config.maxRetries) {
    attempts += 1;
    try {
      const importOutcome = await input.deps.runMarketImport({
        market: input.market.inventory,
        configPath: paths.configPath,
        importResultPath: paths.importResultPath,
        dryRun: false,
      });

      if (importOutcome.skipped) {
        const result: ForwardSettlementBackfillMarketResult = {
          marketTicker: input.market.marketTicker,
          status: "skipped-ready",
          attempts,
          errorMessage: null,
          importResultPath: paths.importResultPath,
          nextEligibleRetryAt: null,
        };
        return {
          checkpoint: updateCheckpointMarket(
            input.checkpoint,
            {
              marketTicker: input.market.marketTicker,
              status: "skipped-ready",
              attempts,
              lastAttemptAt: input.evaluatedAt,
              nextEligibleRetryAt: null,
              errorMessage: null,
              importResultPath: paths.importResultPath,
            },
            input.evaluatedAt,
          ),
          result,
        };
      }

      if (!importOutcome.success) {
        lastError = importOutcome.errorMessage ?? "import failed";
        if (attempts < input.config.maxRetries) {
          await sleep(input.config.retryBaseDelayMs * attempts);
          continue;
        }
        break;
      }

      const result: ForwardSettlementBackfillMarketResult = {
        marketTicker: input.market.marketTicker,
        status: "imported",
        attempts,
        errorMessage: null,
        importResultPath: paths.importResultPath,
        nextEligibleRetryAt: null,
      };
      return {
        checkpoint: updateCheckpointMarket(
          input.checkpoint,
          {
            marketTicker: input.market.marketTicker,
            status: "imported",
            attempts,
            lastAttemptAt: input.evaluatedAt,
            nextEligibleRetryAt: null,
            errorMessage: null,
            importResultPath: paths.importResultPath,
          },
          input.evaluatedAt,
        ),
        result,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "import failed";
      if (attempts < input.config.maxRetries) {
        await sleep(input.config.retryBaseDelayMs * attempts);
      }
    }
  }

  const nextEligibleRetryAt = new Date(
    Date.parse(input.evaluatedAt) + 6 * 60 * 60 * 1000,
  ).toISOString();
  const result: ForwardSettlementBackfillMarketResult = {
    marketTicker: input.market.marketTicker,
    status: "failed",
    attempts,
    errorMessage: lastError,
    importResultPath: paths.importResultPath,
    nextEligibleRetryAt,
  };

  return {
    checkpoint: updateCheckpointMarket(
      input.checkpoint,
      {
        marketTicker: input.market.marketTicker,
        status: "failed",
        attempts,
        lastAttemptAt: input.evaluatedAt,
        errorMessage: lastError,
        nextEligibleRetryAt,
        importResultPath: paths.importResultPath,
      },
      input.evaluatedAt,
    ),
    result,
  };
}

/** Runs idempotent selected-run settlement backfill with checkpoint/resume support. */
export async function runForwardSettlementBackfill(input: {
  config: ForwardSettlementCoverageConfig;
  io: ForwardSettlementCoverageIo;
  markets: readonly MarketSettlementCoverageEntry[];
  selectedRunId: string;
  evaluatedAt: string;
  deps: ForwardSettlementBackfillDeps;
}): Promise<ForwardSettlementBackfillSummary> {
  const marketTickers = input.markets.map((market) => market.marketTicker);
  const existingCheckpoint = input.config.resume
    ? loadForwardSettlementBackfillCheckpoint({
        readFile: input.io.readFile,
        fileExists: input.io.fileExists,
        checkpointPath: input.config.checkpointPath,
      })
    : null;
  const checkpointResumed = Boolean(
    existingCheckpoint
    && existingCheckpoint.captureRunDir === input.config.captureRunDir,
  );
  const checkpointMismatch = Boolean(
    existingCheckpoint
    && existingCheckpoint.captureRunDir !== input.config.captureRunDir,
  );

  let checkpoint =
    checkpointResumed
      ? mergeCheckpointWithMarkets(existingCheckpoint!, marketTickers, input.evaluatedAt)
      : createForwardSettlementBackfillCheckpoint({
          captureRunDir: input.config.captureRunDir,
          selectedRunId: input.selectedRunId,
          importsDir: input.config.importsDir,
          dryRun: input.config.dryRun,
          startedAt: input.evaluatedAt,
          marketTickers,
        });

  const results: ForwardSettlementBackfillMarketResult[] = [];
  const candidates = input.markets.filter((market) => isBackfillCandidate(market.classification));
  let checkpointPersistQueue = Promise.resolve();

  const persistCheckpoint = () => {
    if (
      checkpointMismatch
      || input.config.dryRun
      || !input.io.writeFile
      || !input.io.mkdirSync
    ) {
      return;
    }

    input.io.mkdirSync(posix.dirname(input.config.checkpointPath), { recursive: true });
    input.io.writeFile(
      input.config.checkpointPath,
      serializeForwardSettlementBackfillCheckpoint(checkpoint),
    );
  };

  const queueCheckpointUpdate = (
    update: ForwardSettlementBackfillCheckpointMarket,
  ) => {
    checkpointPersistQueue = checkpointPersistQueue.then(() => {
      checkpoint = updateCheckpointMarket(checkpoint, update, input.evaluatedAt);
      persistCheckpoint();
    });
    return checkpointPersistQueue;
  };

  await runWithConcurrency(
    candidates,
    input.config.maxConcurrency,
    async (market) => {
      const existingImportResultPath = resolveMarketImportPaths({
        importsDir: input.config.importsDir,
        market: market.inventory,
      }).importResultPath;
      const existingImportResultContent =
        input.io.fileExists(existingImportResultPath)
          ? input.io.readFile(existingImportResultPath)
          : null;

      const outcome = await backfillOneMarket({
        market,
        config: input.config,
        io: input.io,
        deps: input.deps,
        checkpoint,
        evaluatedAt: input.evaluatedAt,
        existingImportResultContent,
      });
      const marketUpdate = outcome.checkpoint.markets.find(
        (entry) => entry.marketTicker === market.marketTicker,
      )!;
      await queueCheckpointUpdate(marketUpdate);
      results.push(outcome.result);
    },
  );

  await checkpointPersistQueue;

  for (const market of input.markets) {
    if (results.some((result) => result.marketTicker === market.marketTicker)) {
      continue;
    }

    const skipStatus = shouldSkipBackfill(market);
    if (!skipStatus) {
      continue;
    }

    const existingEntry = checkpoint.markets.find(
      (entry) => entry.marketTicker === market.marketTicker,
    );
    checkpoint = updateCheckpointMarket(
      checkpoint,
      {
        marketTicker: market.marketTicker,
        status: skipStatus,
        attempts: existingEntry?.attempts ?? 0,
        lastAttemptAt: input.evaluatedAt,
        nextEligibleRetryAt: market.nextEligibleRetryAt,
        errorMessage: market.exclusionReason,
        importResultPath: market.sourceArtifact,
      },
      input.evaluatedAt,
    );
    persistCheckpoint();

    results.push({
      marketTicker: market.marketTicker,
      status: skipStatus,
      attempts: 0,
      errorMessage: market.exclusionReason,
      importResultPath: market.sourceArtifact,
      nextEligibleRetryAt: market.nextEligibleRetryAt,
    });
  }

  if (
    !input.config.dryRun
    && input.io.writeFile
    && input.io.mkdirSync
  ) {
    persistCheckpoint();
  }

  return {
    dryRun: input.config.dryRun,
    resumed: checkpointResumed,
    attemptedMarketCount: results.filter((result) =>
      result.status === "imported"
      || result.status === "failed"
      || result.status === "dry-run-planned").length,
    importedMarketCount: results.filter((result) => result.status === "imported").length,
    skippedMarketCount: results.filter((result) =>
      result.status.startsWith("skipped")).length,
    failedMarketCount: results.filter((result) => result.status === "failed").length,
    checkpointPath: input.config.checkpointPath,
    marketResults: results.sort((left, right) =>
      left.marketTicker.localeCompare(right.marketTicker)),
  };
}

export function createProductionForwardSettlementBackfillDeps(input: {
  io: ForwardSettlementCoverageIo;
  evaluatedAt: string;
  importsDir: string;
  staleAfterCaptureObservation?: boolean;
  fetchImpl?: Parameters<typeof runHistoricalImportFromConfig>[0]["fetchImpl"];
}): ForwardSettlementBackfillDeps {
  return {
    runMarketImport: async ({ market, dryRun, importResultPath, configPath }) => {
      if (dryRun) {
        return { success: true };
      }

      if (input.io.fileExists(importResultPath)) {
        const classification = classifyMarketSettlementCoverage({
          io: input.io,
          importsDir: input.importsDir,
          inventory: market,
          evaluatedAt: input.evaluatedAt,
          staleAfterCaptureObservation: input.staleAfterCaptureObservation ?? true,
        });

        if (classification.classification === "settlement-ready") {
          return { success: true, skipped: true };
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
        throw new Error("Filesystem writes are required for production backfill");
      }

      input.io.mkdirSync(posix.dirname(configPath), { recursive: true });
      input.io.writeFile(configPath, serializeHistoricalBronzeImportConfig(config));
      input.io.writeFile(importResultPath, importResult.serialized);
      input.io.writeFile(
        posix.join(posix.dirname(importResultPath), "metadata.json"),
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
    },
  };
}
