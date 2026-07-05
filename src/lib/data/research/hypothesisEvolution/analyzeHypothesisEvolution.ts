import type { CoverageAwareValidationClassification } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";

import type {
  HypothesisEvolutionClassificationChange,
  HypothesisEvolutionDashboardHighlights,
  HypothesisEvolutionEntry,
  HypothesisEvolutionRunSnapshot,
  HypothesisEvolutionSummary,
  HypothesisEvolutionTrend,
  HypothesisEvolutionTrendMetrics,
  HypothesisHistoryDocument,
} from "./hypothesisEvolutionTypes";

const CLASSIFICATION_RANK: Record<CoverageAwareValidationClassification, number> = {
  rejected: 0,
  "inconclusive-insufficient-coverage": 1,
  "inconclusive-regime-sparse": 2,
  "promising-needs-more-history": 3,
  "robust-enough-to-test": 4,
};

const ROBUSTNESS_STRENGTHENING_DELTA = 5;
const ROBUSTNESS_WEAKENING_DELTA = -5;

function collectHypothesisIds(history: HypothesisHistoryDocument): string[] {
  const ids = new Set<string>();

  for (const run of history.runs) {
    for (const hypothesisId of Object.keys(run.snapshotsByHypothesisId)) {
      ids.add(hypothesisId);
    }
  }

  return [...ids].sort((left, right) => left.localeCompare(right));
}

function collectTimeline(
  history: HypothesisHistoryDocument,
  hypothesisId: string,
): HypothesisEvolutionRunSnapshot[] {
  const timeline: HypothesisEvolutionRunSnapshot[] = [];

  for (const run of history.runs) {
    const snapshot = run.snapshotsByHypothesisId[hypothesisId];
    if (snapshot) {
      timeline.push(snapshot);
    }
  }

  return timeline;
}

function formatPromotionTrajectory(
  changes: readonly HypothesisEvolutionClassificationChange[],
): string | null {
  const labels = changes
    .map((change) => change.classification)
    .filter((value): value is CoverageAwareValidationClassification => value !== null)
    .map((classification) => classification.replaceAll("-", " "));

  if (labels.length < 2) {
    return null;
  }

  return `${labels[0]} → ${labels[labels.length - 1]}`;
}

function classifyTrend(input: {
  timeline: readonly HypothesisEvolutionRunSnapshot[];
  presentInLatestRun: boolean;
}): HypothesisEvolutionTrend {
  if (!input.presentInLatestRun) {
    return "disappeared";
  }

  if (input.timeline.length <= 1) {
    return "newly-discovered";
  }

  const first = input.timeline[0]!;
  const last = input.timeline[input.timeline.length - 1]!;
  const robustnessDelta = last.robustnessScore - first.robustnessScore;
  const observationGrowth = last.observationCount - first.observationCount;
  const persistenceDelta = last.monthPersistenceRate - first.monthPersistenceRate;

  const firstClassification = first.classification;
  const lastClassification = last.classification;
  const classificationImproved =
    firstClassification !== null
    && lastClassification !== null
    && CLASSIFICATION_RANK[lastClassification] > CLASSIFICATION_RANK[firstClassification];
  const classificationRegressed =
    firstClassification !== null
    && lastClassification !== null
    && CLASSIFICATION_RANK[lastClassification] < CLASSIFICATION_RANK[firstClassification];

  if (
    robustnessDelta >= ROBUSTNESS_STRENGTHENING_DELTA
    || (robustnessDelta > 0 && observationGrowth > 0)
    || (robustnessDelta > 0 && persistenceDelta > 0)
    || classificationImproved
  ) {
    return "strengthening";
  }

  if (
    robustnessDelta <= ROBUSTNESS_WEAKENING_DELTA
    || classificationRegressed
    || (observationGrowth < 0 && robustnessDelta < 0)
  ) {
    return "weakening";
  }

  return "stable";
}

function buildTrendMetrics(
  timeline: readonly HypothesisEvolutionRunSnapshot[],
  classificationChanges: readonly HypothesisEvolutionClassificationChange[],
): HypothesisEvolutionTrendMetrics {
  if (timeline.length === 0) {
    return {
      robustnessDelta: null,
      observationGrowth: null,
      coverageGrowth: null,
      calibrationDelta: null,
      promotionTrajectory: null,
    };
  }

  const first = timeline[0]!;
  const last = timeline[timeline.length - 1]!;

  return {
    robustnessDelta: timeline.length > 1 ? last.robustnessScore - first.robustnessScore : null,
    observationGrowth:
      timeline.length > 1 ? last.observationCount - first.observationCount : null,
    coverageGrowth: timeline.length > 1 ? last.marketCount - first.marketCount : null,
    calibrationDelta:
      timeline.length > 1
      && first.calibrationError !== null
      && last.calibrationError !== null
        ? last.calibrationError - first.calibrationError
        : null,
    promotionTrajectory: formatPromotionTrajectory(classificationChanges),
  };
}

/** Analyzes longitudinal hypothesis history into trend-classified entries. */
export function analyzeHypothesisEvolution(
  history: HypothesisHistoryDocument,
): {
  entries: HypothesisEvolutionEntry[];
  summary: HypothesisEvolutionSummary;
  highlights: HypothesisEvolutionDashboardHighlights;
} {
  const latestRun = history.runs[history.runs.length - 1] ?? null;
  const latestHypothesisIds = new Set(
    latestRun ? Object.keys(latestRun.snapshotsByHypothesisId) : [],
  );
  const hypothesisIds = collectHypothesisIds(history);

  const entries: HypothesisEvolutionEntry[] = hypothesisIds.map((hypothesisId) => {
    const timeline = collectTimeline(history, hypothesisId);
    const classificationChanges = timeline.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      classification: snapshot.classification,
    }));
    const presentInLatestRun = latestHypothesisIds.has(hypothesisId);

    return {
      hypothesisId,
      hypothesis: timeline[timeline.length - 1]?.hypothesis ?? hypothesisId,
      trend: classifyTrend({ timeline, presentInLatestRun }),
      trendMetrics: buildTrendMetrics(timeline, classificationChanges),
      classificationChanges,
      timeline,
      currentStatus: presentInLatestRun ? timeline[timeline.length - 1] ?? null : null,
    };
  });

  const sortedEntries = [...entries].sort((left, right) => {
    const trendCompare = left.trend.localeCompare(right.trend);
    if (trendCompare !== 0) {
      return trendCompare;
    }

    const robustnessCompare =
      (right.currentStatus?.robustnessScore ?? 0)
      - (left.currentStatus?.robustnessScore ?? 0);
    if (robustnessCompare !== 0) {
      return robustnessCompare;
    }

    return left.hypothesisId.localeCompare(right.hypothesisId);
  });

  const summary: HypothesisEvolutionSummary = {
    totalHypotheses: sortedEntries.length,
    strengtheningCount: sortedEntries.filter((entry) => entry.trend === "strengthening").length,
    weakeningCount: sortedEntries.filter((entry) => entry.trend === "weakening").length,
    stableCount: sortedEntries.filter((entry) => entry.trend === "stable").length,
    newlyDiscoveredCount: sortedEntries.filter((entry) => entry.trend === "newly-discovered").length,
    disappearedCount: sortedEntries.filter((entry) => entry.trend === "disappeared").length,
    runCount: history.runs.length,
  };

  const strengtheningEntries = sortedEntries.filter((entry) => entry.trend === "strengthening");
  const strongest = [...strengtheningEntries].sort((left, right) => {
    const leftDelta = left.trendMetrics.robustnessDelta ?? 0;
    const rightDelta = right.trendMetrics.robustnessDelta ?? 0;
    return rightDelta - leftDelta;
  })[0] ?? null;

  const largestRobustnessGain = sortedEntries.reduce<number | null>((max, entry) => {
    const delta = entry.trendMetrics.robustnessDelta;
    if (delta === null) {
      return max;
    }

    return max === null ? delta : Math.max(max, delta);
  }, null);

  const largestObservationGrowth = sortedEntries.reduce<number | null>((max, entry) => {
    const growth = entry.trendMetrics.observationGrowth;
    if (growth === null) {
      return max;
    }

    return max === null ? growth : Math.max(max, growth);
  }, null);

  const highlights: HypothesisEvolutionDashboardHighlights = {
    strongestImprovingHypothesisId: strongest?.hypothesisId ?? null,
    strongestImprovingHypothesis: strongest?.hypothesis ?? null,
    largestRobustnessGain,
    largestObservationGrowth,
    approachingPromotion: sortedEntries
      .filter((entry) => entry.currentStatus?.promotionEligible)
      .map((entry) => entry.hypothesisId)
      .sort((left, right) => left.localeCompare(right)),
    regressedHypotheses: sortedEntries
      .filter((entry) => entry.trend === "weakening")
      .map((entry) => entry.hypothesisId)
      .sort((left, right) => left.localeCompare(right)),
  };

  return {
    entries: sortedEntries,
    summary,
    highlights,
  };
}
