import { posix } from "node:path";

import { buildBatchResearchOutputPath } from "./buildBatchResearchOutputPath";
import {
  BatchResearchRunnerError,
  BatchResearchRunnerErrorCode,
  type BatchResearchJob,
  type BatchResearchMarketResult,
  type BatchResearchRunnerDeps,
  type BatchResearchSummary,
  type ResearchDatasetRegistryMarketEntry,
  type RunBatchResearchInput,
} from "./batchResearchTypes";
import { parseResearchDatasetSeriesRegistryJson } from "./parseResearchDatasetRegistryJson";
import { validateSerializedResearchOutputJson } from "@/lib/data/research/runner/validateSerializedResearchOutputJson";
import {
  resolveBatchResearchSummaryPath,
  serializeBatchResearchSummary,
} from "./serializeBatchResearchSummary";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function parseConcurrency(value: number | undefined): number {
  const concurrency = value ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new BatchResearchRunnerError(
      "concurrency must be a positive integer",
      BatchResearchRunnerErrorCode.INVALID_CONCURRENCY,
    );
  }

  return concurrency;
}

function compareEntries(
  left: ResearchDatasetRegistryMarketEntry & { registryPath: string },
  right: ResearchDatasetRegistryMarketEntry & { registryPath: string },
): number {
  const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
  if (bySeries !== 0) {
    return bySeries;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

function compareMarketResults(
  left: BatchResearchMarketResult,
  right: BatchResearchMarketResult,
): number {
  const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
  if (bySeries !== 0) {
    return bySeries;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

function loadRegistryEntries(
  registryDir: string,
  deps: BatchResearchRunnerDeps,
): Array<ResearchDatasetRegistryMarketEntry & { registryPath: string }> {
  const registryPaths = deps.filesystem.listRegistryPaths(normalizePath(registryDir));
  const entries: Array<ResearchDatasetRegistryMarketEntry & { registryPath: string }> = [];

  for (const registryPath of registryPaths) {
    const registry = parseResearchDatasetSeriesRegistryJson(
      deps.filesystem.readFile(registryPath),
      registryPath,
    );

    for (const entry of registry.markets) {
      entries.push({
        ...entry,
        registryPath,
      });
    }
  }

  return [...entries].sort(compareEntries);
}

function buildJobs(
  input: RunBatchResearchInput,
  deps: BatchResearchRunnerDeps,
): BatchResearchJob[] {
  const normalizedOutputDir = normalizePath(input.outputDir);
  const entries = loadRegistryEntries(input.registryDir, deps);
  const seenOutputPaths = new Map<string, string>();
  const jobs: BatchResearchJob[] = [];

  for (const entry of entries) {
    const outputPath = buildBatchResearchOutputPath(
      normalizedOutputDir,
      entry.seriesTicker,
      entry.marketTicker,
    );

    const existingEntry = seenOutputPaths.get(outputPath);
    if (existingEntry !== undefined) {
      throw new BatchResearchRunnerError(
        `Duplicate output path: ${outputPath}`,
        BatchResearchRunnerErrorCode.DUPLICATE_OUTPUT_PATH,
        { marketTicker: entry.marketTicker },
      );
    }

    seenOutputPaths.set(outputPath, `${entry.seriesTicker}/${entry.marketTicker}`);

    const skipReason = deps.filesystem.exists(outputPath)
      ? "Output file already exists"
      : null;

    let fixture = null;
    let parseErrorMessage: string | null = null;

    if (!skipReason) {
      try {
        fixture = deps.parseFixtureJson(
          deps.filesystem.readFile(entry.fixturePath),
          entry.marketTicker,
        );
      } catch (error) {
        parseErrorMessage =
          error instanceof Error ? error.message : "Failed to load fixture";
      }
    }

    jobs.push({
      registryPath: entry.registryPath,
      entry,
      outputPath,
      fixture,
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
  job: BatchResearchJob,
  result?: {
    status: BatchResearchMarketResult["status"];
    errorMessage?: string | null;
    runId?: string | null;
  },
): BatchResearchMarketResult {
  return {
    seriesTicker: job.entry.seriesTicker,
    marketTicker: job.entry.marketTicker,
    registryPath: job.registryPath,
    fixturePath: job.entry.fixturePath,
    outputPath: job.outputPath,
    status: result?.status ?? "failed",
    errorMessage: result?.errorMessage ?? null,
    fixtureValid: job.entry.validationStatus?.valid ?? null,
    runId: result?.runId ?? job.fixture?.runId ?? null,
  };
}

async function executeJob(
  job: BatchResearchJob,
  deps: BatchResearchRunnerDeps,
): Promise<BatchResearchMarketResult> {
  if (job.skipReason) {
    return toMarketResult(job, {
      status: "skipped",
      errorMessage: job.skipReason,
    });
  }

  if (!job.fixture || job.parseErrorMessage) {
    return toMarketResult(job, {
      status: "failed",
      errorMessage: job.parseErrorMessage ?? "Invalid fixture",
    });
  }

  try {
    const serialized = deps.runResearch({
      registryPath: job.registryPath,
      entry: job.entry,
      fixture: job.fixture,
    });
    const validation = validateSerializedResearchOutputJson(
      serialized,
      job.entry.marketTicker,
    );

    if (!validation.ok) {
      return toMarketResult(job, {
        status: "failed",
        errorMessage: validation.errorMessage,
        runId: job.fixture.runId,
      });
    }

    deps.filesystem.mkdir(posix.dirname(job.outputPath));
    deps.filesystem.writeFile(job.outputPath, validation.json);

    return toMarketResult(job, {
      status: "success",
      runId: job.fixture.runId,
    });
  } catch (error) {
    return toMarketResult(job, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Research execution failed",
      runId: job.fixture.runId,
    });
  }
}

/** Runs historical research for every market listed in dataset registries. */
export async function runBatchResearch(
  input: RunBatchResearchInput,
  deps: BatchResearchRunnerDeps,
): Promise<BatchResearchSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const startMs = Date.now();
  const concurrency = parseConcurrency(input.concurrency);
  const normalizedRegistryDir = normalizePath(input.registryDir);
  const normalizedOutputDir = normalizePath(input.outputDir);
  const summaryPath = resolveBatchResearchSummaryPath(
    normalizedOutputDir,
    input.summaryPath,
  );

  const jobs = buildJobs(
    {
      registryDir: normalizedRegistryDir,
      outputDir: normalizedOutputDir,
      summaryPath,
      concurrency,
    },
    deps,
  );

  const marketResults: BatchResearchMarketResult[] = [];

  await runWithConcurrency(jobs, concurrency, async (job) => {
    const result = await executeJob(job, deps);
    marketResults.push(result);
  });

  marketResults.sort(compareMarketResults);

  const successfulRuns = marketResults.filter((market) => market.status === "success").length;
  const failedRuns = marketResults.filter((market) => market.status === "failed").length;
  const skippedRuns = marketResults.filter((market) => market.status === "skipped").length;
  const completedAt = now().toISOString();

  const summary: BatchResearchSummary = {
    registryDir: normalizedRegistryDir,
    outputDir: normalizedOutputDir,
    summaryPath,
    concurrency,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    totalDatasets: jobs.length,
    successfulRuns,
    failedRuns,
    skippedRuns,
    markets: marketResults,
  };

  deps.filesystem.mkdir(posix.dirname(summaryPath));
  deps.filesystem.writeFile(summaryPath, serializeBatchResearchSummary(summary));

  return summary;
}
