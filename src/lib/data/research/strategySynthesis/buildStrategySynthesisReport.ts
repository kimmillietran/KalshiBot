import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  resolveStrategySynthesisConfig,
  synthesizeStrategyCandidate,
} from "./deriveStrategySynthesisSpec";
import type {
  BuildStrategySynthesisReportInput,
  ParsedHypothesisValidationEntry,
  StrategySynthesisCandidatesReport,
  StrategySynthesisSummary,
} from "./strategySynthesisTypes";

function indexValidationsByHypothesisId(
  validations: readonly ParsedHypothesisValidationEntry[],
): Map<string, ParsedHypothesisValidationEntry> {
  const byId = new Map<string, ParsedHypothesisValidationEntry>();

  for (const validation of validations) {
    byId.set(validation.hypothesisId, validation);
  }

  return byId;
}

function buildSummary(
  strategies: StrategySynthesisCandidatesReport["strategies"],
  totalCandidates: number,
  skipReasons: readonly string[],
): StrategySynthesisSummary {
  const promotionCounts = {
    experimental: 0,
    candidate: 0,
    rejected: 0,
  };

  for (const strategy of strategies) {
    promotionCounts[strategy.promotionStatus] += 1;
  }

  return {
    totalCandidates,
    synthesizedCount: strategies.length,
    promotionCounts,
    skipReasons,
  };
}

/** Builds parameterized strategy specifications from validated hypotheses. */
export function buildStrategySynthesisReport(
  input: BuildStrategySynthesisReportInput,
): StrategySynthesisCandidatesReport {
  const config = resolveStrategySynthesisConfig(input.config);
  const validationById = indexValidationsByHypothesisId(
    input.inputs.validationReport.validations,
  );
  const minCalibrationError =
    input.inputs.candidatesReport.config.minCalibrationError;

  const strategies = [...input.inputs.candidatesReport.candidates]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((candidate) =>
      synthesizeStrategyCandidate({
        candidate,
        validation: validationById.get(candidate.candidateId) ?? null,
        minCalibrationError,
        config,
      }),
    );

  const skipReasons =
    input.inputs.candidatesReport.candidates.length === 0
      ? input.inputs.candidatesReport.summary.noCandidateReasons
      : [];

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    inputPaths: input.inputPaths,
    config,
    summary: buildSummary(
      strategies,
      input.inputs.candidatesReport.candidates.length,
      skipReasons,
    ),
    strategies,
  };
}

export function serializeStrategySynthesisReport(
  report: StrategySynthesisCandidatesReport,
): string {
  return stableStringify(report);
}
