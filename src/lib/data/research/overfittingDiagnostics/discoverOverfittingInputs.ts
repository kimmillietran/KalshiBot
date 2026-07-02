import { posix } from "node:path";

import { normalizeRootPath } from "../aggregation/researchAggregatePaths";
import { PARAMETER_SWEEP_SUMMARY_FILENAME } from "../parameterSweep/types";
import { STATISTICAL_SIGNIFICANCE_FILENAME } from "../statisticalSignificance/statisticalSignificanceTypes";
import type { StatisticalSignificanceReport } from "../statisticalSignificance/statisticalSignificanceTypes";
import { WALK_FORWARD_SWEEP_SUMMARY_FILENAME } from "../walkForwardSweep/walkForwardSweepTypes";

import type {
  FoldPerformanceMatrix,
  OverfittingDiagnosticsIo,
} from "./overfittingDiagnosticsTypes";

function parseJson<T>(json: string, sourcePath: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error(`Invalid JSON at ${sourcePath}`);
  }
}

/** Loads statistical-significance.json when present; returns null otherwise. */
export function loadStatisticalSignificanceReport(
  inputRoot: string,
  io: OverfittingDiagnosticsIo,
): { report: StatisticalSignificanceReport | null; significancePath: string | null } {
  const significancePath = posix.join(
    normalizeRootPath(inputRoot),
    STATISTICAL_SIGNIFICANCE_FILENAME,
  );

  if (!io.fileExists(significancePath)) {
    return { report: null, significancePath: null };
  }

  const report = parseJson<StatisticalSignificanceReport>(
    io.readFile(significancePath),
    significancePath,
  );
  return { report, significancePath };
}

function collectSummaryPaths(
  directoryPath: string,
  filename: string,
  io: OverfittingDiagnosticsIo,
  collected: string[],
): void {
  if (!io.isDirectory(directoryPath)) {
    return;
  }

  for (const entry of [...io.readdir(directoryPath)].sort()) {
    const entryPath = posix.join(directoryPath, entry);
    if (entry === filename && io.fileExists(entryPath)) {
      collected.push(entryPath);
      continue;
    }
    if (io.isDirectory(entryPath)) {
      collectSummaryPaths(entryPath, filename, io, collected);
    }
  }
}

function countParameterSweepConfigs(
  inputRoot: string,
  io: OverfittingDiagnosticsIo,
): number {
  const summaryPaths: string[] = [];
  collectSummaryPaths(inputRoot, PARAMETER_SWEEP_SUMMARY_FILENAME, io, summaryPaths);

  let total = 0;
  for (const summaryPath of summaryPaths.sort()) {
    const summary = parseJson<{ parameterSets?: readonly unknown[] }>(
      io.readFile(summaryPath),
      summaryPath,
    );
    total += summary.parameterSets?.length ?? 0;
  }
  return total;
}

type WalkForwardRun = {
  foldIndex: number;
  strategyId: string;
  status: string;
};

type WalkForwardSummary = {
  runs: readonly WalkForwardRun[];
};

type ResearchOutputMetrics = {
  metrics?: {
    totalPnlCents?: number;
  };
};

function buildMatrixFromWalkForwardSummary(
  summaryPath: string,
  summary: WalkForwardSummary,
  io: OverfittingDiagnosticsIo,
): FoldPerformanceMatrix | null {
  const successfulRuns = summary.runs.filter((run) => run.status === "success");
  if (successfulRuns.length === 0) {
    return null;
  }

  const folds = [...new Set(successfulRuns.map((run) => String(run.foldIndex)))].sort(
    (left, right) => Number(left) - Number(right),
  );
  const variants = [...new Set(successfulRuns.map((run) => run.strategyId))].sort();

  const performances: Record<string, Record<string, number>> = {};
  for (const variant of variants) {
    performances[variant] = {};
    for (const fold of folds) {
      performances[variant]![fold] = 0;
    }
  }

  const summaryDir = posix.dirname(summaryPath);
  for (const run of successfulRuns) {
    const outputPath = posix.join(
      summaryDir,
      run.strategyId,
      String(run.foldIndex),
      "research-output.json",
    );

    if (!io.fileExists(outputPath)) {
      continue;
    }

    const output = parseJson<ResearchOutputMetrics>(io.readFile(outputPath), outputPath);
    const foldKey = String(run.foldIndex);
    const current = performances[run.strategyId]?.[foldKey] ?? 0;
    performances[run.strategyId]![foldKey] =
      current + (output.metrics?.totalPnlCents ?? 0);
  }

  return {
    folds,
    variants,
    performances,
    sourcePath: summaryPath,
  };
}

/** Discovers walk-forward fold performance when summaries and outputs are available. */
export function discoverFoldPerformanceMatrix(
  inputRoot: string,
  io: OverfittingDiagnosticsIo,
): FoldPerformanceMatrix | null {
  const summaryPaths: string[] = [];
  collectSummaryPaths(inputRoot, WALK_FORWARD_SWEEP_SUMMARY_FILENAME, io, summaryPaths);

  for (const summaryPath of summaryPaths.sort()) {
    const summary = parseJson<WalkForwardSummary>(io.readFile(summaryPath), summaryPath);
    const matrix = buildMatrixFromWalkForwardSummary(summaryPath, summary, io);
    if (matrix && matrix.folds.length >= 2 && matrix.variants.length >= 2) {
      return matrix;
    }
  }

  return null;
}

export function countParameterSweepConfigsFromRoot(
  inputRoot: string,
  io: OverfittingDiagnosticsIo,
): number {
  return countParameterSweepConfigs(normalizeRootPath(inputRoot), io);
}
