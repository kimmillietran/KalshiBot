import { StrategyHarnessError } from "@/lib/data/research/strategyHarness/strategyHarnessTypes";
import {
  HARNESS_DEFAULT_PROMOTION_STATUSES,
} from "@/lib/data/research/strategyHarness/loadSynthesizedStrategySpecs";
import {
  deriveYesMidThresholdCents,
  normalizeHarnessStrategyFamily,
  normalizeSynthesizedStrategySpec,
  type RawSynthesizedStrategySpec,
} from "@/lib/data/research/strategyHarness/normalizeSynthesizedStrategySpec";
import type { StrategySynthesisRejectionCategory } from "./strategySynthesisDebugTypes";

export type HarnessEligibilityDiagnosis = {
  eligible: boolean;
  rejectionReasons: string[];
  rejectionCategories: StrategySynthesisRejectionCategory[];
  missingFields: string[];
};

function addUniqueCategory(
  categories: StrategySynthesisRejectionCategory[],
  category: StrategySynthesisRejectionCategory,
): void {
  if (!categories.includes(category)) {
    categories.push(category);
  }
}

/** Diagnoses harness eligibility for one raw synthesized strategy with explicit rejection reasons. */
export function diagnoseHarnessStrategyEligibility(
  rawStrategy: RawSynthesizedStrategySpec,
  options?: { includeRejected?: boolean },
): HarnessEligibilityDiagnosis {
  const includeRejected = options?.includeRejected === true;
  const rejectionReasons: string[] = [];
  const rejectionCategories: StrategySynthesisRejectionCategory[] = [];
  const missingFields: string[] = [];

  const promotionAllowed =
    includeRejected
    || HARNESS_DEFAULT_PROMOTION_STATUSES.includes(
      rawStrategy.promotionStatus as (typeof HARNESS_DEFAULT_PROMOTION_STATUSES)[number],
    );

  if (!promotionAllowed) {
    rejectionReasons.push(
      `promotionStatus "${rawStrategy.promotionStatus}" is excluded by default harness filters (allowed: ${HARNESS_DEFAULT_PROMOTION_STATUSES.join(", ")}).`,
    );
    addUniqueCategory(rejectionCategories, "promotion-rejected");
    addUniqueCategory(rejectionCategories, "harness-filter-excluded");
  }

  const normalizedFamily = normalizeHarnessStrategyFamily(rawStrategy.strategyFamily);
  if (!normalizedFamily) {
    rejectionReasons.push(
      `strategyFamily "${rawStrategy.strategyFamily}" is not supported by the harness bridge (supported: calibration-fade and aliases).`,
    );
    addUniqueCategory(rejectionCategories, "unsupported-strategy-family");
  }

  if (!rawStrategy.exitAssumption?.trim()) {
    missingFields.push("exitAssumption");
    rejectionReasons.push("exitAssumption is missing or empty.");
    addUniqueCategory(rejectionCategories, "unsupported-entry-exit-condition");
  }

  if (!rawStrategy.entryConditions?.summary?.trim()) {
    missingFields.push("entryConditions.summary");
  }

  const hasExplicitThreshold =
    typeof rawStrategy.entryConditions?.yesMidThresholdCents === "number";
  const hasMarketCondition =
    typeof rawStrategy.entryConditions?.marketCondition === "string"
    && rawStrategy.entryConditions.marketCondition.trim().length > 0;

  if (!hasExplicitThreshold && !hasMarketCondition) {
    missingFields.push("entryConditions.yesMidThresholdCents");
    missingFields.push("entryConditions.marketCondition");
    rejectionReasons.push(
      "Entry conditions lack yesMidThresholdCents and a derivable probability range in marketCondition.",
    );
    addUniqueCategory(rejectionCategories, "missing-entry-threshold");
  } else if (!hasExplicitThreshold && hasMarketCondition) {
    try {
      deriveYesMidThresholdCents({
        direction: rawStrategy.direction,
        entryConditions: rawStrategy.entryConditions,
      });
    } catch (error) {
      const message =
        error instanceof StrategyHarnessError
          ? error.message
          : "Entry threshold could not be derived from marketCondition.";
      rejectionReasons.push(message);
      addUniqueCategory(rejectionCategories, "missing-entry-threshold");
    }
  }

  let normalizationSucceeded = false;
  try {
    normalizeSynthesizedStrategySpec(rawStrategy);
    normalizationSucceeded = true;
  } catch (error) {
    const message =
      error instanceof StrategyHarnessError
        ? error.message
        : "Strategy failed harness schema normalization.";
    if (!rejectionReasons.includes(message)) {
      rejectionReasons.push(message);
    }
    addUniqueCategory(rejectionCategories, "harness-schema-mismatch");
  }

  const eligible =
    promotionAllowed
    && normalizedFamily !== null
    && normalizationSucceeded
    && rejectionCategories.filter(
      (category) =>
        category !== "threshold-mismatch"
        && category !== "promotion-rejected"
        && category !== "harness-filter-excluded",
    ).length === 0;

  return {
    eligible,
    rejectionReasons,
    rejectionCategories,
    missingFields: [...new Set(missingFields)],
  };
}
