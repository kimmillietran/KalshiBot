import {
  HARNESS_DEFAULT_PROMOTION_STATUSES,
  SYNTHESIZED_PROMOTION_STATUSES,
  type SynthesizedPromotionStatus,
  type SynthesizedStrategySpec,
} from "./strategyHarnessTypes";
import {
  normalizeSynthesizedStrategySpec,
  type RawSynthesizedStrategySpec,
} from "./normalizeSynthesizedStrategySpec";
import {
  evaluateResearchOnlyHarnessEligibility,
  type HypothesisFailureAnalysisIndex,
} from "./researchOnlyHarnessEligibility";

export type HarnessStrategySelectionDecision = "included" | "skipped";

export type HarnessStrategySelectionEntry = {
  strategyId: string;
  hypothesisId: string;
  promotionStatus: SynthesizedPromotionStatus;
  decision: HarnessStrategySelectionDecision;
  reason: string;
};

export type HarnessStrategySelectionResult = {
  specs: SynthesizedStrategySpec[];
  selection: HarnessStrategySelectionEntry[];
  skippedRejectedStrategyCount: number;
  includedRejectedStrategies: boolean;
};

export type ResolveHarnessStrategySelectionOptions = {
  strategyFamily?: string;
  synthesizedStrategyId?: string;
  includeRejected?: boolean;
  researchOnlyBacktest?: boolean;
  failureAnalysisByHypothesisId?: HypothesisFailureAnalysisIndex | null;
};

function isHarnessPromotionEligible(
  promotionStatus: SynthesizedPromotionStatus,
  includeRejected: boolean,
): boolean {
  if (includeRejected) {
    return SYNTHESIZED_PROMOTION_STATUSES.includes(promotionStatus);
  }

  return HARNESS_DEFAULT_PROMOTION_STATUSES.includes(
    promotionStatus as (typeof HARNESS_DEFAULT_PROMOTION_STATUSES)[number],
  );
}

function tryNormalizeHarnessStrategy(
  raw: RawSynthesizedStrategySpec,
):
  | { ok: true; spec: SynthesizedStrategySpec }
  | { ok: false; reason: string } {
  try {
    return { ok: true, spec: normalizeSynthesizedStrategySpec(raw) };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "Harness bridge translation failed.",
    };
  }
}

function pushSelection(
  selection: HarnessStrategySelectionEntry[],
  entry: HarnessStrategySelectionEntry,
): void {
  selection.push(entry);
}

/** Resolves harness strategy specs with per-strategy include/skip diagnostics. */
export function resolveHarnessStrategySelection(
  strategies: readonly RawSynthesizedStrategySpec[],
  options?: ResolveHarnessStrategySelectionOptions,
): HarnessStrategySelectionResult {
  const includeRejected = options?.includeRejected === true;
  const researchOnlyBacktest = options?.researchOnlyBacktest === true;
  const failureAnalysisByHypothesisId =
    options?.failureAnalysisByHypothesisId ?? null;
  const selection: HarnessStrategySelectionEntry[] = [];
  const specs: SynthesizedStrategySpec[] = [];

  for (const rawStrategy of strategies) {
    const baseEntry = {
      strategyId: rawStrategy.strategyId,
      hypothesisId: rawStrategy.hypothesisId,
      promotionStatus: rawStrategy.promotionStatus,
    };

    if (
      options?.strategyFamily
      && rawStrategy.strategyFamily !== options.strategyFamily
    ) {
      if (researchOnlyBacktest && rawStrategy.promotionStatus === "rejected") {
        pushSelection(selection, {
          ...baseEntry,
          decision: "skipped",
          reason: `Filtered out by --family (${options.strategyFamily}).`,
        });
      }
      continue;
    }

    if (
      options?.synthesizedStrategyId
      && rawStrategy.strategyId !== options.synthesizedStrategyId
    ) {
      if (researchOnlyBacktest && rawStrategy.promotionStatus === "rejected") {
        pushSelection(selection, {
          ...baseEntry,
          decision: "skipped",
          reason: `Filtered out by --strategy-id (${options.synthesizedStrategyId}).`,
        });
      }
      continue;
    }

    if (isHarnessPromotionEligible(rawStrategy.promotionStatus, includeRejected)) {
      const normalized = tryNormalizeHarnessStrategy(rawStrategy);
      if (!normalized.ok) {
        if (researchOnlyBacktest && rawStrategy.promotionStatus === "rejected") {
          pushSelection(selection, {
            ...baseEntry,
            decision: "skipped",
            reason: normalized.reason,
          });
        }
        continue;
      }

      specs.push(normalized.spec);
      if (researchOnlyBacktest && rawStrategy.promotionStatus === "rejected") {
        pushSelection(selection, {
          ...baseEntry,
          decision: "included",
          reason: "Rejected strategy included via --include-rejected.",
        });
      }
      continue;
    }

    if (researchOnlyBacktest && rawStrategy.promotionStatus === "rejected") {
      const researchEligibility = evaluateResearchOnlyHarnessEligibility(
        rawStrategy,
        { failureAnalysisByHypothesisId },
      );

      if (!researchEligibility.eligible) {
        pushSelection(selection, {
          ...baseEntry,
          decision: "skipped",
          reason: researchEligibility.reason,
        });
        continue;
      }

      const normalized = tryNormalizeHarnessStrategy(rawStrategy);
      if (!normalized.ok) {
        pushSelection(selection, {
          ...baseEntry,
          decision: "skipped",
          reason: normalized.reason,
        });
        continue;
      }

      specs.push(normalized.spec);
      pushSelection(selection, {
        ...baseEntry,
        decision: "included",
        reason: researchEligibility.reason,
      });
      continue;
    }
  }

  const sortedSpecs = [...specs].sort((left, right) =>
    left.strategyId.localeCompare(right.strategyId),
  );
  const skippedRejectedStrategyCount = selection.filter(
    (entry) =>
      entry.promotionStatus === "rejected" && entry.decision === "skipped",
  ).length;
  const includedRejectedStrategies = selection.some(
    (entry) =>
      entry.promotionStatus === "rejected" && entry.decision === "included",
  );

  return {
    specs: sortedSpecs,
    selection,
    skippedRejectedStrategyCount,
    includedRejectedStrategies,
  };
}
