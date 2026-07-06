import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { MispricingAtlasBucketSummary } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { MispricingAtlasCoverageDiagnostics } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { LeadLagLagMetrics } from "@/lib/data/research/leadLag/leadLagTypes";

import { normalizeMispricingAtlas, type NormalizedMispricingAtlas } from "./normalizeMispricingAtlas";

import {
  DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
  DEFAULT_MIN_CALIBRATION_ERROR,
  DEFAULT_MIN_LEAD_LAG_CORRELATION,
  DEFAULT_MIN_UNIQUE_TRADING_DAYS,
} from "./hypothesisCandidateTypes";
import type {
  BuildHypothesisCandidatesInput,
  HypothesisAtlasGroupId,
  HypothesisBucketMetadata,
  HypothesisCandidate,
  HypothesisCandidateConfig,
  HypothesisCandidatesReport,
  HypothesisCandidatesSummary,
  HypothesisConfidence,
  ParsedHypothesisCandidateInputs,
} from "./hypothesisCandidateTypes";
import {
  createDefaultHypothesisBucketSampleThresholds,
  resolveMinSampleSizeForGroup,
} from "./resolveHypothesisBucketThresholds";

type AtlasBucketGroup = {
  groupId: HypothesisAtlasGroupId;
  buckets: readonly MispricingAtlasBucketSummary[];
};

function resolveConfig(
  partial?: Partial<HypothesisCandidateConfig>,
): HypothesisCandidateConfig {
  return {
    minSampleSize: partial?.minSampleSize ?? DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
    minCalibrationError:
      partial?.minCalibrationError ?? DEFAULT_MIN_CALIBRATION_ERROR,
    minLeadLagCorrelation:
      partial?.minLeadLagCorrelation ?? DEFAULT_MIN_LEAD_LAG_CORRELATION,
    minUniqueTradingDays:
      partial?.minUniqueTradingDays ?? DEFAULT_MIN_UNIQUE_TRADING_DAYS,
    minSampleSizeByGroup: {
      ...createDefaultHypothesisBucketSampleThresholds(),
      ...partial?.minSampleSizeByGroup,
    },
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function hasSignificanceSupport(inputs: ParsedHypothesisCandidateInputs): boolean {
  return (
    inputs.statisticalSignificance !== null
    && inputs.statisticalSignificance.strategies.some(
      (strategy) => strategy.statisticallySignificant,
    )
  );
}

function significanceWarnings(
  inputs: ParsedHypothesisCandidateInputs,
): readonly string[] {
  if (inputs.statisticalSignificance === null) {
    return [
      "Statistical significance artifact is missing; confidence is capped and hypothesis remains unvalidated.",
    ];
  }

  if (
    inputs.statisticalSignificance.strategies.every(
      (strategy) => !strategy.statisticallySignificant,
    )
  ) {
    return [
      "No strategy in statistical-significance.json met significance thresholds; treat as exploratory only.",
    ];
  }

  return [];
}

function deriveAtlasConfidence(options: {
  observations: number;
  calibrationErrorMagnitude: number;
  minSampleSize: number;
  significancePresent: boolean;
}): HypothesisConfidence {
  if (
    options.significancePresent
    && options.observations >= options.minSampleSize * 2
    && options.calibrationErrorMagnitude >= DEFAULT_MIN_CALIBRATION_ERROR * 2
  ) {
    return "high";
  }

  if (
    options.observations >= options.minSampleSize
    && options.calibrationErrorMagnitude >= DEFAULT_MIN_CALIBRATION_ERROR
  ) {
    return "medium";
  }

  return "low";
}

function deriveLeadLagConfidence(options: {
  correlation: number;
  observationCount: number;
  minSampleSize: number;
  significancePresent: boolean;
}): HypothesisConfidence {
  if (
    options.significancePresent
    && options.observationCount >= options.minSampleSize * 2
    && options.correlation >= DEFAULT_MIN_LEAD_LAG_CORRELATION * 2
  ) {
    return "high";
  }

  if (
    options.observationCount >= options.minSampleSize
    && options.correlation >= DEFAULT_MIN_LEAD_LAG_CORRELATION
  ) {
    return "medium";
  }

  return "low";
}

function buildAtlasCandidate(options: {
  groupId: AtlasBucketGroup["groupId"];
  bucket: MispricingAtlasBucketSummary;
  config: HypothesisCandidateConfig;
  significanceWarnings: readonly string[];
  significancePresent: boolean;
  regimeContext: string | null;
  direction: "over" | "under";
}): HypothesisCandidate | null {
  const { bucket, config, direction } = options;
  const minSampleSize = resolveMinSampleSizeForGroup(options.groupId, config);

  if (bucket.observations < minSampleSize) {
    return null;
  }

  if (bucket.calibrationError === null) {
    return null;
  }

  const calibrationErrorMagnitude = Math.abs(bucket.calibrationError);
  if (direction === "over") {
    if (bucket.calibrationError < config.minCalibrationError) {
      return null;
    }
  } else if (bucket.calibrationError > -config.minCalibrationError) {
    return null;
  }

  const overconfident = direction === "over";
  const fadeSide = overconfident ? "NO" : "YES";
  const strategyFamily = overconfident ? "calibration-no-fade" : "calibration-yes-fade";
  const marketCondition = options.regimeContext
    ? `${bucket.bucketLabel} (${options.regimeContext})`
    : bucket.bucketLabel;

  const hypothesis = overconfident
    ? `${marketCondition} appears overconfident; test ${fadeSide} fade against implied probability.`
    : `${marketCondition} appears underconfident; test ${fadeSide} fade against implied probability.`;

  const warnings = [...options.significanceWarnings];
  if (bucket.observations < minSampleSize * 2) {
    warnings.push(
      `Atlas cell sample size (${bucket.observations}) is above the minimum but still modest; widen replay coverage before trading.`,
    );
  }

  const uniqueTradingDays = bucket.uniqueTradingDays ?? null;
  if (
    uniqueTradingDays !== null
    && uniqueTradingDays < config.minUniqueTradingDays
  ) {
    warnings.push(
      `Filtered: bucket dominated by ${uniqueTradingDays} unique trading day${uniqueTradingDays === 1 ? "" : "s"} (< ${config.minUniqueTradingDays} required).`,
    );
    return null;
  }

  if (
    uniqueTradingDays !== null
    && uniqueTradingDays < config.minUniqueTradingDays * 2
  ) {
    warnings.push(
      `Sample spans only ${uniqueTradingDays} unique trading days; confirm temporal diversity before synthesis.`,
    );
  }

  const bucketMetadata: HypothesisBucketMetadata = {
    groupId: options.groupId,
    bucketId: bucket.bucketId,
    bucketLabel: bucket.bucketLabel,
    observations: bucket.observations,
    uniqueTradingDays,
    calibrationError: bucket.calibrationError,
    calibrationDirection: direction,
  };

  return {
    candidateId: `atlas-${options.groupId}-${bucket.bucketId}-${direction}`,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis,
    rationale: `Observed calibration error of ${formatPercent(bucket.calibrationError)} across ${bucket.observations} observations${uniqueTradingDays !== null ? ` spanning ${uniqueTradingDays} unique trading days` : ""} (implied ${formatPercent(bucket.averageImpliedProbability ?? 0)}, realized ${formatPercent(bucket.realizedFrequency ?? 0)}).`,
    marketCondition,
    suggestedStrategyFamily: strategyFamily,
    requiredData: [
      "Kalshi implied probability (bid/ask midpoint)",
      "Settlement outcome",
      "Replay context for bucket dimensions (time remaining, moneyness, volatility)",
    ],
    proposedEntryCondition: overconfident
      ? `Enter ${fadeSide} when replay step maps to ${bucket.bucketLabel} and implied probability exceeds realized frequency by at least ${formatPercent(config.minCalibrationError)}.`
      : `Enter ${fadeSide} when replay step maps to ${bucket.bucketLabel} and implied probability trails realized frequency by at least ${formatPercent(config.minCalibrationError)}.`,
    proposedExitSettlementAssumption:
      "Hold through settlement unless a research-only stop is defined; evaluate PnL at market resolution.",
    expectedFailureMode:
      "Calibration gap is descriptive only and may be noise, regime-specific, or already arbitraged away in live markets.",
    killCriterion: `Stop pursuing if out-of-sample calibration error for ${bucket.bucketLabel} falls below ${formatPercent(config.minCalibrationError / 2)} across the next ${minSampleSize} qualifying observations.`,
    confidence: deriveAtlasConfidence({
      observations: bucket.observations,
      calibrationErrorMagnitude,
      minSampleSize,
      significancePresent: options.significancePresent,
    }),
    warnings,
    bucketMetadata,
  };
}

function buildAtlasCandidatesForBucket(options: {
  groupId: AtlasBucketGroup["groupId"];
  bucket: MispricingAtlasBucketSummary;
  config: HypothesisCandidateConfig;
  significanceWarnings: readonly string[];
  significancePresent: boolean;
  regimeContext: string | null;
}): HypothesisCandidate[] {
  const candidates: HypothesisCandidate[] = [];

  for (const direction of ["over", "under"] as const) {
    const candidate = buildAtlasCandidate({
      ...options,
      direction,
    });

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function collectAtlasBucketGroupsFromNormalized(
  normalizedAtlas: NormalizedMispricingAtlas,
): AtlasBucketGroup[] {
  return [
    {
      groupId: "probabilityOnly",
      buckets: normalizedAtlas.coarseBuckets.probabilityOnly,
    },
    {
      groupId: "probabilityTime",
      buckets: normalizedAtlas.coarseBuckets.probabilityTime,
    },
    {
      groupId: "probabilityRegime",
      buckets: normalizedAtlas.coarseBuckets.probabilityRegime,
    },
    {
      groupId: "probabilityMoneyness",
      buckets: normalizedAtlas.coarseBuckets.probabilityMoneyness,
    },
    {
      groupId: "moneynessTime",
      buckets: normalizedAtlas.coarseBuckets.moneynessTime,
    },
    {
      groupId: "volatilityMoneyness",
      buckets: normalizedAtlas.coarseBuckets.volatilityMoneyness,
    },
    {
      groupId: "volatilityProbabilityTime",
      buckets: normalizedAtlas.coarseBuckets.volatilityProbabilityTime,
    },
    { groupId: "probability", buckets: normalizedAtlas.probabilityBuckets },
    { groupId: "timeRemaining", buckets: normalizedAtlas.timeRemainingBuckets },
    { groupId: "moneyness", buckets: normalizedAtlas.moneynessBuckets },
    { groupId: "volatility", buckets: normalizedAtlas.volatilityBuckets },
  ];
}

function resolveAtlasCoverageDiagnostics(
  atlas: NonNullable<ParsedHypothesisCandidateInputs["mispricingAtlas"]>,
  config: HypothesisCandidateConfig,
  normalizedAtlas?: NormalizedMispricingAtlas,
): MispricingAtlasCoverageDiagnostics {
  return (
    normalizedAtlas?.coverageDiagnostics
    ?? normalizeMispricingAtlas(atlas, config.minSampleSize).coverageDiagnostics
  );
}

function buildAtlasNoCandidateReasons(
  atlas: NonNullable<ParsedHypothesisCandidateInputs["mispricingAtlas"]>,
  config: HypothesisCandidateConfig,
  normalizedAtlas?: NormalizedMispricingAtlas,
): string[] {
  const coverage = resolveAtlasCoverageDiagnostics(atlas, config, normalizedAtlas);
  const reasons: string[] = [];

  if (coverage.totalAtlasObservations === 0) {
    if (coverage.skipReasons.missingSettlement > 0) {
      reasons.push(
        `No candidate: no settlement outcomes found (${coverage.skipReasons.missingSettlement} markets skipped).`,
      );
    }

    reasons.push(
      `No candidate: insufficient atlas observations (0 < ${config.minSampleSize}).`,
    );

    return reasons;
  }

  if (coverage.nonEmptyBuckets === 0) {
    reasons.push("No candidate: atlas file parsed but no non-empty buckets.");
    return reasons;
  }

  if (coverage.largestBucketObservations < config.minSampleSize) {
    reasons.push(
      `No candidate: largest bucket has ${coverage.largestBucketObservations} observations, below threshold (${config.minSampleSize}).`,
    );
    return reasons;
  }

  reasons.push(
    "No candidate: no statistically meaningful mispricing cells above the minimum sample threshold.",
  );

  return reasons;
}

function buildAtlasCandidates(
  inputs: ParsedHypothesisCandidateInputs,
  config: HypothesisCandidateConfig,
  normalizedAtlas: NormalizedMispricingAtlas | null,
): HypothesisCandidate[] {
  if (inputs.mispricingAtlas === null || normalizedAtlas === null) {
    return [];
  }

  const significanceWarningList = significanceWarnings(inputs);
  const significancePresent = hasSignificanceSupport(inputs);
  const highVolRegime = inputs.regimeTags?.regimes.find((regime) =>
    regime.tags.some((tag) => /high[\s-]?vol/i.test(tag)),
  );
  const regimeContext = highVolRegime?.label ?? null;

  const candidates: HypothesisCandidate[] = [];

  for (const group of collectAtlasBucketGroupsFromNormalized(normalizedAtlas)) {
    for (const bucket of group.buckets) {
      const bucketCandidates = buildAtlasCandidatesForBucket({
        groupId: group.groupId,
        bucket,
        config,
        significanceWarnings: significanceWarningList,
        significancePresent,
        regimeContext:
          group.groupId === "volatility" && bucket.bucketId === "vol-high"
            ? regimeContext
            : null,
      });

      candidates.push(...bucketCandidates);
    }
  }

  return candidates;
}

function selectLeadLagSignal(
  metrics: readonly LeadLagLagMetrics[],
  config: HypothesisCandidateConfig,
): LeadLagLagMetrics | null {
  const qualifying = metrics
    .filter(
      (metric) =>
        metric.direction === "btc-leads-kalshi"
        && metric.lag >= 1
        && metric.observationCount >= config.minSampleSize
        && metric.correlation !== null
        && Math.abs(metric.correlation) >= config.minLeadLagCorrelation,
    )
    .sort((left, right) => {
      const correlationCompare =
        Math.abs(right.correlation ?? 0) - Math.abs(left.correlation ?? 0);
      if (correlationCompare !== 0) {
        return correlationCompare;
      }

      return left.lag - right.lag;
    });

  return qualifying[0] ?? null;
}

function buildLeadLagCandidate(
  inputs: ParsedHypothesisCandidateInputs,
  config: HypothesisCandidateConfig,
): HypothesisCandidate | null {
  if (inputs.leadLagAnalysis === null) {
    return null;
  }

  const signal = selectLeadLagSignal(
    inputs.leadLagAnalysis.aggregateLagMetrics,
    config,
  );
  if (!signal || signal.correlation === null) {
    return null;
  }

  const significanceWarningList = significanceWarnings(inputs);
  const significancePresent = hasSignificanceSupport(inputs);
  const highVolRegime = inputs.regimeTags?.regimes.find((regime) =>
    regime.tags.some((tag) => /high[\s-]?vol/i.test(tag)),
  );
  const marketCondition = highVolRegime
    ? `BTC return leads Kalshi probability by ${signal.lag} candle(s) in ${highVolRegime.label}`
    : `BTC return leads Kalshi probability by ${signal.lag} candle(s)`;

  const warnings = [...significanceWarningList];
  if (signal.observationCount < config.minSampleSize * 2) {
    warnings.push(
      `Lead-lag alignment count (${signal.observationCount}) is modest; confirm with additional markets before testing.`,
    );
  }

  return {
    candidateId: `lead-lag-aggregate-lag-${signal.lag}`,
    sourceArtifact: "lead-lag-analysis.json",
    hypothesis: `${marketCondition}; test delayed reaction strategy.`,
    rationale: `Aggregate lag ${signal.lag} shows ${signal.direction} with correlation ${signal.correlation.toFixed(3)} across ${signal.observationCount} aligned candle pairs.`,
    marketCondition,
    suggestedStrategyFamily: "delayed-reaction",
    requiredData: [
      "Coinbase BTC spot or replay BTC price series",
      "Kalshi implied probability time series",
      "Aligned candle timestamps",
    ],
    proposedEntryCondition: `After BTC move at candle t, enter when Kalshi implied probability at t+${signal.lag} has not yet reflected the move (directional threshold to be set in research replay).`,
    proposedExitSettlementAssumption:
      "Exit after probability catches up or at a fixed horizon of one candle past the lag window; compare settlement PnL separately.",
    expectedFailureMode:
      "Lead-lag may be a replay artifact, disappear after fees, or invert when liquidity is stressed.",
    killCriterion: `Discard if rolling correlation at lag ${signal.lag} drops below ${(config.minLeadLagCorrelation / 2).toFixed(2)} on the next ${config.minSampleSize} aligned candles.`,
    confidence: deriveLeadLagConfidence({
      correlation: Math.abs(signal.correlation),
      observationCount: signal.observationCount,
      minSampleSize: config.minSampleSize,
      significancePresent,
    }),
    warnings,
    bucketMetadata: null,
  };
}

function sortCandidates(
  candidates: readonly HypothesisCandidate[],
): HypothesisCandidate[] {
  return [...candidates].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  );
}

function buildSummary(
  candidates: readonly HypothesisCandidate[],
  inputs: ParsedHypothesisCandidateInputs,
  config: HypothesisCandidateConfig,
  normalizedAtlas: NormalizedMispricingAtlas | null,
): HypothesisCandidatesSummary {
  const atlasCoverageDiagnostics =
    inputs.mispricingAtlas === null
      ? null
      : resolveAtlasCoverageDiagnostics(
          inputs.mispricingAtlas,
          config,
          normalizedAtlas ?? undefined,
        );

  if (candidates.length > 0) {
    return {
      candidateCount: candidates.length,
      noCandidateReasons: [],
      atlasCoverageDiagnostics,
    };
  }

  const reasons: string[] = [];

  if (
    inputs.mispricingAtlas === null
    && inputs.leadLagAnalysis === null
  ) {
    reasons.push("No candidate: missing mispricing-atlas.json and lead-lag-analysis.json inputs.");
  } else {
    if (inputs.mispricingAtlas !== null) {
      reasons.push(
        ...buildAtlasNoCandidateReasons(
          inputs.mispricingAtlas,
          config,
          normalizedAtlas ?? undefined,
        ),
      );
    }

    if (inputs.leadLagAnalysis !== null) {
      const hasLeadLagSignal = selectLeadLagSignal(
        inputs.leadLagAnalysis.aggregateLagMetrics,
        config,
      );
      if (!hasLeadLagSignal) {
        reasons.push(
          "No candidate: lead-lag analysis did not show a BTC-leading signal above correlation and sample thresholds.",
        );
      }
    }
  }

  if (reasons.length === 0) {
    reasons.push(
      "No candidate: insufficient data / no statistically meaningful mispricing.",
    );
  }

  return {
    candidateCount: 0,
    noCandidateReasons: reasons,
    atlasCoverageDiagnostics,
  };
}

/** Builds deterministic, conservative strategy hypothesis candidates from research artifacts. */
export function buildHypothesisCandidates(
  input: BuildHypothesisCandidatesInput,
): HypothesisCandidatesReport {
  const config = resolveConfig(input.config);
  const normalizedAtlas = input.inputs.mispricingAtlas
    ? normalizeMispricingAtlas(input.inputs.mispricingAtlas, config.minSampleSize)
    : null;
  const atlasCandidates = buildAtlasCandidates(
    input.inputs,
    config,
    normalizedAtlas,
  );
  const leadLagCandidate = buildLeadLagCandidate(input.inputs, config);
  const candidates = sortCandidates([
    ...atlasCandidates,
    ...(leadLagCandidate ? [leadLagCandidate] : []),
  ]);

  const memoryDiagnostics = input.memoryReport
    ? {
        atlasObservationCount:
          input.inputs.mispricingAtlas?.sampleCounts.totalObservations ?? 0,
        candidateCount: candidates.length,
        peakRetainedCandidateCount: candidates.length,
        atlasBucketGroupCount: normalizedAtlas
          ? collectAtlasBucketGroupsFromNormalized(normalizedAtlas).length
          : 0,
        largestIntermediateCollection: "mispricing-atlas-input",
      }
    : undefined;

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    config,
    inputs: input.inputStatus,
    candidates,
    summary: buildSummary(candidates, input.inputs, config, normalizedAtlas),
    ...(memoryDiagnostics ? { memoryDiagnostics } : {}),
  };
}

export function serializeHypothesisCandidatesReport(
  report: HypothesisCandidatesReport,
): string {
  return stableStringify(report);
}

export {
  buildAtlasCandidate,
  selectLeadLagSignal,
};
