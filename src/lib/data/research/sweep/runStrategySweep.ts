import { posix } from "node:path";

import { parseReplayPricingDiagnosticsFromResearchOutput } from "@/lib/data/research/diagnostics";

import { createStrategySweepProgressReporter } from "@/lib/cli/progress";

import { augmentResearchOutputWithSynthesizedMetadata } from "./augmentResearchOutputWithSynthesizedMetadata";
import { buildStrategySweepOutputPath } from "./buildStrategySweepOutputPath";
import { parseStrategySweepSeriesRegistryJson } from "./parseDatasetRegistryJson";
import { resolveSynthesizedStrategySweepEntries } from "./resolveSynthesizedStrategySweepEntries";
import { validateSerializedResearchOutputJson } from "@/lib/data/research/runner/validateSerializedResearchOutputJson";
import { buildStrategySweepDecisionTracePath } from "@/lib/data/research/decisionTrace";
import {
  resolveStrategySweepSummaryPath,
  serializeStrategySweepSummary,
} from "./serializeStrategySweepSummary";
import {
  StrategySweepError,
  StrategySweepErrorCode,
  type StrategySweepJob,
  type StrategySweepMarketEntry,
  type StrategySweepRunResult,
  type StrategySweepRunnerDeps,
  type StrategySweepSummary,
  type RunStrategySweepInput,
  type SynthesizedStrategySweepEntry,
} from "./strategySweepTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function parseConcurrency(value: number | undefined): number {
  const concurrency = value ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new StrategySweepError(
      "concurrency must be a positive integer",
      StrategySweepErrorCode.INVALID_CONCURRENCY,
    );
  }

  return concurrency;
}

function assertUniqueStrategyIds(strategyIds: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const strategyId of strategyIds) {
    const trimmed = strategyId.trim();
    if (!trimmed) {
      continue;
    }

    if (seen.has(trimmed)) {
      throw new StrategySweepError(
        `Duplicate strategy id "${trimmed}"`,
        StrategySweepErrorCode.DUPLICATE_STRATEGY_ID,
        { strategyId: trimmed },
      );
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  if (normalized.length === 0) {
    throw new StrategySweepError(
      "At least one strategy id is required",
      StrategySweepErrorCode.MISSING_STRATEGY_SELECTION,
    );
  }

  return normalized;
}

function resolveSelectedStrategyIds(
  input: RunStrategySweepInput,
  deps: StrategySweepRunnerDeps,
): readonly string[] {
  const selected = assertUniqueStrategyIds(input.strategyIds);

  for (const strategyId of selected) {
    if (!deps.strategyRegistry.has(strategyId)) {
      throw new StrategySweepError(
        `Unknown strategy id "${strategyId}"`,
        StrategySweepErrorCode.UNKNOWN_STRATEGY_ID,
        { strategyId },
      );
    }
  }

  return selected;
}

function compareEntries(
  left: StrategySweepMarketEntry,
  right: StrategySweepMarketEntry,
): number {
  const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
  if (bySeries !== 0) {
    return bySeries;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

function compareJobs(left: StrategySweepJob, right: StrategySweepJob): number {
  const byStrategy = left.strategyId.localeCompare(right.strategyId);
  if (byStrategy !== 0) {
    return byStrategy;
  }

  return compareEntries(left.entry, right.entry);
}

function compareRunResults(
  left: StrategySweepRunResult,
  right: StrategySweepRunResult,
): number {
  const byStrategy = left.strategyId.localeCompare(right.strategyId);
  if (byStrategy !== 0) {
    return byStrategy;
  }

  const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
  if (bySeries !== 0) {
    return bySeries;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

function loadRegistryEntries(
  registryDir: string,
  deps: StrategySweepRunnerDeps,
): StrategySweepMarketEntry[] {
  const registryPaths = deps.filesystem.listRegistryPaths(normalizePath(registryDir));
  const entries: StrategySweepMarketEntry[] = [];

  for (const registryPath of registryPaths) {
    const registry = parseStrategySweepSeriesRegistryJson(
      deps.filesystem.readFile(registryPath),
      registryPath,
    );

    for (const entry of registry.markets) {
      entries.push(entry);
    }
  }

  return [...entries].sort(compareEntries);
}

function resolveStrategyConfig(
  fixtureConfig: Record<string, unknown> | undefined,
  inputConfig: unknown,
): Record<string, unknown> {
  if (fixtureConfig && Object.keys(fixtureConfig).length > 0) {
    return fixtureConfig;
  }

  if (typeof inputConfig === "object" && inputConfig !== null && !Array.isArray(inputConfig)) {
    return inputConfig as Record<string, unknown>;
  }

  return {};
}

function buildBaselineJobs(
  input: RunStrategySweepInput,
  strategyIds: readonly string[],
  entries: readonly StrategySweepMarketEntry[],
  deps: StrategySweepRunnerDeps,
): StrategySweepJob[] {
  const normalizedOutputDir = normalizePath(input.outputDir);
  const jobs: StrategySweepJob[] = [];

  for (const strategyId of strategyIds) {
    for (const entry of entries) {
      const outputPath = buildStrategySweepOutputPath(
        normalizedOutputDir,
        strategyId,
        entry.seriesTicker,
        entry.marketTicker,
        input.parameterSetId
          ? { parameterSetId: input.parameterSetId }
          : undefined,
      );

      let fixture = null;
      let parseErrorMessage: string | null = null;
      let strategyConfig: Record<string, unknown> = {};

      if (!deps.filesystem.exists(entry.fixturePath)) {
        parseErrorMessage = `Missing fixture: ${entry.fixturePath}`;
      } else {
        try {
          fixture = deps.parseFixtureJson(
            deps.filesystem.readFile(entry.fixturePath),
            entry.marketTicker,
          );
          strategyConfig = resolveStrategyConfig(
            fixture.strategyConfig,
            input.strategyConfig,
          );
          deps.strategyRegistry.parseConfig(strategyId, strategyConfig);
        } catch (error) {
          parseErrorMessage =
            error instanceof Error ? error.message : "Failed to prepare sweep job";
        }
      }

      jobs.push({
        strategyId,
        executionStrategyId: strategyId,
        strategyConfig,
        entry,
        outputPath,
        fixture,
        parseErrorMessage,
      });
    }
  }

  return jobs;
}

function buildSynthesizedJobs(
  input: RunStrategySweepInput,
  synthesizedEntries: readonly SynthesizedStrategySweepEntry[],
  entries: readonly StrategySweepMarketEntry[],
  deps: StrategySweepRunnerDeps,
): StrategySweepJob[] {
  const normalizedOutputDir = normalizePath(input.outputDir);
  const jobs: StrategySweepJob[] = [];

  for (const synthesizedEntry of synthesizedEntries) {
    for (const entry of entries) {
      const outputPath = buildStrategySweepOutputPath(
        normalizedOutputDir,
        synthesizedEntry.sweepStrategyId,
        entry.seriesTicker,
        entry.marketTicker,
        input.parameterSetId
          ? { parameterSetId: input.parameterSetId }
          : undefined,
      );

      let fixture = null;
      let parseErrorMessage: string | null = null;

      if (!deps.filesystem.exists(entry.fixturePath)) {
        parseErrorMessage = `Missing fixture: ${entry.fixturePath}`;
      } else {
        try {
          fixture = deps.parseFixtureJson(
            deps.filesystem.readFile(entry.fixturePath),
            entry.marketTicker,
          );
          deps.strategyRegistry.parseConfig(
            synthesizedEntry.pluginStrategyId,
            synthesizedEntry.strategyConfig,
          );
        } catch (error) {
          parseErrorMessage =
            error instanceof Error ? error.message : "Failed to prepare synthesized sweep job";
        }
      }

      jobs.push({
        strategyId: synthesizedEntry.sweepStrategyId,
        executionStrategyId: synthesizedEntry.pluginStrategyId,
        strategyConfig: synthesizedEntry.strategyConfig,
        synthesized: {
          synthesizedStrategyId: synthesizedEntry.synthesizedStrategyId,
          hypothesisId: synthesizedEntry.hypothesisId,
          strategyFamily: synthesizedEntry.strategyFamily,
          pluginStrategyId: synthesizedEntry.pluginStrategyId,
        },
        entry,
        outputPath,
        fixture,
        parseErrorMessage,
      });
    }
  }

  return jobs;
}

function buildJobs(
  input: RunStrategySweepInput,
  strategyIds: readonly string[],
  synthesizedEntries: readonly SynthesizedStrategySweepEntry[],
  deps: StrategySweepRunnerDeps,
): StrategySweepJob[] {
  const entries = loadRegistryEntries(input.registryDir, deps);
  const seenOutputPaths = new Map<string, string>();
  const jobs = [
    ...buildBaselineJobs(input, strategyIds, entries, deps),
    ...buildSynthesizedJobs(input, synthesizedEntries, entries, deps),
  ].sort(compareJobs);

  for (const job of jobs) {
    const existingEntry = seenOutputPaths.get(job.outputPath);
    if (existingEntry !== undefined) {
      throw new StrategySweepError(
        `Duplicate output path: ${job.outputPath}`,
        StrategySweepErrorCode.DUPLICATE_OUTPUT_PATH,
        { strategyId: job.strategyId, marketTicker: job.entry.marketTicker },
      );
    }

    seenOutputPaths.set(
      job.outputPath,
      `${job.strategyId}/${job.entry.seriesTicker}/${job.entry.marketTicker}`,
    );
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

function toRunResult(
  job: StrategySweepJob,
  result?: {
    status: StrategySweepRunResult["status"];
    errorMessage?: string | null;
    runId?: string | null;
    durationMs?: number;
    pricingDiagnostics?: StrategySweepRunResult["pricingDiagnostics"];
  },
): StrategySweepRunResult {
  return {
    strategyId: job.strategyId,
    seriesTicker: job.entry.seriesTicker,
    marketTicker: job.entry.marketTicker,
    registryPath: job.entry.registryPath,
    fixturePath: job.entry.fixturePath,
    outputPath: job.outputPath,
    status: result?.status ?? "failed",
    errorMessage: result?.errorMessage ?? null,
    durationMs: result?.durationMs ?? 0,
    runId: result?.runId ?? job.fixture?.runId ?? null,
    ...(job.synthesized ? { synthesized: job.synthesized } : {}),
    ...(result?.pricingDiagnostics
      ? { pricingDiagnostics: result.pricingDiagnostics }
      : {}),
  };
}

async function executeJob(
  job: StrategySweepJob,
  deps: StrategySweepRunnerDeps,
): Promise<StrategySweepRunResult> {
  const startedMs = Date.now();

  if (job.parseErrorMessage) {
    return toRunResult(job, {
      status: "failed",
      errorMessage: job.parseErrorMessage,
      durationMs: Date.now() - startedMs,
    });
  }

  if (!job.fixture) {
    return toRunResult(job, {
      status: "failed",
      errorMessage: "Invalid fixture",
      durationMs: Date.now() - startedMs,
    });
  }

  try {
    const researchResult = deps.runResearch({
      fixture: job.fixture,
      strategyId: job.executionStrategyId,
      strategyConfig: job.strategyConfig,
      synthesized: job.synthesized,
    });

    if (
      researchResult === null
      || researchResult === undefined
      || typeof researchResult.researchOutput !== "string"
    ) {
      return toRunResult(job, {
        status: "failed",
        errorMessage: "Research runner returned empty or non-string output",
        runId: job.fixture.runId,
        durationMs: Date.now() - startedMs,
      });
    }

    const validation = validateSerializedResearchOutputJson(
      researchResult.researchOutput,
      job.entry.marketTicker,
    );

    if (!validation.ok) {
      return toRunResult(job, {
        status: "failed",
        errorMessage: validation.errorMessage,
        runId: job.fixture.runId,
        durationMs: Date.now() - startedMs,
      });
    }

    const serializedOutput = job.synthesized
      ? augmentResearchOutputWithSynthesizedMetadata(validation.json, {
          sweepStrategyId: job.strategyId,
          synthesized: job.synthesized,
        })
      : validation.json;

    deps.filesystem.mkdir(posix.dirname(job.outputPath));
    deps.filesystem.writeFile(job.outputPath, serializedOutput);
    deps.filesystem.writeFile(
      buildStrategySweepDecisionTracePath(job.outputPath),
      researchResult.decisionTrace,
    );

    return toRunResult(job, {
      status: "success",
      runId: job.fixture.runId,
      durationMs: Date.now() - startedMs,
      pricingDiagnostics:
        parseReplayPricingDiagnosticsFromResearchOutput(validation.json) ?? undefined,
    });
  } catch (error) {
    return toRunResult(job, {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Strategy sweep execution failed",
      runId: job.fixture.runId,
      durationMs: Date.now() - startedMs,
    });
  }
}

function countUniqueMarkets(entries: readonly StrategySweepMarketEntry[]): number {
  const seen = new Set<string>();

  for (const entry of entries) {
    seen.add(`${entry.seriesTicker}/${entry.marketTicker}`);
  }

  return seen.size;
}

/** Executes every selected strategy across every market in dataset registries. */
export async function runStrategySweep(
  input: RunStrategySweepInput,
  deps: StrategySweepRunnerDeps,
): Promise<StrategySweepSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const startMs = Date.now();
  const concurrency = parseConcurrency(input.concurrency);
  const normalizedRegistryDir = normalizePath(input.registryDir);
  const normalizedOutputDir = normalizePath(input.outputDir);
  const summaryPath = resolveStrategySweepSummaryPath(
    normalizedOutputDir,
    input.summaryPath,
  );
  const strategyIds = resolveSelectedStrategyIds(input, deps);
  const registryEntries = loadRegistryEntries(normalizedRegistryDir, deps);
  const synthesizedResolution = input.includeSynthesized
    ? resolveSynthesizedStrategySweepEntries({
        synthesisPath: input.synthesisPath,
        readFile: deps.filesystem.readFile,
        fileExists: deps.filesystem.exists,
      })
    : { entries: [], warnings: [] };
  const synthesizedStrategyIds = synthesizedResolution.entries.map(
    (entry) => entry.sweepStrategyId,
  );
  const jobs = buildJobs(
    {
      registryDir: normalizedRegistryDir,
      outputDir: normalizedOutputDir,
      strategyIds,
      strategyConfig: input.strategyConfig,
      parameterSetId: input.parameterSetId,
      summaryPath,
      concurrency,
      writeSummary: input.writeSummary,
      includeSynthesized: input.includeSynthesized,
      synthesisPath: input.synthesisPath,
    },
    strategyIds,
    synthesizedResolution.entries,
    deps,
  );

  const runResults: StrategySweepRunResult[] = [];
  const progressReporter = deps.logProgress
    ? createStrategySweepProgressReporter({
        totalJobs: jobs.length,
        totalMarkets: countUniqueMarkets(registryEntries),
        strategyIds: [...strategyIds, ...synthesizedStrategyIds],
        startedAtMs: startMs,
        isTty: deps.isProgressTty ?? false,
        write: deps.logProgress,
        now: () => Date.now(),
      })
    : null;

  await runWithConcurrency(jobs, concurrency, async (job) => {
    const result = await executeJob(job, deps);
    runResults.push(result);
    progressReporter?.recordJob(result);
  });

  progressReporter?.complete();

  runResults.sort(compareRunResults);

  const successfulRuns = runResults.filter((run) => run.status === "success").length;
  const failedRuns = runResults.filter((run) => run.status === "failed").length;
  const completedAt = now().toISOString();

  const summary: StrategySweepSummary = {
    registryDir: normalizedRegistryDir,
    outputDir: normalizedOutputDir,
    summaryPath,
    concurrency,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    strategiesExecuted: [...strategyIds],
    includeSynthesized: input.includeSynthesized === true,
    synthesizedStrategiesExecuted: synthesizedStrategyIds,
    warnings: synthesizedResolution.warnings,
    marketsTested: countUniqueMarkets(registryEntries),
    totalRuns: jobs.length,
    successfulRuns,
    failedRuns,
    runs: runResults,
  };

  if (input.writeSummary !== false) {
    deps.filesystem.mkdir(posix.dirname(summaryPath));
    deps.filesystem.writeFile(summaryPath, serializeStrategySweepSummary(summary));
  }

  return summary;
}
