/**
 * Run exploratory M17 SPENT hold-to-settlement evaluation.
 * Stops before P&L when frozen entry decisions are missing.
 */

import {
  entriesFromFrictionSamples,
  runM17SettlementJoinAudit,
} from "@/lib/data/research/m17SettlementJoinAudit";
import type { SettlementLabelRecord } from "@/lib/data/research/settlementFrictionCoverage";

import {
  summarizeFeatureAvailability,
  type RetainedFrictionSampleRow,
} from "./featureCompleteness";
import {
  buildM17FrozenDecisionInventory,
  listMissingFrozenDecisionsBlockingPnl,
} from "./frozenStrategyDefinition";
import { M17_LEAKAGE_CONTROL_STATEMENTS } from "./leakageGuards";
import {
  M17_CITED_REGIME_FILTERS,
  M17_SPENT_DATASET_PROVENANCE,
  M17_SPENT_HTS_ANALYSIS_VERSION,
  M17_SPENT_HTS_DISCLAIMER,
  M17_SPENT_HTS_STUDY_ID,
  type M17SpentHoldToSettlementReport,
} from "./types";

export function runM17SpentHoldToSettlementEval(input: {
  samples: readonly RetainedFrictionSampleRow[];
  labels: readonly SettlementLabelRecord[];
  generatedAtUtc: string;
  codeAuthoritySha: string | null;
  inputIdentities: Record<string, string>;
}): M17SpentHoldToSettlementReport {
  const inventory = buildM17FrozenDecisionInventory();
  const missingFrozen = listMissingFrozenDecisionsBlockingPnl(inventory);

  const entries = entriesFromFrictionSamples(
    input.samples.map((s) => ({
      marketTicker: String(s.marketTicker ?? ""),
      utcDayKey: String(s.utcDayKey ?? ""),
      entryTimestampMs: Number(s.entryTimestampMs ?? Number.NaN),
    })),
  );

  const { report: joinReport } = runM17SettlementJoinAudit({
    entries,
    labels: input.labels,
    generatedAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    inputIdentities: input.inputIdentities,
  });

  const features = summarizeFeatureAvailability({
    samples: input.samples,
    validOfficialSettlementJoin: joinReport.counts.validOfficialSettlementLabel,
    incompleteTickerExcluded: joinReport.counts.excludedKnownIncompleteTicker,
    nonNumericExpirationExcluded: joinReport.counts.nonNumericExpirationValue,
  });

  const markets = new Set(
    input.samples
      .map((s) => s.marketTicker)
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0),
  );
  const dates = new Set(
    input.samples
      .map((s) => s.utcDayKey)
      .filter((d): d is string => typeof d === "string" && d.trim().length > 0),
  );

  const coverageShare =
    features.executableBookSamples > 0
      ? features.validOfficialSettlementJoin / features.executableBookSamples
      : 0;

  const blocked = missingFrozen.length > 0
    || features.completeRequiredFeaturesForEntry === 0;

  if (!blocked) {
    // Fail closed: inventory + feature gates alone must not imply P&L was computed.
    // Entry simulation is intentionally unimplemented until the mapping is frozen.
    throw new Error(
      "M17 SPENT hold-to-settlement P&L simulation is not implemented. "
        + "Freeze the settlement-state→entry mapping and implement authorized "
        + "entry simulation before emitting computed exploratory performance.",
    );
  }

  const performance = {
    status: "blocked" as const,
    reason:
      "Stopped before P&L: missing frozen settlement-state→entry mapping and/or "
      + "required pre-entry features absent on retained SPENT samples. "
      + "Do not invent thresholds from these 34 days.",
    noEntriesSimulated: 0,
    grossTerminalOutcomeCentsSum: null,
    oneTakerFeeAdjustedReturnCentsSum: null,
    winRate: null,
    averageReturnCents: null,
    medianReturnCents: null,
    varianceReturnCents: null,
    maxDrawdownCents: null,
  };

  return {
    studyId: M17_SPENT_HTS_STUDY_ID,
    analysisVersion: M17_SPENT_HTS_ANALYSIS_VERSION,
    disclaimer: M17_SPENT_HTS_DISCLAIMER,
    generatedAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    completionStatus: "blocked-missing-frozen-decisions",
    datasetProvenance: M17_SPENT_DATASET_PROVENANCE,
    inputIdentities: input.inputIdentities,
    strategyDefinitionUsed: {
      name: "hold-to-settlement-terminal-mispricing",
      side: "NO",
      fee: "one-standard-taker-schedule",
      outcomeLabel: "official-expiration_value-post-entry-only",
      avg60sDataWiredIntoGates: false,
      citedRegimeFilters: M17_CITED_REGIME_FILTERS,
      settlementEstimateSemantics: {
        expirationValue: "authoritative-after-settlement-outcome-label-only",
        avg60sData: "research-only-empirical-candidate-not-a-gate",
        last60sWindowedAverage15min: "diagnostic-only",
      },
    },
    frozenDecisionInventory: inventory,
    missingFrozenDecisionsBlockingPnl: missingFrozen,
    featureAvailability: features,
    candidatePopulation: {
      retainedExecutableSamples: features.executableBookSamples,
      claimedPriorEntryArtifact: "unavailable-not-found-in-retained-artifacts",
      recomputedUnderFrozenRegimeFilters: null,
      recomputedRegimeFilterNote:
        "Cannot recompute [1/3,2/3)×high-vol×<15m candidates from retained friction "
        + "samples: YES midpoint, Coinbase realized volatility, and explicit "
        + "timeRemainingMs columns are absent. Regenerating quote/vol streams was "
        + "not authorized for this blocked evaluation. Claimed 20,923/72 artifact "
        + "remains unavailable.",
      independentMarketsInRetainedExecutable: markets.size,
      datesInRetainedExecutable: dates.size,
      validSettlementLabelCoverageShare: coverageShare,
    },
    performance,
    baselines: {
      noTrade: {
        meanFeeAdjustedReturnCents: 0,
        note: "No-trade baseline is definitionally 0; reported without inspecting outcomes for selection.",
      },
      marketImplied: {
        status: "not-computed",
        reason:
          "YES/NO market-implied baseline requires retained YES mid / NO ask levels on candidate rows; absent on friction samples.",
      },
      fixedSettlementThreshold: {
        status: "not-defined-in-frozen-m17-design",
        reason:
          "M17 draft §C.2 Baseline A is arithmetic-only (no trading claim). No frozen fixed settlement-threshold trading baseline exists.",
      },
    },
    confirmatoryBoundary: {
      isSpentExploratory: true,
      canEstablishOutOfSamplePerformance: false,
      canJustifyLiveTrading: false,
      pristinePurchaseNeeds: [
        "UTC days outside M16-ER SPENT_VALIDATION (not QUALITY_AUDIT_ONLY, not sealed M16-P)",
        "Same CryptoStruct RAW-BBO-CHANGE adapter / executable book configuration",
        "Study-complete official settlement labels per marketTicker",
        "Pre-reserved pristine / holdout partition before any exploratory peek",
        "Frozen settlement-state→entry mapping (probability model or explicit rule) registered before evaluation",
        "Co-timed BRTI / banked settlement-sample paths if the claim is settlement-state causality",
      ],
    },
    pristinePurchaseRecommendation: {
      justifiedNow: false,
      rationale:
        "Do not purchase pristine validation/holdout yet. The M17 entry mapping from "
        + "settlement-state arithmetic to YES-overpriced is still unfrozen, official "
        + "banked-sample field identity is unresolved, and retained SPENT CryptoStruct "
        + "days lack pre-entry BRTI settlement-state paths. Freeze the decision rule "
        + "and establish settlement-state input availability before buying holdout data.",
    },
    zeroNetworkConfirmation: {
      marketDataRequests: 0,
      websocketCaptures: 0,
      cryptostructPurchases: 0,
      trades: 0,
      orderPlacements: 0,
    },
    leakageControlsApplied: [...M17_LEAKAGE_CONTROL_STATEMENTS],
  };
}
