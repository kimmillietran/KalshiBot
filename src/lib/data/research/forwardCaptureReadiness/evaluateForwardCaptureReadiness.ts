import {
  buildRunBreakdownMetrics,
  groupRunsByKey,
  isNonZeroSpread,
  isSuccessfulRun,
  runDurationMinutes,
  summarizeForwardCaptureRuns,
  type LoadedForwardCaptureRun,
} from "./loadForwardCaptureRuns";
import {
  median,
  percentile,
  safeShare,
  utcDateKey,
} from "./forwardCaptureReadinessMath";
import {
  DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS,
  FORWARD_CAPTURE_READINESS_CAVEATS,
  FORWARD_CAPTURE_READINESS_DISCLAIMER,
  type ForwardCaptureAggregateMetrics,
  type ForwardCaptureBreakdownEntry,
  type ForwardCaptureFamilyReadinessEntry,
  type ForwardCaptureFamilyReadinessVerdict,
  type ForwardCaptureOverallReadinessVerdict,
  type ForwardCaptureReadinessSummary,
  type ForwardCaptureRecommendedNextAction,
  type ForwardCaptureResearchFamilyId,
} from "./forwardCaptureReadinessTypes";

function buildAggregateMetrics(
  runs: LoadedForwardCaptureRun[],
): ForwardCaptureAggregateMetrics {
  const metrics = summarizeForwardCaptureRuns(runs);
  const validRecords = metrics.allTopOfBookRecords.filter(
    (record) => record.bookState === "valid",
  ).length;
  const nonZeroSpreadRecords = metrics.allTopOfBookRecords.filter(isNonZeroSpread).length;
  const zeroSpreadRecords =
    metrics.allTopOfBookRecords.length - nonZeroSpreadRecords;

  const totalDurationMinutes = runs.reduce(
    (sum, run) => sum + runDurationMinutes(run),
    0,
  );
  const researchReadyDurationMinutes = runs
    .filter((run) => isSuccessfulRun(run.health.verdict))
    .reduce((sum, run) => sum + runDurationMinutes(run), 0);

  const hoursCovered = totalDurationMinutes / 60;

  return {
    runCount: runs.length,
    successfulRunCount: runs.filter((run) => isSuccessfulRun(run.health.verdict)).length,
    totalDurationMinutes,
    researchReadyDurationMinutes,
    marketCount: new Set(metrics.allTopOfBookRecords.map((record) => record.marketTicker))
      .size,
    eventCount: new Set(
      metrics.allTopOfBookRecords
        .map((record) => record.eventTicker)
        .filter((value): value is string => Boolean(value)),
    ).size,
    topOfBookRecordCount: metrics.allTopOfBookRecords.length,
    btcSpotRecordCount: metrics.allBtcSpotRecords.length,
    rawMessageCount: runs.reduce((sum, run) => sum + run.rawMessageCount, 0),
    validBookShare: safeShare(validRecords, metrics.allTopOfBookRecords.length),
    sequenceGapCount: runs.reduce(
      (sum, run) => sum + (run.health.orderbook?.sequenceGapCount ?? 0),
      0,
    ),
    reconnectCount: runs.reduce(
      (sum, run) => sum + (run.health.orderbook?.reconnectCount ?? 0),
      0,
    ),
    medianTopOfBookGapMs: median(metrics.allGapsMs),
    p90TopOfBookGapMs: percentile(metrics.allGapsMs, 90),
    btcSpotCoverageShare: safeShare(
      metrics.allBtcSpotRecords.length,
      Math.max(metrics.allTopOfBookRecords.length, 1),
    ),
    nonZeroSpreadShare: safeShare(
      nonZeroSpreadRecords,
      metrics.allTopOfBookRecords.length,
    ),
    zeroSpreadShare: safeShare(zeroSpreadRecords, metrics.allTopOfBookRecords.length),
    daysCovered: metrics.calendarDays.size,
    hoursCovered,
  };
}

function evaluateLeadLagReadiness(
  aggregates: ForwardCaptureAggregateMetrics,
): ForwardCaptureFamilyReadinessEntry {
  const thresholds = DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS.leadLag;
  const familyId: ForwardCaptureResearchFamilyId = "leadLagReadiness";

  if (aggregates.runCount === 0) {
    return {
      familyId,
      verdict: "not-ready-no-data",
      rationale: "No forward capture runs found.",
    };
  }

  if (aggregates.totalDurationMinutes < thresholds.minTotalDurationMinutes) {
    return {
      familyId,
      verdict: "not-ready-too-short",
      rationale: `Captured ${aggregates.totalDurationMinutes.toFixed(1)} minutes; need ${thresholds.minTotalDurationMinutes} minutes.`,
    };
  }

  if ((aggregates.btcSpotCoverageShare ?? 0) < thresholds.minBtcSpotCoverageShare) {
    return {
      familyId,
      verdict: "not-ready-no-btc-spot",
      rationale: `BTC spot coverage ${Math.round((aggregates.btcSpotCoverageShare ?? 0) * 100)}% below ${Math.round(thresholds.minBtcSpotCoverageShare * 100)}%.`,
    };
  }

  if (
    aggregates.p90TopOfBookGapMs !== null
    && aggregates.p90TopOfBookGapMs > thresholds.maxP90TopOfBookGapMs
  ) {
    return {
      familyId,
      verdict: "not-ready-gappy",
      rationale: `p90 top-of-book gap ${aggregates.p90TopOfBookGapMs}ms exceeds ${thresholds.maxP90TopOfBookGapMs}ms.`,
    };
  }

  if ((aggregates.validBookShare ?? 0) < thresholds.minValidBookShare) {
    return {
      familyId,
      verdict: "not-ready-invalid-books",
      rationale: `Valid book share ${Math.round((aggregates.validBookShare ?? 0) * 100)}% below ${Math.round(thresholds.minValidBookShare * 100)}%.`,
    };
  }

  if (aggregates.daysCovered < thresholds.minCalendarDays) {
    return {
      familyId,
      verdict: "not-ready-too-short",
      rationale: `Only ${aggregates.daysCovered} calendar days captured; need ${thresholds.minCalendarDays}.`,
    };
  }

  return {
    familyId,
    verdict: "ready",
    rationale: "Lead-lag diagnostic thresholds met across duration, BTC spot, gaps, and valid books.",
  };
}

function evaluateQuoteStalenessReadiness(
  aggregates: ForwardCaptureAggregateMetrics,
): ForwardCaptureFamilyReadinessEntry {
  const thresholds = DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS.quoteStaleness;
  const familyId: ForwardCaptureResearchFamilyId = "quoteStalenessReadiness";

  if (aggregates.runCount === 0) {
    return {
      familyId,
      verdict: "not-ready-no-data",
      rationale: "No forward capture runs found.",
    };
  }

  if (aggregates.totalDurationMinutes < thresholds.minTotalDurationMinutes) {
    return {
      familyId,
      verdict: "not-ready-too-short",
      rationale: `Captured ${aggregates.totalDurationMinutes.toFixed(1)} minutes; need ${thresholds.minTotalDurationMinutes} minutes.`,
    };
  }

  if (
    aggregates.p90TopOfBookGapMs !== null
    && aggregates.p90TopOfBookGapMs > thresholds.maxP90TopOfBookGapMs
  ) {
    return {
      familyId,
      verdict: "not-ready-gappy",
      rationale: `p90 top-of-book gap ${aggregates.p90TopOfBookGapMs}ms exceeds ${thresholds.maxP90TopOfBookGapMs}ms.`,
    };
  }

  if (aggregates.sequenceGapCount > thresholds.maxSequenceGapCount) {
    return {
      familyId,
      verdict: "not-ready-gappy",
      rationale: `${aggregates.sequenceGapCount} sequence gaps exceed threshold ${thresholds.maxSequenceGapCount}.`,
    };
  }

  if ((aggregates.nonZeroSpreadShare ?? 0) < thresholds.minNonZeroSpreadShare) {
    return {
      familyId,
      verdict: "not-ready-invalid-books",
      rationale: `Non-zero spread share ${Math.round((aggregates.nonZeroSpreadShare ?? 0) * 100)}% below ${Math.round(thresholds.minNonZeroSpreadShare * 100)}%.`,
    };
  }

  return {
    familyId,
    verdict: "ready",
    rationale: "Quote staleness diagnostic thresholds met.",
  };
}

function evaluateSameMarketParityReadiness(
  runs: LoadedForwardCaptureRun[],
  aggregates: ForwardCaptureAggregateMetrics,
): ForwardCaptureFamilyReadinessEntry {
  const thresholds = DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS.sameMarketParity;
  const familyId: ForwardCaptureResearchFamilyId = "sameMarketParityReadiness";

  if (aggregates.runCount === 0) {
    return {
      familyId,
      verdict: "not-ready-no-data",
      rationale: "No forward capture runs found.",
    };
  }

  const metrics = summarizeForwardCaptureRuns(runs);
  const depthPresent = thresholds.requireDepthFields
    ? metrics.allTopOfBookRecords.some(
        (record) =>
          record.yesBestBidSize !== null
          && record.yesBestAskSize !== null
          && record.noBestBidSize !== null
          && record.noBestAskSize !== null,
      )
    : true;

  if (!depthPresent) {
    return {
      familyId,
      verdict: "not-ready-invalid-books",
      rationale: "YES/NO depth fields are missing from captured top-of-book records.",
    };
  }

  if ((aggregates.validBookShare ?? 0) < thresholds.minValidBookShare) {
    return {
      familyId,
      verdict: "not-ready-invalid-books",
      rationale: `Valid book share ${Math.round((aggregates.validBookShare ?? 0) * 100)}% below ${Math.round(thresholds.minValidBookShare * 100)}%.`,
    };
  }

  return {
    familyId,
    verdict: "ready",
    rationale: "Real-book parity scan prerequisites are satisfied.",
  };
}

function evaluateCalibrationFadeSpreadRealismReadiness(
  aggregates: ForwardCaptureAggregateMetrics,
): ForwardCaptureFamilyReadinessEntry {
  const thresholds =
    DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS.calibrationFadeSpreadRealism;
  const familyId: ForwardCaptureResearchFamilyId =
    "calibrationFadeSpreadRealismReadiness";

  if (aggregates.runCount === 0) {
    return {
      familyId,
      verdict: "not-ready-no-data",
      rationale: "No forward capture runs found.",
    };
  }

  if (aggregates.totalDurationMinutes < thresholds.minTotalDurationMinutes) {
    return {
      familyId,
      verdict: "not-ready-too-short",
      rationale: `Captured ${aggregates.totalDurationMinutes.toFixed(1)} minutes; need ${thresholds.minTotalDurationMinutes} minutes for spread realism checks.`,
    };
  }

  if ((aggregates.nonZeroSpreadShare ?? 0) < thresholds.minNonZeroSpreadShare) {
    return {
      familyId,
      verdict: "not-ready-invalid-books",
      rationale: "Captured windows lack sufficient non-zero spread observations.",
    };
  }

  if (aggregates.marketCount < thresholds.minMarketsWithValidBook) {
    return {
      familyId,
      verdict: "not-ready-too-short",
      rationale: `Only ${aggregates.marketCount} markets captured; need ${thresholds.minMarketsWithValidBook}.`,
    };
  }

  return {
    familyId,
    verdict: "ready",
    rationale:
      "Forward quotes include real spread observations across enough markets for spread realism checks (settlement join still required).",
  };
}

function resolveOverallVerdict(input: {
  aggregates: ForwardCaptureAggregateMetrics;
  familyReadiness: readonly ForwardCaptureFamilyReadinessEntry[];
}): ForwardCaptureOverallReadinessVerdict {
  if (input.aggregates.runCount === 0) {
    return "not-ready-no-data";
  }

  const leadLag = input.familyReadiness.find(
    (entry) => entry.familyId === "leadLagReadiness",
  );
  const parity = input.familyReadiness.find(
    (entry) => entry.familyId === "sameMarketParityReadiness",
  );

  if (leadLag?.verdict === "ready") {
    return "ready-for-first-lead-lag-diagnostic";
  }

  if (parity?.verdict === "ready") {
    return "ready-for-first-parity-scan";
  }

  const minCaptureDurationMinutes = Math.min(
    DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS.leadLag.minTotalDurationMinutes,
    DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS.quoteStaleness.minTotalDurationMinutes,
    DEFAULT_FORWARD_CAPTURE_READINESS_THRESHOLDS.calibrationFadeSpreadRealism
      .minTotalDurationMinutes,
  );
  if (input.aggregates.totalDurationMinutes < minCaptureDurationMinutes) {
    return "not-ready-too-short";
  }

  const allTooShort = input.familyReadiness.every(
    (entry) =>
      entry.verdict === "not-ready-too-short" || entry.verdict === "not-ready-no-data",
  );
  if (allTooShort) {
    return "not-ready-too-short";
  }

  const anyReady = input.familyReadiness.some((entry) => entry.verdict === "ready");
  if (anyReady) {
    return "partially-ready";
  }

  return "not-ready";
}

function resolveRecommendedNextAction(input: {
  overallVerdict: ForwardCaptureOverallReadinessVerdict;
  familyReadiness: readonly ForwardCaptureFamilyReadinessEntry[];
}): ForwardCaptureRecommendedNextAction {
  if (
    input.overallVerdict === "not-ready-no-data"
    || input.overallVerdict === "not-ready-too-short"
  ) {
    return "keep-capturing";
  }

  if (input.overallVerdict === "ready-for-first-lead-lag-diagnostic") {
    return "build-lead-lag-diagnostic";
  }

  if (input.overallVerdict === "ready-for-first-parity-scan") {
    return "build-static-parity-scan";
  }

  const gappy = input.familyReadiness.some(
    (entry) => entry.verdict === "not-ready-gappy",
  );
  const invalidBooks = input.familyReadiness.some(
    (entry) => entry.verdict === "not-ready-invalid-books",
  );

  if (gappy || invalidBooks) {
    return "fix-capture-quality";
  }

  const quoteStalenessReady = input.familyReadiness.find(
    (entry) => entry.familyId === "quoteStalenessReadiness",
  )?.verdict === "ready";
  if (quoteStalenessReady) {
    return "build-quote-staleness-diagnostic";
  }

  return "keep-capturing";
}

function buildBreakdownByDate(
  runs: LoadedForwardCaptureRun[],
): ForwardCaptureBreakdownEntry[] {
  const grouped = groupRunsByKey(runs, (record) => utcDateKey(record.receivedAtLocal));
  return [...grouped.entries()]
    .map(([key, groupedRuns]) => ({
      key,
      ...buildAggregateMetrics(groupedRuns),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildBreakdownBySeries(
  runs: LoadedForwardCaptureRun[],
): ForwardCaptureBreakdownEntry[] {
  const grouped = groupRunsByKey(
    runs,
    (record) => record.seriesTicker ?? null,
  );
  return [...grouped.entries()]
    .map(([key, groupedRuns]) => ({
      key,
      ...buildAggregateMetrics(groupedRuns),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildBreakdownByMarket(
  runs: LoadedForwardCaptureRun[],
): ForwardCaptureBreakdownEntry[] {
  const grouped = groupRunsByKey(runs, (record) => record.marketTicker);
  return [...grouped.entries()]
    .map(([key, groupedRuns]) => ({
      key,
      ...buildAggregateMetrics(groupedRuns),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

/** Evaluates forward capture research readiness across loaded runs. */
export function evaluateForwardCaptureReadiness(runs: LoadedForwardCaptureRun[]): {
  disclaimer: string;
  caveats: readonly string[];
  aggregates: ForwardCaptureAggregateMetrics;
  summary: ForwardCaptureReadinessSummary;
  runs: ReturnType<typeof summarizeForwardCaptureRuns>["runTable"];
  byDate: ForwardCaptureBreakdownEntry[];
  bySeriesTicker: ForwardCaptureBreakdownEntry[];
  byMarketTicker: ForwardCaptureBreakdownEntry[];
  byRunId: ForwardCaptureBreakdownEntry[];
} {
  const aggregates = buildAggregateMetrics(runs);
  const familyReadiness: ForwardCaptureFamilyReadinessEntry[] = [
    evaluateLeadLagReadiness(aggregates),
    evaluateQuoteStalenessReadiness(aggregates),
    evaluateSameMarketParityReadiness(runs, aggregates),
    evaluateCalibrationFadeSpreadRealismReadiness(aggregates),
  ];

  const overallVerdict = resolveOverallVerdict({ aggregates, familyReadiness });
  const recommendedNextAction = resolveRecommendedNextAction({
    overallVerdict,
    familyReadiness,
  });

  const metrics = summarizeForwardCaptureRuns(runs);

  return {
    disclaimer: FORWARD_CAPTURE_READINESS_DISCLAIMER,
    caveats: FORWARD_CAPTURE_READINESS_CAVEATS,
    aggregates,
    summary: {
      overallVerdict,
      recommendedNextAction,
      familyReadiness,
    },
    runs: metrics.runTable,
    byDate: buildBreakdownByDate(runs),
    bySeriesTicker: buildBreakdownBySeries(runs),
    byMarketTicker: buildBreakdownByMarket(runs),
    byRunId: buildRunBreakdownMetrics(runs),
  };
}

export function isFamilyVerdictReady(
  verdict: ForwardCaptureFamilyReadinessVerdict,
): boolean {
  return verdict === "ready";
}
