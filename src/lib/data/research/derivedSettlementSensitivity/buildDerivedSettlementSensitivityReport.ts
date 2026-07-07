import { stableStringify } from "@/lib/trading/config/hashConfig";

import { analyzeDerivedSettlementSensitivity } from "./analyzeDerivedSettlementSensitivity";
import type {
  BuildDerivedSettlementSensitivityReportInput,
  DerivedSensitivityRecommendation,
  DerivedSettlementSensitivityEntry,
  DerivedSettlementSensitivityReport,
  DerivedSettlementSensitivitySummary,
} from "./derivedSettlementSensitivityTypes";

function buildSummary(
  entries: readonly DerivedSettlementSensitivityEntry[],
  derivedMarketCount: number,
): DerivedSettlementSensitivitySummary {
  const recommendationCounts = {
    robust: 0,
    "moderately-sensitive": 0,
    "highly-sensitive": 0,
    "dominated-by-derived-data": 0,
  } satisfies Record<DerivedSensitivityRecommendation, number>;

  let largestRobustnessDrop = 0;
  let largestRobustnessDropHypothesisId: string | null = null;
  let hypothesesBecomingStrongerCount = 0;
  let hypothesesBecomingWeakerCount = 0;
  let hypothesesAffectedCount = 0;

  for (const entry of entries) {
    recommendationCounts[entry.recommendation] += 1;

    if (entry.allObservations.derivedObservationCount > 0) {
      hypothesesAffectedCount += 1;
    }

    if (entry.deltaRobustness > 0) {
      hypothesesBecomingStrongerCount += 1;
    } else if (entry.deltaRobustness < 0) {
      hypothesesBecomingWeakerCount += 1;
      const drop = Math.abs(entry.deltaRobustness);
      if (drop > largestRobustnessDrop) {
        largestRobustnessDrop = drop;
        largestRobustnessDropHypothesisId = entry.hypothesisId;
      }
    }
  }

  return {
    totalHypotheses: entries.length,
    hypothesesAffectedCount,
    largestRobustnessDrop: Math.round(largestRobustnessDrop * 100) / 100,
    largestRobustnessDropHypothesisId,
    hypothesesBecomingStrongerCount,
    hypothesesBecomingWeakerCount,
    derivedMarketCount,
    recommendationCounts,
  };
}

/** Builds read-only derived-settlement sensitivity diagnostics for all hypotheses. */
export function buildDerivedSettlementSensitivityReport(
  input: BuildDerivedSettlementSensitivityReportInput,
): DerivedSettlementSensitivityReport {
  const officialById = new Map(
    input.officialOnlyValidations.map((validation) => [validation.hypothesisId, validation]),
  );

  const entries = [...input.validations]
    .sort((left, right) => left.hypothesisId.localeCompare(right.hypothesisId))
    .map((allValidation) => {
      const officialValidation = officialById.get(allValidation.hypothesisId) ?? {
        ...allValidation,
        observationCount: 0,
        robustnessScore: 0,
        passes: false,
      };

      return analyzeDerivedSettlementSensitivity({
        allValidation,
        officialValidation,
        allCalibration: input.allCalibrationByHypothesisId.get(allValidation.hypothesisId) ?? null,
        officialCalibration:
          input.officialOnlyCalibrationByHypothesisId.get(allValidation.hypothesisId) ?? null,
      });
    });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    passThreshold: input.passThreshold,
    derivedMarketCount: input.derivedMarketKeys.size,
    summary: buildSummary(entries, input.derivedMarketKeys.size),
    entries,
  };
}

export function serializeDerivedSettlementSensitivityReport(
  report: DerivedSettlementSensitivityReport,
): string {
  return stableStringify(report);
}
