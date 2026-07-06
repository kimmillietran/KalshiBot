import type { HistoricalCoveragePlanReport } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";
import type { CoverageAwareValidationReport } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import type { HypothesisValidationReport } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HistoricalExpansionImportConfig } from "@/lib/data/importJobs/expansionConfig/expansionConfigTypes";
import type { HistoricalExpansionImportSummary } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";
import { parseExpansionMarketCalendarMonth } from "@/lib/data/research/coveragePlanner/importability/parseExpansionMarketCalendarMonth";
import { normalizeExpansionImportMarketRecords } from "@/lib/data/research/coveragePlanner/importability/estimateRecommendationImportability";

import {
  ExpansionBatchPlannerError,
  ExpansionBatchPlannerErrorCode,
  type ExpansionBatchPlannerInputPaths,
  type ExpansionBatchPlannerInputStatus,
  type ExpansionBatchPlannerIo,
} from "./expansionBatchPlannerTypes";

export type LoadedExpansionBatchPlannerInputs = {
  inputStatus: ExpansionBatchPlannerInputStatus;
  coveragePlan: HistoricalCoveragePlanReport;
  expansionConfig: HistoricalExpansionImportConfig | null;
  expansionImportSummary: HistoricalExpansionImportSummary | null;
  hypothesisValidation: HypothesisValidationReport | null;
  coverageAwareValidation: CoverageAwareValidationReport | null;
  discoveryMarketsByMonth: ReadonlyMap<string, number>;
};

function parseJsonDocument<T>(
  io: ExpansionBatchPlannerIo,
  path: string,
  label: string,
  required: boolean,
): T | null {
  if (!io.fileExists(path)) {
    if (required) {
      throw new ExpansionBatchPlannerError(
        `${label} not found at ${path}`,
        ExpansionBatchPlannerErrorCode.MISSING_INPUT,
      );
    }
    return null;
  }

  try {
    return JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as T;
  } catch {
    throw new ExpansionBatchPlannerError(
      `Invalid JSON in ${path}`,
      ExpansionBatchPlannerErrorCode.INVALID_JSON,
    );
  }
}

function assertCoveragePlan(value: unknown): HistoricalCoveragePlanReport {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ExpansionBatchPlannerError(
      "historical-coverage-plan.json must be an object",
      ExpansionBatchPlannerErrorCode.INVALID_DOCUMENT,
    );
  }

  const document = value as Partial<HistoricalCoveragePlanReport>;
  if (!document.snapshot || !document.recommendations || !document.temporalBalance) {
    throw new ExpansionBatchPlannerError(
      "historical-coverage-plan.json is missing snapshot, recommendations, or temporalBalance",
      ExpansionBatchPlannerErrorCode.INVALID_DOCUMENT,
    );
  }

  return value as HistoricalCoveragePlanReport;
}

function countDiscoveryMarketsByMonth(
  io: ExpansionBatchPlannerIo,
  path: string,
): ReadonlyMap<string, number> {
  const document = parseJsonDocument<{ markets?: readonly { marketTicker?: string }[] }>(
    io,
    path,
    "discovery-result.json",
    false,
  );

  if (!document?.markets) {
    return new Map();
  }

  const counts = new Map<string, number>();
  for (const market of document.markets) {
    const ticker = market.marketTicker;
    if (!ticker) {
      continue;
    }

    const month = parseExpansionMarketCalendarMonth(ticker);
    if (!month) {
      continue;
    }

    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  return counts;
}

function normalizeExpansionSummary(
  document: HistoricalExpansionImportSummary | null,
): HistoricalExpansionImportSummary | null {
  if (!document) {
    return null;
  }

  return document;
}

/** Loads planner inputs from configured artifact paths. */
export function loadExpansionBatchPlannerInputs(
  io: ExpansionBatchPlannerIo,
  inputPaths: ExpansionBatchPlannerInputPaths,
): LoadedExpansionBatchPlannerInputs {
  const inputStatus: ExpansionBatchPlannerInputStatus = {
    coveragePlanPresent: io.fileExists(inputPaths.coveragePlanPath),
    expansionConfigPresent: io.fileExists(inputPaths.expansionConfigPath),
    expansionImportSummaryPresent: io.fileExists(inputPaths.expansionImportSummaryPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    coverageAwareValidationPresent: io.fileExists(inputPaths.coverageAwareValidationPath),
    discoveryResultPresent: io.fileExists(inputPaths.discoveryResultPath),
  };

  const coveragePlan = assertCoveragePlan(
    parseJsonDocument(
      io,
      inputPaths.coveragePlanPath,
      "historical-coverage-plan.json",
      true,
    ),
  );

  const expansionConfig = parseJsonDocument<HistoricalExpansionImportConfig>(
    io,
    inputPaths.expansionConfigPath,
    "historical-expansion-config.json",
    false,
  );

  const expansionImportSummary = normalizeExpansionSummary(
    parseJsonDocument<HistoricalExpansionImportSummary>(
      io,
      inputPaths.expansionImportSummaryPath,
      "historical-expansion-import-summary.json",
      false,
    ),
  );

  const hypothesisValidation = parseJsonDocument<HypothesisValidationReport>(
    io,
    inputPaths.hypothesisValidationPath,
    "hypothesis-validation.json",
    false,
  );

  const coverageAwareValidation = parseJsonDocument<CoverageAwareValidationReport>(
    io,
    inputPaths.coverageAwareValidationPath,
    "coverage-aware-validation.json",
    false,
  );

  const discoveryMarketsByMonth = countDiscoveryMarketsByMonth(
    io,
    inputPaths.discoveryResultPath,
  );

  return {
    inputStatus,
    coveragePlan,
    expansionConfig,
    expansionImportSummary,
    hypothesisValidation,
    coverageAwareValidation,
    discoveryMarketsByMonth,
  };
}

/** Exposes normalized importability market records for month-level estimates. */
export function loadExpansionImportMarketRecords(
  expansionImportSummary: HistoricalExpansionImportSummary | null,
): ReturnType<typeof normalizeExpansionImportMarketRecords> {
  if (!expansionImportSummary) {
    return [];
  }

  return normalizeExpansionImportMarketRecords(
    expansionImportSummary.jobs.flatMap((job) => job.markets),
  );
}
