import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import { DATASET_REGISTRY_FILENAME } from "@/lib/data/research/batchResearch/batchResearchTypes";
import type { HistoricalResearchCliInput } from "@/lib/data/fixtures/historicalFixtureTypes";
import { parseResearchDatasetSeriesRegistryJson } from "@/lib/data/research/batchResearch/parseResearchDatasetRegistryJson";

import { buildStrategyHarnessOutputPath, resolveStrategyHarnessSummaryPath } from "./buildStrategyHarnessOutputPath";
import { resolveHarnessStrategyFromSpec } from "./createResearchStrategyHarnessRegistry";
import {
  HARNESS_NO_MATCH_WARNING,
  loadHarnessStrategySelection,
} from "./loadSynthesizedStrategySpecs";
import { HARNESS_RESEARCH_ONLY_WARNING } from "./researchOnlyHarnessEligibility";
import {
  DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR,
  DEFAULT_STRATEGY_HARNESS_RESEARCH_ONLY_OUTPUT_DIR,
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
  researchOnlyBacktest?: boolean;
  failureAnalysisPath?: string;
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

function buildEmptyHarnessSummary(input: {
  synthesisPath: string;
  registryDir: string;
  outputDir: string;
  summaryPath: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  includeRejected: boolean;
  researchOnlyBacktest: boolean;
  strategySelection: StrategyHarnessSummary["strategySelection"];
  skippedRejectedStrategyCount: number;
  includedRejectedStrategies: boolean;
}): StrategyHarnessSummary {
  const warnings = [HARNESS_NO_MATCH_WARNING];
  if (input.researchOnlyBacktest) {
    warnings.unshift(HARNESS_RESEARCH_ONLY_WARNING);
  }

  return {
    synthesisPath: input.synthesisPath,
    registryDir: input.registryDir,
    outputDir: input.outputDir,
    summaryPath: input.summaryPath,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs: input.durationMs,
    includeRejected: input.includeRejected,
    runMode: input.researchOnlyBacktest ? "research-only" : "production",
    researchOnlyBacktest: input.researchOnlyBacktest,
    includedRejectedStrategies: input.includedRejectedStrategies,
    promotionEligible: !input.researchOnlyBacktest,
    evaluatedStrategies: 0,
    skippedRejectedStrategyCount: input.skippedRejectedStrategyCount,
    strategySelection: input.strategySelection,
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    skippedRuns: 0,
    warnings,
    results: [],
  };
}

/** Evaluates synthesized strategy specs across registry markets via the research pipeline. */
export async function runStrategyHarness(
  input: RunStrategyHarnessInput,
): Promise<StrategyHarnessSummary> {
  const startedAt = input.now?.().toISOString() ?? new Date().toISOString();
  const startMs = Date.now();
  const researchOnlyBacktest = input.researchOnlyBacktest === true;
  const includeRejected = input.includeRejected === true;

  if (researchOnlyBacktest && includeRejected) {
    throw new StrategyHarnessError(
      "--research-only-backtest cannot be combined with --include-rejected.",
    );
  }

  const outputDir = normalizePath(
    input.outputDir
    ?? (researchOnlyBacktest
      ? DEFAULT_STRATEGY_HARNESS_RESEARCH_ONLY_OUTPUT_DIR
      : DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR),
  );
  const summaryPath = input.summaryPath
    ?? resolveStrategyHarnessSummaryPath(outputDir, DEFAULT_STRATEGY_HARNESS_SUMMARY_FILENAME);
  const concurrency = input.concurrency ?? 1;
  const selectionResult = loadHarnessStrategySelection(input.io, input.synthesisPath, {
    strategyFamily: input.strategyFamily,
    synthesizedStrategyId: input.synthesizedStrategyId,
    includeRejected,
    researchOnlyBacktest,
    failureAnalysisPath: input.failureAnalysisPath,
  });
  const specs = selectionResult.specs;

  if (specs.length === 0) {
    input.io.mkdir(outputDir);
    const completedAt = input.now?.().toISOString() ?? new Date().toISOString();
    const summary = buildEmptyHarnessSummary({
      synthesisPath: input.synthesisPath,
      registryDir: normalizePath(input.registryDir),
      outputDir,
      summaryPath,
      startedAt,
      completedAt,
      durationMs: Date.now() - startMs,
      includeRejected,
      researchOnlyBacktest,
      strategySelection: selectionResult.selection,
      skippedRejectedStrategyCount: selectionResult.skippedRejectedStrategyCount,
      includedRejectedStrategies: selectionResult.includedRejectedStrategies,
    });

    input.io.writeFile(summaryPath, stableStringify(summary));
    return summary;
  }

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new StrategyHarnessError("concurrency must be a positive integer");
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
  const warnings: string[] = [];
  if (researchOnlyBacktest) {
    warnings.push(HARNESS_RESEARCH_ONLY_WARNING);
  }

  const summary: StrategyHarnessSummary = {
    synthesisPath: input.synthesisPath,
    registryDir: normalizePath(input.registryDir),
    outputDir,
    summaryPath,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    includeRejected,
    runMode: researchOnlyBacktest ? "research-only" : "production",
    researchOnlyBacktest,
    includedRejectedStrategies: selectionResult.includedRejectedStrategies,
    promotionEligible: !researchOnlyBacktest,
    evaluatedStrategies: specs.length,
    skippedRejectedStrategyCount: selectionResult.skippedRejectedStrategyCount,
    strategySelection: selectionResult.selection,
    totalRuns: sortedResults.length,
    successfulRuns: sortedResults.filter((result) => result.status === "success").length,
    failedRuns: sortedResults.filter((result) => result.status === "failed").length,
    skippedRuns: sortedResults.filter((result) => result.status === "skipped").length,
    warnings,
    results: sortedResults,
  };

  input.io.writeFile(summaryPath, stableStringify(summary));
  return summary;
}

export function serializeStrategyHarnessSummary(summary: StrategyHarnessSummary): string {
  return stableStringify(summary);
}
