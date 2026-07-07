import { DEFAULT_MIN_CALIBRATION_ERROR } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_MIN_PERIOD_OBSERVATIONS } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { analyzeMonthRegimeStability } from "./analyzeMonthRegimeStability";
import { buildMonthRegimeObservationIndex } from "./buildMonthRegimeCrossTabIndex";
import { loadMonthRegimeAnalysisInputs } from "./loadMonthRegimeAnalysisInputs";
import type {
  BuildMonthRegimeAnalysisReportInput,
  MonthRegimeAnalysisReport,
  MonthRegimeAnalysisSummary,
} from "./monthRegimeAnalysisTypes";

const STABILITY_INSTABILITY_THRESHOLD = 0.35;

function resolveConfig(
  validationConfig: { minCalibrationError?: number; minPeriodObservations?: number } | undefined,
): { minCalibrationError: number; minPeriodObservations: number } {
  return {
    minCalibrationError:
      validationConfig?.minCalibrationError ?? DEFAULT_MIN_CALIBRATION_ERROR,
    minPeriodObservations:
      validationConfig?.minPeriodObservations ?? DEFAULT_MIN_PERIOD_OBSERVATIONS,
  };
}

function buildSummary(
  analyses: readonly MonthRegimeAnalysisReport["analyses"][number][],
  emptyInputReasons: readonly string[],
): MonthRegimeAnalysisSummary {
  const instabilityValues = analyses.map((analysis) => analysis.summary.instabilityIndex);
  const averageInstabilityIndex =
    instabilityValues.length === 0
      ? 0
      : Math.round(
        (instabilityValues.reduce((sum, value) => sum + value, 0) / instabilityValues.length)
          * 1_000_000,
      ) / 1_000_000;

  const unstableCount = analyses.filter(
    (analysis) => analysis.summary.instabilityIndex >= STABILITY_INSTABILITY_THRESHOLD,
  ).length;

  return {
    totalHypotheses: analyses.length,
    stableCount: analyses.length - unstableCount,
    unstableCount,
    averageInstabilityIndex,
    emptyInputReasons,
  };
}

function buildInvestigatorNotes(
  report: Pick<MonthRegimeAnalysisReport, "summary" | "inputStatus">,
): string[] {
  const notes = [
    "Read-only diagnostic: does not modify validation, hypotheses, imports, promotions, or synthesis.",
    "Month implied/realized probabilities are derived from observation accumulators when research outputs are available.",
  ];

  if (!report.inputStatus.hypothesisValidationPresent) {
    notes.push("hypothesis-validation.json was not found; no analyses were produced.");
  }

  if (!report.inputStatus.hypothesisCandidatesPresent) {
    notes.push("hypothesis-candidates.json was not found; hypothesis text and direction parsing may be limited.");
  }

  if (!report.inputStatus.regimeTagsPresent) {
    notes.push("regime-tags.json was not found; regime and heatmap metrics may be incomplete.");
  }

  if (report.summary.emptyInputReasons.length > 0) {
    notes.push(...report.summary.emptyInputReasons);
  }

  return notes;
}

/** Builds the month/regime stability analysis report. */
export function buildMonthRegimeAnalysisReport(
  input: BuildMonthRegimeAnalysisReportInput,
): MonthRegimeAnalysisReport {
  const loaded = loadMonthRegimeAnalysisInputs(input.io, input.inputPaths);
  const config = resolveConfig(loaded.validationReport?.config);
  const emptyInputReasons: string[] = [];

  if (!loaded.validationReport) {
    emptyInputReasons.push("Missing hypothesis-validation.json");
  }

  const candidateById = new Map(
    (loaded.candidatesReport?.candidates ?? []).map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );

  const validations = loaded.validationReport?.validations ?? [];
  const candidates = loaded.candidatesReport?.candidates ?? [];

  let observationIndex: ReturnType<typeof buildMonthRegimeObservationIndex> | null = null;
  if (
    loaded.inputStatus.hypothesisCandidatesPresent
    && loaded.inputStatus.regimeTagsPresent
    && candidates.length > 0
  ) {
    observationIndex = buildMonthRegimeObservationIndex({
      candidates,
      researchResultsDir: input.inputPaths.researchResultsDir,
      regimeTagsPath: input.inputPaths.regimeTagsPath,
      io: input.io,
    });
  }

  const analyses = validations.map((validation) => {
    const candidate = candidateById.get(validation.hypothesisId) ?? null;
    const reference = candidate
      ? parseAtlasHypothesisCandidateId(candidate.candidateId)
      : null;

    const accumulator =
      reference && observationIndex
        ? observationIndex.getAccumulator(reference) ?? null
        : null;
    const crossTab =
      reference && observationIndex
        ? observationIndex.getCrossTab(reference) ?? null
        : null;

    return analyzeMonthRegimeStability({
      validation,
      candidate,
      accumulator,
      crossTab,
      config,
    });
  });

  const summary = buildSummary(analyses, emptyInputReasons);
  const report: MonthRegimeAnalysisReport = {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: loaded.inputStatus,
    config,
    summary,
    analyses,
    investigatorNotes: [],
  };

  report.investigatorNotes = buildInvestigatorNotes(report);
  return report;
}

/** Serializes the month/regime analysis report as deterministic JSON. */
export function serializeMonthRegimeAnalysisReport(report: MonthRegimeAnalysisReport): string {
  return stableStringify(report);
}
