import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type { OosTemporalSplitRanges } from "@/lib/data/research/oosPowerCorrection/oosPowerCorrectionTypes";
import {
  DEFAULT_OOS_CORRECTION_ALPHA,
  DEFAULT_OOS_MIN_EFFECT_CENTS,
  DEFAULT_OOS_TARGET_POWER,
} from "@/lib/data/research/oosPowerCorrection/oosPowerCorrectionTypes";

/** Prospective statistical design required before new governed preregistration. */
export const PROSPECTIVE_STATISTICAL_PROMOTION_CONTRACT_VERSION =
  "m12.7c-prospective-statistical-promotion-v1" as const;

export type ProspectiveEvidenceStoppingRule =
  | { kind: "fixed-horizon"; holdoutMonthCount: number }
  | { kind: "fixed-n"; minimumEffectiveSampleSize: number }
  | { kind: "explicit-sequential"; ruleId: string; description: string };

export type ProspectiveStatisticalPromotionContract = {
  analysisVersion: typeof PROSPECTIVE_STATISTICAL_PROMOTION_CONTRACT_VERSION;
  /** Primary estimand for holdout inference. */
  primaryEstimand: "signed-calibration-edge";
  /** Material effect threshold in probability units (same scale as OOS edge samples). */
  materialEffectThreshold: number;
  alpha: number;
  targetPower: number;
  independentObservationDefinition: "market-day-block";
  temporalSplit: OosTemporalSplitRanges;
  discoveryScope: "train-months-only";
  fdr: {
    method: "benjaminiYekutieli";
    alpha: number;
    family: "atlas-hypothesis-candidates-with-holdout-p";
  };
  power: {
    targetPower: number;
    minEffectCents: number;
    unit: "signed-calibration-edge";
  };
  stoppingRule: ProspectiveEvidenceStoppingRule;
  interpretationContract: {
    support: "holdout-corrected-pass-and-clears-mde";
    reject: "holdout-corrected-fail-or-clears-mde-false";
    inconclusive: "underpowered-or-insufficient-data-or-skipped";
  };
  contaminationPolicy: "fail-closed-if-discovery-saw-holdout";
};

export type ProspectiveDesignValidationResult = {
  valid: boolean;
  reasons: readonly string[];
  contractContentHash: string | null;
};

export function hashProspectiveDesignContent(
  contract: ProspectiveStatisticalPromotionContract,
): string {
  return fnv1a32(stableStringify(contract));
}

/**
 * Fail-closed validation of a prospective promotion design contract.
 * Missing/partial/ambiguous contracts never validate.
 */
export function validateProspectiveStatisticalPromotionContract(
  value: unknown,
): ProspectiveDesignValidationResult {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {
      valid: false,
      reasons: ["Prospective statistical promotion contract is missing or not an object"],
      contractContentHash: null,
    };
  }

  const contract = value as Record<string, unknown>;
  const reasons: string[] = [];

  if (contract.analysisVersion !== PROSPECTIVE_STATISTICAL_PROMOTION_CONTRACT_VERSION) {
    reasons.push("prospective design analysisVersion mismatch");
  }
  if (contract.primaryEstimand !== "signed-calibration-edge") {
    reasons.push("primaryEstimand must be signed-calibration-edge");
  }
  if (contract.discoveryScope !== "train-months-only") {
    reasons.push("discoveryScope must be train-months-only for true OOS promotion");
  }
  if (contract.contaminationPolicy !== "fail-closed-if-discovery-saw-holdout") {
    reasons.push("contaminationPolicy must fail closed on holdout leakage into discovery");
  }
  if (typeof contract.alpha !== "number" || !Number.isFinite(contract.alpha) || contract.alpha <= 0) {
    reasons.push("alpha must be a positive finite number");
  }
  if (
    typeof contract.targetPower !== "number"
    || !Number.isFinite(contract.targetPower)
    || contract.targetPower <= 0
    || contract.targetPower >= 1
  ) {
    reasons.push("targetPower must be in (0,1)");
  }
  if (
    typeof contract.materialEffectThreshold !== "number"
    || !Number.isFinite(contract.materialEffectThreshold)
    || contract.materialEffectThreshold <= 0
  ) {
    reasons.push("materialEffectThreshold must be a positive finite number");
  }
  if (contract.independentObservationDefinition !== "market-day-block") {
    reasons.push("independentObservationDefinition must be market-day-block");
  }

  const temporalSplit = contract.temporalSplit;
  if (
    !temporalSplit
    || typeof temporalSplit !== "object"
    || !Array.isArray((temporalSplit as OosTemporalSplitRanges).trainMonths)
    || !Array.isArray((temporalSplit as OosTemporalSplitRanges).validationMonths)
    || !Array.isArray((temporalSplit as OosTemporalSplitRanges).holdoutMonths)
  ) {
    reasons.push("temporalSplit with train/validation/holdout months is required");
  } else {
    const split = temporalSplit as OosTemporalSplitRanges;
    const train = new Set(split.trainMonths);
    const holdout = new Set(split.holdoutMonths);
    for (const month of holdout) {
      if (train.has(month)) {
        reasons.push(`holdout month ${month} overlaps train`);
      }
    }
    if (split.holdoutMonths.length === 0) {
      reasons.push("holdoutMonths must be non-empty");
    }
    if (split.trainMonths.length === 0) {
      reasons.push("trainMonths must be non-empty");
    }
  }

  const fdr = contract.fdr;
  if (
    !fdr
    || typeof fdr !== "object"
    || (fdr as { method?: unknown }).method !== "benjaminiYekutieli"
    || (fdr as { family?: unknown }).family !== "atlas-hypothesis-candidates-with-holdout-p"
  ) {
    reasons.push("fdr must declare benjaminiYekutieli over the atlas holdout-p family");
  }

  const power = contract.power;
  if (
    !power
    || typeof power !== "object"
    || (power as { unit?: unknown }).unit !== "signed-calibration-edge"
  ) {
    reasons.push("power.unit must be signed-calibration-edge");
  }

  const stopping = contract.stoppingRule;
  if (!stopping || typeof stopping !== "object" || Array.isArray(stopping)) {
    reasons.push("stoppingRule is required");
  } else {
    const kind = (stopping as { kind?: unknown }).kind;
    if (kind !== "fixed-horizon" && kind !== "fixed-n" && kind !== "explicit-sequential") {
      reasons.push("stoppingRule.kind must be fixed-horizon, fixed-n, or explicit-sequential");
    }
  }

  const interpretation = contract.interpretationContract;
  if (!interpretation || typeof interpretation !== "object") {
    reasons.push("interpretationContract is required");
  }

  if (reasons.length > 0) {
    return { valid: false, reasons, contractContentHash: null };
  }

  const typed = value as ProspectiveStatisticalPromotionContract;
  return {
    valid: true,
    reasons: [],
    contractContentHash: hashProspectiveDesignContent(typed),
  };
}

/** Fixture helper: valid contract aligned to an explicit temporal split. */
export function buildValidProspectiveStatisticalPromotionContract(
  temporalSplit: OosTemporalSplitRanges,
): ProspectiveStatisticalPromotionContract {
  return {
    analysisVersion: PROSPECTIVE_STATISTICAL_PROMOTION_CONTRACT_VERSION,
    primaryEstimand: "signed-calibration-edge",
    materialEffectThreshold: DEFAULT_OOS_MIN_EFFECT_CENTS / 100,
    alpha: DEFAULT_OOS_CORRECTION_ALPHA,
    targetPower: DEFAULT_OOS_TARGET_POWER,
    independentObservationDefinition: "market-day-block",
    temporalSplit: {
      trainMonths: [...temporalSplit.trainMonths],
      validationMonths: [...temporalSplit.validationMonths],
      holdoutMonths: [...temporalSplit.holdoutMonths],
    },
    discoveryScope: "train-months-only",
    fdr: {
      method: "benjaminiYekutieli",
      alpha: DEFAULT_OOS_CORRECTION_ALPHA,
      family: "atlas-hypothesis-candidates-with-holdout-p",
    },
    power: {
      targetPower: DEFAULT_OOS_TARGET_POWER,
      minEffectCents: DEFAULT_OOS_MIN_EFFECT_CENTS,
      unit: "signed-calibration-edge",
    },
    stoppingRule: {
      kind: "fixed-horizon",
      holdoutMonthCount: temporalSplit.holdoutMonths.length,
    },
    interpretationContract: {
      support: "holdout-corrected-pass-and-clears-mde",
      reject: "holdout-corrected-fail-or-clears-mde-false",
      inconclusive: "underpowered-or-insufficient-data-or-skipped",
    },
    contaminationPolicy: "fail-closed-if-discovery-saw-holdout",
  };
}
