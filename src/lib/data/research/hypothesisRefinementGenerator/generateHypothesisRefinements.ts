import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";
import {
  TIME_REMAINING_BUCKET_DEFINITIONS,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasBuckets";

import { lookupAtlasBucketSupport } from "./lookupAtlasBucketSupport";
import { parseParentHypothesisId } from "./parseParentHypothesisId";
import type {
  HypothesisRefinementCandidate,
  HypothesisRefinementFilters,
  HypothesisRefinementType,
  OverfittingRiskLevel,
} from "./hypothesisRefinementTypes";
import { HYPOTHESIS_REFINEMENT_STATUS } from "./hypothesisRefinementTypes";

const DERIVED_SETTLEMENT_MONTH = "2025-12";
const MIN_REVERSING_MONTH_OBSERVATIONS = 5;
const MIN_STABLE_MONTH_OBSERVATIONS = 10;
const MIN_ATLAS_SUPPORT_OBSERVATIONS = 15;

const PROBABILITY_MID_RANGE_SPLITS = [
  { suffix: "prob-30-50", label: "[0.3, 0.5)" },
  { suffix: "prob-50-70", label: "[0.5, 0.7)" },
] as const;

const COARSE_TIME_EARLY_SPLITS = [
  { bucketId: "time-0-5m", label: "< 5 minutes remaining" },
  { bucketId: "time-5-10m", label: "5-10 minutes remaining" },
  { bucketId: "time-10-15m", label: "10-15 minutes remaining" },
] as const;

type DraftRefinement = Omit<
  HypothesisRefinementCandidate,
  "priorityRank" | "priorityScore"
>;

export type GenerateHypothesisRefinementsInput = {
  failureAnalyses: readonly HypothesisFailureAnalysisEntry[];
  validations: readonly HypothesisValidationEntry[];
  mispricingAtlas: MispricingAtlas | null;
  crossValidationEntries: readonly CrossValidationEntry[];
};

function hasFailureCategory(
  analysis: HypothesisFailureAnalysisEntry,
  category: string,
): boolean {
  return analysis.failureReasons.some((reason) => reason.category === category);
}

function shouldGenerateRefinements(analysis: HypothesisFailureAnalysisEntry): boolean {
  if (analysis.passes) {
    return false;
  }

  if (analysis.priorityCategory === "likely-spurious") {
    return false;
  }

  if (analysis.priorityCategory === "blocked-by-coverage") {
    return false;
  }

  return true;
}

function buildRefinementId(
  parentHypothesisId: string,
  refinementType: HypothesisRefinementType,
  suffix: string,
): string {
  return `refine-${parentHypothesisId}--${refinementType}-${suffix}`;
}

function directionVerb(direction: "over" | "under"): string {
  return direction === "over" ? "NO fade" : "YES fade";
}

function baseParentContext(analysis: HypothesisFailureAnalysisEntry): Pick<
  HypothesisRefinementCandidate,
  | "parentHypothesisId"
  | "parentHypothesis"
  | "parentPriorityCategory"
  | "parentRobustnessScore"
  | "parentScoreGap"
  | "status"
> {
  return {
    parentHypothesisId: analysis.hypothesisId,
    parentHypothesis: analysis.hypothesis,
    parentPriorityCategory: analysis.priorityCategory,
    parentRobustnessScore: analysis.robustnessScore,
    parentScoreGap: analysis.scoreGap,
    status: HYPOTHESIS_REFINEMENT_STATUS,
  };
}

function createDraft(
  analysis: HypothesisFailureAnalysisEntry,
  draft: {
    refinementType: HypothesisRefinementType;
    suffix: string;
    refinedHypothesis: string;
    rationale: string;
    expectedBenefit: string;
    expectedRisk: string;
    overfittingRisk: OverfittingRiskLevel;
    suggestedFilters: HypothesisRefinementFilters;
    atlasSupportObservations: number | null;
  },
): DraftRefinement {
  return {
    refinementId: buildRefinementId(
      analysis.hypothesisId,
      draft.refinementType,
      draft.suffix,
    ),
    ...baseParentContext(analysis),
    refinementType: draft.refinementType,
    refinedHypothesis: draft.refinedHypothesis,
    rationale: draft.rationale,
    expectedBenefit: draft.expectedBenefit,
    expectedRisk: draft.expectedRisk,
    overfittingRisk: draft.overfittingRisk,
    suggestedFilters: draft.suggestedFilters,
    atlasSupportObservations: draft.atlasSupportObservations,
  };
}

function generateProbabilitySplits(
  analysis: HypothesisFailureAnalysisEntry,
  parsed: ReturnType<typeof parseParentHypothesisId>,
  atlas: MispricingAtlas | null,
): DraftRefinement[] {
  if (!parsed || !parsed.bucketId.includes("coarse-prob-1")) {
    return [];
  }

  if (
    !hasFailureCategory(analysis, "poor-month-stability")
    && !hasFailureCategory(analysis, "weak-calibration-gap")
    && !hasFailureCategory(analysis, "regime-instability")
  ) {
    return [];
  }

  const contextLabel = analysis.hypothesis.replace(
    /\[0\.3,\s*0\.7\)/,
    "{probability-range}",
  );

  return PROBABILITY_MID_RANGE_SPLITS.flatMap((split) => {
    const refinedHypothesis = contextLabel.includes("{probability-range}")
      ? contextLabel.replace("{probability-range}", split.label)
      : analysis.hypothesis.replace("[0.3, 0.7)", split.label);

    const atlasSupport =
      lookupAtlasBucketSupport(atlas, "coarse-prob-1")
      ?? lookupAtlasBucketSupport(atlas, "coarse-prob-2");

    if (atlasSupport !== null && atlasSupport < MIN_ATLAS_SUPPORT_OBSERVATIONS) {
      return [];
    }

    return [
      createDraft(analysis, {
        refinementType: "probability-bucket-split",
        suffix: split.suffix,
        refinedHypothesis: `${refinedHypothesis} (refined probability bucket; test ${directionVerb(parsed.direction)}).`,
        rationale:
          `Parent hypothesis spans [0.3, 0.7) and failed month/regime stability checks. `
          + `Narrowing to ${split.label} may isolate a sub-range where calibration error is more persistent.`,
        expectedBenefit:
          "Reduces heterogeneity inside the mid-probability band and may improve month-level edge persistence.",
        expectedRisk:
          "Smaller sample size per child bucket increases variance and overfitting risk.",
        overfittingRisk: "medium",
        suggestedFilters: {
          probabilityRangeLabel: split.label,
        },
        atlasSupportObservations: atlasSupport,
      }),
    ];
  });
}

function generateTimeSplits(
  analysis: HypothesisFailureAnalysisEntry,
  parsed: ReturnType<typeof parseParentHypothesisId>,
  atlas: MispricingAtlas | null,
): DraftRefinement[] {
  if (!parsed || !parsed.bucketId.includes("coarse-time-early")) {
    return [];
  }

  if (
    !hasFailureCategory(analysis, "poor-month-stability")
    && !hasFailureCategory(analysis, "weak-calibration-gap")
  ) {
    return [];
  }

  return COARSE_TIME_EARLY_SPLITS.flatMap((split) => {
    const atlasSupport = lookupAtlasBucketSupport(atlas, split.bucketId);
    const knownBucket = TIME_REMAINING_BUCKET_DEFINITIONS.some(
      (entry) => entry.bucketId === split.bucketId,
    );

    if (
      knownBucket
      && atlasSupport !== null
      && atlasSupport < MIN_ATLAS_SUPPORT_OBSERVATIONS
    ) {
      return [];
    }

    const refinedHypothesis = analysis.hypothesis
      .replace("< 15 minutes remaining", split.label)
      .replace("coarse-time-early", split.bucketId);

    return [
      createDraft(analysis, {
        refinementType: "time-bucket-split",
        suffix: split.bucketId,
        refinedHypothesis: `${refinedHypothesis} (refined time bucket; test ${directionVerb(parsed.direction)}).`,
        rationale:
          `Parent bucket combines all observations with < 15 minutes remaining. `
          + `Splitting into ${split.label} tests whether the edge concentrates in a shorter window.`,
        expectedBenefit:
          "Late-window mispricing may be stronger in the final minutes; isolating time buckets can improve stability.",
        expectedRisk:
          "Very short windows shrink sample size and can amplify day-level concentration.",
        overfittingRisk: "medium",
        suggestedFilters: {
          timeBucketId: split.bucketId,
        },
        atlasSupportObservations: atlasSupport,
      }),
    ];
  });
}

function generateVolatilitySplits(
  analysis: HypothesisFailureAnalysisEntry,
  parsed: ReturnType<typeof parseParentHypothesisId>,
  atlas: MispricingAtlas | null,
): DraftRefinement[] {
  if (!parsed) {
    return [];
  }

  const refinements: DraftRefinement[] = [];

  if (
    parsed.bucketId.includes("vol-high")
    && hasFailureCategory(analysis, "regime-instability")
  ) {
    const mediumDefinition = VOLATILITY_BUCKET_DEFINITIONS.find(
      (entry) => entry.bucketId === "vol-medium",
    );
    const mediumSupport = lookupAtlasBucketSupport(atlas, "vol-medium");

    if (mediumSupport === null || mediumSupport >= MIN_ATLAS_SUPPORT_OBSERVATIONS) {
      refinements.push(
        createDraft(analysis, {
          refinementType: "volatility-regime-split",
          suffix: "vol-medium",
          refinedHypothesis: analysis.hypothesis
            .replace(/High \(>=60% annualized\)/, mediumDefinition?.bucketLabel ?? "Medium (30-60% annualized)")
            .replace("vol-high", "vol-medium"),
          rationale:
            "Parent edge may be regime-specific to high volatility. Testing medium volatility isolates whether mispricing is broad or concentrated in extreme vol.",
          expectedBenefit:
            "Separates volatility regimes that often behave differently around settlement.",
          expectedRisk:
            "Switching regime may remove the original signal entirely if the edge was high-vol specific.",
          overfittingRisk: "medium",
          suggestedFilters: {
            volatilityBucketId: "vol-medium",
          },
          atlasSupportObservations: mediumSupport,
        }),
      );
    }
  }

  if (
    parsed.bucketId.includes("coarse-regime-high")
    && hasFailureCategory(analysis, "regime-instability")
  ) {
    const highSupport = lookupAtlasBucketSupport(atlas, "vol-high");
    refinements.push(
      createDraft(analysis, {
        refinementType: "volatility-regime-split",
        suffix: "vol-high-numeric",
        refinedHypothesis: analysis.hypothesis.replace(
          "high volatility regime",
          "High (>=60% annualized) volatility",
        ),
        rationale:
          "Parent uses coarse regime tags. A numeric high-vol bucket may align better with atlas observations when regime tags are sparse.",
        expectedBenefit:
          "Uses continuous volatility bucketing instead of sparse regime labels.",
        expectedRisk:
          "Regime tag and numeric vol buckets may overlap imperfectly, shifting the sample unpredictably.",
        overfittingRisk: "low",
        suggestedFilters: {
          volatilityBucketId: "vol-high",
        },
        atlasSupportObservations: highSupport,
      }),
    );
  }

  return refinements;
}

function generateMonthExclusionRefinement(
  analysis: HypothesisFailureAnalysisEntry,
): DraftRefinement | null {
  const reversingMonths = analysis.stabilityDiagnostics.weakestMonths
    .filter(
      (month) =>
        !month.edgeMatchesDirection
        && month.observations >= MIN_REVERSING_MONTH_OBSERVATIONS,
    )
    .map((month) => month.month);

  if (
    reversingMonths.length === 0
    || !hasFailureCategory(analysis, "poor-month-stability")
  ) {
    return null;
  }

  const monthList = reversingMonths.join(", ");

  return createDraft(analysis, {
    refinementType: "exclude-reversing-months",
    suffix: reversingMonths.join("-"),
    refinedHypothesis: `${analysis.hypothesis} (exclude months where edge reverses: ${monthList}).`,
    rationale:
      `Month-level diagnostics show edge reversal in ${monthList}. `
      + "Excluding reversing months tests whether the parent signal is stable outside those periods.",
    expectedBenefit:
      "Removes calendar periods that actively contradict the calibration direction.",
    expectedRisk:
      "Cherry-picking months can inflate apparent stability without generalizing forward.",
    overfittingRisk: "high",
    suggestedFilters: {
      excludedMonths: reversingMonths,
    },
    atlasSupportObservations: null,
  });
}

function generateMonthStableSubsetRefinement(
  analysis: HypothesisFailureAnalysisEntry,
): DraftRefinement | null {
  const stableMonths = analysis.stabilityDiagnostics.strongestMonths
    .filter(
      (month) =>
        month.edgeMatchesDirection
        && month.observations >= MIN_STABLE_MONTH_OBSERVATIONS,
    )
    .map((month) => month.month);

  if (
    stableMonths.length === 0
    || !hasFailureCategory(analysis, "poor-month-stability")
  ) {
    return null;
  }

  const monthList = stableMonths.join(", ");

  return createDraft(analysis, {
    refinementType: "month-stable-subset",
    suffix: stableMonths.join("-"),
    refinedHypothesis: `${analysis.hypothesis} (limit to strongest months: ${monthList}).`,
    rationale:
      `Strongest months (${monthList}) align with the calibration direction. `
      + "A month-stable subset checks whether the edge is driven by consistently favorable calendar periods.",
    expectedBenefit:
      "Focuses validation on months that already support the hypothesis direction.",
    expectedRisk:
      "Restricting to best months risks overfitting and may not reproduce out of sample.",
    overfittingRisk: "high",
    suggestedFilters: {
      includedMonths: stableMonths,
    },
    atlasSupportObservations: null,
  });
}

function generateSettlementRefinements(
  analysis: HypothesisFailureAnalysisEntry,
): DraftRefinement[] {
  if (!hasFailureCategory(analysis, "derived-data-sensitivity")) {
    return [];
  }

  return [
    createDraft(analysis, {
      refinementType: "official-settlement-only",
      suffix: "official-only",
      refinedHypothesis: `${analysis.hypothesis} (official settlement only; exclude ${DERIVED_SETTLEMENT_MONTH} derived expiration_value).`,
      rationale:
        `Derived-settlement sensitivity flagged for ${DERIVED_SETTLEMENT_MONTH}. `
        + "An official-settlement-only variant removes derived expiration_value influence.",
      expectedBenefit:
        "Tests whether the calibration edge survives without derived settlement months.",
      expectedRisk:
        "May discard useful observations and reduce power if derived months are representative.",
      overfittingRisk: "low",
      suggestedFilters: {
        excludedMonths: [DERIVED_SETTLEMENT_MONTH],
        settlementMode: "official-only",
      },
      atlasSupportObservations: null,
    }),
    createDraft(analysis, {
      refinementType: "derived-settlement-aware",
      suffix: "derived-aware",
      refinedHypothesis: `${analysis.hypothesis} (derived-settlement aware; annotate ${DERIVED_SETTLEMENT_MONTH} observations).`,
      rationale:
        "Keeps derived-settlement observations but tracks them explicitly for sensitivity review.",
      expectedBenefit:
        "Preserves sample size while making derived-data influence visible during validation.",
      expectedRisk:
        "Derived settlement may still dominate if not excluded during backtest.",
      overfittingRisk: "medium",
      suggestedFilters: {
        settlementMode: "derived-aware",
      },
      atlasSupportObservations: null,
    }),
  ];
}

function computeRefinementPriorityScore(
  analysis: HypothesisFailureAnalysisEntry,
  refinement: DraftRefinement,
  crossValidation: CrossValidationEntry | null,
): number {
  let score = analysis.priorityScore;

  if (analysis.priorityCategory === "near-promising") {
    score += 20;
  }

  switch (refinement.refinementType) {
    case "exclude-reversing-months":
      score += 18;
      break;
    case "month-stable-subset":
      score += 14;
      break;
    case "official-settlement-only":
      score += 16;
      break;
    case "probability-bucket-split":
    case "time-bucket-split":
      score += 12;
      break;
    case "volatility-regime-split":
      score += 10;
      break;
    case "derived-settlement-aware":
      score += 6;
      break;
    default:
      break;
  }

  if (crossValidation && !crossValidation.overallPasses) {
    score += 4;
  }

  score -= analysis.scoreGap * 0.1;

  if (refinement.overfittingRisk === "high") {
    score -= 12;
  } else if (refinement.overfittingRisk === "medium") {
    score -= 4;
  }

  if (
    refinement.atlasSupportObservations !== null
    && refinement.atlasSupportObservations >= MIN_ATLAS_SUPPORT_OBSERVATIONS
  ) {
    score += 5;
  }

  return Number(score.toFixed(2));
}

type ScoredDraftRefinement = DraftRefinement & { priorityScore: number };

function rankRefinements(
  refinements: ScoredDraftRefinement[],
): HypothesisRefinementCandidate[] {
  const scored = [...refinements].sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }

      if (left.parentHypothesisId !== right.parentHypothesisId) {
        return left.parentHypothesisId.localeCompare(right.parentHypothesisId);
      }

      return left.refinementId.localeCompare(right.refinementId);
    });

  return scored.map((refinement, index) => ({
    ...refinement,
    priorityRank: index + 1,
  }));
}

function generateRefinementsForParent(
  analysis: HypothesisFailureAnalysisEntry,
  crossValidationById: Map<string, CrossValidationEntry>,
  atlas: MispricingAtlas | null,
): ScoredDraftRefinement[] {
  const parsed = parseParentHypothesisId(analysis.hypothesisId);
  const crossValidation = crossValidationById.get(analysis.hypothesisId) ?? null;

  const drafts = [
    ...generateProbabilitySplits(analysis, parsed, atlas),
    ...generateTimeSplits(analysis, parsed, atlas),
    ...generateVolatilitySplits(analysis, parsed, atlas),
    generateMonthExclusionRefinement(analysis),
    generateMonthStableSubsetRefinement(analysis),
    ...generateSettlementRefinements(analysis),
  ].filter((entry): entry is DraftRefinement => entry !== null);

  return drafts.map((draft) => ({
    ...draft,
    priorityScore: computeRefinementPriorityScore(analysis, draft, crossValidation),
  }));
}

/** Generates ranked refinement candidates for near-promising failed hypotheses. */
export function generateHypothesisRefinements(
  input: GenerateHypothesisRefinementsInput,
): HypothesisRefinementCandidate[] {
  const crossValidationById = new Map(
    input.crossValidationEntries
      .filter((entry) => entry.targetType === "hypothesis")
      .map((entry) => [entry.hypothesisId, entry]),
  );

  const drafts = input.failureAnalyses
    .filter(shouldGenerateRefinements)
    .flatMap((analysis) =>
      generateRefinementsForParent(analysis, crossValidationById, input.mispricingAtlas),
    );

  return rankRefinements(drafts);
}

export function countSkippedParents(
  analyses: readonly HypothesisFailureAnalysisEntry[],
): {
  skippedLikelySpurious: number;
  skippedCoverageBlocked: number;
  nearPromisingParents: number;
} {
  let skippedLikelySpurious = 0;
  let skippedCoverageBlocked = 0;
  let nearPromisingParents = 0;

  for (const analysis of analyses) {
    if (analysis.priorityCategory === "likely-spurious") {
      skippedLikelySpurious += 1;
    } else if (analysis.priorityCategory === "blocked-by-coverage") {
      skippedCoverageBlocked += 1;
    } else if (analysis.priorityCategory === "near-promising") {
      nearPromisingParents += 1;
    }
  }

  return {
    skippedLikelySpurious,
    skippedCoverageBlocked,
    nearPromisingParents,
  };
}
