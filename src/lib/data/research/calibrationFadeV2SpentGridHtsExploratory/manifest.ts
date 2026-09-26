/**
 * Immutable study manifest — freeze before joining outcomes / computing P&L.
 */

import {
  KALSHI_FEE_SCHEDULE_ROLE,
  KALSHI_FEE_SCHEDULE_VARIANT,
} from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import { M16_CR2_INFERENCE_METHOD } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Cr2ClusterMean";
import { buildM16ErFeeContract } from "@/lib/data/research/m16ExternalReplication";
import { SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS } from "@/lib/data/research/settlementFrictionCoverage/types";

import {
  CF_V2_HYPOTHESIS_PATH,
  CF_V2_SPENT_GRID_DATASET_PROVENANCE,
  CF_V2_SPENT_GRID_ELIGIBILITY,
  CF_V2_SPENT_GRID_HTS_ANALYSIS_VERSION,
  CF_V2_SPENT_GRID_HTS_DISCLAIMER,
  CF_V2_SPENT_GRID_HTS_STUDY_ID,
} from "./types";

export const CF_V2_SPENT_GRID_EXPECTED_INPUTS = {
  preentryFeaturesRelativePath:
    "data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery/work/preentry-features.jsonl",
  preentryFeaturesSha256:
    "c7bba7a5e2c3ee7b8f5386f770f993752eb3d4053a10ef5f97e6231264b5e0d7",
  settlementLabelsRelativePath:
    "data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl",
  settlementLabelsSha256:
    "7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7",
  bookFeaturesRelativePath:
    "data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery/work/book-features.jsonl",
  bookFeaturesSha256:
    "6846e7187fe89eb76c00b60ec0c44f1ae6fbfbafce20d90ab9582c54f5e44eaf",
  samplesRelativePath:
    "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl",
  samplesSha256:
    "3f2dad5062e566ad7feacff1fbe1c0b963bbaa4d45aaa20d2a619f31098c8728",
} as const;

export function buildFrozenStudyManifest(input: {
  codeAuthoritySha: string;
  generatedAtUtc: string;
  inputHashesVerified: boolean;
}): Record<string, unknown> {
  const fee = buildM16ErFeeContract();
  return {
    studyId: CF_V2_SPENT_GRID_HTS_STUDY_ID,
    analysisVersion: CF_V2_SPENT_GRID_HTS_ANALYSIS_VERSION,
    disclaimer: CF_V2_SPENT_GRID_HTS_DISCLAIMER,
    frozenAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    datasetProvenance: CF_V2_SPENT_GRID_DATASET_PROVENANCE,
    hypothesisPath: CF_V2_HYPOTHESIS_PATH,
    hypothesisPreservedUnchanged: true,
    inputHashesVerified: input.inputHashesVerified,
    expectedInputs: CF_V2_SPENT_GRID_EXPECTED_INPUTS,
    differencesFromContinuousCrossingV2: [
      "Entry unit is first eligible retained 60s friction-grid observation per market, not continuous first-crossing into eligibility on a full quote stream",
      "Universe is the retained M16-ER settlement-friction admission grid (eligible quotes at 60s cadence), not continuous market coverage",
      "Pre-entry features regenerated offline (book + Coinbase completed-1m vol); original continuous hypothesis config file is not modified",
    ],
    frictionGridAdmissionFilters: {
      sampleCadenceMs: SETTLEMENT_FRICTION_SAMPLE_CADENCE_MS,
      note:
        "Retained samples come from CryptoStruct RAW-BBO-CHANGE streams filtered to "
        + "eligible non-crossed/non-locked books with min displayed size, quote-age gate, "
        + "session bounds, and first qualifying BBO-change per 60s cadence bucket. "
        + "This is not a continuous tape; generalization beyond the admitted grid is limited.",
    },
    eligibility: CF_V2_SPENT_GRID_ELIGIBILITY,
    volatilityContract: {
      source: "preentry-features.annualizedRealizedVolatility / citedHighVolRegime",
      authority: CF_V2_HYPOTHESIS_PATH,
      lookbackBars: 10,
      requiredCloseCount: 11,
      candleCloseOffsetMs: 59_999,
      completedCandleEligibility: "closeTimeMs < entryTimestampMs",
      method: "realized-log-return-annualized",
      minInclusive: 0.6,
    },
    midpointUnits: {
      field: "yesMidpoint",
      formula: "(yesBidCents + yesAskCents) / 2 / 100",
      range: "[1/3, 2/3) as probability fraction",
    },
    selection: {
      unit: "one-entry-per-marketTicker",
      rule: "earliest entryTimestampMs among eligible rows",
      tieBreak:
        "If multiple eligible rows share the same earliest entryTimestampMs for a market, "
        + "flag as duplicate-conflict and do not select opportunistically",
      outcomeJoinAfterSelection: true,
      missingOutcomeDoesNotReselect: true,
    },
    executionAssumptions: {
      side: "NO",
      contracts: 1,
      entryPrice: "observed noAskCents",
      exit: "official settlement result label",
      quoteFillAssumption:
        "Simulated fill at displayed noAskCents; not a confirmed live fill",
      sizeEvidenceFields: ["yesBidSize", "yesAskSize"],
      freshnessEvidence:
        "Quote-age / exchange-vs-receive freshness not present on preentry-features rows; disclosed as missing",
    },
    feeContract: {
      identity: fee.feeContractIdentity,
      schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
      role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
      quantity: 1,
      priceBasis: "noAskCents",
      roundTripFee: false,
      settlementFee: false,
      implementation:
        "src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts",
    },
    payoff: {
      resultNo: "grossPnlCents = 100 - noAskCents",
      resultYes: "grossPnlCents = -noAskCents",
      net: "grossPnlCents - entryFeeCents",
    },
    bookReconstructionPolicy: {
      doNotExcludeAllHalfSpreadMismatches: true,
      classADefinitionMismatchNotTreatedAsInvalidNoAsk: true,
      classBSensitivityWhenPresent:
        "If selected entries include Class B uncertain books and classifier inputs exist, "
        + "report a predefined sensitivity excluding those entries",
      classBResolvedNotInferredFromNoAskAlone: true,
    },
    statisticalMethod: {
      primaryMean: "mean net P&L cents per evaluable market",
      clusterUnit: "utcDayKey of selected entry",
      varianceEstimator: "CR2 intercept-only cluster-robust (M16 implementation)",
      inferenceMethod: M16_CR2_INFERENCE_METHOD,
      confidenceInterval:
        "two-sided 95% CI using CR2 SE and Student-t critical value with df = G−1",
      leaveOneDayOut: "descriptive means only; not used to revise eligibility",
    },
    exploratoryDecisionRules: {
      dataIntegrityFirst: true,
      insufficientEvidence: "N < 50 or G < 10",
      doNotSupportProceeding: "sufficient incidence and meanNetPnlCents <= 0",
      evidenceAgainstPositiveMean: "CI upper bound <= 0",
      exploratoryPromise: "mean >= +1 cent AND G >= 15 AND CI lower bound > 0",
      otherwise: "inconclusive-or-below-material-promise-bar",
      note:
        "Screening criteria only. Negative grid ≠ reject continuous-first-crossing. "
        + "Positive grid ≠ live fillability or independent confirmation.",
    },
    boundaries: {
      noPurchases: true,
      noMarketDataDownloads: true,
      noProspectiveCaptures: true,
      noLiveTrades: true,
      m17SettlementStateTestingPaused: true,
      avg60sOutOfStrategyFeatures: true,
      noThresholdSweeps: true,
      noVolAblation: true,
      noContinuousCrossingRerun: true,
    },
  };
}
