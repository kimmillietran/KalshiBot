import { dirname, posix } from "node:path";

import { buildBatchFixtureOutputPath } from "@/lib/data/importJobs/batchFixtureBridge/buildBatchFixtureOutputPath";
import {
  BATCH_FIXTURE_IMPORT_RESULT_FILENAME,
} from "@/lib/data/importJobs/batchFixtureBridge/batchFixtureBridgeTypes";
import { validateSerializedBatchFixtureJson } from "@/lib/data/importJobs/batchFixtureBridge/validateSerializedBatchFixtureJson";
import { buildBatchResearchOutputPath } from "@/lib/data/research/batchResearch/buildBatchResearchOutputPath";
import {
  buildResearchDatasetRegistryFromDirectories,
  buildResearchDatasetRegistryOutputPaths,
  serializeResearchDatasetSeriesRegistry,
} from "@/lib/data/research/registry";
import type { ResearchDatasetSeriesRegistry } from "@/lib/data/research/registry";
import { validateSerializedResearchOutputJson } from "@/lib/data/research/runner/validateSerializedResearchOutputJson";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { collectExpansionRebuildMetrics } from "./collectExpansionRebuildMetrics";
import {
  ExpansionRebuildError,
  ExpansionRebuildErrorCode,
  type ExpansionRebuildFixtureMarketResult,
  type ExpansionRebuildIo,
  type ExpansionRebuildResearchMarketResult,
  type ExpansionRebuildSummary,
  type ExpansionRebuildTargetMarket,
  type RunExpansionRebuildDeps,
  type RunExpansionRebuildInput,
} from "./expansionRebuildTypes";
import {
  extractImportedExpansionMarkets,
  loadHistoricalExpansionImportSummary,
} from "./loadHistoricalExpansionImportSummary";

function normalizePath(path: string): string {
  return posix.normalize(path.replace(/\\/g, "/"));
}

function buildMarketKey(seriesTicker: string, marketTicker: string): string {
  return `${seriesTicker}/${marketTicker}`;
}

function parseConcurrency(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new ExpansionRebuildError(
      "concurrency must be a positive integer",
      ExpansionRebuildErrorCode.INVALID_CONCURRENCY,
    );
  }

  return value;
}

function discoverImportPaths(importsDir: string, io: ExpansionRebuildIo): string[] {
  const normalizedRoot = normalizePath(importsDir);
  if (!io.fileExists(normalizedRoot) || !io.isDirectory(normalizedRoot)) {
    return [];
  }

  const paths: string[] = [];

  function walk(directoryPath: string): void {
    for (const entry of [...io.readdir(directoryPath)].sort()) {
      const entryPath = posix.join(directoryPath, entry);
      if (io.isDirectory(entryPath)) {
        walk(entryPath);
        continue;
      }

      if (entry === BATCH_FIXTURE_IMPORT_RESULT_FILENAME) {
        paths.push(normalizePath(entryPath));
      }
    }
  }

  walk(normalizedRoot);
  return paths.sort((left, right) => left.localeCompare(right));
}

function resolveTargetMarkets(
  input: RunExpansionRebuildInput,
  io: ExpansionRebuildIo,
): ExpansionRebuildTargetMarket[] {
  if (input.fullRebuild) {
    const importPaths = discoverImportPaths(input.importsDir, io);
    const seen = new Set<string>();
    const markets: ExpansionRebuildTargetMarket[] = [];

    for (const importPath of importPaths) {
      try {
        const { seriesTicker, marketTicker } = buildBatchFixtureOutputPath(
          normalizePath(input.importsDir),
          normalizePath(input.fixturesDir),
          importPath,
        );
        const key = buildMarketKey(seriesTicker, marketTicker);
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        markets.push({
          seriesTicker,
          marketTicker,
          importResultPath: importPath,
        });
      } catch {
        continue;
      }
    }

    return markets;
  }

  const summary = loadHistoricalExpansionImportSummary(io, input.expansionImportSummaryPath);
  const markets = extractImportedExpansionMarkets(summary);

  if (markets.length === 0) {
    throw new ExpansionRebuildError(
      "No imported markets found in expansion import summary",
      ExpansionRebuildErrorCode.NO_TARGET_MARKETS,
    );
  }

  return markets;
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

async function buildFixtures(
  input: RunExpansionRebuildInput,
  io: ExpansionRebuildIo,
  deps: RunExpansionRebuildDeps,
  targets: readonly ExpansionRebuildTargetMarket[],
  concurrency: number,
): Promise<ExpansionRebuildFixtureMarketResult[]> {
  const normalizedImportsDir = normalizePath(input.importsDir);
  const normalizedFixturesDir = normalizePath(input.fixturesDir);
  const results: ExpansionRebuildFixtureMarketResult[] = [];

  await runWithConcurrency(targets, concurrency, async (target) => {
    const { fixturePath } = buildBatchFixtureOutputPath(
      normalizedImportsDir,
      normalizedFixturesDir,
      target.importResultPath,
    );

    if (io.fileExists(fixturePath) && !input.fullRebuild) {
      results.push({
        marketTicker: target.marketTicker,
        seriesTicker: target.seriesTicker,
        importResultPath: target.importResultPath,
        fixturePath,
        status: "skipped",
        errorMessage: "Output file already exists",
      });
      return;
    }

    if (!io.fileExists(target.importResultPath)) {
      results.push({
        marketTicker: target.marketTicker,
        seriesTicker: target.seriesTicker,
        importResultPath: target.importResultPath,
        fixturePath,
        status: "failed",
        errorMessage: `Missing import result: ${target.importResultPath}`,
      });
      return;
    }

    try {
      const importResult = deps.parseImportResultJson(io.readFile(target.importResultPath));
      const serialized = deps.runFixtureBridge({
        importPath: target.importResultPath,
        importResult,
        marketTicker: target.marketTicker,
      });
      const validation = validateSerializedBatchFixtureJson(serialized);

      if (!validation.ok) {
        results.push({
          marketTicker: target.marketTicker,
          seriesTicker: target.seriesTicker,
          importResultPath: target.importResultPath,
          fixturePath,
          status: "failed",
          errorMessage: validation.errorMessage,
        });
        return;
      }

      io.mkdirSync(posix.dirname(fixturePath), { recursive: true });
      io.writeFile(fixturePath, validation.json);

      results.push({
        marketTicker: target.marketTicker,
        seriesTicker: target.seriesTicker,
        importResultPath: target.importResultPath,
        fixturePath,
        status: "success",
        errorMessage: null,
      });
    } catch (error) {
      results.push({
        marketTicker: target.marketTicker,
        seriesTicker: target.seriesTicker,
        importResultPath: target.importResultPath,
        fixturePath,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Fixture bridge failed",
      });
    }
  });

  return results.sort((left, right) => {
    const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
    if (bySeries !== 0) {
      return bySeries;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });
}

function rebuildRegistry(
  input: RunExpansionRebuildInput,
  io: ExpansionRebuildIo,
): {
  registries: readonly ResearchDatasetSeriesRegistry[];
  registrySeriesCount: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  const registries = buildResearchDatasetRegistryFromDirectories(
    normalizePath(input.fixturesDir),
    input.metadataDir ? normalizePath(input.metadataDir) : null,
    {
      readdir: (path) => io.readdir(path),
      readFile: (path) => io.readFile(path),
      fileExists: (path) => io.fileExists(path),
      isDirectory: (path) => io.isDirectory(path),
    },
    { generatedAt: input.generatedAt },
  );

  const outputPaths = buildResearchDatasetRegistryOutputPaths(
    normalizePath(input.registryDir),
    registries,
  );

  for (let index = 0; index < registries.length; index += 1) {
    const registry = registries[index];
    const outputPath = outputPaths[index];
    if (!registry || !outputPath) {
      continue;
    }

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeResearchDatasetSeriesRegistry(registry));
  }

  if (registries.length === 0) {
    warnings.push("Registry rebuild produced zero series registries");
  }

  return {
    registries,
    registrySeriesCount: registries.length,
    warnings,
  };
}

function buildResearchJobs(
  input: RunExpansionRebuildInput,
  targets: readonly ExpansionRebuildTargetMarket[],
  fixtureResults: readonly ExpansionRebuildFixtureMarketResult[],
  registries: readonly ResearchDatasetSeriesRegistry[],
): Array<{
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  outputPath: string;
}> {
  const normalizedOutputDir = normalizePath(input.researchResultsDir);
  const targetKeys = new Set(
    targets.map((target) => buildMarketKey(target.seriesTicker, target.marketTicker)),
  );
  const jobs = new Map<
    string,
    {
      seriesTicker: string;
      marketTicker: string;
      fixturePath: string;
      outputPath: string;
    }
  >();

  for (const registry of registries) {
    for (const entry of registry.markets) {
      const key = buildMarketKey(entry.seriesTicker, entry.marketTicker);
      if (!input.fullRebuild && !targetKeys.has(key)) {
        continue;
      }

      jobs.set(key, {
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
        fixturePath: entry.fixturePath,
        outputPath: buildBatchResearchOutputPath(
          normalizedOutputDir,
          entry.seriesTicker,
          entry.marketTicker,
        ),
      });
    }
  }

  for (const result of fixtureResults) {
    if (result.status !== "success" && result.status !== "skipped") {
      continue;
    }

    const key = buildMarketKey(result.seriesTicker, result.marketTicker);
    if (!input.fullRebuild && !targetKeys.has(key)) {
      continue;
    }

    if (jobs.has(key)) {
      continue;
    }

    jobs.set(key, {
      seriesTicker: result.seriesTicker,
      marketTicker: result.marketTicker,
      fixturePath: result.fixturePath,
      outputPath: buildBatchResearchOutputPath(
        normalizedOutputDir,
        result.seriesTicker,
        result.marketTicker,
      ),
    });
  }

  return [...jobs.values()].sort((left, right) => {
    const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
    if (bySeries !== 0) {
      return bySeries;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });
}

async function runResearchForTargets(
  input: RunExpansionRebuildInput,
  io: ExpansionRebuildIo,
  deps: RunExpansionRebuildDeps,
  targets: readonly ExpansionRebuildTargetMarket[],
  fixtureResults: readonly ExpansionRebuildFixtureMarketResult[],
  registries: readonly ResearchDatasetSeriesRegistry[],
  concurrency: number,
): Promise<ExpansionRebuildResearchMarketResult[]> {
  const jobs = buildResearchJobs(input, targets, fixtureResults, registries);

  const results: ExpansionRebuildResearchMarketResult[] = [];

  await runWithConcurrency(jobs, concurrency, async (job) => {
    if (io.fileExists(job.outputPath) && !input.fullRebuild) {
      results.push({
        marketTicker: job.marketTicker,
        seriesTicker: job.seriesTicker,
        fixturePath: job.fixturePath,
        outputPath: job.outputPath,
        status: "skipped",
        errorMessage: "Output file already exists",
        runId: null,
      });
      return;
    }

    try {
      const fixture = deps.parseFixtureJson(io.readFile(job.fixturePath), job.marketTicker);
      const serialized = deps.runResearch({
        fixture,
        marketTicker: job.marketTicker,
        seriesTicker: job.seriesTicker,
      });
      const validation = validateSerializedResearchOutputJson(serialized, job.marketTicker);

      if (!validation.ok) {
        results.push({
          marketTicker: job.marketTicker,
          seriesTicker: job.seriesTicker,
          fixturePath: job.fixturePath,
          outputPath: job.outputPath,
          status: "failed",
          errorMessage: validation.errorMessage,
          runId: fixture.runId ?? null,
        });
        return;
      }

      io.mkdirSync(dirname(job.outputPath), { recursive: true });
      io.writeFile(job.outputPath, validation.json);

      results.push({
        marketTicker: job.marketTicker,
        seriesTicker: job.seriesTicker,
        fixturePath: job.fixturePath,
        outputPath: job.outputPath,
        status: "success",
        errorMessage: null,
        runId: fixture.runId ?? null,
      });
    } catch (error) {
      results.push({
        marketTicker: job.marketTicker,
        seriesTicker: job.seriesTicker,
        fixturePath: job.fixturePath,
        outputPath: job.outputPath,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Research replay failed",
        runId: null,
      });
    }
  });

  return results.sort((left, right) => {
    const bySeries = left.seriesTicker.localeCompare(right.seriesTicker);
    if (bySeries !== 0) {
      return bySeries;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });
}

function countStatus<T extends { status: "success" | "failed" | "skipped" }>(
  results: readonly T[],
  status: T["status"],
): number {
  return results.filter((result) => result.status === status).length;
}

/** Rebuilds fixtures and research outputs after historical expansion imports. */
export async function runExpansionRebuild(
  input: RunExpansionRebuildInput,
  io: ExpansionRebuildIo,
  deps: RunExpansionRebuildDeps,
): Promise<ExpansionRebuildSummary> {
  const startedAt = Date.now();
  const concurrency = parseConcurrency(input.concurrency);
  const warnings: string[] = [];

  if (!input.fullRebuild) {
    loadHistoricalExpansionImportSummary(io, input.expansionImportSummaryPath);
  }

  const before = collectExpansionRebuildMetrics(io, {
    importConfigsDir: normalizePath(input.importConfigsDir),
    fixturesDir: normalizePath(input.fixturesDir),
    researchResultsDir: normalizePath(input.researchResultsDir),
    registryDir: normalizePath(input.registryDir),
    mispricingAtlasPath: normalizePath(input.mispricingAtlasPath),
  });

  const targets = resolveTargetMarkets(input, io);

  if (input.fullRebuild && targets.length === 0) {
    throw new ExpansionRebuildError(
      "No import results discovered for full rebuild",
      ExpansionRebuildErrorCode.NO_TARGET_MARKETS,
    );
  }

  const fixtureResults = await buildFixtures(input, io, deps, targets, concurrency);
  const registryResult = rebuildRegistry(input, io);
  warnings.push(...registryResult.warnings);

  const researchResults = await runResearchForTargets(
    input,
    io,
    deps,
    targets,
    fixtureResults,
    registryResult.registries,
    concurrency,
  );

  const after = collectExpansionRebuildMetrics(io, {
    importConfigsDir: normalizePath(input.importConfigsDir),
    fixturesDir: normalizePath(input.fixturesDir),
    researchResultsDir: normalizePath(input.researchResultsDir),
    registryDir: normalizePath(input.registryDir),
    mispricingAtlasPath: normalizePath(input.mispricingAtlasPath),
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPath: input.expansionImportSummaryPath,
    fullRebuild: input.fullRebuild,
    targetMarketCount: targets.length,
    before,
    after,
    fixtureResults,
    researchResults,
    summary: {
      fixturesBuilt: countStatus(fixtureResults, "success"),
      fixturesSkipped: countStatus(fixtureResults, "skipped"),
      fixturesFailed: countStatus(fixtureResults, "failed"),
      researchRunsSucceeded: countStatus(researchResults, "success"),
      researchRunsSkipped: countStatus(researchResults, "skipped"),
      researchRunsFailed: countStatus(researchResults, "failed"),
      registrySeriesCount: registryResult.registrySeriesCount,
      durationMs: Date.now() - startedAt,
    },
    warnings,
  };
}

/** Serializes expansion rebuild summary to stable JSON. */
export function serializeExpansionRebuildSummary(summary: ExpansionRebuildSummary): string {
  return stableStringify(summary);
}
