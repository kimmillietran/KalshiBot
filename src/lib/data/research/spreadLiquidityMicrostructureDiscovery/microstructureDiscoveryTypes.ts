/**
 * M13.0b — Governed TRAIN-only TOB imbalance microstructure discovery.
 * May shortlist ≤3. Must not validate, lock, promote, freeze, capture, or trade.
 */

export const MICROSTRUCTURE_GOVERNED_DISCOVERY_ANALYSIS_VERSION =
  "spread-liquidity-microstructure-governed-discovery-v1" as const;

export const MICROSTRUCTURE_RESEARCH_SPLIT_VERSION =
  "microstructure-research-split-v1" as const;

export const MICROSTRUCTURE_DISCOVERY_DISCLAIMER =
  "M13.0b runs TRAIN-only discovery across the sealed M13.0a 12-cell universe. "
  + "VALIDATION and HOLDOUT microstructure outcomes are IO-quarantined. "
  + "This milestone may shortlist ≤3 candidates but must not validate, lock a holdout "
  + "candidate, promote, preregister, freeze, start capture, or place live orders.";

export const DEFAULT_MICROSTRUCTURE_DISCOVERY_JSON_ROOT =
  "data/research-results/spread-liquidity-microstructure/discovery" as const;
export const DEFAULT_MICROSTRUCTURE_DISCOVERY_HTML_ROOT =
  "data/reports/spread-liquidity-microstructure/discovery" as const;

export const MICROSTRUCTURE_DISCOVERY_JSON_FILENAME =
  "tob-imbalance-governed-discovery.json" as const;
export const MICROSTRUCTURE_DISCOVERY_HTML_FILENAME =
  "tob-imbalance-governed-discovery.html" as const;
export const MICROSTRUCTURE_DISCOVERY_SPLIT_FILENAME =
  "microstructure-research-split.json" as const;
export const MICROSTRUCTURE_DISCOVERY_CELLS_FILENAME =
  "tob-imbalance-discovery-cells.jsonl" as const;

/** Bound before TRAIN outcome access — M13.0b-prep defaults made explicit. */
export const BOUND_MATERIAL_EFFECT_CENTS = 2 as const;
export const BOUND_ALPHA = 0.05 as const;
export const BOUND_TARGET_POWER = 0.8 as const;
export const BOUND_OUTCOME_SD_CENTS = 10 as const;

export const DEFAULT_MICROSTRUCTURE_TRAIN_RUN_ID = "2026-09-08T07-46-44-416Z" as const;
export const DEFAULT_MICROSTRUCTURE_VALIDATION_RUN_ID = "2026-09-09T06-39-04-259Z" as const;
export const DEFAULT_MICROSTRUCTURE_HOLDOUT_RUN_ID = "2026-09-09T20-37-36-719Z" as const;
export const DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT =
  "data/live-capture/forward-quotes" as const;

export class MicrostructureGovernedDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrostructureGovernedDiscoveryError";
  }
}

export type MicrostructureSplitRole = "train" | "validation" | "holdout";

export type MicrostructureContaminationClassification =
  | "clean-for-microstructure-discovery-role"
  | "previously-inspected"
  | "not-established";

export type MicrostructureCaptureArtifactIdentity = {
  runId: string;
  captureRunDir: string;
  role: MicrostructureSplitRole;
  exploratoryRole: "exploratory-design-data-not-confirmatory";
  confirmatoryReuseForbidden: true;
  contaminationClassification: MicrostructureContaminationClassification;
  contaminationEvidence: readonly string[];
  captureHealthContentHash: string | null;
  durationHours: number | null;
  topOfBookByteLength: number | null;
  topOfBookIdentityHash: string | null;
  identityHash: string;
  nativeCaptureVerdict: string | null;
};

export type MicrostructureResearchSplitManifest = {
  splitVersion: typeof MICROSTRUCTURE_RESEARCH_SPLIT_VERSION;
  createdForAnalysisVersion: typeof MICROSTRUCTURE_GOVERNED_DISCOVERY_ANALYSIS_VERSION;
  confirmatoryReuseForbidden: true;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  train: MicrostructureCaptureArtifactIdentity;
  validation: MicrostructureCaptureArtifactIdentity;
  holdout: MicrostructureCaptureArtifactIdentity;
  splitManifestHash: string;
  warnings: readonly string[];
};

export type MicrostructureDiscoveryIo = {
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

export type MicrostructureDiscoveryStatus =
  | "candidates-shortlisted"
  | "no-candidates-eligible"
  | "insufficient-discovery-incidence"
  | "invalid-evidence";

export type MicrostructureDiscoveryCandidateResult = {
  candidateId: string;
  hypothesisId: string;
  imbalanceThresholdAbs: number;
  responseHorizonMs: number;
  timeRemainingBin: string;
  direction: "same-direction";
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

export type MicrostructureTrainCaptureMetrics = {
  trainRunId: string;
  durationHours: number | null;
  tobRecordsScanned: number;
  validBookQuotes: number;
  economicallyValidQuotes: number;
  bidSizeAvailableQuotes: number;
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

export type MicrostructureGovernedDiscoveryReport = {
  analysisVersion: typeof MICROSTRUCTURE_GOVERNED_DISCOVERY_ANALYSIS_VERSION;
  disclaimer: typeof MICROSTRUCTURE_DISCOVERY_DISCLAIMER;
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
    rule: "median-signed-primary-executable-response-cents-strictly-greater-than-zero";
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
  trainCaptureMetrics: MicrostructureTrainCaptureMetrics;
  contaminationAudit: {
    train: MicrostructureContaminationClassification;
    validation: MicrostructureContaminationClassification;
    holdout: MicrostructureContaminationClassification;
    evidence: {
      train: readonly string[];
      validation: readonly string[];
      holdout: readonly string[];
    };
  };
  perCandidateResults: readonly MicrostructureDiscoveryCandidateResult[];
  shortlist: readonly MicrostructureDiscoveryCandidateResult[];
  discoveryStatus: MicrostructureDiscoveryStatus;
  recommendedNextAction:
    | "proceed-to-validation"
    | "no-candidates-eligible"
    | "collect-more-train-incidence"
    | "invalid-evidence-fail-closed";
  quarantine: {
    validationOutcomesRead: false;
    holdoutOutcomesRead: false;
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
