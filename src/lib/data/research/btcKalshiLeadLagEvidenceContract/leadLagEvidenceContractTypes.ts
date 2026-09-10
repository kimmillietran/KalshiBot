import type { LeadLagResponseDirection } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";

export const LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION =
  "m12.8c-prep-btc-kalshi-lead-lag-evidence-contract-v1" as const;

export const LEAD_LAG_EVIDENCE_DESIGN_JSON_ROOT =
  "data/research-results/btc-kalshi-lead-lag/evidence-design" as const;
export const LEAD_LAG_EVIDENCE_DESIGN_HTML_ROOT =
  "data/reports/btc-kalshi-lead-lag/evidence-design" as const;
export const LEAD_LAG_EVIDENCE_DESIGN_JSON_FILENAME =
  "lead-lag-evidence-design.json" as const;
export const LEAD_LAG_EVIDENCE_DESIGN_HTML_FILENAME =
  "lead-lag-evidence-design.html" as const;

export const LEAD_LAG_EVIDENCE_CONTRACT_DISCLAIMER =
  "M12.8c-prep defines a candidate-agnostic scientific evidence contract for BTC/Kalshi lead-lag. "
  + "It does not analyze validation/holdout outcomes, select a winner among M12.8a candidates, "
  + "promote, preregister, freeze, start capture, or place live orders.";

/** Known M12.8a lineage (identity only — not outcome access). */
export const KNOWN_M128A_DISCOVERY_IDENTITY =
  "a4b5fd8a50bd04207f1041846f30a4f7d9f07bf34b03ddf12e293a2278520a24" as const;
export const KNOWN_M128A_SPLIT_MANIFEST_HASH =
  "c0a38fee02c5bcbc9b6dd7d61ec1d5f3ea5397c965842af6e90cb686ab4d43c6" as const;
export const KNOWN_LEAD_LAG_TRAIN_RUN_ID = "2026-09-08T07-46-44-416Z" as const;
export const KNOWN_LEAD_LAG_VALIDATION_RUN_ID = "2026-09-09T06-39-04-259Z" as const;
export const KNOWN_LEAD_LAG_HOLDOUT_RUN_ID = "2026-09-09T20-37-36-719Z" as const;

export const LEAD_LAG_DISCOVERY_HYPOTHESIS_HISTORY_COUNT = 9600 as const;
export const LEAD_LAG_VALIDATION_SHORTLIST_SIZE = 5 as const;

export class LeadLagEvidenceContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadLagEvidenceContractError";
  }
}

/** Primary independent unit for confirmatory inference (never raw quotes / multi-window rows). */
export type LeadLagIndependentUnitDefinition =
  | "market-day-block"
  | "unique-btc-trigger"
  | "independent-market";

export type LeadLagPrimaryEstimandId =
  | "signed-yes-mid-response-cents"
  | "signed-executable-ask-response-cents";

export type LeadLagSecondaryDiagnosticId =
  | "signed-yes-mid-response-cents"
  | "signed-executable-ask-response-cents"
  | "directional-response-share"
  | "spread-change-cents";

export type LeadLagFillModel =
  | "one-contract-tob-observable-only"
  | "not-established";

export type LeadLagStoppingRule =
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

export type LeadLagHoldoutTestingFamily =
  | "single-locked-candidate-after-validation"
  | "validation-shortlist-family"
  | "full-discovery-grid";

export type LeadLagSupportRejectRules = {
  support: string;
  reject: string;
  inconclusive: string;
};

export type LeadLagStatisticalUnitContract = {
  primaryIndependentUnit: LeadLagIndependentUnitDefinition;
  notIndependent: readonly string[];
  dependenceModel: string;
  clusteringRule: string;
  multiMarketSameTriggerPolicy: string;
  effectiveSampleSizeRule: string;
};

export type LeadLagEstimandContract = {
  primaryEstimand: LeadLagPrimaryEstimandId;
  primaryEstimandRationale: string;
  secondaryDiagnostics: readonly LeadLagSecondaryDiagnosticId[];
  midpointDistinctFromExecutablePnl: true;
  executablePnlStatus: "not-yet-faithful-primary" | "established";
  nextRequiredEvidenceForExecutablePnl: string;
};

export type LeadLagExecutionSemantics = {
  fillModel: LeadLagFillModel;
  entryPriceField: "executableBuyYesCents" | "executableSellYesCents";
  exitOrResponsePriceField: "executableBuyYesCents" | "executableSellYesCents" | "yesMidCents";
  spreadCostField: "spreadCents";
  feeAssumption: string;
  sideConsistencyRule: string;
  quoteStalenessBoundMs: number;
  minimumExecutableVisibility: string;
  missingBidAskPolicy: "fail-executable-evidence";
  staleQuotePolicy: "fail-executable-observability";
  assumesFillBeyondTobLiquidity: false;
  liveOrdersImplemented: false;
};

export type LeadLagPowerModelInputs = {
  alpha: number;
  targetPower: number;
  materialEffectCents: number;
  outcomeStandardDeviationCents: number;
  /** Optional cluster-adjusted ESS inputs; required N is still model-derived. */
  rawObservationCount?: number;
  independentMarketCount?: number;
  marketDayCount?: number;
  uniqueBtcTriggerCount?: number;
};

export type LeadLagPowerSensitivityRow = {
  assumptionId: string;
  alpha: number;
  targetPower: number;
  materialEffectCents: number;
  outcomeStandardDeviationCents: number;
  requiredEffectiveN: number | null;
  materialEffectRationale: string;
};

export type LeadLagMaterialEffectPolicy = {
  /** Economic rationale — never TRAIN winner point estimate. */
  selectionForbiddenFromTrainWinnerEstimates: true;
  defaultMaterialEffectCents: number;
  economicRationale: string;
};

export type LeadLagMultiplicityDesign = {
  discoveryHypothesisCount: number;
  validationShortlistSize: number;
  intendedLockedCandidateCount: 1;
  holdoutTestingFamily: LeadLagHoldoutTestingFamily;
  holdoutTestingFamilyRationale: string;
  multiplicityHistoryErasable: false;
  mechanicalCorrectionOverFullDiscoveryGridRequired: false;
  mechanicalCorrectionNote: string;
};

export type LeadLagHoldoutEvidenceContract = {
  contractVersion: typeof LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION;
  /** Bound only after M12.8b lock; null while candidate-agnostic. */
  candidateDefinitionHash: string | null;
  discoveryIdentity: string;
  validationIdentity: string | null;
  splitManifestHash: string;
  holdoutRunId: typeof KNOWN_LEAD_LAG_HOLDOUT_RUN_ID;
  primaryEstimand: LeadLagPrimaryEstimandId;
  direction: LeadLagResponseDirection | null;
  materialEffectThresholdCents: number;
  alpha: number;
  targetPower: number;
  independentUnitDefinition: LeadLagIndependentUnitDefinition;
  clusteringRule: string;
  minimumEvidenceRequirement: {
    kind: "model-derived-effective-n";
    requiredEffectiveN: number | null;
    powerModelAssumptionId: string;
  };
  executionObservabilityRequirement: string;
  supportRejectInconclusive: LeadLagSupportRejectRules;
  multiplicity: LeadLagMultiplicityDesign;
  requiresExactValidationLockMatch: true;
};

export type LeadLagProspectiveEvidenceContract = {
  contractVersion: typeof LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION;
  featureDefinition: string;
  causalBtcJoinSemantics: string;
  signalHorizonMs: number | null;
  kalshiResponseHorizonMs: number | null;
  candidateDirection: LeadLagResponseDirection | null;
  entryEligibility: string;
  executionDefinition: LeadLagExecutionSemantics;
  effectThresholdCents: number;
  alpha: number;
  targetPower: number;
  requiredEvidence: {
    kind: "model-derived-effective-n";
    requiredEffectiveN: number | null;
  };
  stoppingRule: LeadLagStoppingRule | null;
  supportRejectInconclusive: LeadLagSupportRejectRules;
  captureQualityRequirements: readonly string[];
  candidateSpecificParametersBound: false;
};

export type LeadLagPromotionIntegrationStatus =
  | "schema-ready-awaiting-holdout-and-lock"
  | "not-eligible"
  | "accepted";

export type LeadLagEvidenceDesignReport = {
  analysisVersion: typeof LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION;
  disclaimer: typeof LEAD_LAG_EVIDENCE_CONTRACT_DISCLAIMER;
  generatedAt: string;
  designIdentityHash: string;
  discoveryIdentity: string;
  splitManifestHash: string;
  discoveryIsolationStatus: "train-only-discovery";
  statisticalUnit: LeadLagStatisticalUnitContract;
  dependenceModel: string;
  primaryEstimand: LeadLagEstimandContract;
  secondaryDiagnostics: readonly LeadLagSecondaryDiagnosticId[];
  executionSemantics: LeadLagExecutionSemantics;
  powerModel: {
    reusedStack: "powerAnalysis.computeRequiredSampleSize";
    essStack: "oosPowerCorrection.computeEffectiveSampleSizeEstimate";
    materialEffectPolicy: LeadLagMaterialEffectPolicy;
    defaultInputs: LeadLagPowerModelInputs;
  };
  powerSensitivity: readonly LeadLagPowerSensitivityRow[];
  allowedStoppingRules: readonly LeadLagStoppingRule["kind"][];
  stoppingRuleValidationPolicy: "fail-closed-if-missing-or-optional-without-sequential-design";
  holdoutContractRequirements: LeadLagHoldoutEvidenceContract;
  prospectiveContractRequirements: LeadLagProspectiveEvidenceContract;
  multiplicityDesign: LeadLagMultiplicityDesign;
  promotionIntegrationStatus: LeadLagPromotionIntegrationStatus;
  promotionIntegrationNotes: readonly string[];
  validationOutcomeAccessed: false;
  holdoutOutcomeAccessed: false;
  candidateWinnerSelected: false;
  promotionCreated: false;
  preregistrationCreated: false;
  freezeCreated: false;
  captureStarted: false;
  liveTradingImplemented: false;
  outputPath: string;
  htmlOutputPath: string;
};

export type LeadLagEvidenceContractConfig = {
  discoveryIdentity: string;
  splitManifestHash: string;
  /** Optional binding for instantiation tests only — does not select a winner. */
  candidateDefinitionHash: string | null;
  validationIdentity: string | null;
  direction: LeadLagResponseDirection | null;
  signalHorizonMs: number | null;
  kalshiResponseHorizonMs: number | null;
  alpha: number;
  targetPower: number;
  materialEffectCents: number;
  outcomeStandardDeviationCents: number;
  stoppingRule: LeadLagStoppingRule | null;
  outputPath: string | null;
  htmlOutputPath: string | null;
};

export type LeadLagEvidenceContractIo = {
  fileExists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};
