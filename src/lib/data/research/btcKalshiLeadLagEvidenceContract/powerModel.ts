import { computeRequiredSampleSize } from "../powerAnalysis/powerAnalysisMath";

import type {
  LeadLagMaterialEffectPolicy,
  LeadLagPowerModelInputs,
  LeadLagPowerSensitivityRow,
} from "./leadLagEvidenceContractTypes";
import { LeadLagEvidenceContractError } from "./leadLagEvidenceContractTypes";
import { computeLeadLagEffectiveSampleSize } from "./statisticalUnit";

/**
 * Economic default MDE — not derived from TRAIN candidate effect estimates.
 * Rationale: must clear a typical one-tick/half-spread style buffer (~2¢) before
 * claiming a material lead-lag association worth prospective confirmation.
 */
export const DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS = 2;

export const DEFAULT_LEAD_LAG_OUTCOME_SD_CENTS = 10;

export function buildLeadLagMaterialEffectPolicy(): LeadLagMaterialEffectPolicy {
  return {
    selectionForbiddenFromTrainWinnerEstimates: true,
    defaultMaterialEffectCents: DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS,
    economicRationale:
      "Material effect defaults to a spread/fee-relevant economic buffer (2¢), not any TRAIN "
      + "shortlist median response. Candidate-specific TRAIN effects must not auto-set MDE.",
  };
}

export function deriveRequiredEffectiveEvidence(input: LeadLagPowerModelInputs): {
  requiredEffectiveN: number | null;
  reusedFunction: "powerAnalysis.computeRequiredSampleSize";
  effectiveSampleSizeCap: number | null;
} {
  if (input.materialEffectCents <= 0) {
    throw new LeadLagEvidenceContractError("materialEffectCents must be positive");
  }
  if (input.outcomeStandardDeviationCents <= 0) {
    throw new LeadLagEvidenceContractError("outcomeStandardDeviationCents must be positive");
  }

  const requiredEffectiveN = computeRequiredSampleSize({
    edgeCents: input.materialEffectCents,
    standardDeviation: input.outcomeStandardDeviationCents,
    alpha: input.alpha,
    targetPower: input.targetPower,
  });

  let effectiveSampleSizeCap: number | null = null;
  if (
    input.rawObservationCount !== undefined
    && input.independentMarketCount !== undefined
    && input.marketDayCount !== undefined
    && input.uniqueBtcTriggerCount !== undefined
  ) {
    effectiveSampleSizeCap = computeLeadLagEffectiveSampleSize({
      rawObservationCount: input.rawObservationCount,
      independentMarketCount: input.independentMarketCount,
      marketDayCount: input.marketDayCount,
      uniqueBtcTriggerCount: input.uniqueBtcTriggerCount,
    });
  }

  return {
    requiredEffectiveN,
    reusedFunction: "powerAnalysis.computeRequiredSampleSize",
    effectiveSampleSizeCap,
  };
}

export function buildLeadLagPowerSensitivityTable(input: {
  baseAlpha: number;
  baseTargetPower: number;
  baseMaterialEffectCents: number;
  baseOutcomeStandardDeviationCents: number;
}): readonly LeadLagPowerSensitivityRow[] {
  const materialEffects = [
    input.baseMaterialEffectCents,
    input.baseMaterialEffectCents * 2,
    Math.max(1, input.baseMaterialEffectCents / 2),
  ];
  const sds = [
    input.baseOutcomeStandardDeviationCents,
    input.baseOutcomeStandardDeviationCents * 1.5,
  ];
  const powers = [0.8, 0.9] as const;
  const alphas = [input.baseAlpha, 0.01].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  const rows: LeadLagPowerSensitivityRow[] = [];
  for (const alpha of alphas) {
    for (const targetPower of powers) {
      for (const materialEffectCents of materialEffects) {
        for (const outcomeStandardDeviationCents of sds) {
          const required = deriveRequiredEffectiveEvidence({
            alpha,
            targetPower,
            materialEffectCents,
            outcomeStandardDeviationCents,
          });
          rows.push({
            assumptionId:
              `alpha=${alpha}|power=${targetPower}|mde=${materialEffectCents}|sd=${outcomeStandardDeviationCents}`,
            alpha,
            targetPower,
            materialEffectCents,
            outcomeStandardDeviationCents,
            requiredEffectiveN: required.requiredEffectiveN,
            materialEffectRationale:
              "Illustrative sensitivity only; MDE is economic-policy parameterized, not TRAIN-winner-derived.",
          });
        }
      }
    }
  }

  rows.sort((left, right) => left.assumptionId.localeCompare(right.assumptionId));
  return rows;
}

/** Guard used by tests: reject hardcoded sample-size authority thresholds. */
export function assertNoHardcodedSampleSizeAuthority(sourceText: string): void {
  // Detect fixed sample-size floor authority (fifty / one-hundred) written as n comparisons.
  const fifty = 50;
  const oneHundred = 100;
  const forbidden = new RegExp(
    String.raw`(?:^|[^A-Za-z])n\s*>=\s*(?:${fifty}|${oneHundred})\b`,
    "m",
  );
  if (forbidden.test(sourceText)) {
    throw new LeadLagEvidenceContractError(
      "Lead-lag evidence contract must not hardcode fixed sample-size authority thresholds",
    );
  }
}
