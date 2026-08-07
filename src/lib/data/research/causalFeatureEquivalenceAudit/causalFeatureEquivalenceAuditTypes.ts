import type { VolatilityWindowRejectionReason } from "../calibrationFadeForwardValidation/buildValidatedCausalVolatilityWindow";
import type { CalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

export const CAUSAL_FEATURE_EQUIVALENCE_ANALYSIS_VERSION =
  "calibration-fade-causal-feature-equivalence-v1" as const;

export const CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_SCHEMA =
  "calibration-fade-causal-feature-equivalence-evidence" as const;

export const CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_VERSION = "v1" as const;

export const DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_PATH =
  "config/research/audits/calibration-fade-causal-feature-equivalence-v1.json";

export const DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_AUDIT_OUTPUT_PATH =
  "data/research-results/causal-feature-equivalence-audit.json";

export const DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_AUDIT_HTML_PATH =
  "data/reports/causal-feature-equivalence-audit.html";

export const DEFAULT_CAUSAL_FEATURE_EQUIVALENCE_HYPOTHESIS_CONFIG_PATH =
  "config/research/hypotheses/high-volatility-late-market-calibration-fade-v1.json";

export const EXPECTED_HYPOTHESIS_ID =
  "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over";

export const EXPECTED_HYPOTHESIS_CONFIGURATION_HASH = "0bda8f23";

export const EXPECTED_FREEZE_COMMIT_SHA =
  "f2598cf960472f368cd6ad25f67d4c97a3b3956e";

export const EVIDENCE_STATUSES = [
  "proven-by-executable-code",
  "proven-by-test",
  "declared-by-frozen-config",
  "inferred-from-call-chain",
  "project-context-only",
  "unavailable",
] as const;

export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export const VOLATILITY_CONTRACT_FIELDS = [
  "sourceInstrument",
  "sourceRecordType",
  "timestampField",
  "timestampMeaning",
  "returnIntervalMs",
  "lookbackReturns",
  "requiredCloseCount",
  "annualizationMethod",
  "quoteMinuteInclusionPolicy",
  "missingMinuteBehavior",
  "sourceGapDefinition",
  "sourceGapThresholdMs",
  "startBoundaryHandling",
  "internalGapHandling",
  "trailingGapHandling",
  "quoteJoinAgeMs",
  "quoteJoinAgeRole",
  "duplicateHandling",
  "orderingHandling",
  "invalidPriceHandling",
  "futureSampleHandling",
  "volHighThreshold",
] as const;

export type VolatilityContractField = (typeof VOLATILITY_CONTRACT_FIELDS)[number];

/** Fields that govern semantic equivalence for volatility reconstruction. */
export const GOVERNED_VOLATILITY_CONTRACT_FIELDS = [
  "sourceInstrument",
  "sourceRecordType",
  "timestampField",
  "returnIntervalMs",
  "lookbackReturns",
  "requiredCloseCount",
  "annualizationMethod",
  "quoteMinuteInclusionPolicy",
  "missingMinuteBehavior",
  "sourceGapDefinition",
  "sourceGapThresholdMs",
  "startBoundaryHandling",
  "internalGapHandling",
  "trailingGapHandling",
  "duplicateHandling",
  "orderingHandling",
  "invalidPriceHandling",
  "futureSampleHandling",
] as const satisfies readonly VolatilityContractField[];

export type CausalFeatureEquivalenceVerdict =
  | "historical-feature-definition-ambiguous"
  | "forward-validator-semantics-mismatch"
  | "frozen-feature-not-reconstructable-from-current-capture"
  | "exactly-equivalent-and-reconstructable";

export type CausalFeatureEquivalenceRecommendedNextAction =
  | "resolve-historical-feature-definition"
  | "correct-forward-validator-to-frozen-semantics"
  | "design-equivalent-forward-capture"
  | "collect-sufficient-evaluable-forward-duration"
  | "resume-calibration-fade-forward-event-evaluation";

export type ContractFieldComparisonStatus =
  | "equivalent"
  | "mismatch"
  | "ambiguous-missing-historical"
  | "descriptive-only";

export type HistoricalEvidenceStatus =
  | "proven"
  | "ambiguous"
  | "insufficient";

export type VolatilityWindowAttributionClass =
  | "insufficient-source-points"
  | "insufficient-bars"
  | "future-only-source"
  | "invalid-source-price"
  | "non-ascending-source"
  | "conflicting-duplicate-source"
  | "missing-minute-bucket"
  | "start-boundary-gap-exceeded"
  | "internal-source-gap-exceeded"
  | "trailing-source-age-exceeded"
  | "nonconsecutive-bars"
  | "volatility-estimate-unavailable"
  | "available";

export const VOLATILITY_WINDOW_ATTRIBUTION_CLASSES = [
  "insufficient-source-points",
  "insufficient-bars",
  "future-only-source",
  "invalid-source-price",
  "non-ascending-source",
  "conflicting-duplicate-source",
  "missing-minute-bucket",
  "start-boundary-gap-exceeded",
  "internal-source-gap-exceeded",
  "trailing-source-age-exceeded",
  "nonconsecutive-bars",
  "volatility-estimate-unavailable",
  "available",
] as const satisfies readonly VolatilityWindowAttributionClass[];

export type EvidenceClaim = {
  claimId: string;
  claim: string;
  status: EvidenceStatus;
  commitSha: string | null;
  path: string | null;
  blobSha: string | null;
  symbol: string | null;
  contractField: VolatilityContractField | null;
  value: string | number | boolean | null;
  summary: string;
  limitations: readonly string[];
};

export type CausalFeatureEquivalenceEvidenceDocument = {
  schema: typeof CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_SCHEMA;
  version: typeof CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_VERSION;
  auditId: string;
  hypothesisId: string;
  hypothesisConfigurationHash: string;
  freezeCommitSha: string;
  freezeCommitTimestamp: string;
  runtimeGitPolicy: string;
  claims: readonly EvidenceClaim[];
  unresolvedAmbiguities: readonly string[];
  limitations: readonly string[];
};

export type VolatilityFeatureContract = {
  sourceInstrument: string | null;
  sourceRecordType: string | null;
  timestampField: string | null;
  timestampMeaning: string | null;
  returnIntervalMs: number | null;
  lookbackReturns: number | null;
  requiredCloseCount: number | null;
  annualizationMethod: string | null;
  quoteMinuteInclusionPolicy: string | null;
  missingMinuteBehavior: string | null;
  sourceGapDefinition: string | null;
  sourceGapThresholdMs: number | null;
  startBoundaryHandling: string | null;
  internalGapHandling: string | null;
  trailingGapHandling: string | null;
  quoteJoinAgeMs: number | null;
  quoteJoinAgeRole: string | null;
  duplicateHandling: string | null;
  orderingHandling: string | null;
  invalidPriceHandling: string | null;
  futureSampleHandling: string | null;
  volHighThreshold: number | null;
};

export type ContractFieldComparison = {
  field: VolatilityContractField;
  historicalValue: string | number | boolean | null;
  forwardValue: string | number | boolean | null;
  status: ContractFieldComparisonStatus;
  governed: boolean;
};

export type ContractComparisonResult = {
  fields: readonly ContractFieldComparison[];
  equivalent: boolean;
  hasSemanticMismatch: boolean;
  hasAmbiguousMissingHistorical: boolean;
  historicalEvidenceStatus: HistoricalEvidenceStatus;
};

export type ThresholdBinStats = {
  thresholdMs: number;
  comparison: "<=" | ">";
  count: number;
  share: number | null;
};

/** Interval threshold bins count each gap toward every applicable exceedance row. */
export type ThresholdCountSemantics = "cumulative-overlapping";

export type GapExample = {
  fromTimestampMs: number;
  toTimestampMs: number;
  gapMs: number;
};

export type BtcSourceDiagnostics = {
  sourceRecordCount: number;
  firstTimestampMs: number | null;
  lastTimestampMs: number | null;
  durationMs: number | null;
  finiteTimestampCount: number;
  finitePositivePriceCount: number;
  invalidPriceCount: number;
  outOfOrderCount: number;
  exactDuplicateTimestampCount: number;
  conflictingDuplicateTimestampCount: number;
  observedIntervalCount: number;
  minimumIntervalMs: number | null;
  maximumIntervalMs: number | null;
  meanIntervalMs: number | null;
  p50IntervalMs: number | null;
  p75IntervalMs: number | null;
  p90IntervalMs: number | null;
  p95IntervalMs: number | null;
  p99IntervalMs: number | null;
  /**
   * Cumulative overlapping threshold counts: a single gap contributes to every
   * applicable exceedance row (e.g. 6001ms increments >5000, >5001, >5100, >5500, >6000).
   */
  thresholdCountSemantics: ThresholdCountSemantics;
  thresholdBins: readonly ThresholdBinStats[];
  longestGapExamples: readonly GapExample[];
  runStartBoundaryCoverageMs: number | null;
  runEndBoundaryCoverageMs: number | null;
};

export type QuoteJoinDiagnostics = {
  observationsScanned: number;
  observationsWithCausalSource: number;
  observationsWithNoCausalSource: number;
  ageMinMs: number | null;
  ageMaxMs: number | null;
  ageMeanMs: number | null;
  ageP50Ms: number | null;
  ageP90Ms: number | null;
  ageP95Ms: number | null;
  ageP99Ms: number | null;
  ageAtOrBelow5000Count: number;
  ageAtOrBelow5000Share: number | null;
  ageAbove5000Count: number;
  ageAbove5000Share: number | null;
  negativeAgeCount: number;
  futureSourceLeakageCount: number;
  sourceTimestampField: string;
  quoteTimestampField: string;
  clockDomainCaveat: string;
};

export type AttributionClassStats = {
  class: VolatilityWindowAttributionClass;
  observationCount: number;
  observationShare: number | null;
  affectedMarketCount: number;
  representativeExamples: readonly {
    marketTicker: string;
    timestampMs: number;
    failingGapMs: number | null;
  }[];
  minimumFailingGapMs: number | null;
  maximumFailingGapMs: number | null;
  p50FailingGapMs: number | null;
  p90FailingGapMs: number | null;
};

/** Per-observation attribution row retained for reconstructability denominators. */
export type VolatilityWindowAttributionObservation = {
  marketTicker: string;
  timestampMs: number;
  attributionClass: VolatilityWindowAttributionClass;
  /** Production rejection reason when unavailable; null when available. */
  productionRejectionReason: VolatilityWindowRejectionReason | null;
  failingGapMs: number | null;
};

export type VolatilityWindowDiagnostics = {
  observationsAttempted: number;
  classes: readonly AttributionClassStats[];
  productionRejectionReasonCounts: Readonly<Partial<Record<VolatilityWindowRejectionReason, number>>>;
  /** One row per attempted observation, in attribution walk order. */
  observations: readonly VolatilityWindowAttributionObservation[];
};

/**
 * Structural (finite-run boundary) exclusion categories — distinct from production
 * rejection reasons. Warm-up / pre-source exclusions are not reconstruction failures.
 */
export const STRUCTURAL_EXCLUSION_REASONS = [
  "pre-first-causal-source",
  "feature-warmup-insufficient-history",
  "other-structural-boundary",
] as const;

export type StructuralExclusionReason = (typeof STRUCTURAL_EXCLUSION_REASONS)[number];

export type ReferenceComparisonSummary = {
  performed: boolean;
  reasonIfSkipped: string | null;
  bothUnavailable: number;
  historicalAvailableForwardUnavailable: number;
  historicalUnavailableForwardAvailable: number;
  bothAvailable: number;
  bothAvailableEqual: number;
  bothAvailableMaterialDifference: number;
  maximumAbsoluteDifference: number | null;
  p50AbsoluteDifference: number | null;
  p90AbsoluteDifference: number | null;
  p99AbsoluteDifference: number | null;
  equalityTolerance: number;
  equalityToleranceBasis: string;
  firstMismatches: readonly {
    marketTicker: string;
    timestampMs: number;
    historicalVolatility: number | null;
    forwardVolatility: number | null;
  }[];
};

/**
 * Reconstructability denominator (Domain A):
 * all feature-evaluable parseable top-of-book observations after structural
 * finite-run exclusions — independent of hypothesis non-volatility eligibility
 * gates (probability band, time remaining, open market, book sync, join age).
 * M12.4 measures source-feature reconstructability for every TOB quote the
 * volatility window helper is asked to evaluate, not only strategy-eligible rows.
 */
export const RECONSTRUCTABILITY_DENOMINATOR_DEFINITION =
  "Domain A: feature-evaluable parseable top-of-book observations (observedTotal minus structural finite-run warm-up / pre-first-causal-source exclusions). Non-volatility hypothesis eligibility gates are not applied. Structural warm-up exclusions are not reconstruction failures." as const;

export type ReconstructabilityAssessment = {
  reconstructable: boolean;
  /**
   * Documents Domain A vs Domain B choice and warm-up exclusion policy.
   * @see RECONSTRUCTABILITY_DENOMINATOR_DEFINITION
   */
  denominatorDefinition: string;
  /** All parseable selected-run top-of-book observations considered by the audit. */
  observedTotal: number;
  structurallyExcludedCount: number;
  /** observedTotal - structurallyExcludedCount */
  featureEvaluableCount: number;
  /** Available windows among feature-evaluable observations only. */
  availableCount: number;
  /** Non-available feature-evaluable observations (excludes structural warm-up). */
  reconstructionFailureCount: number;
  structuralExclusionCountsByReason: Readonly<Partial<Record<StructuralExclusionReason, number>>>;
  reconstructionFailureCountsByReason: Readonly<
    Partial<Record<VolatilityWindowAttributionClass, number>>
  >;
  /**
   * Earliest quote timestamp at which production could accept a
   * requiredCloseCount-bar window under healthy run-start geometry (start-boundary
   * maximumSourceGapMs eligibility plus ending-minute sample phase). Null when no
   * usable causal BTC exists.
   */
  earliestFeatureEvaluableTimestampMs: number | null;
  /** First finite positive-price causal BTC timestamp used for the boundary. */
  firstUsableCausalBtcTimestampMs: number | null;
  /** availableCount / featureEvaluableCount */
  availableShareOfEvaluable: number | null;
  /**
   * Share of feature-evaluable observations attributed to start/internal/trailing
   * source-gap classes (gap-only diagnostic; does not alone gate reconstructable).
   */
  continuityFailureShareOfEvaluable: number | null;
  reason: string;
};

export type FutureCaptureRequirements = {
  emitted: boolean;
  requiredSourceRecordType: string | null;
  requiredTimestampField: string | null;
  requiredTimestampClockDomain: string | null;
  requiredMaximumSourceGapMs: number | null;
  requiredNominalCadenceMs: number | null;
  requiredSchedulingSafetyMarginMs: number | null;
  requiredCaptureFields: readonly string[];
  requiredDuplicateOrderGuarantees: string | null;
  requiredPreRollDurationMs: number | null;
  requiredMinimumBarWarmup: number | null;
  requiredRunStartBehavior: string | null;
  requiredMonitoringMetric: string | null;
  acceptanceTest: string | null;
  note: string | null;
};

export type CausalFeatureEquivalenceAuditReport = {
  analysisVersion: typeof CAUSAL_FEATURE_EQUIVALENCE_ANALYSIS_VERSION;
  generatedAt: string;
  analysisScope: "selected-run";
  selectedRunId: string;
  captureRunDir: string;
  outputPath: string;
  htmlOutputPath: string;
  inputFingerprints: readonly {
    role: string;
    path: string;
    sha256: string;
    byteLength: number;
  }[];
  hypothesisId: string;
  hypothesisConfigurationHash: string;
  auditEvidencePath: string;
  auditEvidenceHash: string;
  /** Stable semantic hash of normalized historicalContract (excludes generatedAt/paths/warnings). */
  historicalContractSemanticHash: string;
  /** Stable semantic hash of normalized currentForwardContract. */
  currentForwardContractSemanticHash: string;
  historicalEvidenceStatus: HistoricalEvidenceStatus;
  historicalContract: VolatilityFeatureContract;
  currentForwardContract: VolatilityFeatureContract;
  contractComparison: ContractComparisonResult;
  btcSourceDiagnostics: BtcSourceDiagnostics;
  quoteJoinDiagnostics: QuoteJoinDiagnostics;
  volatilityWindowDiagnostics: VolatilityWindowDiagnostics;
  referenceComparison: ReferenceComparisonSummary;
  reconstructability: ReconstructabilityAssessment;
  futureCaptureRequirements: FutureCaptureRequirements;
  verdict: CausalFeatureEquivalenceVerdict;
  recommendedNextAction: CausalFeatureEquivalenceRecommendedNextAction;
  limitations: readonly string[];
  warnings: readonly string[];
  nonClaims: readonly string[];
};

export class CausalFeatureEquivalenceAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CausalFeatureEquivalenceAuditError";
  }
}

export type CausalFeatureEquivalenceAuditIo = CalibrationFadeForwardValidationIo;
