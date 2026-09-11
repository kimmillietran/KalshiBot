/**
 * M14.0b — Governed TRAIN-only Kalshi TOB midpoint momentum discovery.
 * May shortlist ≤3. Must not validate, lock, promote, freeze, capture, or trade.
 */

export const MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION =
  "kalshi-tob-momentum-train-discovery-v1" as const;

export const MOMENTUM_DISCOVERY_RESEARCH_SPLIT_VERSION =
  "momentum-discovery-research-split-v1" as const;

export const MOMENTUM_DISCOVERY_DISCLAIMER =
  "M14.0b runs TRAIN-only discovery across the sealed M14.0a 12-cell universe. "
  + "VALIDATION and HOLDOUT momentum outcomes are IO-quarantined. "
  + "This milestone may shortlist ≤3 candidates but must not validate, lock a holdout "
  + "candidate, promote, preregister, freeze, start capture, or place live orders.";

export const DEFAULT_MOMENTUM_DISCOVERY_JSON_ROOT =
  "data/research-results/momentum/discovery" as const;
export const DEFAULT_MOMENTUM_DISCOVERY_HTML_ROOT =
  "data/reports/momentum/discovery" as const;

export const MOMENTUM_DISCOVERY_JSON_FILENAME =
  "kalshi-tob-momentum-governed-discovery.json" as const;
export const MOMENTUM_DISCOVERY_HTML_FILENAME =
  "kalshi-tob-momentum-governed-discovery.html" as const;
export const MOMENTUM_DISCOVERY_SPLIT_FILENAME =
  "momentum-research-split.json" as const;
export const MOMENTUM_DISCOVERY_CELLS_FILENAME =
  "kalshi-tob-momentum-discovery-cells.jsonl" as const;

/** Bound before TRAIN outcome access — M14.0b-prep defaults made explicit. */
export const BOUND_MATERIAL_EFFECT_CENTS = 2 as const;
export const BOUND_ALPHA = 0.05 as const;
export const BOUND_TARGET_POWER = 0.8 as const;
export const BOUND_OUTCOME_SD_CENTS = 10 as const;

export const DEFAULT_MOMENTUM_TRAIN_RUN_ID = "2026-09-08T07-46-44-416Z" as const;
export const DEFAULT_MOMENTUM_VALIDATION_RUN_ID = "2026-09-09T06-39-04-259Z" as const;
export const DEFAULT_MOMENTUM_HOLDOUT_RUN_ID = "2026-09-09T20-37-36-719Z" as const;
export const DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT =
  "data/live-capture/forward-quotes" as const;

export class MomentumGovernedDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentumGovernedDiscoveryError";
  }
}

export type MomentumSplitRole = "train" | "validation" | "holdout";

export type MomentumDiscoveryContaminationClassification =
  | "untouched-for-short-horizon-price-response"
  | "field-only-inspected"
  | "outcome-consumed-unrelated-external-predictor"
  | "outcome-consumed-related-tob-price-response"
  | "contaminated-train-only"
  | "ineligible-validation"
  | "ineligible-holdout"
  | "not-established";

export type MomentumCaptureArtifactIdentity = {
  runId: string;
  captureRunDir: string;
  role: MomentumSplitRole;
  exploratoryRole: "exploratory-design-data-not-confirmatory";
  confirmatoryReuseForbidden: true;
  contaminationClassification: MomentumDiscoveryContaminationClassification;
  contaminationEvidence: readonly string[];
  eligibleForRole: boolean;
  quarantinedForOutcomeScoring: boolean;
  captureHealthContentHash: string | null;
  durationHours: number | null;
  topOfBookByteLength: number | null;
  topOfBookIdentityHash: string | null;
  identityHash: string;
  nativeCaptureVerdict: string | null;
};

export type MomentumResearchSplitManifest = {
  splitVersion: typeof MOMENTUM_DISCOVERY_RESEARCH_SPLIT_VERSION;
  createdForAnalysisVersion: typeof MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION;
  confirmatoryReuseForbidden: true;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  train: MomentumCaptureArtifactIdentity;
  validation: MomentumCaptureArtifactIdentity;
  holdout: MomentumCaptureArtifactIdentity;
  splitManifestHash: string;
  warnings: readonly string[];
};

export type MomentumDiscoveryIo = {
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  appendFile?: (path: string, data: string) => void;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  unlinkFile?: (path: string) => void;
  renameFile?: (from: string, to: string) => void;
  fileByteLength?: (path: string) => number;
  listDirectory?: (path: string) => string[];
  iterateJsonl: (
    path: string,
    options: {
      onLine: (line: string, meta: { lineNumber: number }) => "continue" | "stop" | void;
    },
  ) => Promise<void>;
};

export type MomentumDiscoveryStatus =
  | "train-shortlist-produced"
  | "no-candidates-eligible"
  | "invalid-evidence"
  | "insufficient-train-evidence";

export type MomentumDiscoveryCandidateResult = {
  candidateId: string;
  hypothesisId: string;
  lookbackWindowMs: number;
  thresholdCents: number;
  responseHorizonMs: number;
  direction: "continuation";
  structuralSimplicityRank: number;
  rawEvents: number;
  refractoryEpisodes: number;
  observableResponses: number;
  executableObservableResponses: number;
  independentMarkets: number;
  independentMarketDays: number;
  effectiveSampleSize: number;
  signedExecutableMeanCents: number | null;
  signedExecutableMedianCents: number | null;
  signedMidpointMeanCents: number | null;
  signedMidpointMedianCents: number | null;
  directionalResponseShare: number | null;
  executableObservabilityShare: number | null;
  directionConsistentWithFamily: boolean;
  executableEffectAvailable: boolean;
  shortlistEligible: boolean;
  rejectionReasons: readonly string[];
  rankingKey: string | null;
  shortlisted: boolean;
  shortlistRank: number | null;
};

export type MomentumTrainCaptureMetrics = {
  trainRunId: string;
  durationHours: number | null;
  tobRecordsScanned: number;
  validBookQuotes: number;
  economicallyValidQuotes: number;
  anchorResolvableQuotes: number;
  firstCrossingEventsTotal: number;
  refractoryEpisodesTotal: number;
  marketsTouched: number;
  marketDaysTouched: number;
  responseObservabilityByHorizonMs: Record<string, {
    observable: number;
    unobservable: number;
  }>;
  executableObservabilityShareOverall: number | null;
};

export type MomentumGovernedDiscoveryReport = {
  analysisVersion: typeof MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION;
  disclaimer: typeof MOMENTUM_DISCOVERY_DISCLAIMER;
  generatedAt: string;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  splitManifestIdentity: string;
  discoveryIdentity: string;
  discoveryIsolationStatus: "train-only-discovery";
  trainRunId: string;
  trainCaptureRunDir: string;
  powerDesign: {
    materialEffectThresholdCents: number;
    alpha: number;
    targetPower: number;
    outcomeStandardDeviationCents: number;
    requiredEffectiveN: number;
    requiredEffectiveNSource: "powerAnalysis.computeRequiredSampleSize";
    stoppingRule: {
      kind: "fixed-n";
      minimumEffectiveSampleSize: number;
      interpretationIfNotReached: "inconclusive-underpowered";
    };
  };
  directionConsistencyAdapter: {
    rule: "median-signed-gross-executable-pnl-cents-strictly-greater-than-zero";
    boundBeforeTrainOutcomeAccess: true;
    zeroIsNotConsistent: true;
    meanCannotReplaceMedian: true;
  };
  structuralSimplicityOrdering: {
    rule: string;
    boundBeforeTrainOutcomeAccess: true;
  };
  searchUniverse: {
    hypothesisCount: 12;
    directionCount: 1;
    hypotheses: readonly string[];
  };
  captureHealthSummary: {
    nativeCaptureVerdict: string | null;
    durationHours: number | null;
    topOfBookByteLength: number | null;
  };
  trainCaptureMetrics: MomentumTrainCaptureMetrics;
  contaminationAudit: {
    train: MomentumDiscoveryContaminationClassification;
    validation: MomentumDiscoveryContaminationClassification;
    holdout: MomentumDiscoveryContaminationClassification;
    evidence: {
      train: readonly string[];
      validation: readonly string[];
      holdout: readonly string[];
    };
  };
  perCandidateResults: readonly MomentumDiscoveryCandidateResult[];
  shortlist: readonly MomentumDiscoveryCandidateResult[];
  discoveryStatus: MomentumDiscoveryStatus;
  recommendedNextAction:
    | "stop-no-validation"
    | "train-shortlist-produced-halt-no-validation-access"
    | "collect-more-train-incidence"
    | "invalid-evidence-fail-closed";
  quarantine: {
    validationOutcomesRead: false;
    holdoutOutcomesRead: false;
    validationAccess: false;
    holdoutAccess: false;
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    freezeCreated: false;
    captureStarted: false;
    liveOrdersExecuted: false;
    gridMutated: false;
    directionFlipped: false;
  };
  outputPaths: {
    outputPath: string;
    htmlOutputPath: string;
    splitManifestPath: string;
    cellsOutputPath: string;
  };
};
