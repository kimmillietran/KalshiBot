/**
 * M14.0b-prep — candidate-agnostic momentum evidence + data-isolation contract.
 * Design-only: no historical momentum outcome reads.
 */

export const MOMENTUM_EVIDENCE_CONTRACT_ANALYSIS_VERSION =
  "momentum-evidence-contract-v1" as const;

export const MOMENTUM_RESEARCH_SPLIT_VERSION = "momentum-research-split-v1" as const;

export const MOMENTUM_EVIDENCE_DESIGN_JSON_ROOT =
  "data/research-results/momentum/evidence-design" as const;
export const MOMENTUM_EVIDENCE_DESIGN_HTML_ROOT =
  "data/reports/momentum/evidence-design" as const;
export const MOMENTUM_EVIDENCE_DESIGN_JSON_FILENAME =
  "momentum-evidence-design.json" as const;
export const MOMENTUM_EVIDENCE_DESIGN_HTML_FILENAME =
  "momentum-evidence-design.html" as const;

export const MOMENTUM_EVIDENCE_CONTRACT_DISCLAIMER =
  "M14.0b-prep defines a candidate-agnostic evidence/validation/holdout/power/fee/"
  + "data-isolation contract for the governed momentum family. It does not run TRAIN "
  + "discovery, read historical momentum outcomes/returns/P&L, select winners, promote, "
  + "preregister, freeze, start capture, or place orders.";

export const EXPECTED_MOMENTUM_FAMILY_ID = "momentum" as const;
export const EXPECTED_MOMENTUM_SUBFAMILY_ID =
  "kalshi-tob-mid-return-threshold-continuation-v1" as const;

export const EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT = 12 as const;
export const MOMENTUM_MAX_SHORTLIST_K = 3 as const;
export const MOMENTUM_DIRECTION = "continuation" as const;

/** Expected structural axes (identity authority remains M14.0a). */
export const EXPECTED_MOMENTUM_LOOKBACK_WINDOWS_MS = [5_000, 15_000] as const;
export const EXPECTED_MOMENTUM_THRESHOLDS_CENTS = [2, 3] as const;
export const EXPECTED_MOMENTUM_RESPONSE_HORIZONS_MS = [5_000, 15_000, 30_000] as const;

export const MOMENTUM_DEFAULT_ALPHA = 0.05 as const;
export const MOMENTUM_DEFAULT_TARGET_POWER = 0.8 as const;
export const MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS = 2 as const;
export const MOMENTUM_DEFAULT_OUTCOME_SD_CENTS = 10 as const;

/** Prior research-role run IDs (metadata lineage only — not pristine momentum evidence). */
export const PRIOR_LEAD_LAG_TRAIN_RUN_ID = "2026-09-08T07-46-44-416Z" as const;
export const PRIOR_LEAD_LAG_VALIDATION_RUN_ID = "2026-09-09T06-39-04-259Z" as const;
export const PRIOR_LEAD_LAG_HOLDOUT_RUN_ID = "2026-09-09T20-37-36-719Z" as const;
/** Same physical TRAIN capture was also M13.0b microstructure TRAIN. */
export const PRIOR_MICROSTRUCTURE_TRAIN_RUN_ID = PRIOR_LEAD_LAG_TRAIN_RUN_ID;

export const DEFAULT_FORWARD_QUOTES_CAPTURE_ROOT =
  "data/live-capture/forward-quotes" as const;

export class MomentumEvidenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentumEvidenceContractError";
  }
}

export type MomentumIndependentUnitDefinition =
  "at-most-one-qualifying-episode-per-market-day-per-cell";

export type MomentumPrimaryEstimandId =
  "signed-one-contract-executable-horizon-pnl-cents-gross";

export type MomentumDiagnosticEstimandId =
  "signed-midpoint-continuation-cents";

export type MomentumFeeContractStatus =
  | "unbound"
  | "schedule-identified-but-unbound-for-family";

export type MomentumValidationStatus =
  | "validated"
  | "validation-failed"
  | "underpowered-for-validation"
  | "insufficient-validation-incidence"
  | "invalid-evidence";

export type MomentumHoldoutVerdict =
  | "support"
  | "reject"
  | "underpowered"
  | "insufficient-incidence"
  | "invalid-evidence";

export type MomentumStoppingRule =
  | {
      kind: "fixed-n";
      minimumEffectiveSampleSize: number;
      interpretationIfNotReached: "inconclusive-underpowered";
    }
  | {
      kind: "fixed-capture-horizon";
      captureHorizonHours: number;
      interpretationIfNotReached: "inconclusive-underpowered";
    };

export type MomentumContaminationClassification =
  | "untouched-for-short-horizon-price-response"
  | "field-only-inspected"
  | "outcome-consumed-unrelated-external-predictor"
  | "outcome-consumed-related-tob-price-response"
  | "contaminated-train-only"
  | "ineligible-validation"
  | "ineligible-holdout"
  | "not-established";

export type MomentumSplitRole = "train" | "validation" | "holdout";

export type MomentumStructuralCellAxes = {
  lookbackWindowMs: number;
  thresholdCents: number;
  responseHorizonMs: number;
  direction: typeof MOMENTUM_DIRECTION;
};

export type MomentumCandidateDefinition = MomentumStructuralCellAxes & {
  candidateId: string;
  hypothesisId: string;
  discoveryRank: number | null;
};

export type MomentumEvidenceContractConfig = {
  /** Injected from M14.0a; null while unbound — real outcome access requires exact identity. */
  familyDefinitionIdentity: string | null;
  materialEffectThresholdCents: number | null;
  alpha: number;
  targetPower: number;
  outcomeStandardDeviationCents: number;
  maxShortlistK: number;
  expectedDiscoveryHypothesisCount: number;
  stoppingRule: MomentumStoppingRule | null;
  outputPath: string | null;
  htmlOutputPath: string | null;
};

export type MomentumEvidenceDesignReport = {
  analysisVersion: typeof MOMENTUM_EVIDENCE_CONTRACT_ANALYSIS_VERSION;
  disclaimer: typeof MOMENTUM_EVIDENCE_CONTRACT_DISCLAIMER;
  generatedAt: string;
  contractIdentityHash: string;
  expectedFamilyId: typeof EXPECTED_MOMENTUM_FAMILY_ID;
  expectedSubfamilyId: typeof EXPECTED_MOMENTUM_SUBFAMILY_ID;
  familyDefinitionIdentity: string | null;
  familyBindingStatus: "unbound" | "bound";
  realOutcomeAccessAuthorized: false;
  statisticalUnit: ReturnType<typeof import("./statisticalUnit").buildMomentumStatisticalUnitContract>;
  estimands: ReturnType<typeof import("./estimandsAndFee").buildMomentumEstimandContract>;
  feeContract: ReturnType<typeof import("./estimandsAndFee").auditMomentumFeeContract>;
  directionConsistency: ReturnType<typeof import("./directionConsistency").buildMomentumDirectionConsistencyRule>;
  shortlistPolicy: ReturnType<typeof import("./shortlistPolicy").buildMomentumShortlistPolicy>;
  validationSemantics: ReturnType<typeof import("./validationSemantics").buildMomentumValidationSemantics>;
  lockAndTieBreak: ReturnType<typeof import("./lockAndTieBreak").buildMomentumLockPolicy>;
  holdoutSemantics: ReturnType<typeof import("./holdoutSemantics").buildMomentumHoldoutSemantics>;
  multiplicityDesign: ReturnType<typeof import("./multiplicityDesign").buildMomentumMultiplicityDesign>;
  powerMethodology: ReturnType<typeof import("./powerAndStopping").buildMomentumPowerMethodology>;
  stoppingRulePolicy: string;
  captureQualityRequirements: readonly string[];
  dataIsolationPolicy: ReturnType<typeof import("./dataIsolation").buildMomentumDataIsolationPolicy>;
  captureInventory: ReturnType<typeof import("./dataIsolation").buildMetadataOnlyMomentumCaptureInventory>;
  splitRequirements: ReturnType<typeof import("./dataIsolation").buildMomentumSplitRequirements>;
  materialEffectDecisionStatus: {
    bound: boolean;
    materialEffectThresholdCents: number | null;
    recommendedCents: number;
    recommendationRationale: string;
    failsClosedIfMissing: true;
  };
  m14aIntegrationBoundary: string;
  reusableGovernanceStack: readonly string[];
  quarantine: {
    realHistoricalMomentumOutcomesRead: false;
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
