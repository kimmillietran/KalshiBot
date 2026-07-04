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
  finalizeExpansionImportRunStatus,
  initializeExpansionImportCheckpoint,
  loadExpansionImportCheckpoint,
  planExpansionMarketExecution,
  serializeExpansionImportCheckpoint,
  updateExpansionImportCheckpoint,
} from "@/lib/data/importJobs/expansionImportSafety";
import type { HistoricalExpansionImportCheckpoint } from "@/lib/data/importJobs/expansionImportSafety";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildExpansionMarketImportArtifacts } from "./buildExpansionMarketImportConfig";
import {
  createExpansionImportCircuitBreakerState,
  evaluateExpansionImportCircuitBreaker,
  formatExpansionImportCircuitBreakerWarning,
  recordExpansionImportCircuitBreakerFailure,
} from "./expansionImportCircuitBreaker";
import {
  ExpansionExecutorError,
  ExpansionExecutorErrorCode,
  type ExpansionImportJobResult,
  type ExpansionImportMarketResult,
  type HistoricalExpansionImportSummary,
  type RunHistoricalExpansionImportInput,
} from "./expansionExecutorTypes";
import { scanExistingExpansionMarketTickers } from "./scanExistingExpansionMarketTickers";

function countImportPlan(
  discovered: readonly {
    marketTicker: string;
  }[],
  existingTickers: ReadonlySet<string>,
  remainingMarketBudget: number | null,
): { alreadyCoveredCount: number; toImportCount: number } {
  let alreadyCoveredCount = 0;
  let toImportCount = 0;
  let budget = remainingMarketBudget;

  for (const market of discovered) {
    if (existingTickers.has(market.marketTicker)) {
      alreadyCoveredCount += 1;
      continue;
    }

    if (budget !== null && budget <= 0) {
      break;
    }

    toImportCount += 1;
    if (budget !== null) {
      budget -= 1;
    }
  }

  return { alreadyCoveredCount, toImportCount };
}

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

function toSamplingWindow(job: HistoricalExpansionImportJob): {
  after: string;
  before: string;
} {
  return {
    after: job.discovery.sampling.afterDate,
    before: job.discovery.sampling.beforeDate,
  };
}

function aggregateSummary(
  jobs: readonly ExpansionImportJobResult[],
  startedAtMs: number,
): HistoricalExpansionImportSummary["summary"] {
  return {
    jobCount: jobs.length,
    discoveredMarketCount: jobs.reduce(
      (total, job) => total + job.discoveredMarketCount,
      0,
    ),
    importedCount: jobs.reduce((total, job) => total + job.importedCount, 0),
    skippedCount: jobs.reduce((total, job) => total + job.skippedCount, 0),
    failedCount: jobs.reduce((total, job) => total + job.failedCount, 0),
    plannedCount: jobs.reduce((total, job) => total + job.plannedCount, 0),
    durationMs: Date.now() - startedAtMs,
  };
}

function buildPartialSummary(
  input: RunHistoricalExpansionImportInput,
  jobResults: readonly ExpansionImportJobResult[],
  startedAtMs: number,
  checkpoint: HistoricalExpansionImportCheckpoint,
  runStatus: HistoricalExpansionImportSummary["runStatus"],
  warnings: readonly string[],
): HistoricalExpansionImportSummary {
  return {
    generatedAt: input.generatedAt,
    execute: input.config.execute,
    inputPath: input.config.inputPath,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    checkpointPath: input.config.checkpointPath,
    resume: input.config.resume,
    maxRetries: input.config.maxRetries,
    runStatus,
    importConfigsDir: input.config.importConfigsDir,
    importsDir: input.config.importsDir,
    maxMarkets: input.config.maxMarkets,
    jobIdFilter: input.config.jobId,
    summary: aggregateSummary(jobResults, startedAtMs),
    jobs: jobResults,
    warnings,
  };
}

function persistRunArtifacts(
  input: RunHistoricalExpansionImportInput,
  summary: HistoricalExpansionImportSummary,
  checkpoint: HistoricalExpansionImportCheckpoint,
): void {
  const checkpointJson = serializeExpansionImportCheckpoint(checkpoint);
  const summaryJson = serializeHistoricalExpansionImportSummary(summary);

  input.io.writeFile(input.config.checkpointPath, checkpointJson);
  input.io.writeFile(input.config.outputPath, summaryJson);
  input.onPersist?.({ checkpointJson, summaryJson });
}

async function executeMarketImport(
  input: RunHistoricalExpansionImportInput,
  job: HistoricalExpansionImportJob,
  market: { marketTicker: string; seriesTicker: string; openTime: string | null; closeTime: string | null },
): Promise<ExpansionImportMarketResult> {
  const startedAtMs = Date.now();

  if (!market.openTime || !market.closeTime) {
    return {
      marketTicker: market.marketTicker,
      seriesTicker: market.seriesTicker,
      status: "skipped",
      configPath: null,
      importResultPath: null,
      errorMessage: null,
      skipReason: "Discovered market is missing openTime or closeTime",
      durationMs: Date.now() - startedAtMs,
    };
  }

  const artifacts = buildExpansionMarketImportArtifacts(job, market, {
    importConfigsDir: input.config.importConfigsDir,
    importsDir: input.config.importsDir,
  });

  if (!input.config.execute) {
    return {
      marketTicker: market.marketTicker,
      seriesTicker: market.seriesTicker,
      status: "planned",
      configPath: artifacts.configPath,
      importResultPath: artifacts.importResultPath,
      errorMessage: null,
      skipReason: null,
      durationMs: Date.now() - startedAtMs,
    };
  }

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

    return {
      marketTicker: market.marketTicker,
      seriesTicker: market.seriesTicker,
      status: "imported",
      configPath: artifacts.configPath,
      importResultPath: artifacts.importResultPath,
      errorMessage: null,
      skipReason: null,
      durationMs: Date.now() - startedAtMs,
    };
  } catch (error) {
    return {
      marketTicker: market.marketTicker,
      seriesTicker: market.seriesTicker,
      status: "failed",
      configPath: artifacts.configPath,
      importResultPath: artifacts.importResultPath,
      errorMessage: error instanceof Error ? error.message : "Import failed",
      skipReason: null,
      durationMs: Date.now() - startedAtMs,
    };
  }
}

/** Executes or dry-runs scheduled historical expansion import jobs. */
export async function runHistoricalExpansionImport(
  input: RunHistoricalExpansionImportInput,
): Promise<HistoricalExpansionImportSummary> {
  const startedAtMs = Date.now();
  const manifest = parseHistoricalExpansionImportConfigJson(
    input.config.inputPath,
    input.expansionConfigJson,
  );

  let scheduledJobs = manifest.jobs.filter((job) => job.status === "scheduled");
  if (input.config.jobId) {
    scheduledJobs = scheduledJobs.filter((job) => job.jobId === input.config.jobId);
    if (scheduledJobs.length === 0) {
      throw new ExpansionExecutorError(
        `No scheduled expansion job found for job id: ${input.config.jobId}`,
        ExpansionExecutorErrorCode.JOB_NOT_FOUND,
      );
    }
  }

  if (scheduledJobs.length === 0) {
    throw new ExpansionExecutorError(
      "No scheduled jobs found in historical expansion import config",
      ExpansionExecutorErrorCode.NO_SCHEDULED_JOBS,
    );
  }

  const existingCheckpoint = loadExpansionImportCheckpoint(
    input.config.checkpointPath,
    input.io,
  );
  let checkpoint = initializeExpansionImportCheckpoint({
    generatedAt: input.generatedAt,
    inputPath: input.config.inputPath,
    checkpointPath: input.config.checkpointPath,
    resume: input.config.resume,
    maxRetries: input.config.maxRetries,
    jobIds: scheduledJobs.map((job) => job.jobId),
    existingCheckpointJson: existingCheckpoint
      ? serializeExpansionImportCheckpoint(existingCheckpoint)
      : null,
  });

  const safety = {
    resume: input.config.resume,
    skipFailed: input.config.skipFailed,
    forceMarket: input.config.forceMarket,
    checkpointPath: input.config.checkpointPath,
    maxRetries: input.config.maxRetries,
    summaryInputPath: input.config.summaryInputPath,
  };

  const existingTickers = scanExistingExpansionMarketTickers(
    {
      importConfigsDir: input.config.importConfigsDir,
      fixturesDir: input.config.fixturesDir,
      researchResultsDir: input.config.researchResultsDir,
    },
    input.io,
  );

  const warnings: string[] = [];
  const jobResults: ExpansionImportJobResult[] = [];
  let remainingMarketBudget = input.config.maxMarkets;
  let interrupted = false;
  let circuitBreakerState = createExpansionImportCircuitBreakerState();
  const sortedScheduledJobs = [...scheduledJobs].sort(compareJobs);
  const progress = input.progress ?? null;

  for (const [jobIndex, job] of sortedScheduledJobs.entries()) {
    if (input.signal?.aborted) {
      interrupted = true;
      break;
    }

    const jobStartedAtMs = Date.now();
    const jobWarnings: string[] = [];
    const sampling = toSamplingWindow(job);
    const discovered = await input.deps.discoverMarkets(job.seriesTicker, sampling);
    const markets: ExpansionImportMarketResult[] = [];

    const sortedDiscovered = [...discovered].sort((left, right) =>
      left.marketTicker.localeCompare(right.marketTicker),
    );
    const importPlan = countImportPlan(
      sortedDiscovered,
      existingTickers,
      remainingMarketBudget,
    );

    progress?.reportJobHeader({
      dryRun: !input.config.execute,
      resume: input.config.resume,
      maxMarkets: input.config.maxMarkets,
      jobIndex: jobIndex + 1,
      totalJobs: sortedScheduledJobs.length,
      jobId: job.jobId,
      seriesTicker: job.seriesTicker,
      windowLabel: `${sampling.after.slice(0, 10)} → ${sampling.before.slice(0, 10)}`,
      discoveredCount: discovered.length,
      alreadyCoveredCount: importPlan.alreadyCoveredCount,
      toImportCount: importPlan.toImportCount,
    });

    for (const market of sortedDiscovered) {
      if (input.signal?.aborted) {
        interrupted = true;
        break;
      }

      if (remainingMarketBudget !== null && remainingMarketBudget <= 0) {
        jobWarnings.push(
          "Stopped scheduling additional markets after reaching --max-markets limit",
        );
        break;
      }

      const executionPlan = planExpansionMarketExecution({
        safety,
        checkpoint,
        jobId: job.jobId,
        marketTicker: market.marketTicker,
      });

      if (executionPlan.action === "skip") {
        markets.push({
          marketTicker: market.marketTicker,
          seriesTicker: market.seriesTicker,
          status: "skipped",
          configPath: null,
          importResultPath: null,
          errorMessage: null,
          skipReason: executionPlan.reason,
          durationMs: 0,
        });
        progress?.recordMarket("skipped", market.marketTicker);
        continue;
      }

      if (existingTickers.has(market.marketTicker)) {
        const skippedResult: ExpansionImportMarketResult = {
          marketTicker: market.marketTicker,
          seriesTicker: market.seriesTicker,
          status: "skipped",
          configPath: null,
          importResultPath: null,
          errorMessage: null,
          skipReason: "Market already present in import configs, fixtures, or research outputs",
          durationMs: 0,
        };
        markets.push(skippedResult);
        progress?.recordDedupedMarket(market.marketTicker);

        if (input.config.execute) {
          checkpoint = updateExpansionImportCheckpoint(
            checkpoint,
            job.jobId,
            skippedResult,
            input.generatedAt,
          );
        }

        continue;
      }

      const result = await executeMarketImport(input, job, market);
      markets.push(result);
      progress?.recordMarket(result.status, market.marketTicker);

      if (
        input.config.execute
        && result.status === "failed"
        && result.errorMessage
      ) {
        circuitBreakerState = recordExpansionImportCircuitBreakerFailure(
          circuitBreakerState,
          market.marketTicker,
          result.errorMessage,
        );
        const circuitBreakerTrip = evaluateExpansionImportCircuitBreaker(
          circuitBreakerState,
        );
        if (circuitBreakerTrip) {
          const warning = formatExpansionImportCircuitBreakerWarning(circuitBreakerTrip);
          jobWarnings.push(warning);
          warnings.push(warning);
          interrupted = true;
          break;
        }
      }

      if (result.status === "planned" || result.status === "imported") {
        if (remainingMarketBudget !== null) {
          remainingMarketBudget -= 1;
        }
        existingTickers.add(market.marketTicker);
      }

      if (input.config.execute) {
        checkpoint = updateExpansionImportCheckpoint(
          checkpoint,
          job.jobId,
          result,
          input.generatedAt,
        );

        const partialSummary = buildPartialSummary(
          input,
          [
            ...jobResults,
            {
              jobId: job.jobId,
              seriesTicker: job.seriesTicker,
              status: "completed",
              discoveredMarketCount: discovered.length,
              importedCount: markets.filter((entry) => entry.status === "imported").length,
              skippedCount: markets.filter((entry) => entry.status === "skipped").length,
              failedCount: markets.filter((entry) => entry.status === "failed").length,
              plannedCount: markets.filter((entry) => entry.status === "planned").length,
              durationMs: Date.now() - jobStartedAtMs,
              warnings: jobWarnings,
              markets,
            },
          ],
          startedAtMs,
          checkpoint,
          interrupted ? "interrupted" : "partial",
          warnings,
        );

        persistRunArtifacts(input, partialSummary, {
          ...checkpoint,
          runStatus: interrupted ? "interrupted" : "running",
        });
      }
    }

    if (discovered.length === 0) {
      jobWarnings.push(
        `No markets discovered for ${job.seriesTicker} between ${sampling.after} and ${sampling.before}`,
      );
    }

    const importedCount = markets.filter((entry) => entry.status === "imported").length;
    const skippedCount = markets.filter((entry) => entry.status === "skipped").length;
    const failedCount = markets.filter((entry) => entry.status === "failed").length;
    const plannedCount = markets.filter((entry) => entry.status === "planned").length;

    jobResults.push({
      jobId: job.jobId,
      seriesTicker: job.seriesTicker,
      status:
        failedCount > 0 && importedCount === 0 && plannedCount === 0
          ? "failed"
          : "completed",
      discoveredMarketCount: discovered.length,
      importedCount,
      skippedCount,
      failedCount,
      plannedCount,
      durationMs: Date.now() - jobStartedAtMs,
      warnings: jobWarnings,
      markets,
    });

    warnings.push(...jobWarnings);
    progress?.completeJob();

    if (interrupted) {
      break;
    }
  }

  const { checkpointRunStatus, summaryRunStatus } = finalizeExpansionImportRunStatus({
    interrupted,
    checkpoint,
    jobs: jobResults,
    maxRetries: input.config.maxRetries,
  });

  checkpoint = {
    ...checkpoint,
    runStatus: checkpointRunStatus,
    updatedAt: input.generatedAt,
  };

  const summary = buildPartialSummary(
    input,
    jobResults,
    startedAtMs,
    checkpoint,
    summaryRunStatus,
    warnings,
  );

  if (input.config.execute) {
    persistRunArtifacts(input, summary, checkpoint);
  }

  progress?.complete();

  return summary;
}

export function serializeHistoricalExpansionImportSummary(
  summary: HistoricalExpansionImportSummary,
): string {
  return stableStringify(summary);
}
