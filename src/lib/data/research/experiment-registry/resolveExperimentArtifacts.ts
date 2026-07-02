import { posix } from "node:path";

import { AGGREGATE_SUMMARY_FILENAME } from "@/lib/data/research/aggregation/researchAggregatePaths";
import { CALIBRATION_REPORT_FILENAME } from "@/lib/data/research/calibration/calibrationTypes";
import { buildResearchFixturePath } from "@/lib/data/research/registry/researchDatasetRegistryPaths";

import { normalizeRootPath } from "./experimentRegistryPaths";
import {
  type ExperimentLeaderboardEntry,
  type ExperimentLeaderboardSnapshot,
  type ExperimentRegistryIo,
} from "./experimentRegistryTypes";
import { hashFixtureContent } from "./hashExperimentIdentity";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveFixtureHash(
  fixturesRoot: string,
  seriesTicker: string,
  marketTicker: string,
  io: Pick<ExperimentRegistryIo, "fileExists" | "readFile">,
): string | null {
  const fixturePath = buildResearchFixturePath(fixturesRoot, seriesTicker, marketTicker);
  if (!io.fileExists(fixturePath)) {
    return null;
  }

  return hashFixtureContent(io.readFile(fixturePath));
}

export function resolveCalibrationReportPath(
  researchRoot: string,
  strategyId: string,
  seriesTicker: string,
  io: Pick<ExperimentRegistryIo, "fileExists">,
): string | null {
  const outputPath = posix.join(
    normalizeRootPath(researchRoot),
    strategyId,
    seriesTicker,
    CALIBRATION_REPORT_FILENAME,
  );

  return io.fileExists(outputPath) ? outputPath : null;
}

export function resolveLeaderboardSnapshot(
  researchRoot: string,
  seriesTicker: string,
  io: Pick<ExperimentRegistryIo, "fileExists" | "readFile">,
): ExperimentLeaderboardSnapshot | null {
  const aggregatePath = posix.join(
    normalizeRootPath(researchRoot),
    seriesTicker,
    AGGREGATE_SUMMARY_FILENAME,
  );

  if (!io.fileExists(aggregatePath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(aggregatePath));
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.markets)) {
    return null;
  }

  const ranked = parsed.markets
    .filter(isRecord)
    .map((market) => ({
      marketTicker:
        typeof market.marketTicker === "string" ? market.marketTicker : "",
      totalPnlCents:
        isRecord(market.metrics) && typeof market.metrics.totalPnlCents === "number"
          ? market.metrics.totalPnlCents
          : null,
      totalReturnPct:
        isRecord(market.metrics) && typeof market.metrics.totalReturnPct === "number"
          ? market.metrics.totalReturnPct
          : null,
      winRatePct:
        isRecord(market.metrics) && typeof market.metrics.winRatePct === "number"
          ? market.metrics.winRatePct
          : null,
    }))
    .filter((market) => market.marketTicker)
    .sort((left, right) => {
      const leftPnl = left.totalPnlCents ?? Number.NEGATIVE_INFINITY;
      const rightPnl = right.totalPnlCents ?? Number.NEGATIVE_INFINITY;
      if (leftPnl !== rightPnl) {
        return rightPnl - leftPnl;
      }

      return left.marketTicker.localeCompare(right.marketTicker);
    });

  const entries: ExperimentLeaderboardEntry[] = ranked.map((market, index) => ({
    marketTicker: market.marketTicker,
    rank: index + 1,
    totalPnlCents: market.totalPnlCents,
    totalReturnPct: market.totalReturnPct,
    winRatePct: market.winRatePct,
  }));

  return {
    sourcePath: aggregatePath,
    generatedAt:
      typeof parsed.generatedAt === "string" ? parsed.generatedAt : new Date(0).toISOString(),
    seriesTicker,
    entries,
  };
}
