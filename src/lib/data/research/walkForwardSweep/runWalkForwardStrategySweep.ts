import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import { validateSerializedResearchOutputJson } from "@/lib/data/research/runner/validateSerializedResearchOutputJson";

import {
  buildWalkForwardSweepOutputPath,
  discoverWalkForwardSplit,
  resolveWalkForwardSweepSummaryPath,
} from "./discoverWalkForwardSplit";
import {
  WalkForwardSweepError,
  WalkForwardSweepErrorCode,
  DEFAULT_WALK_FORWARD_SWEEP_OUTPUT_DIR,
  DEFAULT_WALK_FORWARD_SPLIT_INPUT_DIR,
} from "./walkForwardSweepTypes";
import type {
  RunWalkForwardStrategySweepInput,
  WalkForwardSweepJob,
  WalkForwardSweepRunResult,
  WalkForwardSweepRunnerDeps,
  WalkForwardSweepSummary,
} from "./walkForwardSweepTypes";

function parseConcurrency(value: number | undefined): number {
  const concurrency = value ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new WalkForwardSweepError(
      "concurrency must be a positive integer",
      WalkForwardSweepErrorCode.INVALID_CONCURRENCY,
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
      throw new WalkForwardSweepError(
        `Duplicate strategy id "${trimmed}"`,
        WalkForwardSweepErrorCode.DUPLICATE_STRATEGY_ID,
        { strategyId: trimmed },
      );
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  if (normalized.length === 0) {
    throw new WalkForwardSweepError(
      "At least one strategy id is required",
      WalkForwardSweepErrorCode.MISSING_STRATEGY_SELECTION,
    );
  }

  return normalized;
}

function resolveSelectedStrategyIds(
  input: RunWalkForwardStrategySweepInput,
  deps: WalkForwardSweepRunnerDeps,
): readonly string[] {
  const selected = assertUniqueStrategyIds(input.strategyIds);

  for (const strategyId of selected) {
    if (!deps.strategyRegistry.has(strategyId)) {
      throw new WalkForwardSweepError(
        `Unknown strategy id "${strategyId}"`,
        WalkForwardSweepErrorCode.UNKNOWN_STRATEGY_ID,
        { strategyId, splitId: input.splitId },
      );
    }
  }

  return selected;
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

function compareJobs(left: WalkForwardSweepJob, right: WalkForwardSweepJob): number {
  if (left.foldIndex !== right.foldIndex) {
    return left.foldIndex - right.foldIndex;
  }

  const byStrategy = left.strategyId.localeCompare(right.strategyId);
  if (byStrategy !== 0) {
    return byStrategy;
  }

  const bySeries = left.market.seriesTicker.localeCompare(right.market.seriesTicker);
  if (bySeries !== 0) {
    return bySeries;
  }

  return left.market.marketTicker.localeCompare(right.market.marketTicker);
}

function compareRunResults(
  left: WalkForwardSweepRunResult,
  right: WalkForwardSweepRunResult,
): number {
  if (left.foldIndex !== right.foldIndex) {
    return left.foldIndex - right.foldIndex;
  }

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

function buildJobs(
  input: RunWalkForwardStrategySweepInput,
  strategyIds: readonly string[],
  deps: WalkForwardSweepRunnerDeps,
): WalkForwardSweepJob[] {
  const splitInputDir = input.splitInputDir ?? DEFAULT_WALK_FORWARD_SPLIT_INPUT_DIR;
  const outputDir = input.outputDir ?? DEFAULT_WALK_FORWARD_SWEEP_OUTPUT_DIR;
  const split = discoverWalkForwardSplit(input.splitId, splitInputDir, deps.filesystem);
  const seenOutputPaths = new Map<string, string>();
  const jobs: WalkForwardSweepJob[] = [];

  for (const fold of split.folds) {
    for (const strategyId of strategyIds) {
      for (const market of fold.validationMarkets) {
        const outputPath = buildWalkForwardSweepOutputPath(
          outputDir,
          split.splitId,
          fold.foldIndex,
          strategyId,
          market.seriesTicker,
          market.marketTicker,
        );

        const existingEntry = seenOutputPaths.get(outputPath);
        if (existingEntry !== undefined) {
          throw new WalkForwardSweepError(
            `Duplicate output path: ${outputPath}`,
            WalkForwardSweepErrorCode.DUPLICATE_OUTPUT_PATH,
            {
              splitId: split.splitId,
              foldIndex: fold.foldIndex,
              strategyId,
              marketTicker: market.marketTicker,
            },
          );
        }

        seenOutputPaths.set(
          outputPath,
          `${fold.foldIndex}/${strategyId}/${market.marketTicker}`,
        );

        let fixture = null;
        let parseErrorMessage: string | null = null;
        let strategyConfig: Record<string, unknown> = {};

        if (!deps.filesystem.exists(market.fixturePath)) {
          parseErrorMessage = `Missing fixture: ${market.fixturePath}`;
        } else {
          try {
            fixture = deps.parseFixtureJson(
              deps.filesystem.readFile(market.fixturePath),
              market.marketTicker,
            );
            strategyConfig = resolveStrategyConfig(
              fixture.strategyConfig,
              input.strategyConfig,
            );
            deps.strategyRegistry.parseConfig(strategyId, strategyConfig);
          } catch (error) {
            parseErrorMessage =
              error instanceof Error ? error.message : "Failed to prepare walk-forward sweep job";
          }
        }

        jobs.push({
          splitId: split.splitId,
          foldIndex: fold.foldIndex,
          foldMetadata: fold.metadata,
          strategyId,
          strategyConfig,
          market,
          outputPath,
          fixture,
          parseErrorMessage,
        });
      }
    }
  }

  return jobs.sort(compareJobs);
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
  job: WalkForwardSweepJob,
  result?: {
    status: WalkForwardSweepRunResult["status"];
    errorMessage?: string | null;
    runId?: string | null;
    durationMs?: number;
  },
): WalkForwardSweepRunResult {
  return {
    splitId: job.splitId,
    foldIndex: job.foldIndex,
    strategyId: job.strategyId,
    seriesTicker: job.market.seriesTicker,
    marketTicker: job.market.marketTicker,
    fixturePath: job.market.fixturePath,
    outputPath: job.outputPath,
    status: result?.status ?? "failed",
    errorMessage: result?.errorMessage ?? null,
    durationMs: result?.durationMs ?? 0,
    runId: result?.runId ?? job.fixture?.runId ?? null,
    foldMetadata: job.foldMetadata,
  };
}

async function executeJob(
  job: WalkForwardSweepJob,
  deps: WalkForwardSweepRunnerDeps,
): Promise<WalkForwardSweepRunResult> {
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
    const serialized = deps.runResearch({
      fixture: job.fixture,
      strategyId: job.strategyId,
      strategyConfig: job.strategyConfig,
    });
    const validation = validateSerializedResearchOutputJson(
      serialized,
      job.market.marketTicker,
    );

    if (!validation.ok) {
      return toRunResult(job, {
        status: "failed",
        errorMessage: validation.errorMessage,
        runId: job.fixture.runId,
        durationMs: Date.now() - startedMs,
      });
    }

    deps.filesystem.mkdir(posix.dirname(job.outputPath));
    deps.filesystem.writeFile(job.outputPath, validation.json);

    return toRunResult(job, {
      status: "success",
      runId: job.fixture.runId,
      durationMs: Date.now() - startedMs,
    });
  } catch (error) {
    return toRunResult(job, {
      status: "failed",
      errorMessage:
        error instanceof Error ? error.message : "Walk-forward strategy sweep execution failed",
      runId: job.fixture.runId,
      durationMs: Date.now() - startedMs,
    });
  }
}

function countUniqueMarkets(jobs: readonly WalkForwardSweepJob[]): number {
  const seen = new Set<string>();

  for (const job of jobs) {
    seen.add(`${job.market.seriesTicker}/${job.market.marketTicker}`);
  }

  return seen.size;
}

function countUniqueFolds(jobs: readonly WalkForwardSweepJob[]): number {
  const seen = new Set<number>();

  for (const job of jobs) {
    seen.add(job.foldIndex);
  }

  return seen.size;
}

/** Executes selected strategies on walk-forward validation folds only. */
export async function runWalkForwardStrategySweep(
  input: RunWalkForwardStrategySweepInput,
  deps: WalkForwardSweepRunnerDeps,
): Promise<WalkForwardSweepSummary> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const startMs = Date.now();
  const concurrency = parseConcurrency(input.concurrency);
  const splitInputDir = input.splitInputDir ?? DEFAULT_WALK_FORWARD_SPLIT_INPUT_DIR;
  const outputDir = input.outputDir ?? DEFAULT_WALK_FORWARD_SWEEP_OUTPUT_DIR;
  const summaryPath = resolveWalkForwardSweepSummaryPath(
    outputDir,
    input.splitId,
    input.summaryPath,
  );
  const strategyIds = resolveSelectedStrategyIds(input, deps);
  const jobs = buildJobs(input, strategyIds, deps);
  const runResults: WalkForwardSweepRunResult[] = [];

  await runWithConcurrency(jobs, concurrency, async (job) => {
    const result = await executeJob(job, deps);
    runResults.push(result);
  });

  runResults.sort(compareRunResults);

  const successfulRuns = runResults.filter((run) => run.status === "success").length;
  const failedRuns = runResults.filter((run) => run.status === "failed").length;
  const completedAt = now().toISOString();

  const summary: WalkForwardSweepSummary = {
    splitId: input.splitId.trim(),
    splitInputDir,
    outputDir,
    summaryPath,
    concurrency,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    foldsExecuted: countUniqueFolds(jobs),
    strategiesExecuted: [...strategyIds],
    marketsEvaluated: countUniqueMarkets(jobs),
    totalRuns: jobs.length,
    successfulRuns,
    failedRuns,
    runs: runResults,
  };

  deps.filesystem.mkdir(posix.dirname(summaryPath));
  deps.filesystem.writeFile(summaryPath, serializeWalkForwardSweepSummary(summary));

  return summary;
}

export function serializeWalkForwardSweepSummary(
  summary: WalkForwardSweepSummary,
): string {
  return stableStringify({
    splitId: summary.splitId,
    splitInputDir: summary.splitInputDir,
    outputDir: summary.outputDir,
    summaryPath: summary.summaryPath,
    concurrency: summary.concurrency,
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: summary.durationMs,
    foldsExecuted: summary.foldsExecuted,
    strategiesExecuted: [...summary.strategiesExecuted],
    marketsEvaluated: summary.marketsEvaluated,
    totalRuns: summary.totalRuns,
    successfulRuns: summary.successfulRuns,
    failedRuns: summary.failedRuns,
    runs: [...summary.runs],
  });
}
