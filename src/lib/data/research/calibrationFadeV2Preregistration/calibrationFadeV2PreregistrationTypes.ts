/**
 * Additive v2 preregistration types. Separate from the v1 frozen-hypothesis
 * loader so null maximumSourceGapMs cannot loosen v1 parseVolatilityDefinition.
 */

export const CALIBRATION_FADE_V2_PREREGISTRATION_SCHEMA =
  "calibration-fade-hypothesis-preregistration" as const;
export const CALIBRATION_FADE_V2_PREREGISTRATION_VERSION = 1 as const;
export const CALIBRATION_FADE_V2_HYPOTHESIS_VERSION = "v2" as const;

/** Canonical v2 hypothesis / candidate identity (immutable lineage fork of the atlas candidate). */
export const CALIBRATION_FADE_V2_HYPOTHESIS_ID =
  "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over" as const;
export const CALIBRATION_FADE_V2_SOURCE_CANDIDATE_ID =
  "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over" as const;

/** Immutable v2 freeze commit that contains the final hypothesis config bytes. */
export const CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA =
  "1c5ef9da3ef5e48af26c05b850183b0e8d4290d0" as const;

export const DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH =
  "config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json";
export const DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH =
  "config/research/hypotheses/provenance/high-volatility-late-market-calibration-fade-v2.json";
export const DEFAULT_CALIBRATION_FADE_V1_HYPOTHESIS_CONFIG_PATH =
  "config/research/hypotheses/high-volatility-late-market-calibration-fade-v1.json";

/** Required completed-candle source; spot ticks must never silently substitute. */
export const V2_REQUIRED_SOURCE_RECORD_TYPE = "exchange-completed-1m-ohlc" as const;
export const V2_REQUIRED_PROVIDER = "coinbase-spot" as const;
export const V2_REQUIRED_PROVIDER_INSTRUMENT = "BTC-USD" as const;
export const V2_ADJACENT_SOURCE_GAP_POLICY_NONE = "none" as const;
export const V2_PROSPECTIVE_BOUNDARY_KIND = "strictly-after-freeze-commit" as const;

export const PENDING_FREEZE_IDENTITY = "pending" as const;

export class CalibrationFadeV2PreregistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeV2PreregistrationError";
  }
}

export type CalibrationFadeV2VolatilityDefinition = {
  sourceInstrument: "BTC";
  provider: typeof V2_REQUIRED_PROVIDER;
  providerInstrument: typeof V2_REQUIRED_PROVIDER_INSTRUMENT;
  sourceRecordType: typeof V2_REQUIRED_SOURCE_RECORD_TYPE;
  timestampField: "exchange-candle-close-time";
  timestampMeaning: "exchange-candle-close-time";
  returnIntervalMs: 60000;
  lookbackBars: 10;
  requiredCloseCount: 11;
  method: "realized-log-return-annualized";
  causalOnly: true;
  quoteMinutePolicy: "exclude-in-progress-minute-as-completed-candle";
  missingMinuteBehavior: "omit-missing-exchange-candles-no-fill";
  fillInterpolation: "none";
  /** Discriminated: no adjacent-source-gap eligibility gate. */
  adjacentSourceGapPolicy: typeof V2_ADJACENT_SOURCE_GAP_POLICY_NONE;
  /**
   * Explicit null means NOT APPLICABLE under adjacentSourceGapPolicy=none.
   * Must not be 0 or 5000.
   */
  maximumSourceGapMs: null;
};

export type CalibrationFadeV2HypothesisSpec = {
  hypothesisId: string;
  hypothesisVersion: typeof CALIBRATION_FADE_V2_HYPOTHESIS_VERSION;
  description: string;
  canonicalSourceArtifacts: readonly string[];
  sourceCandidateId: string;
  axisGroupId: string;
  bucketId: string;
  calibrationDirection: "over" | "under";
  targetOutcomeSide: "yes" | "no";
  suggestedStrategyFamily: string;
  eligibilityRules: {
    volatility: { bucketId: string; minInclusive: number; maxExclusive: number | null };
    probability: { bucketId: string; minInclusive: number; maxExclusive: number };
    timeRemainingMs: { bucketId: string; minInclusive: number; maxExclusive: number };
  };
  probabilityMeasure: { id: string; definition: string; formula: string };
  volatilityDefinition: CalibrationFadeV2VolatilityDefinition;
  marketEligibilityRules: {
    requireValidBook: boolean;
    requireSynchronizedBook: boolean;
    requireOpenMarket: boolean;
    requireBtcJoin: boolean;
  };
  deduplicationPolicy: {
    episodeBreakOnDisqualification: boolean;
    entryRule: string;
    primaryValidationUnit: string;
    suppressRepeatedQualifyingSnapshots: boolean;
  };
  entryPriceMeasures: {
    calibrationLayer: string;
    executableLayer: string;
    diagnosticLayer: string;
  };
  settlementMapping: Record<string, string | number>;
  minimumEvidenceRequirements: {
    minimumIndependentCandidateMarkets: number;
    minimumSettlementCoverageShare: number;
    minimumValidBookShare: number;
    minimumBtcJoinCoverageShare: number;
    materialRejectionCalibrationGap: number;
    materialSupportCalibrationGap: number;
    materialExecutableNetReturnCents: number;
  };
  classificationRules: { precedence: readonly string[] };
};

export type CalibrationFadeV2HistoricalCandidateLineage = {
  role: string;
  observationCount: number;
  uniqueTradingDays: number;
  passes: false;
  robustnessScore: number;
  notes: readonly string[];
};

export type CalibrationFadeV2ProspectiveEvidenceBoundary = {
  kind: typeof V2_PROSPECTIVE_BOUNDARY_KIND;
  freezeCommitSha: string;
  freezeTimestamp: string;
  rule: string;
};

export type CalibrationFadeV2NonConfirmatoryPolicy = {
  preFreezeRuns: "diagnostic-only";
  aug4RunStartIso: string;
  aug4Status: string;
  notes: readonly string[];
};

export type CalibrationFadeV2ProvenanceManifest = {
  schema: typeof CALIBRATION_FADE_V2_PREREGISTRATION_SCHEMA;
  version: typeof CALIBRATION_FADE_V2_PREREGISTRATION_VERSION;
  verificationModel: "reviewed-manifest";
  hypothesisId: string;
  hypothesisVersion: typeof CALIBRATION_FADE_V2_HYPOTHESIS_VERSION;
  sourceCandidateId: string;
  configPath: string;
  descendsFromV1ConfigPath: string;
  originalFreezeCommitSha: string;
  v2FreezeCommitSha: string;
  v2FreezeCommitTimestamp: string;
  conclusion: string;
  intentionalDifferences: readonly {
    id: string;
    summary: string;
    v1Unchanged: boolean;
    notIntegrityCorrectionToV1: boolean;
  }[];
  historicalCandidateLineage: CalibrationFadeV2HistoricalCandidateLineage;
  prospectiveEvidenceBoundary: CalibrationFadeV2ProspectiveEvidenceBoundary;
  nonConfirmatoryPolicy: CalibrationFadeV2NonConfirmatoryPolicy;
  limitations: readonly string[];
};

export type CalibrationFadeV2PreregistrationIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};
