import { posix } from "node:path";

import { CALIBRATION_REPORT_FILENAME } from "@/lib/data/research/calibration/calibrationTypes";
import {
  AGGREGATE_SUMMARY_FILENAME,
  assertSafePathSegment,
  normalizeRootPath,
} from "@/lib/data/research/aggregation/researchAggregatePaths";
import {
  mergeStrategyMarkets,
} from "@/lib/data/research/leaderboard/discoverStrategyAggregateSummaries";
import { parseAggregateSummaryJson } from "@/lib/data/research/leaderboard/parseAggregateSummaryJson";
import type {
  ParsedStrategyAggregateSummary,
  ScannedStrategyAggregateSummary,
} from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";

import {
  parseCalibrationReportJson,
  parseStrategyLeaderboardJson,
} from "./parseResearchReportInputs";
import type {
  LoadResearchReportInputsOptions,
  ResearchReportInputs,
  ResearchReportIo,
} from "./researchReportTypes";
import {
  DEFAULT_RESEARCH_REPORT_INPUT_DIR,
  DEFAULT_RESEARCH_REPORT_LEADERBOARD_PATH,
} from "./researchReportTypes";

function collectAggregateSummariesInDirectory(
  directoryPath: string,
  strategyId: string,
  io: ResearchReportIo,
  collected: ScannedStrategyAggregateSummary[],
): void {
  if (!io.isDirectory(directoryPath)) {
    return;
  }

  for (const entry of [...io.readdir(directoryPath)].sort()) {
    const entryPath = posix.join(directoryPath, entry);

    if (entry === AGGREGATE_SUMMARY_FILENAME && io.fileExists(entryPath)) {
      collected.push({
        strategyId,
        summaryPath: entryPath,
        summaryJson: io.readFile(entryPath),
      });
      continue;
    }

    if (io.isDirectory(entryPath)) {
      collectAggregateSummariesInDirectory(entryPath, strategyId, io, collected);
    }
  }
}

function collectCalibrationReportsInDirectory(
  directoryPath: string,
  io: ResearchReportIo,
  collected: string[],
): void {
  if (!io.isDirectory(directoryPath)) {
    return;
  }

  for (const entry of [...io.readdir(directoryPath)].sort()) {
    const entryPath = posix.join(directoryPath, entry);

    if (entry === CALIBRATION_REPORT_FILENAME && io.fileExists(entryPath)) {
      collected.push(entryPath);
      continue;
    }

    if (io.isDirectory(entryPath)) {
      collectCalibrationReportsInDirectory(entryPath, io, collected);
    }
  }
}

function discoverStrategySummaries(
  inputRoot: string,
  io: ResearchReportIo,
): ParsedStrategyAggregateSummary[] {
  const normalizedRoot = normalizeRootPath(inputRoot);
  if (!io.isDirectory(normalizedRoot)) {
    return [];
  }

  const strategyIds = [...io.readdir(normalizedRoot)]
    .map((entry) => assertSafePathSegment(entry, "strategyId"))
    .filter((entry) => io.isDirectory(posix.join(normalizedRoot, entry)))
    .sort();

  const parsedSummaries: ParsedStrategyAggregateSummary[] = [];

  for (const strategyId of strategyIds) {
    const strategyDir = posix.join(normalizedRoot, strategyId);
    const scanned: ScannedStrategyAggregateSummary[] = [];
    collectAggregateSummariesInDirectory(strategyDir, strategyId, io, scanned);

    if (scanned.length === 0) {
      continue;
    }

    const summaries = scanned.map((entry) =>
      parseAggregateSummaryJson(entry.summaryJson, entry.summaryPath),
    );
    parsedSummaries.push(
      mergeStrategyMarkets({
        strategyId,
        summaries,
        sourcePaths: scanned.map((entry) => entry.summaryPath),
      }),
    );
  }

  return parsedSummaries.sort((left, right) =>
    left.strategyId.localeCompare(right.strategyId),
  );
}

function discoverCalibrationReports(
  inputRoot: string,
  io: ResearchReportIo,
) {
  const normalizedRoot = normalizeRootPath(inputRoot);
  if (!io.isDirectory(normalizedRoot)) {
    return [];
  }

  const reportPaths: string[] = [];
  collectCalibrationReportsInDirectory(normalizedRoot, io, reportPaths);

  return reportPaths
    .sort((left, right) => left.localeCompare(right))
    .map((path) => parseCalibrationReportJson(io.readFile(path)));
}

function readOptionalLeaderboard(
  leaderboardPath: string,
  io: ResearchReportIo,
) {
  if (!io.fileExists(leaderboardPath)) {
    return null;
  }

  return parseStrategyLeaderboardJson(io.readFile(leaderboardPath));
}

/** Loads leaderboard, aggregate, and calibration inputs for report generation. */
export function loadResearchReportInputs(
  io: ResearchReportIo,
  options: LoadResearchReportInputsOptions = {},
): ResearchReportInputs {
  const inputRoot = normalizeRootPath(
    options.inputRoot ?? DEFAULT_RESEARCH_REPORT_INPUT_DIR,
  );
  const leaderboardPath = options.leaderboardPath ?? DEFAULT_RESEARCH_REPORT_LEADERBOARD_PATH;

  return {
    inputRoot,
    leaderboardPath: io.fileExists(leaderboardPath) ? leaderboardPath : null,
    leaderboard: readOptionalLeaderboard(leaderboardPath, io),
    strategySummaries: discoverStrategySummaries(inputRoot, io),
    calibrationReports: discoverCalibrationReports(inputRoot, io),
  };
}
