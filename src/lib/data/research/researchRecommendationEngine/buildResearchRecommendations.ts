import {
  RESEARCH_RECOMMENDATION_KIND_PRIORITY,
  type ResearchRecommendationConfidence,
  type ResearchRecommendationEntry,
  type ResearchRecommendationKind,
} from "./researchRecommendationEngineTypes";
import type { LoadedResearchRecommendationInputs } from "./loadResearchRecommendationInputs";

type DraftRecommendation = Omit<ResearchRecommendationEntry, "rank"> & {
  sortKey: string;
};

function formatFamilyLabel(familyId: string, label?: string): string {
  if (label) {
    return label;
  }

  return familyId
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function addDraft(
  drafts: DraftRecommendation[],
  draft: Omit<DraftRecommendation, "sortKey"> & { sortKey?: string },
): void {
  drafts.push({
    ...draft,
    sortKey:
      draft.sortKey
      ?? `${draft.kind}:${draft.title}:${draft.sourceArtifacts.join(",")}`,
  });
}

function compareRecommendations(
  left: DraftRecommendation,
  right: DraftRecommendation,
): number {
  const priorityCompare =
    RESEARCH_RECOMMENDATION_KIND_PRIORITY[left.kind]
    - RESEARCH_RECOMMENDATION_KIND_PRIORITY[right.kind];
  if (priorityCompare !== 0) {
    return priorityCompare;
  }

  const confidenceRank: Record<ResearchRecommendationConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  const confidenceCompare =
    confidenceRank[left.confidence] - confidenceRank[right.confidence];
  if (confidenceCompare !== 0) {
    return confidenceCompare;
  }

  return left.sortKey.localeCompare(right.sortKey);
}

function finalizeRecommendations(
  drafts: DraftRecommendation[],
): ResearchRecommendationEntry[] {
  const deduped = new Map<string, DraftRecommendation>();
  for (const draft of drafts) {
    const existing = deduped.get(draft.sortKey);
    if (!existing || compareRecommendations(draft, existing) < 0) {
      deduped.set(draft.sortKey, draft);
    }
  }

  return [...deduped.values()]
    .sort(compareRecommendations)
    .map((draft, index) => ({
      rank: index + 1,
      kind: draft.kind,
      title: draft.title,
      rationale: draft.rationale,
      explanation: draft.explanation,
      confidence: draft.confidence,
      sourceArtifacts: draft.sourceArtifacts,
      signals: draft.signals,
    }));
}

/** Builds deterministic heuristic recommendations from optional research diagnostics. */
export function buildResearchRecommendations(
  loadedInputs: LoadedResearchRecommendationInputs,
): ResearchRecommendationEntry[] {
  const drafts: DraftRecommendation[] = [];

  for (const entry of loadedInputs.portfolioAnalytics?.entries ?? []) {
    const label = formatFamilyLabel(entry.researchFamily, entry.label);
    const promising = entry.promisingCount ?? 0;
    const candidates = entry.candidateCount ?? 0;
    const validations = entry.validationCount ?? 0;

    if (
      /momentum/i.test(entry.researchFamily)
      && (promising >= 1 || (entry.robustnessMedian ?? 0) >= 50)
    ) {
      addDraft(drafts, {
        kind: "expand-research-family",
        title: `Expand ${label} research`,
        rationale: `${label} shows promising signal with ${promising} near-promising hypotheses and ${candidates} candidates.`,
        explanation:
          `Portfolio analytics indicate ${label} is under-weighted relative to signal quality. `
          + `Observation share ${((entry.observationShare ?? 0) * 100).toFixed(1)}% with `
          + `${validations} validations suggests expanding this family before opening new axes.`,
        confidence: promising >= 2 ? "high" : "medium",
        sourceArtifacts: ["research-portfolio-analytics"],
        signals: {
          researchFamily: entry.researchFamily,
          promisingCount: promising,
          candidateCount: candidates,
          validationCount: validations,
        },
      });
    }
  }

  for (const entry of loadedInputs.roiAnalysis?.entries ?? []) {
    const label = formatFamilyLabel(entry.researchFamily, entry.label);
    const roiScore = entry.roiScore ?? 0;
    const yieldPerHour = entry.yieldPerHour ?? 0;

    if (/momentum/i.test(entry.researchFamily) && (roiScore >= 0.6 || yieldPerHour >= 0.5)) {
      addDraft(drafts, {
        kind: "expand-research-family",
        title: `Expand ${label} research`,
        rationale: `${label} has strong ROI (${roiScore.toFixed(2)}) and should receive more research budget.`,
        explanation:
          `ROI analysis ranks ${label} among the highest-yield families `
          + `(yield/hour ${yieldPerHour.toFixed(2)}). Prioritize additional hypothesis and validation cycles here.`,
        confidence: roiScore >= 0.75 ? "high" : "medium",
        sourceArtifacts: ["research-roi-analysis"],
        signals: {
          researchFamily: entry.researchFamily,
          roiScore,
          yieldPerHour,
        },
      });
    }

    if (
      /hour[- ]?only|hourly/i.test(entry.researchFamily)
      && (roiScore <= 0.35 || yieldPerHour <= 0.25)
    ) {
      addDraft(drafts, {
        kind: "reduce-exploration-focus",
        title: `Reduce ${label} exploration`,
        rationale: `${label} exploration has weak ROI (${roiScore.toFixed(2)}) relative to other families.`,
        explanation:
          `ROI analysis suggests deprioritizing hour-only sweeps until higher-yield families are exhausted. `
          + `Current candidate yield ${entry.candidateYield ?? 0} and validation yield ${entry.validationYield ?? 0}.`,
        confidence: roiScore <= 0.2 ? "high" : "medium",
        sourceArtifacts: ["research-roi-analysis"],
        signals: {
          researchFamily: entry.researchFamily,
          roiScore,
          yieldPerHour,
        },
      });
    }
  }

  for (const dimension of loadedInputs.dimensionExplorer?.dimensions ?? []) {
    const isProbability =
      dimension.dimensionId === "probability"
      || dimension.dimensionId === "coarseProbability"
      || dimension.dimensionId === "coarseProbabilityAxis";

    if (
      isProbability
      && dimension.entropy !== null
      && dimension.entropy !== undefined
      && dimension.entropy <= 2.5
      && (dimension.sparsity ?? 0) <= 0.25
    ) {
      addDraft(drafts, {
        kind: "split-dimension-buckets",
        title: "Split Probability buckets",
        rationale: `${dimension.label} has concentrated mass (entropy ${dimension.entropy.toFixed(2)} bits) across ${dimension.observationCount ?? 0} observations.`,
        explanation:
          `Dimension explorer shows probability mass concentrated in a few buckets. `
          + `Splitting probability bins should improve calibration diagnostics and reduce false near-promising signals.`,
        confidence: "medium",
        sourceArtifacts: ["research-dimension-explorer"],
        signals: {
          dimensionId: dimension.dimensionId,
          entropy: dimension.entropy,
          observationCount: dimension.observationCount ?? 0,
        },
      });
    }

    if ((dimension.sparsity ?? 0) >= 0.5) {
      addDraft(drafts, {
        kind: "deprioritize-sparse-dimension",
        title: `Deprioritize ${dimension.label}`,
        rationale: `${dimension.label} is ${Math.round((dimension.sparsity ?? 0) * 100)}% sparse with limited populated buckets.`,
        explanation:
          `Sparse dimensions consume search space without proportional candidate yield. `
          + `Shift exploration to denser registry dimensions before expanding ${dimension.dimensionId}.`,
        confidence: (dimension.sparsity ?? 0) >= 0.75 ? "high" : "medium",
        sourceArtifacts: ["research-dimension-explorer"],
        signals: {
          dimensionId: dimension.dimensionId,
          sparsity: dimension.sparsity ?? null,
          coverage: dimension.coverage ?? null,
        },
      });
    }

    if (
      (dimension.coverage ?? 0) >= 0.8
      && (dimension.observationCount ?? 0) > 0
      && loadedInputs.dimensionExplorer?.recommendations?.some(
        (item) =>
          item.dimensionId === dimension.dimensionId
          && item.kind === "zero-hypothesis-yield",
      )
    ) {
      addDraft(drafts, {
        kind: "recommend-registry-dimension",
        title: `Add registry follow-up for ${dimension.label}`,
        rationale: `${dimension.label} is populated in the atlas but produces no hypothesis candidates.`,
        explanation:
          `The dimension registry exposes ${dimension.dimensionId} buckets with data, `
          + `yet hypothesis generation yields zero candidates. Consider a new axis group or matcher wiring for this dimension.`,
        confidence: "medium",
        sourceArtifacts: ["research-dimension-explorer"],
        signals: {
          dimensionId: dimension.dimensionId,
          coverage: dimension.coverage ?? null,
          observationCount: dimension.observationCount ?? 0,
        },
      });
    }
  }

  const monthSummary = loadedInputs.monthRegime?.summary;
  const weekendShare = monthSummary?.weekendObservationShare;
  const weekdayShare = monthSummary?.weekdayObservationShare;
  const recommendWeekend =
    monthSummary?.recommendWeekendSampling === true
    || (weekendShare !== undefined
      && weekdayShare !== undefined
      && weekendShare < weekdayShare * 0.5);

  if (recommendWeekend) {
    addDraft(drafts, {
      kind: "increase-sampling-window",
      title: "Increase Weekend sampling",
      rationale: "Weekend observations are underrepresented relative to weekday coverage.",
      explanation:
        `Month-regime analysis shows weekend share ${((weekendShare ?? 0) * 100).toFixed(1)}% `
        + `vs weekday ${((weekdayShare ?? 0) * 100).toFixed(1)}%. Expand historical imports or weighting for weekend sessions.`,
      confidence: weekendShare !== undefined && weekendShare < 0.15 ? "high" : "medium",
      sourceArtifacts: ["month-regime-analysis"],
      signals: {
        weekendObservationShare: weekendShare ?? null,
        weekdayObservationShare: weekdayShare ?? null,
      },
    });
  }

  for (const entry of loadedInputs.monthRegime?.entries ?? []) {
    if (entry.weekendUnderrepresented === true) {
      addDraft(drafts, {
        kind: "increase-sampling-window",
        title: "Increase Weekend sampling",
        rationale: entry.summary ?? "Weekend sampling is thin for at least one tracked hypothesis.",
        explanation:
          entry.recommendation
          ?? "Month-regime diagnostics flag weekend underrepresentation. Prioritize weekend fixture expansion.",
        confidence: "medium",
        sourceArtifacts: ["month-regime-analysis"],
        signals: {
          hypothesisId: entry.hypothesisId ?? null,
          weekendObservationShare: entry.weekendObservationShare ?? null,
        },
        sortKey: `increase-sampling-window:weekend:${entry.hypothesisId ?? "global"}`,
      });
    }
  }

  for (const family of loadedInputs.interactionAnalysis?.families ?? []) {
    const label = formatFamilyLabel(family.familyId, family.label);
    const strength = family.interactionStrength ?? 0;
    const candidateYield = family.candidateYield ?? 0;

    if (/momentum.*volatility|volatility.*momentum/i.test(family.familyId)) {
      addDraft(drafts, {
        kind: "investigate-interaction",
        title: `Investigate ${label}`,
        rationale: `${label} is flagged as a high-value interaction family (strength ${strength.toFixed(2)}).`,
        explanation:
          `Interaction analysis recommends direct follow-up on ${family.familyId}. `
          + `Population rate ${((family.populationRate ?? 0) * 100).toFixed(1)}% with candidate yield ${candidateYield}.`,
        confidence: strength >= 0.6 ? "high" : "medium",
        sourceArtifacts: ["research-interaction-analysis"],
        signals: {
          familyId: family.familyId,
          interactionStrength: strength,
          candidateYield,
        },
      });
    }

    if (
      strength >= 0.55
      && candidateYield <= 1
      && (family.populationRate ?? 0) >= 0.4
    ) {
      addDraft(drafts, {
        kind: "recommend-interaction-family",
        title: `Explore ${label} interaction family`,
        rationale: `${label} has strong interaction signal but minimal candidate yield.`,
        explanation:
          `Interaction strength ${strength.toFixed(2)} with only ${candidateYield} candidates suggests an under-explored cross-dimension family. `
          + `Add dedicated hypothesis templates or axis-group wiring for ${(family.dimensionIds ?? []).join(" × ") || family.familyId}.`,
        confidence: "medium",
        sourceArtifacts: ["research-interaction-analysis"],
        signals: {
          familyId: family.familyId,
          interactionStrength: strength,
          candidateYield,
        },
        sortKey: `recommend-interaction-family:${family.familyId}`,
      });
    }
  }

  for (const analysis of loadedInputs.failureAnalysis?.analyses ?? []) {
    const nearPromising = analysis.priorityCategory === "near-promising";
    const action = analysis.recommendedNextAction ?? "";
    const monthFailure = analysis.failureReasons?.some(
      (reason) =>
        reason.category === "poor-month-stability"
        || reason.category === "regime-instability",
    );

    if (nearPromising || action === "inspect-month-breakdown" || monthFailure) {
      addDraft(drafts, {
        kind: "recommend-refinement-priority",
        title: `Prioritize refinement for ${analysis.hypothesisId}`,
        rationale:
          analysis.failureReasons?.[0]?.summary
          ?? `Near-promising hypothesis with robustness ${analysis.robustnessScore ?? "—"}.`,
        explanation:
          `Failure analysis recommends "${action || "refinement follow-up"}" for `
          + `${analysis.hypothesisId}. Rank ${analysis.priorityRank ?? "—"} in the current validation queue.`,
        confidence: nearPromising ? "high" : "medium",
        sourceArtifacts: ["hypothesis-failure-analysis"],
        signals: {
          hypothesisId: analysis.hypothesisId,
          priorityCategory: analysis.priorityCategory ?? null,
          recommendedNextAction: action || null,
          robustnessScore: analysis.robustnessScore ?? null,
        },
        sortKey: `recommend-refinement-priority:${analysis.hypothesisId}`,
      });
    }
  }

  if (
    loadedInputs.failureAnalysis?.summary?.nearPromisingCount
    && loadedInputs.failureAnalysis.summary.nearPromisingCount > 0
    && drafts.every((draft) => draft.kind !== "recommend-refinement-priority")
  ) {
    addDraft(drafts, {
      kind: "recommend-refinement-priority",
      title: "Prioritize near-promising refinements",
      rationale: `${loadedInputs.failureAnalysis.summary.nearPromisingCount} near-promising hypotheses need refinement follow-up.`,
      explanation:
        "Failure analysis summary indicates near-promising hypotheses without a specific per-id action. "
        + "Run refinement generation and validate child candidates before new axis exploration.",
      confidence: "medium",
      sourceArtifacts: ["hypothesis-failure-analysis"],
      signals: {
        nearPromisingCount: loadedInputs.failureAnalysis.summary.nearPromisingCount,
      },
    });
  }

  for (const recommendation of loadedInputs.dimensionExplorer?.recommendations ?? []) {
    if (recommendation.kind === "refine-buckets") {
      addDraft(drafts, {
        kind: "split-dimension-buckets",
        title: recommendation.label,
        rationale: recommendation.rationale,
        explanation:
          `Dimension explorer recommends bucket refinement for ${recommendation.dimensionId ?? "a registered dimension"}.`,
        confidence: "medium",
        sourceArtifacts: ["research-dimension-explorer"],
        signals: {
          dimensionId: recommendation.dimensionId ?? null,
          explorerKind: recommendation.kind,
        },
        sortKey: `split-dimension-buckets:${recommendation.dimensionId ?? recommendation.label}`,
      });
    }
  }

  return finalizeRecommendations(drafts);
}

export function compareResearchRecommendationKinds(
  left: ResearchRecommendationKind,
  right: ResearchRecommendationKind,
): number {
  return RESEARCH_RECOMMENDATION_KIND_PRIORITY[left]
    - RESEARCH_RECOMMENDATION_KIND_PRIORITY[right];
}
