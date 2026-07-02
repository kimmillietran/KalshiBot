import { posix } from "node:path";

import { buildBatchFixtureOutputPath } from "./buildBatchFixtureOutputPath";
import {
  BatchFixtureBridgeRunnerError,
  BatchFixtureBridgeRunnerErrorCode,
  type BatchFixtureBridgeJob,
  type BatchFixtureBridgeRunnerDeps,
  type BatchFixtureMarketResult,
  type BatchFixtureBridgeSummary,
  type RunBatchFixtureBridgeInput,
} from "./batchFixtureBridgeTypes";
import { parseHistoricalBronzeImportResultJson } from "./parseHistoricalBronzeImportResultJson";
import {
  resolveBatchFixtureSummaryPath,
  serializeBatchFixtureBridgeSummary,
} from "./serializeBatchFixtureBridgeSummary";
import { validateSerializedBatchFixtureJson } from "./validateSerializedBatchFixtureJson";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function compareMarketResults(
  left: BatchFixtureMarketResult,
  right: BatchFixtureMarketResult,
): number {
  return left.importPath.localeCompare(right.importPath);
}

function buildJobs(
  input: RunBatchFixtureBridgeInput,
  deps: BatchFixtureBridgeRunnerDeps,
): BatchFixtureBridgeJob[] {
  const normalizedInputDir = normalizePath(input.inputDir);
  const normalizedOutputDir = normalizePath(input.outputDir);
  const importPaths = deps.filesystem.listImportPaths(normalizedInputDir);
  const seenOutputPaths = new Map<string, string>();
  const jobs: BatchFixtureBridgeJob[] = [];

  for (const importPath of importPaths) {
    const { marketTicker, fixturePath } = buildBatchFixtureOutputPath(
      normalizedInputDir,
      normalizedOutputDir,
      importPath,
    );

    const existingImportPath = seenOutputPaths.get(fixturePath);
    if (existingImportPath !== undefined) {
      throw new BatchFixtureBridgeRunnerError(
        `Duplicate output path: ${fixturePath}`,
        BatchFixtureBridgeRunnerErrorCode.DUPLICATE_OUTPUT_PATH,
        { importPath, marketTicker },
      );
    }

    seenOutputPaths.set(fixturePath, importPath);

    let importResult = null;
    let parseErrorMessage: string | null = null;

    try {
      importResult = parseHistoricalBronzeImportResultJson(
        deps.filesystem.readFile(importPath),
      );
    } catch (error) {
      parseErrorMessage =
        error instanceof Error ? error.message : "Failed to read import result file";
    }

    const skipReason = deps.filesystem.exists(fixturePath)
      ? "Output file already exists"
      : null;

    jobs.push({
      importPath,
      fixturePath,
      marketTicker: importResult?.metadata.marketTicker ?? marketTicker,
      importResult,
      parseErrorMessage,
      skipReason,
    });
  }

  return jobs;
}

function toMarketResult(
  job: BatchFixtureBridgeJob,
  result?: {
    status: BatchFixtureMarketResult["status"];
    errorMessage?: string | null;
    importValid?: boolean | null;
    jobId?: string | null;
  },
): BatchFixtureMarketResult {
  return {
    marketTicker: job.marketTicker,
    importPath: job.importPath,
    fixturePath: job.fixturePath,
    status: result?.status ?? "failed",
    errorMessage: result?.errorMessage ?? null,
    importValid: result?.importValid ?? job.importResult?.validationResult.valid ?? null,
    jobId: result?.jobId ?? job.importResult?.jobId ?? null,
  };
}

async function executeJob(
  job: BatchFixtureBridgeJob,
  deps: BatchFixtureBridgeRunnerDeps,
): Promise<BatchFixtureMarketResult> {
  if (job.skipReason) {
    return toMarketResult(job, {
      status: "skipped",
      errorMessage: job.skipReason,
    });
  }

  if (!job.importResult || job.parseErrorMessage) {
    return toMarketResult(job, {
      status: "failed",
      errorMessage: job.parseErrorMessage ?? "Invalid import result",
    });
  }

  try {
    const serialized = deps.runFixtureBridge({
      importPath: job.importPath,
      importResult: job.importResult,
      marketTicker: job.marketTicker,
    });
    const validation = validateSerializedBatchFixtureJson(serialized);

    if (!validation.ok) {
      return toMarketResult(job, {
        status: "failed",
        errorMessage: validation.errorMessage,
        importValid: job.importResult.validationResult.valid,
        jobId: job.importResult.jobId,
      });
    }

    deps.filesystem.mkdir(posix.dirname(job.fixturePath));
    deps.filesystem.writeFile(job.fixturePath, validation.json);

    return toMarketResult(job, {
      status: "success",
      importValid: job.importResult.validationResult.valid,
      jobId: job.importResult.jobId,
    });
  } catch (error) {
    return toMarketResult(job, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Fixture bridge failed",
      importValid: job.importResult.validationResult.valid,
      jobId: job.importResult.jobId,
    });
  }
}

/** Converts discovered import-result.json files into replay-ready fixture.json outputs. */
export async function runBatchFixtureBridge(
  input: RunBatchFixtureBridgeInput,
  deps: BatchFixtureBridgeRunnerDeps,
): Promise<BatchFixtureBridgeSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const startMs = Date.now();
  const normalizedInputDir = normalizePath(input.inputDir);
  const normalizedOutputDir = normalizePath(input.outputDir);
  const summaryPath = resolveBatchFixtureSummaryPath(
    normalizedOutputDir,
    input.summaryPath,
  );

  const jobs = buildJobs(
    {
      inputDir: normalizedInputDir,
      outputDir: normalizedOutputDir,
      summaryPath,
      bridgeOptions: input.bridgeOptions,
    },
    deps,
  );

  const marketResults: BatchFixtureMarketResult[] = [];

  for (const job of jobs) {
    marketResults.push(await executeJob(job, deps));
  }

  marketResults.sort(compareMarketResults);

  const successfulFixtures = marketResults.filter((market) => market.status === "success").length;
  const failedFixtures = marketResults.filter((market) => market.status === "failed").length;
  const skippedFixtures = marketResults.filter((market) => market.status === "skipped").length;
  const completedAt = now().toISOString();

  const summary: BatchFixtureBridgeSummary = {
    inputDir: normalizedInputDir,
    outputDir: normalizedOutputDir,
    summaryPath,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    totalImports: jobs.length,
    successfulFixtures,
    failedFixtures,
    skippedFixtures,
    markets: marketResults,
  };

  deps.filesystem.mkdir(posix.dirname(summaryPath));
  deps.filesystem.writeFile(summaryPath, serializeBatchFixtureBridgeSummary(summary));

  return summary;
}
