export const MICROSTRUCTURE_EVIDENCE_CONTRACT_ANALYSIS_VERSION =
  "m13.0b-prep-microstructure-evidence-contract-v1" as const;

export const MICROSTRUCTURE_EVIDENCE_DESIGN_JSON_ROOT =
  "data/research-results/spread-liquidity-microstructure/evidence-design" as const;
export const MICROSTRUCTURE_EVIDENCE_DESIGN_HTML_ROOT =
  "data/reports/spread-liquidity-microstructure/evidence-design" as const;
export const MICROSTRUCTURE_EVIDENCE_DESIGN_JSON_FILENAME =
  "microstructure-evidence-design.json" as const;
export const MICROSTRUCTURE_EVIDENCE_DESIGN_HTML_FILENAME =
  "microstructure-evidence-design.html" as const;

export const MICROSTRUCTURE_EVIDENCE_CONTRACT_DISCLAIMER =
  "M13.0b-prep defines a candidate-agnostic evidence/validation/holdout/power contract for the "
  + "TOB imbalance microstructure family. It does not run TRAIN discovery, read historical "
  + "microstructure outcomes, select winners, promote, preregister, freeze, start capture, or place orders.";

export const EXPECTED_MICROSTRUCTURE_FAMILY_ID = "spread-liquidity-microstructure" as const;
export const EXPECTED_MICROSTRUCTURE_SUBFAMILY_ID =
  "tob-size-imbalance-short-horizon-repricing-v1" as const;

/** Expected M13.0a structural universe size (identity authority remains M13.0a). */
export const EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT = 12 as const;
export const MICROSTRUCTURE_MAX_SHORTLIST_K = 3 as const;

export const MICROSTRUCTURE_DEFAULT_ALPHA = 0.05 as const;
export const MICROSTRUCTURE_DEFAULT_TARGET_POWER = 0.8 as const;

/**
 * Methodology recommendation only — NOT auto-bound from TRAIN performance.
 * 2¢ aligns with tick/half-spread style economic buffer used elsewhere in repo research.
 * Contract fails closed if materialEffectThresholdCents is not explicitly supplied.
 */
export const MICROSTRUCTURE_RECOMMENDED_MATERIAL_EFFECT_CENTS = 2 as const;
export const MICROSTRUCTURE_DEFAULT_OUTCOME_SD_CENTS = 10 as const;

export const MICROSTRUCTURE_REFRACTORY_FLOOR_MS = 2_000 as const;

export class MicrostructureEvidenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrostructureEvidenceContractError";
  }
}

export type MicrostructureIndependentUnitDefinition =
  "at-most-one-qualifying-episode-per-market-day-per-cell";

export type MicrostructurePrimaryEstimandId =
  "signed-one-contract-executable-horizon-response-cents";

export type MicrostructureDiagnosticEstimandId =
  | "signed-yes-mid-response-cents"
  | "directional-response-share"
  | "spread-change-cents";

export type MicrostructureValidationStatus =
  | "validated"
  | "validation-failed"
  | "underpowered-for-validation"
  | "insufficient-validation-incidence"
  | "invalid-evidence";

export type MicrostructureHoldoutVerdict =
  | "support"
  | "reject"
  | "underpowered"
  | "insufficient-incidence"
  | "invalid-evidence";

export type MicrostructureStoppingRule =
  | {
      kind: "fixed-n";
      minimumEffectiveSampleSize: number;
      interpretationIfNotReached: "inconclusive-underpowered";
    }
  | {
      kind: "fixed-capture-horizon";
      captureHorizonHours: number;
      interpretationIfNotReached: "inconclusive-underpowered";
    }
  | {
      kind: "explicit-sequential";
      ruleId: string;
      description: string;
      sequentialDesignImplemented: true;
    };

export type MicrostructureStructuralCellAxes = {
  imbalanceThreshold: number;
  responseHorizonMs: number;
  timeRemainingBin: string;
  direction: "same-direction";
};

export type MicrostructureCandidateDefinition = MicrostructureStructuralCellAxes & {
  candidateId: string;
  hypothesisId: string;
  discoveryRank: number | null;
};

export type MicrostructureEvidenceContractConfig = {
  /** Injected later from M13.0a; null while unbound. */
  familyDefinitionIdentity: string | null;
  /** Explicit; missing fails closed for validation/holdout authorization. */
  materialEffectThresholdCents: number | null;
  alpha: number;
  targetPower: number;
  outcomeStandardDeviationCents: number;
  maxShortlistK: number;
  expectedDiscoveryHypothesisCount: number;
  stoppingRule: MicrostructureStoppingRule | null;
  outputPath: string | null;
  htmlOutputPath: string | null;
};

export type MicrostructureEvidenceDesignReport = {
  analysisVersion: typeof MICROSTRUCTURE_EVIDENCE_CONTRACT_ANALYSIS_VERSION;
  disclaimer: typeof MICROSTRUCTURE_EVIDENCE_CONTRACT_DISCLAIMER;
  generatedAt: string;
  contractIdentityHash: string;
  expectedFamilyId: typeof EXPECTED_MICROSTRUCTURE_FAMILY_ID;
  expectedSubfamilyId: typeof EXPECTED_MICROSTRUCTURE_SUBFAMILY_ID;
  familyDefinitionIdentity: string | null;
  statisticalUnit: ReturnType<typeof import("./statisticalUnit").buildMicrostructureStatisticalUnitContract>;
  episodeSemantics: ReturnType<typeof import("./episodeSemantics").buildMicrostructureEpisodeSemantics>;
  estimands: ReturnType<typeof import("./estimandsAndExecution").buildMicrostructureEstimandContract>;
  executionSemantics: ReturnType<typeof import("./estimandsAndExecution").buildMicrostructureExecutionSemantics>;
  shortlistPolicy: ReturnType<typeof import("./shortlistPolicy").buildMicrostructureShortlistPolicy>;
  validationSemantics: ReturnType<typeof import("./validationSemantics").buildMicrostructureValidationSemantics>;
  lockAndTieBreak: ReturnType<typeof import("./lockAndTieBreak").buildMicrostructureLockPolicy>;
  holdoutSemantics: ReturnType<typeof import("./holdoutSemantics").buildMicrostructureHoldoutSemantics>;
  multiplicityDesign: ReturnType<typeof import("./multiplicityDesign").buildMicrostructureMultiplicityDesign>;
  powerMethodology: ReturnType<typeof import("./powerAndStopping").buildMicrostructurePowerMethodology>;
  stoppingRulePolicy: string;
  captureQualityRequirements: readonly string[];
  explicitExclusions: readonly string[];
  m13aIntegrationBoundary: string;
  reusableGovernanceStack: readonly string[];
  microstructureSpecificAdapters: readonly string[];
  materialEffectDecisionStatus: {
    bound: boolean;
    materialEffectThresholdCents: number | null;
    recommendedCents: number;
    recommendationRationale: string;
    failsClosedIfMissing: true;
  };
  quarantine: {
    realHistoricalMicrostructureOutcomesRead: false;
    candidateSelected: false;
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    freezeCreated: false;
    captureStarted: false;
    liveOrdersExecuted: false;
  };
  outputPath: string;
  htmlOutputPath: string;
};
