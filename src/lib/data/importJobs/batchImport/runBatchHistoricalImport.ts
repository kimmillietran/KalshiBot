import { posix } from "node:path";

import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportConfigError,
  serializeHistoricalBronzeImportConfig,
} from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";
import {
  buildImportedMarketMetadata,
  serializeImportedMarketMetadata,
} from "@/lib/data/datasets/registry";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

import { buildBatchImportOutputPath } from "./buildBatchImportOutputPath";
import {
  AdaptiveThrottleController,
  parseBatchImportAdaptiveThrottleOptions,
} from "./batchImportAdaptiveThrottle";
import { createBatchImportProgressReporter } from "@/lib/cli/progress";
import {
  parseBatchImportRateLimitOptions,
  runImportWithRateLimitRetry,
  BatchImportRetryExhaustedError,
  isBatchImportRecoverableError,
  type ResolvedBatchImportRateLimitConfig,
} from "./batchImportRateLimit";
import { categorizeBatchImportFailure } from "./categorizeBatchImportFailure";
import {
  BATCH_IMPORT_CONFIG_FILENAME,
  BATCH_IMPORT_METADATA_FILENAME,
  BatchImportRunnerError,
  BatchImportRunnerErrorCode,
  type BatchHistoricalImportRunnerDeps,
  type BatchImportFailureReasonCounts,
  type BatchImportJob,
  type BatchImportMarketResult,
  type BatchImportSummary,
  type RunBatchHistoricalImportInput,
} from "./batchImportTypes";
import {
  buildBatchImportSummaryPath,
  serializeBatchImportSummary,
} from "./serializeBatchImportSummary";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function parseConcurrency(value: number | undefined): number {
  const concurrency = value ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new BatchImportRunnerError(
      "concurrency must be a positive integer",
      BatchImportRunnerErrorCode.INVALID_CONCURRENCY,
    );
  }

  return concurrency;
}

function parseConfigJson(
  json: string,
): { config: HistoricalBronzeImportConfig | null; errorMessage: string | null } {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      config: null,
      errorMessage: "Input file contains invalid JSON",
    };
  }

  try {
    return {
      config: buildHistoricalBronzeImportConfig(
        parsed as Parameters<typeof buildHistoricalBronzeImportConfig>[0],
      ),
      errorMessage: null,
    };
  } catch (error) {
    if (error instanceof HistoricalBronzeImportConfigError) {
      return {
        config: null,
        errorMessage: error.message,
      };
    }

    throw error;
  }
}

function compareMarketResults(
  left: BatchImportMarketResult,
  right: BatchImportMarketResult,
): number {
  return left.configPath.localeCompare(right.configPath);
}

function buildJobs(
  input: RunBatchHistoricalImportInput,
  deps: BatchHistoricalImportRunnerDeps,
): BatchImportJob[] {
  const normalizedInputDir = normalizePath(input.inputDir);
  const normalizedOutputDir = normalizePath(input.outputDir);
  const configPaths = deps.filesystem.listConfigPaths(normalizedInputDir);
  const seenOutputPaths = new Map<string, string>();
  const jobs: BatchImportJob[] = [];
  const overwriteExisting = input.overwriteExisting ?? false;

  for (const configPath of configPaths) {
    const { marketTicker, outputPath } = buildBatchImportOutputPath(
      normalizedInputDir,
      normalizedOutputDir,
      configPath,
    );

    const existingConfigPath = seenOutputPaths.get(outputPath);
    if (existingConfigPath !== undefined) {
      throw new BatchImportRunnerError(
        `Duplicate output path: ${outputPath}`,
        BatchImportRunnerErrorCode.DUPLICATE_OUTPUT_PATH,
        { configPath, marketTicker },
      );
    }

    seenOutputPaths.set(outputPath, configPath);

    let config: HistoricalBronzeImportConfig | null = null;
    let parseErrorMessage: string | null = null;

    try {
      const parsed = parseConfigJson(deps.filesystem.readFile(configPath));
      config = parsed.config;
      parseErrorMessage = parsed.errorMessage;
    } catch (error) {
      parseErrorMessage =
        error instanceof Error ? error.message : "Failed to read config file";
    }

    const skipReason =
      !overwriteExisting && deps.filesystem.exists(outputPath)
        ? "Output file already exists"
        : null;

    jobs.push({
      configPath,
      outputPath,
      marketTicker: config?.marketTicker ?? marketTicker,
      config,
      parseErrorMessage,
      skipReason,
    });
  }

  return jobs;
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workerCount = Math.min(concurrency, queue.length);

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

function toMarketResult(
  job: BatchImportJob,
  result?: {
    status: BatchImportMarketResult["status"];
    errorMessage?: string | null;
    jobId?: string | null;
    bronzeRecordCount?: number | null;
    valid?: boolean | null;
    retryCount?: number | null;
    requestDelayMs?: number | null;
    rateLimited?: boolean | null;
  },
): BatchImportMarketResult {
  return {
    marketTicker: job.marketTicker,
    configPath: job.configPath,
    outputPath: job.outputPath,
    status: result?.status ?? "failed",
    errorMessage: result?.errorMessage ?? null,
    jobId: result?.jobId ?? null,
    bronzeRecordCount: result?.bronzeRecordCount ?? null,
    valid: result?.valid ?? null,
    retryCount: result?.retryCount ?? null,
    requestDelayMs: result?.requestDelayMs ?? null,
    rateLimited: result?.rateLimited ?? null,
  };
}

function writeSuccessfulImportArtifacts(
  job: BatchImportJob,
  config: HistoricalBronzeImportConfig,
  importResult: HistoricalBronzeImportJobResult,
  deps: BatchHistoricalImportRunnerDeps,
): void {
  const marketDir = posix.dirname(job.outputPath);
  deps.filesystem.mkdir(marketDir);
  deps.filesystem.writeFile(job.outputPath, importResult.serialized);
  deps.filesystem.writeFile(
    posix.join(marketDir, BATCH_IMPORT_CONFIG_FILENAME),
    serializeHistoricalBronzeImportConfig(config),
  );
  deps.filesystem.writeFile(
    posix.join(marketDir, BATCH_IMPORT_METADATA_FILENAME),
    serializeImportedMarketMetadata(
      buildImportedMarketMetadata({
        config,
        importResult,
      }),
    ),
  );
}

async function executeJob(
  job: BatchImportJob,
  deps: BatchHistoricalImportRunnerDeps,
  rateLimit: ResolvedBatchImportRateLimitConfig,
  throttle: AdaptiveThrottleController,
  requestDelayMs: number,
): Promise<BatchImportMarketResult> {
  if (job.skipReason) {
    return toMarketResult(job, {
      status: "skipped",
      errorMessage: job.skipReason,
      retryCount: null,
      requestDelayMs: null,
      rateLimited: null,
    });
  }

  if (!job.config || job.parseErrorMessage) {
    return toMarketResult(job, {
      status: "failed",
      errorMessage: job.parseErrorMessage ?? "Invalid config",
      retryCount: null,
      requestDelayMs: null,
      rateLimited: null,
    });
  }

  try {
    const { result, retryCount, rateLimited } = await runImportWithRateLimitRetry({
      runImport: () =>
        deps.runImport({
          configPath: job.configPath,
          config: job.config!,
        }),
      rateLimit,
      sleep: deps.sleep,
      onRateLimited: () => {
        throttle.onRateLimit();
      },
    });
    const importResult = result as HistoricalBronzeImportJobResult;

    if (!rateLimited) {
      throttle.onSuccessWithoutRateLimit();
    }

    writeSuccessfulImportArtifacts(job, job.config, importResult, deps);

    return toMarketResult(job, {
      status: "success",
      jobId: importResult.jobId,
      bronzeRecordCount: importResult.metadata.bronzeRecordCount,
      valid: importResult.metadata.valid,
      retryCount,
      requestDelayMs,
      rateLimited,
    });
  } catch (error) {
    const retryCount =
      error instanceof BatchImportRetryExhaustedError ? error.retryCount : null;
    const rateLimited =
      error instanceof BatchImportRetryExhaustedError
      && isBatchImportRecoverableError(error.causeError);

    return toMarketResult(job, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Import failed",
      jobId: job.config.jobId,
      retryCount,
      requestDelayMs,
      rateLimited,
    });
  }
}

function buildFailureReasonCounts(
  markets: readonly BatchImportMarketResult[],
): BatchImportFailureReasonCounts {
  const counts = new Map<string, number>();

  for (const market of markets) {
    if (market.status !== "failed") {
      continue;
    }

    const code = categorizeBatchImportFailure(market.errorMessage);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function summarizeRetryMetrics(
  markets: readonly BatchImportMarketResult[],
  rateLimit: ResolvedBatchImportRateLimitConfig,
): Pick<
  BatchImportSummary,
  "retryCount" | "recoveredImports" | "failedAfterRetries"
> {
  let retryCount = 0;
  let recoveredImports = 0;
  let failedAfterRetries = 0;

  for (const market of markets) {
    const marketRetryCount = market.retryCount ?? 0;
    retryCount += marketRetryCount;

    if (market.status === "success" && marketRetryCount > 0) {
      recoveredImports += 1;
    }

    if (
      market.status === "failed"
      && rateLimit.maxRetries > 0
      && (market.retryCount ?? 0) >= rateLimit.maxRetries
      && categorizeBatchImportFailure(market.errorMessage) === "rate-limited"
    ) {
      failedAfterRetries += 1;
    }
  }

  return {
    retryCount,
    recoveredImports,
    failedAfterRetries,
  };
}

/** Runs historical imports for every discovered config under the input directory. */
export async function runBatchHistoricalImport(
  input: RunBatchHistoricalImportInput,
  deps: BatchHistoricalImportRunnerDeps,
): Promise<BatchImportSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const startMs = Date.now();
  const concurrency = parseConcurrency(input.concurrency);
  const rateLimit = parseBatchImportRateLimitOptions({
    requestDelayMs: input.requestDelayMs,
    maxRetries: input.maxRetries,
    retryBaseDelayMs: input.retryBaseDelayMs,
  });
  const adaptiveThrottle = parseBatchImportAdaptiveThrottleOptions({
    adaptiveThrottle: input.adaptiveThrottle,
    minRequestDelayMs: input.minRequestDelayMs,
    maxRequestDelayMs: input.maxRequestDelayMs,
    throttleIncreaseFactor: input.throttleIncreaseFactor,
    throttleDecreaseMs: input.throttleDecreaseMs,
  });
  const throttle = new AdaptiveThrottleController(adaptiveThrottle);
  const sleep =
    deps.sleep
    ?? ((ms: number) => new Promise((resolve) => {
      setTimeout(resolve, ms);
    }));
  const normalizedInputDir = normalizePath(input.inputDir);
  const normalizedOutputDir = normalizePath(input.outputDir);
  const summaryPath = buildBatchImportSummaryPath(normalizedOutputDir);

  const jobs = buildJobs(input, deps);

  const marketResults: BatchImportMarketResult[] = [];
  const progressReporter = deps.logProgress
    ? createBatchImportProgressReporter({
        totalMarkets: jobs.length,
        startedAtMs: startMs,
        isTty: deps.isProgressTty ?? false,
        write: deps.logProgress,
        now: () => Date.now(),
      })
    : null;

  await runWithConcurrency(jobs, concurrency, async (job) => {
    const requestDelayMs = adaptiveThrottle.enabled
      ? throttle.currentDelayMs
      : rateLimit.requestDelayMs;
    const result = await executeJob(job, deps, rateLimit, throttle, requestDelayMs);
    marketResults.push(result);

    progressReporter?.recordMarket(
      result,
      job.marketTicker,
      adaptiveThrottle.enabled ? throttle.currentDelayMs : rateLimit.requestDelayMs,
    );

    const interRequestDelayMs = adaptiveThrottle.enabled
      ? throttle.currentDelayMs
      : rateLimit.requestDelayMs;

    if (interRequestDelayMs > 0) {
      throttle.recordAppliedDelay(interRequestDelayMs);
      await sleep(interRequestDelayMs);
    }
  });

  progressReporter?.complete();

  marketResults.sort(compareMarketResults);

  const successfulImports = marketResults.filter((market) => market.status === "success").length;
  const failedImports = marketResults.filter((market) => market.status === "failed").length;
  const skippedImports = marketResults.filter((market) => market.status === "skipped").length;
  const completedAt = now().toISOString();
  const retryMetrics = summarizeRetryMetrics(marketResults, rateLimit);
  const throttleMetrics = throttle.getMetrics();

  const summary: BatchImportSummary = {
    inputDir: normalizedInputDir,
    outputDir: normalizedOutputDir,
    concurrency,
    requestDelayMs: adaptiveThrottle.enabled
      ? throttleMetrics.finalRequestDelayMs
      : rateLimit.requestDelayMs,
    maxRetries: rateLimit.maxRetries,
    retryBaseDelayMs: rateLimit.retryBaseDelayMs,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    totalConfigs: jobs.length,
    successfulImports,
    failedImports,
    skippedImports,
    ...retryMetrics,
    failureReasonCounts: buildFailureReasonCounts(marketResults),
    summaryPath,
    adaptiveThrottleEnabled: adaptiveThrottle.enabled,
    initialRequestDelayMs: adaptiveThrottle.enabled
      ? throttleMetrics.initialRequestDelayMs
      : rateLimit.requestDelayMs,
    finalRequestDelayMs: adaptiveThrottle.enabled
      ? throttleMetrics.finalRequestDelayMs
      : rateLimit.requestDelayMs,
    minRequestDelayMs: adaptiveThrottle.enabled
      ? adaptiveThrottle.minRequestDelayMs
      : null,
    maxRequestDelayMs: adaptiveThrottle.enabled
      ? adaptiveThrottle.maxRequestDelayMs
      : null,
    throttleAdjustmentCount: adaptiveThrottle.enabled
      ? throttleMetrics.throttleAdjustmentCount
      : 0,
    rateLimitCount: adaptiveThrottle.enabled ? throttleMetrics.rateLimitCount : 0,
    averageRequestDelayMs: adaptiveThrottle.enabled
      ? throttleMetrics.averageRequestDelayMs
      : rateLimit.requestDelayMs,
    markets: marketResults,
  };

  deps.filesystem.mkdir(normalizedOutputDir);
  deps.filesystem.writeFile(summaryPath, serializeBatchImportSummary(summary));

  return summary;
}
