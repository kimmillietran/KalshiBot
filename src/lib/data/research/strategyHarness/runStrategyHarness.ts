import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import { DATASET_REGISTRY_FILENAME } from "@/lib/data/research/batchResearch/batchResearchTypes";
import type { HistoricalResearchCliInput } from "@/lib/data/fixtures/historicalFixtureTypes";
import { parseResearchDatasetSeriesRegistryJson } from "@/lib/data/research/batchResearch/parseResearchDatasetRegistryJson";

import { buildStrategyHarnessOutputPath, resolveStrategyHarnessSummaryPath } from "./buildStrategyHarnessOutputPath";
import { resolveHarnessStrategyFromSpec } from "./createResearchStrategyHarnessRegistry";
import {
  filterHarnessStrategySpecs,
  loadStrategySynthesisCandidatesReport,
} from "./loadSynthesizedStrategySpecs";
import {
  DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR,
  DEFAULT_STRATEGY_HARNESS_SUMMARY_FILENAME,
  StrategyHarnessError,
  type RunStrategyHarnessEvaluationFn,
  type StrategyHarnessIo,
  type StrategyHarnessMarketResult,
  type StrategyHarnessSummary,
  type SynthesizedStrategySpec,
} from "./strategyHarnessTypes";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function discoverRegistryPaths(registryDir: string, io: StrategyHarnessIo): string[] {
  const normalizedDir = normalizePath(registryDir);
  const results: string[] = [];

  for (const entry of io.readdir(normalizedDir)) {
    const fullPath = posix.join(normalizedDir, entry);

    if (io.isDirectory(fullPath)) {
      const registryPath = posix.join(fullPath, DATASET_REGISTRY_FILENAME);
      if (io.fileExists(registryPath)) {
        results.push(registryPath);
      }
      continue;
    }

    if (entry === DATASET_REGISTRY_FILENAME) {
      results.push(fullPath);
    }
  }

  return results.sort((left, right) => left.localeCompare(right));
}

type RegistryMarketEntry = {
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  registryPath: string;
};

function loadRegistryMarkets(registryDir: string, io: StrategyHarnessIo): RegistryMarketEntry[] {
  const entries: RegistryMarketEntry[] = [];

  for (const registryPath of discoverRegistryPaths(registryDir, io)) {

    const registry = parseResearchDatasetSeriesRegistryJson(
      io.readFile(registryPath),
      registryPath,
    );

    for (const market of registry.markets) {
      entries.push({
        seriesTicker: market.seriesTicker,
        marketTicker: market.marketTicker,
        fixturePath: market.fixturePath,
        registryPath,
      });
    }
  }

  return entries.sort((left, right) => {
    const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
    if (bySeries !== 0) {
      return bySeries;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });
}

export type RunStrategyHarnessInput = {
  synthesisPath: string;
  registryDir: string;
  outputDir?: string;
  summaryPath?: string;
  strategyFamily?: string;
  synthesizedStrategyId?: string;
  includeRejected?: boolean;
  concurrency?: number;
  io: StrategyHarnessIo;
  parseFixtureJson: (json: string, marketTicker?: string) => HistoricalResearchCliInput;
  runEvaluation: RunStrategyHarnessEvaluationFn;
  now?: () => Date;
};

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

function compareResults(
  left: StrategyHarnessMarketResult,
  right: StrategyHarnessMarketResult,
): number {
  const byStrategy = left.synthesizedStrategyId.localeCompare(right.synthesizedStrategyId);
  if (byStrategy !== 0) {
    return byStrategy;
  }

  const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
  if (bySeries !== 0) {
    return bySeries;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

/** Evaluates synthesized strategy specs across registry markets via the research pipeline. */
export async function runStrategyHarness(
  input: RunStrategyHarnessInput,
): Promise<StrategyHarnessSummary> {
  const startedAt = input.now?.().toISOString() ?? new Date().toISOString();
  const startMs = Date.now();
  const outputDir = normalizePath(input.outputDir ?? DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR);
  const summaryPath = input.summaryPath
    ?? resolveStrategyHarnessSummaryPath(outputDir, DEFAULT_STRATEGY_HARNESS_SUMMARY_FILENAME);
  const concurrency = input.concurrency ?? 1;

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new StrategyHarnessError("concurrency must be a positive integer");
  }

  const report = loadStrategySynthesisCandidatesReport(input.io, input.synthesisPath);

  const specs = filterHarnessStrategySpecs(report.strategies, {
    strategyFamily: input.strategyFamily,
    synthesizedStrategyId: input.synthesizedStrategyId,
    includeRejected: input.includeRejected,
  });

  if (specs.length === 0) {
    input.io.mkdir(outputDir);
    const completedAt = input.now?.().toISOString() ?? new Date().toISOString();
    const summary: StrategyHarnessSummary = {
      synthesisPath: input.synthesisPath,
      registryDir: normalizePath(input.registryDir),
      outputDir,
      summaryPath,
      startedAt,
      completedAt,
      durationMs: Date.now() - startMs,
      evaluatedStrategies: 0,
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      skippedRuns: 0,
      results: [],
    };

    input.io.writeFile(summaryPath, stableStringify(summary));
    return summary;
  }

  const normalizedRegistryDir = normalizePath(input.registryDir);
  if (!input.io.isDirectory(normalizedRegistryDir)) {
    throw new StrategyHarnessError(
      `Registry directory does not exist: ${normalizedRegistryDir}`,
    );
  }

  const markets = loadRegistryMarkets(input.registryDir, input.io);
  if (markets.length === 0) {
    throw new StrategyHarnessError(`No dataset registry markets found in ${input.registryDir}`);
  }

  input.io.mkdir(outputDir);

  const results: StrategyHarnessMarketResult[] = [];

  type HarnessJob = {
    spec: SynthesizedStrategySpec;
    market: RegistryMarketEntry;
    outputPath: string;
  };

  const jobs: HarnessJob[] = [];

  for (const spec of specs) {
    resolveHarnessStrategyFromSpec(spec);

    for (const market of markets) {
      jobs.push({
        spec,
        market,
        outputPath: buildStrategyHarnessOutputPath(
          outputDir,
          spec.strategyId,
          market.seriesTicker,
          market.marketTicker,
        ),
      });
    }
  }

  await runWithConcurrency(jobs, concurrency, async (job) => {
    if (input.io.fileExists(job.outputPath)) {
      results.push({
        synthesizedStrategyId: job.spec.strategyId,
        hypothesisId: job.spec.hypothesisId,
        strategyFamily: job.spec.strategyFamily,
        seriesTicker: job.market.seriesTicker,
        marketTicker: job.market.marketTicker,
        fixturePath: job.market.fixturePath,
        outputPath: job.outputPath,
        status: "skipped",
        errorMessage: "Output file already exists",
        runId: null,
      });
      return;
    }

    try {
      const fixture = input.parseFixtureJson(
        input.io.readFile(job.market.fixturePath),
        job.market.marketTicker,
      );
      const serialized = input.runEvaluation({ spec: job.spec, fixture });
      input.io.mkdir(posix.dirname(job.outputPath));
      input.io.writeFile(job.outputPath, serialized);

      let runId: string | null = null;
      try {
        const parsed = JSON.parse(serialized) as { metadata?: { runId?: string } };
        runId = parsed.metadata?.runId ?? fixture.runId ?? null;
      } catch {
        runId = fixture.runId ?? null;
      }

      results.push({
        synthesizedStrategyId: job.spec.strategyId,
        hypothesisId: job.spec.hypothesisId,
        strategyFamily: job.spec.strategyFamily,
        seriesTicker: job.market.seriesTicker,
        marketTicker: job.market.marketTicker,
        fixturePath: job.market.fixturePath,
        outputPath: job.outputPath,
        status: "success",
        errorMessage: null,
        runId,
      });
    } catch (error) {
      results.push({
        synthesizedStrategyId: job.spec.strategyId,
        hypothesisId: job.spec.hypothesisId,
        strategyFamily: job.spec.strategyFamily,
        seriesTicker: job.market.seriesTicker,
        marketTicker: job.market.marketTicker,
        fixturePath: job.market.fixturePath,
        outputPath: job.outputPath,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Harness evaluation failed",
        runId: null,
      });
    }
  });

  const completedAt = input.now?.().toISOString() ?? new Date().toISOString();
  const sortedResults = [...results].sort(compareResults);
  const summary: StrategyHarnessSummary = {
    synthesisPath: input.synthesisPath,
    registryDir: normalizePath(input.registryDir),
    outputDir,
    summaryPath,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    evaluatedStrategies: specs.length,
    totalRuns: sortedResults.length,
    successfulRuns: sortedResults.filter((result) => result.status === "success").length,
    failedRuns: sortedResults.filter((result) => result.status === "failed").length,
    skippedRuns: sortedResults.filter((result) => result.status === "skipped").length,
    results: sortedResults,
  };

  input.io.writeFile(summaryPath, stableStringify(summary));
  return summary;
}

export function serializeStrategyHarnessSummary(summary: StrategyHarnessSummary): string {
  return stableStringify(summary);
}
