/**
 * M16-ER — external historical CryptoStruct replication of the M16 reversal family.
 * Independent of prospective M16-P (KalshiBot source). No economic outcomes here.
 */

import { createHash } from "node:crypto";

import { computeRequiredSampleSize } from "@/lib/data/research/powerAnalysis/powerAnalysisMath";
import {
  buildCryptostructCandidateUniverse,
  CRYPTOSTRUCT_CATALOG_FREEZE,
  CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
} from "@/lib/data/research/cryptostructDatasetGovernance";
import { M16_CR2_INFERENCE_METHOD } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Cr2ClusterMean";
import {
  designEffect,
  M16_PLANNING_WITHIN_UTC_DAY_ICC,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16DependencePlan";
import {
  M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY,
  M16_FAMILY_DEFINITION_IDENTITY,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16PriorContractIdentities";
import { stableStringify } from "@/lib/trading/config/hashConfig";

/** Selected CryptoStruct adapter from source-equivalence audit. */
export const M16_ER_ADAPTER_ID = "RAW-BBO-CHANGE" as const;
export const M16_ER_ADAPTER_IDENTITY =
  "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d" as const;

export const M16_ER_SOURCE_EQUIVALENCE_VERDICT = "PASS WITH CAVEATS" as const;
export const M16_ER_ROLE = "m16-external-historical-replication" as const;
export const M16_P_ROLE = "m16-prospective-kalshibot-source" as const;

export const M16_ER_PROTOCOL_VERSION =
  "kalshi-kxbtc15m-m16-er-external-historical-replication-v1" as const;

/** Blind incidence from QUALITY_AUDIT_ONLY source-equivalence (no P&L). */
export const M16_ER_BLIND_INCIDENCE_PER_4H_DAY = [
  10, 14, 13, 12, 12,
] as const;

export const M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY =
  M16_ER_BLIND_INCIDENCE_PER_4H_DAY.reduce((a, b) => a + b, 0) /
  M16_ER_BLIND_INCIDENCE_PER_4H_DAY.length;

export const M16_ER_IID_BASELINE_TRADE_N =
  computeRequiredSampleSize({
    edgeCents: 5,
    standardDeviation: 25,
    alpha: 0.05,
    targetPower: 0.8,
  }) ?? 155;

export function computeM16ErClusteredPlanningTradeN(input?: {
  iidBaselineTradeN?: number;
  rho?: number;
  avgClusterSize?: number;
}): number {
  const iid = input?.iidBaselineTradeN ?? M16_ER_IID_BASELINE_TRADE_N;
  const rho = input?.rho ?? M16_PLANNING_WITHIN_UTC_DAY_ICC;
  const m = input?.avgClusterSize ?? M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY;
  return Math.ceil(iid * designEffect(rho, m));
}

/**
 * Cluster floor: max(prospective small-cluster floor 24, ceil(N/m)).
 * With m≈12.2 and N≈329 → ceil(329/12.2)=27.
 */
export function computeM16ErMinUtcDayClusters(input?: {
  requiredTradeN?: number;
  avgClusterSize?: number;
  smallClusterFloor?: number;
}): number {
  const n = input?.requiredTradeN ?? computeM16ErClusteredPlanningTradeN();
  const m = input?.avgClusterSize ?? M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY;
  const floor = input?.smallClusterFloor ?? 24;
  return Math.max(floor, Math.ceil(n / m));
}

export const M16_ER_REQUIRED_TRADE_N = computeM16ErClusteredPlanningTradeN();
export const M16_ER_MIN_UTC_DAY_CLUSTERS = computeM16ErMinUtcDayClusters();

export function buildM16ErDependencePlan() {
  const m = M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY;
  const rho = M16_PLANNING_WITHIN_UTC_DAY_ICC;
  const de = designEffect(rho, m);
  const requiredTradeN = Math.ceil(M16_ER_IID_BASELINE_TRADE_N * de);
  const minClusters = Math.max(24, Math.ceil(requiredTradeN / m));

  const plan = {
    planVersion: "kalshi-kxbtc15m-m16-er-dependence-plan-v1" as const,
    role: M16_ER_ROLE,
    milestone: "m16-er-dependence-power-plan" as const,
    method: M16_CR2_INFERENCE_METHOD,
    chronologicalUnit: "utc-calendar-day-of-eligible-confirmation" as const,
    clusterKey: "utcDayKey(confirmationTimestampMs)" as const,
    tradeUnit:
      "first-time-gate-eligible-confirmation-per-marketTicker" as const,
    iidBaselineTradeN: M16_ER_IID_BASELINE_TRADE_N,
    planningWithinUtcDayIcc: rho,
    planningAvgTradesPerUtcDay: m,
    planningBlindIncidenceSource:
      "QUALITY_AUDIT_ONLY CryptoStruct RAW-BBO-CHANGE eligible confirmations / 4h day (10,14,13,12,12); no P&L" as const,
    designEffect: de,
    requiredTradeN,
    minimumUtcDayClusters: minClusters,
    minimumUtcDayClustersJustification:
      "max(24-prospective-small-cluster-floor, ceil(requiredTradeN / planningAvgTradesPerUtcDay)); denser CS incidence raises DE vs M16-P N=268" as const,
    primaryInference: {
      varianceEstimator: "CR2" as const,
      designMatrix: "intercept-only-column-of-ones" as const,
      test: "one-sided-t" as const,
      degreesOfFreedomRule: "G-minus-1" as const,
      nullHypothesis: "mu-leq-0" as const,
      alternativeHypothesis: "mu-gt-0" as const,
      alpha: 0.05 as const,
      forbidCr0PlusNormalZ: true as const,
      forbidSilentIidFallback: true as const,
    },
    collectionMode: "fixed-date-cohort-no-sequential-stopping" as const,
    notes: [
      "Do NOT reuse prospective M16-P N=268; CS incidence denser → larger DE.",
      "No economic outcomes used to set m, rho, N, or G.",
    ],
  };

  const dependencePlanIdentity = createHash("sha256")
    .update(stableStringify(plan))
    .digest("hex");

  return { ...plan, dependencePlanIdentity };
}

export function buildM16ErSourceContract() {
  const contract = {
    contractVersion: "kalshi-kxbtc15m-m16-er-source-contract-v1" as const,
    role: M16_ER_ROLE,
    observationSource: "cryptostruct-kalshi-btc-15m-series-day-zip" as const,
    adapterId: M16_ER_ADAPTER_ID,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    sourceEquivalenceVerdict: M16_ER_SOURCE_EQUIVALENCE_VERDICT,
    sourceEquivalenceAuthorityPath:
      "data/research-results/external-kalshi-data-audit/m16-source-equivalence-audit.md" as const,
    caveat:
      "CryptoStruct observation process is denser than KalshiBot eligible TOB; additional qualifying causal paths expected; M16-ER is NOT byte-identical to M16-P" as const,
    midpointRule: "yesMid=50+(yesBid-noBid)/2" as const,
    emissionRule:
      "emit when (yesBid,noBid,bookEligible,structuralGap) changes" as const,
    substantiveFamilyIdentity: M16_FAMILY_DEFINITION_IDENTITY,
    substantiveRuleUnchanged: true as const,
  };
  const sourceContractIdentity = createHash("sha256")
    .update(stableStringify(contract))
    .digest("hex");
  return { ...contract, sourceContractIdentity };
}

export function buildM16ErFeeContract() {
  /**
   * Historical KXBTC15M fee attestation for Aug–Sep 2026 cohort:
   * series fee_type=quadratic, fee_multiplier=1 → STANDARD taker schedule
   * (same as sealed M16 fee semantics). fee_changes empty at M16 seal;
   * Feb 2026 PDF retains general 0.07×C×P×(1-P) for non-special markets.
   */
  const contract = {
    contractVersion: "kalshi-kxbtc15m-m16-er-fee-contract-v1" as const,
    role: M16_ER_ROLE,
    bindsExistingM16FeeSemantics: true as const,
    referencedM16FeeContractIdentity: M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY,
    historicalApplicability: {
      seriesTicker: "KXBTC15M" as const,
      cohortUtcDateRange: {
        startInclusive: CRYPTOSTRUCT_CATALOG_FREEZE.completeRecordingFromUtc,
        endInclusive: CRYPTOSTRUCT_CATALOG_FREEZE.catalogEndUtcInclusive,
      },
      schedule: "standard-taker-0.07-C-P-(1-P)-ceil-to-cent" as const,
      entryFee: "taker-fee-at-executable-ask" as const,
      exitFee: "taker-fee-at-executable-bid" as const,
      settlementFee: "none" as const,
      inferenceBasis:
        "documented Kalshi fee schedule + M16 series attestation (quadratic×1); not inferred from strategy outcomes" as const,
    },
    inventedFlatFeeForbidden: true as const,
    silentZeroFeeForbidden: true as const,
  };
  const feeContractIdentity = createHash("sha256")
    .update(stableStringify(contract))
    .digest("hex");
  return { ...contract, feeContractIdentity };
}

export function buildM16ErEvidenceContract() {
  const dependence = buildM16ErDependencePlan();
  const contract = {
    contractVersion: "kalshi-kxbtc15m-m16-er-evidence-contract-v1" as const,
    role: M16_ER_ROLE,
    primaryEstimand: "mean-one-contract-fee-adjusted-executable-pnl" as const,
    h0: "mean-fee-adjusted-executable-pnl-leq-0" as const,
    h1: "mean-fee-adjusted-executable-pnl-gt-0" as const,
    alpha: 0.05 as const,
    sidedness: "one-sided" as const,
    targetPower: 0.8 as const,
    planningMdeCents: 5 as const,
    planningSdCents: 25 as const,
    requiredTradeN: dependence.requiredTradeN,
    minimumUtcDayClusters: dependence.minimumUtcDayClusters,
    inferenceMethod: M16_CR2_INFERENCE_METHOD,
    economicOutcomesOpened: false as const,
  };
  const evidenceContractIdentity = createHash("sha256")
    .update(stableStringify(contract))
    .digest("hex");
  return { ...contract, evidenceContractIdentity };
}

export function buildM16ErFixedCohortPlan() {
  const universe = buildCryptostructCandidateUniverse();
  const dependence = buildM16ErDependencePlan();
  const dates = universe.candidateUntouchedUtcDates;
  const hours = dates.length * 4;
  const expectedConfirmations = dates.length * M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY;
  const adequate =
    dates.length >= dependence.minimumUtcDayClusters
    && expectedConfirmations >= dependence.requiredTradeN;

  const plan = {
    planVersion: "kalshi-kxbtc15m-m16-er-fixed-cohort-v1" as const,
    role: M16_ER_ROLE,
    collectionMode: "fixed-all-eligible-untouched-dates" as const,
    governedWindowUtc: "18:00-22:00Z" as const,
    hoursPerDay: 4 as const,
    fixedUtcDates: dates,
    fixedDateCount: dates.length,
    fixedGovernedHours: hours,
    planningIncidencePerDay: M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY,
    expectedBlindConfirmations: expectedConfirmations,
    requiredTradeN: dependence.requiredTradeN,
    minimumUtcDayClusters: dependence.minimumUtcDayClusters,
    adequacyVerdict: adequate
      ? ("ADEQUATE_UNDER_BLIND_PLANNING" as const)
      : ("INSUFFICIENT_UNDER_BLIND_PLANNING" as const),
    qualityAuditOnlyExcluded: [...CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES],
    noSequentialRescueUnlessPreregistered: true as const,
    preregisteredRescue: "none-fixed-cohort-only" as const,
    universeDefinitionIdentity: universe.universeDefinitionIdentity,
  };

  const cohortReservationIdentity = createHash("sha256")
    .update(stableStringify(plan))
    .digest("hex");

  return { ...plan, cohortReservationIdentity };
}

export function buildM16ErExecutionSemantics() {
  const semantics = {
    semanticsVersion: "kalshi-kxbtc15m-m16-er-execution-semantics-v1" as const,
    role: M16_ER_ROLE,
    signalStateFrom: "midpoint-proxy-via-selected-adapter" as const,
    entryFrom: "causal-executable-candidate-ask-at-confirmation" as const,
    exitFrom: "causal-executable-candidate-bid" as const,
    cryptostructExecutableMapping: {
      yesBid: "max(YES bids) cents" as const,
      yesAsk: "min(YES asks) cents" as const,
      noBid: "100 - yesAsk" as const,
      noAsk: "100 - yesBid" as const,
      candidateAsk:
        "YES side → yesAsk; NO side → noAsk (complement)" as const,
      candidateBid:
        "YES side → yesBid; NO side → noBid (complement)" as const,
    },
    targetBidCents: 55 as const,
    structuralStop: "first-eligible-candidate-bid-strictly-below-L" as const,
    terminalFlatten: "last-eligible-candidate-bid-at-or-before-close" as const,
    midpointNeverUsedAsFill: true as const,
    noFutureLookingQuoteSelection: true as const,
    outcomesComputed: false as const,
  };
  const executionSemanticsIdentity = createHash("sha256")
    .update(stableStringify(semantics))
    .digest("hex");
  return { ...semantics, executionSemanticsIdentity };
}

export function buildM16ErQualityExclusionContract() {
  const contract = {
    contractVersion: "kalshi-kxbtc15m-m16-er-quality-exclusion-v1" as const,
    role: M16_ER_ROLE,
    allowedExclusionReasons: [
      "corrupted-zip",
      "sha256-mismatch",
      "unrecoverable-snapshot-delta-chain-failure",
      "missing-governed-18-22z-interval",
      "provider-documented-outage-beyond-exchange-downtime",
      "malformed-ticker-lifecycle",
    ] as const,
    forbiddenExclusionReasons: [
      "zero-signal-day",
      "low-volatility-day",
      "weird-looking-strategy-behavior",
      "losing-looking-day",
      "high-or-low-incidence-inconvenient",
    ] as const,
    healthyZeroSignalRemainsInCohort: true as const,
    automaticReplacement: "none-unless-deterministic-rule-frozen-here" as const,
    replacementRule: "none" as const,
  };
  const qualityExclusionIdentity = createHash("sha256")
    .update(stableStringify(contract))
    .digest("hex");
  return { ...contract, qualityExclusionIdentity };
}

export function buildM16ErPurchaseManifest() {
  const cohort = buildM16ErFixedCohortPlan();
  const credits = cohort.fixedDateCount * CRYPTOSTRUCT_CATALOG_FREEZE.creditsPerSeriesDay;
  const premiumMonthly = CRYPTOSTRUCT_CATALOG_FREEZE.premiumMonthlyCredits;
  return {
    purchaseExecuted: false as const,
    doNotPurchaseInThisTask: true as const,
    provider: "CryptoStruct" as const,
    series: "KXBTC15M" as const,
    utcDatesToPurchase: cohort.fixedUtcDates,
    dayCount: cohort.fixedDateCount,
    creditsRequired: credits,
    premiumMonthlyAllowanceCredits: premiumMonthly,
    premiumAllowanceSufficient: credits <= premiumMonthly,
    listPriceEurIfNoCredits: credits * CRYPTOSTRUCT_CATALOG_FREEZE.listPriceEurPerSeriesDay,
    qualityAuditOwnedDaysDoNotEnterValidation: [
      ...CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
    ],
    note:
      "QUALITY_AUDIT_ONLY days already owned must NOT be counted as M16-ER validation credits or dates" as const,
  };
}

export function buildM16ErScientificProtocol() {
  const source = buildM16ErSourceContract();
  const universe = buildCryptostructCandidateUniverse();
  const cohort = buildM16ErFixedCohortPlan();
  const dependence = buildM16ErDependencePlan();
  const fee = buildM16ErFeeContract();
  const evidence = buildM16ErEvidenceContract();
  const execution = buildM16ErExecutionSemantics();
  const quality = buildM16ErQualityExclusionContract();

  const body = {
    protocolVersion: M16_ER_PROTOCOL_VERSION,
    role: M16_ER_ROLE,
    distinguishesFrom: M16_P_ROLE,
    substantiveFamilyIdentity: M16_FAMILY_DEFINITION_IDENTITY,
    sourceContractIdentity: source.sourceContractIdentity,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    universeDefinitionIdentity: universe.universeDefinitionIdentity,
    cohortReservationIdentity: cohort.cohortReservationIdentity,
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    feeContractIdentity: fee.feeContractIdentity,
    evidenceContractIdentity: evidence.evidenceContractIdentity,
    executionSemanticsIdentity: execution.executionSemanticsIdentity,
    qualityExclusionIdentity: quality.qualityExclusionIdentity,
    economicOutcomesOpened: false as const,
  };

  const scientificProtocolIdentity = createHash("sha256")
    .update(stableStringify(body))
    .digest("hex");

  return { ...body, scientificProtocolIdentity };
}

export type M16ErOutcomeOpenInput = {
  protocolIdentity?: string;
  adapterIdentity?: string;
  cohortReservationIdentity?: string;
  purchasedZipSha256Verified?: boolean;
  qualityAuditComplete?: boolean;
  fixedCohortAdmissionComplete?: boolean;
  sampleAdequacyMet?: boolean;
  pnlPreviouslyOpened?: boolean;
};

export const M16_ER_OUTCOME_OPEN_BLOCKERS = {
  PROTOCOL_MISMATCH: "m16-er-scientific-protocol-identity-mismatch",
  ADAPTER_MISMATCH: "m16-er-adapter-identity-mismatch",
  COHORT_MISMATCH: "m16-er-cohort-reservation-identity-mismatch",
  SHA_UNVERIFIED: "m16-er-purchased-zip-sha256-unverified",
  QUALITY_INCOMPLETE: "m16-er-quality-audit-incomplete",
  COHORT_NOT_ADMITTED: "m16-er-fixed-cohort-admission-incomplete",
  ADEQUACY_SHORT: "m16-er-sample-cluster-adequacy-not-met",
  PNL_ALREADY_OPENED: "m16-er-pnl-previously-opened",
} as const;

export function evaluateM16ErOutcomeOpenAuthorization(
  input: M16ErOutcomeOpenInput = {},
) {
  const protocol = buildM16ErScientificProtocol();
  const cohort = buildM16ErFixedCohortPlan();
  const blockers: string[] = [];

  if (
    input.protocolIdentity != null
    && input.protocolIdentity !== protocol.scientificProtocolIdentity
  ) {
    blockers.push(M16_ER_OUTCOME_OPEN_BLOCKERS.PROTOCOL_MISMATCH);
  }
  if (
    input.adapterIdentity != null
    && input.adapterIdentity !== M16_ER_ADAPTER_IDENTITY
  ) {
    blockers.push(M16_ER_OUTCOME_OPEN_BLOCKERS.ADAPTER_MISMATCH);
  }
  if (
    input.cohortReservationIdentity != null
    && input.cohortReservationIdentity !== cohort.cohortReservationIdentity
  ) {
    blockers.push(M16_ER_OUTCOME_OPEN_BLOCKERS.COHORT_MISMATCH);
  }
  if (input.purchasedZipSha256Verified !== true) {
    blockers.push(M16_ER_OUTCOME_OPEN_BLOCKERS.SHA_UNVERIFIED);
  }
  if (input.qualityAuditComplete !== true) {
    blockers.push(M16_ER_OUTCOME_OPEN_BLOCKERS.QUALITY_INCOMPLETE);
  }
  if (input.fixedCohortAdmissionComplete !== true) {
    blockers.push(M16_ER_OUTCOME_OPEN_BLOCKERS.COHORT_NOT_ADMITTED);
  }
  if (input.sampleAdequacyMet !== true) {
    blockers.push(M16_ER_OUTCOME_OPEN_BLOCKERS.ADEQUACY_SHORT);
  }
  if (input.pnlPreviouslyOpened === true) {
    blockers.push(M16_ER_OUTCOME_OPEN_BLOCKERS.PNL_ALREADY_OPENED);
  }

  // Default freeze state: always sealed until all gates true
  const authorized = blockers.length === 0;

  return {
    authorized,
    economicOutcomeOpenAuthorized: authorized,
    sealed: !authorized,
    scientificProtocolIdentity: protocol.scientificProtocolIdentity,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    cohortReservationIdentity: cohort.cohortReservationIdentity,
    blockers,
    forbiddenWhileSealed: [
      "pnl",
      "targetHit",
      "stopHit",
      "settlement",
      "winner",
      "loser",
      "meanReturn",
      "winRate",
      "cr2Result",
      "pValue",
    ] as const,
    note: authorized
      ? "M16-ER outcome open authorized under frozen protocol"
      : "M16-ER economics sealed — protocol freeze only",
  };
}

/** Synthetic-fixture readiness for eventual M16-ER evaluator (no real outcomes). */
export function buildM16ErEvaluatorReadiness() {
  return {
    finalEvaluatorReadyForRealOutcomes: false as const,
    syntheticFixtureSupportRequired: [
      "entry-exit-semantics",
      "fee-semantics",
      "target-stop-logic",
      "terminal-flatten",
      "cr2-calculation",
      "one-sided-decision-rule",
      "fail-closed-identities",
    ] as const,
    reusesCanonicalModules: [
      "stepM16MarketMachine",
      "computeKalshiScheduleFeeCents",
      "computeM16Cr2ClusterMean",
      "buildM16TradePolicySpec",
    ] as const,
    realReservedOutcomesFed: false as const,
    note: "Prospective M16-P evaluator plumbing may be reused on synthetic fixtures only until outcome-open gate authorizes.",
  };
}

export function buildM16ErIdentityBundle() {
  const source = buildM16ErSourceContract();
  const universe = buildCryptostructCandidateUniverse();
  const cohort = buildM16ErFixedCohortPlan();
  const dependence = buildM16ErDependencePlan();
  const fee = buildM16ErFeeContract();
  const evidence = buildM16ErEvidenceContract();
  const protocol = buildM16ErScientificProtocol();
  const execution = buildM16ErExecutionSemantics();
  const quality = buildM16ErQualityExclusionContract();
  const purchase = buildM16ErPurchaseManifest();
  const gate = evaluateM16ErOutcomeOpenAuthorization();
  const evaluator = buildM16ErEvaluatorReadiness();

  return {
    role: M16_ER_ROLE,
    prospectiveM16PUnchanged: true as const,
    substantiveFamilyIdentity: M16_FAMILY_DEFINITION_IDENTITY,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    sourceContractIdentity: source.sourceContractIdentity,
    universeDefinitionIdentity: universe.universeDefinitionIdentity,
    cohortReservationIdentity: cohort.cohortReservationIdentity,
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    feeContractIdentity: fee.feeContractIdentity,
    evidenceContractIdentity: evidence.evidenceContractIdentity,
    scientificProtocolIdentity: protocol.scientificProtocolIdentity,
    executionSemanticsIdentity: execution.executionSemanticsIdentity,
    qualityExclusionIdentity: quality.qualityExclusionIdentity,
    dependence,
    cohort,
    fee,
    evidence,
    purchase,
    outcomeGate: gate,
    evaluator,
    scientificInterpretation: {
      m16P: "prospective KalshiBot-source replication",
      m16Er: "historical external CryptoStruct-source replication",
      sameSubstantiveFamily: true,
      notRelabeledProspective: true,
      disagreementInterpretation:
        "potentially source/observation-process sensitive; not automatic invalidation of either arm",
    },
  };
}
