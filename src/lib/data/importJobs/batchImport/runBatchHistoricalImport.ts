import { posix } from "node:path";

import {
  buildHistoricalBronzeImportConfig,
  HistoricalBronzeImportConfigError,
} from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";

import { buildBatchImportOutputPath } from "./buildBatchImportOutputPath";
import {
  BatchImportRunnerError,
  BatchImportRunnerErrorCode,
  type BatchHistoricalImportRunnerDeps,
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

    const skipReason = deps.filesystem.exists(outputPath)
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

function toMarketResult(job: BatchImportJob, result?: {
  status: BatchImportMarketResult["status"];
  errorMessage?: string | null;
  jobId?: string | null;
  bronzeRecordCount?: number | null;
  valid?: boolean | null;
}): BatchImportMarketResult {
  return {
    marketTicker: job.marketTicker,
    configPath: job.configPath,
    outputPath: job.outputPath,
    status: result?.status ?? "failed",
    errorMessage: result?.errorMessage ?? null,
    jobId: result?.jobId ?? null,
    bronzeRecordCount: result?.bronzeRecordCount ?? null,
    valid: result?.valid ?? null,
  };
}

async function executeJob(
  job: BatchImportJob,
  deps: BatchHistoricalImportRunnerDeps,
): Promise<BatchImportMarketResult> {
  if (job.skipReason) {
    return toMarketResult(job, {
      status: "skipped",
      errorMessage: job.skipReason,
    });
  }

  if (!job.config || job.parseErrorMessage) {
    return toMarketResult(job, {
      status: "failed",
      errorMessage: job.parseErrorMessage ?? "Invalid config",
    });
  }

  try {
    const importResult = await deps.runImport({
      configPath: job.configPath,
      config: job.config,
    });

    deps.filesystem.mkdir(posix.dirname(job.outputPath));
    deps.filesystem.writeFile(job.outputPath, importResult.serialized);

    return toMarketResult(job, {
      status: "success",
      jobId: importResult.jobId,
      bronzeRecordCount: importResult.metadata.bronzeRecordCount,
      valid: importResult.metadata.valid,
    });
  } catch (error) {
    return toMarketResult(job, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Import failed",
      jobId: job.config.jobId,
    });
  }
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
  const normalizedInputDir = normalizePath(input.inputDir);
  const normalizedOutputDir = normalizePath(input.outputDir);
  const summaryPath = buildBatchImportSummaryPath(normalizedOutputDir);

  const jobs = buildJobs(
    {
      inputDir: normalizedInputDir,
      outputDir: normalizedOutputDir,
      concurrency,
    },
    deps,
  );

  const marketResults: BatchImportMarketResult[] = [];

  await runWithConcurrency(jobs, concurrency, async (job) => {
    const result = await executeJob(job, deps);
    marketResults.push(result);
  });

  marketResults.sort(compareMarketResults);

  const successfulImports = marketResults.filter((market) => market.status === "success").length;
  const failedImports = marketResults.filter((market) => market.status === "failed").length;
  const skippedImports = marketResults.filter((market) => market.status === "skipped").length;
  const completedAt = now().toISOString();

  const summary: BatchImportSummary = {
    inputDir: normalizedInputDir,
    outputDir: normalizedOutputDir,
    concurrency,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    totalConfigs: jobs.length,
    successfulImports,
    failedImports,
    skippedImports,
    summaryPath,
    markets: marketResults,
  };

  deps.filesystem.mkdir(normalizedOutputDir);
  deps.filesystem.writeFile(summaryPath, serializeBatchImportSummary(summary));

  return summary;
}
