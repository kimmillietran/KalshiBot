import {
  BTC_MAGNITUDE_BINS,
  BTC_RETURN_HORIZONS_MS,
  IMPLIED_PROBABILITY_BINS,
  RESPONSE_WINDOWS_MS,
  TIME_REMAINING_BINS,
} from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import {
  DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS,
  MOMENTUM_MODERATE_THRESHOLD_PERCENT,
  MOMENTUM_STRONG_THRESHOLD_PERCENT,
} from "../dimensions/momentum/momentumResearchTypes";
import { MOMENTUM_BUCKET_DEFINITIONS } from "../dimensions/momentum/momentumBucketDefinitions";

import type {
  CompletedLeadLagLineageSummary,
  FamilyInventory,
  MicrostructureDataSupportRow,
  NextFamilyReadinessIo,
  ResearchFamilyId,
} from "./nextFamilyReadinessTypes";

const LEAD_LAG_MODULES = [
  "src/lib/data/research/btcKalshiLeadLagAnalysis/analyzeBtcKalshiLeadLagForRun.ts",
  "src/lib/data/research/btcKalshiLeadLagAnalysis/causalBtcJoin.ts",
  "src/lib/data/research/btcKalshiLeadLagAnalysis/classifyLeadLagInterpretation.ts",
  "scripts/research/buildBtcKalshiLeadLagAnalysis.ts",
] as const;

const MICROSTRUCTURE_MODULES = [
  "src/lib/data/research/bidSizeCoverageAudit/buildBidSizeCoverageAuditReport.ts",
  "src/lib/data/research/quoteFidelityGate/buildQuoteFidelityGateReport.ts",
  "src/lib/data/research/staticParityScan/buildStaticParityScanReport.ts",
  "src/lib/data/research/executableConfirmationDesign/buildExecutableConfirmationDesignReport.ts",
] as const;

const MOMENTUM_MODULES = [
  "src/lib/data/research/dimensions/momentum/momentumResearchTypes.ts",
  "src/lib/data/research/dimensions/momentum/momentumBucketDefinitions.ts",
  "src/lib/features/momentum.ts",
  "src/lib/data/strategies/plugin/builtins/simpleMomentumStrategyPlugin.ts",
] as const;

const MOMENTUM_FAMILY_ANALYSIS_MISSING = [
  "src/lib/data/research/momentumFamilyAnalysis/",
  "scripts/research/buildMomentumFamilyAnalysis.ts",
] as const;

const MICROSTRUCTURE_FAMILY_DEFINITION_MODULES = [
  "src/lib/data/research/spreadLiquidityMicrostructureFamily/index.ts",
  "src/lib/data/research/spreadLiquidityMicrostructureFamily/buildMicrostructureFamilyDefinitionReport.ts",
  "scripts/research/buildSpreadLiquidityMicrostructureFamily.ts",
] as const;

function presentPaths(
  io: NextFamilyReadinessIo,
  paths: readonly string[],
): { present: string[]; missing: string[] } {
  const present: string[] = [];
  const missing: string[] = [];
  for (const path of paths) {
    if (io.fileExists(path)) {
      present.push(path);
    } else {
      missing.push(path);
    }
  }
  return { present, missing };
}

export function inventoryLeadLagFamily(io: NextFamilyReadinessIo): FamilyInventory {
  const modules = presentPaths(io, LEAD_LAG_MODULES);
  const candleIntegrityPresent = io.fileExists(
    "src/lib/data/research/completedCandleWindowIntegrity/index.ts",
  );
  return {
    familyId: "btc-kalshi-lead-lag",
    displayName: "BTC / Kalshi lead-lag",
    maturity: modules.missing.length === 0 ? "mature" : "partial",
    independenceFromCalibrationFade: "high",
    conceptualThesis:
      "BTC moves first and Kalshi implied probability reacts later "
      + "(impulse → forward response), distinct from calibration overconfidence in a vol/time bucket.",
    modulePathsPresent: modules.present,
    modulePathsMissing: modules.missing,
    npmScriptsPresent: ["research:btc-kalshi-lead-lag-analysis", "research:lead-lag"],
    familyDefinitionAvailable: modules.present.length >= 3,
    causalSemanticsNotes: [
      "causalBtcJoin is backward-only (last BTC at-or-before Kalshi timestamp) with age cap.",
      "Report stamps futureLeakageGuardStatus and btcJoinDirection.",
      "Do not select the best lag/horizon on all exploratory data and call it a hypothesis.",
    ],
    executableInputNotes: [
      "Lead-lag characterization uses executableBuyYesCents / executableSellYesCents and spread/size fields.",
      "Midpoint response is diagnostic, not executable P&L.",
    ],
    multiplicity: {
      status: "needs-work",
      returnHorizonCount: BTC_RETURN_HORIZONS_MS.length,
      responseWindowCount: RESPONSE_WINDOWS_MS.length,
      magnitudeBinCount: BTC_MAGNITUDE_BINS.length,
      timeRemainingBinCount: TIME_REMAINING_BINS.length,
      impliedProbabilityBinCount: IMPLIED_PROBABILITY_BINS.length,
      atlasAxisGroupCount: null,
      momentumBucketCount: null,
      note:
        `${BTC_RETURN_HORIZONS_MS.length} BTC return horizons × `
        + `${RESPONSE_WINDOWS_MS.length} response windows × `
        + `${BTC_MAGNITUDE_BINS.length} magnitude × `
        + `${TIME_REMAINING_BINS.length} time-remaining × `
        + `${IMPLIED_PROBABILITY_BINS.length} implied-prob bins form a large exploratory grid. `
        + "Prospective work must freeze a small pre-registered subset before confirmatory capture.",
    },
    overlapsWithCalibrationFade: [
      "Shares forward-quote capture plumbing, top-of-book fidelity, and bid-size coverage audits.",
      "Does not share the calibration-fade eligibility rule or signed calibration-gap classifier.",
    ],
    volatilityContiguityDependency: candleIntegrityPresent ? "needs-work" : "not-established",
    volatilityContiguityNote: candleIntegrityPresent
      ? "Completed-candle contiguity primitives exist for future contracts; lead-lag primary path uses causal spot join. "
        + "If a future lead-lag rule depends on completed-candle returns/volatility, requireContiguousWindow must be opt-in."
      : "completedCandleWindowIntegrity module not found in this checkout.",
  };
}

export function applyLeadLagEmpiricalDisposition(
  inventory: FamilyInventory,
  lineage: CompletedLeadLagLineageSummary,
): FamilyInventory {
  if (inventory.familyId !== "btc-kalshi-lead-lag") {
    return inventory;
  }
  return {
    ...inventory,
    maturity: "empirically-investigated",
    familyDefinitionAvailable: true,
    empiricalLineageNotes: [
      lineage.lineageSummary,
      `Historical holdout remains ${lineage.holdoutStatisticalVerdict} `
        + `(not rejected/support). Disposition=deferred-for-prospective-replication.`,
      `Prospective replication: requiredFreshESS=${lineage.prospectiveRequiredFreshEss}; `
        + `status=available-but-not-authorized (budget not approved).`,
      `Descriptive locked effects (not aggregated): TRAIN=${lineage.trainLockedEffectCents ?? "n/a"}¢, `
        + `VALIDATION=${lineage.validationLockedEffectCents ?? "n/a"}¢, `
        + `HOLDOUT=${lineage.holdoutLockedEffectCents ?? "n/a"}¢.`,
      "Candidate shopping forbidden: other validation survivors must not be opened on historical holdout.",
      "Any future lead-lag exploration requires a new governed discovery lineage with fresh OOS allocation.",
    ],
    causalSemanticsNotes: [
      ...inventory.causalSemanticsNotes,
      "M12.8 discovery→validation→holdout completed for one locked candidate; lineage is spent for historical evidence.",
    ],
  };
}

export function buildMicrostructureDataSupportInventory(): readonly MicrostructureDataSupportRow[] {
  return [
    {
      feature: "spread",
      status: "available",
      note: "TOB best bid/ask and spread fields are captured and audited (quote fidelity / spread realism).",
    },
    {
      feature: "bid-ask-depth",
      status: "partial",
      note: "Top-of-book only; full book depth / multi-level order-flow is not established as available.",
    },
    {
      feature: "bid-ask-size",
      status: "available",
      note: "Bid/ask size fields exist in forward TOB streams; bid-size coverage audits exist.",
    },
    {
      feature: "imbalance",
      status: "derivable-not-frozen",
      note: "Size imbalance can be derived from bid/ask size, but no frozen imbalance feature contract exists.",
    },
    {
      feature: "quote-changes",
      status: "partial",
      note: "TOB stream timestamps/sequence support change detection; no sealed quote-change hypothesis module.",
    },
    {
      feature: "liquidity-withdrawal",
      status: "unavailable",
      note: "Liquidity withdrawal / cancel-flow is not established from current TOB-only capture.",
    },
    {
      feature: "short-horizon-repricing",
      status: "partial",
      note: "Short-horizon mid/ask moves are observable in TOB; no family entry rule is defined.",
    },
    {
      feature: "market-state-time-remaining",
      status: "available",
      note: "Market metadata / time-remaining style fields are available via capture market-metadata streams.",
    },
  ];
}

export function inventoryMicrostructureFamily(io: NextFamilyReadinessIo): FamilyInventory {
  const modules = presentPaths(io, MICROSTRUCTURE_MODULES);
  const familyDefinition = presentPaths(io, MICROSTRUCTURE_FAMILY_DEFINITION_MODULES);
  const familyDefinitionAvailable = familyDefinition.missing.length === 0;
  const dataSupport = buildMicrostructureDataSupportInventory();
  return {
    familyId: "spread-liquidity-microstructure",
    displayName: "Spread / liquidity microstructure",
    maturity: familyDefinitionAvailable
      ? "partial"
      : modules.present.length >= 2
        ? "partial"
        : "not-established",
    independenceFromCalibrationFade: "medium",
    conceptualThesis:
      "Endogenous Kalshi TOB displayed-size imbalance and short-horizon executable YES repricing "
      + "(complement-book semantics) — not calibration overconfidence and independent of lead-lag.",
    modulePathsPresent: [...modules.present, ...familyDefinition.present],
    modulePathsMissing: [...modules.missing, ...familyDefinition.missing],
    npmScriptsPresent: [
      "research:bid-size-coverage-audit",
      "research:quote-fidelity-gate",
      "research:static-parity-scan",
      "research:executable-confirmation-design",
      ...(familyDefinitionAvailable
        ? ["research:spread-liquidity-microstructure-family"]
        : []),
    ],
    familyDefinitionAvailable,
    causalSemanticsNotes: familyDefinitionAvailable
      ? [
          "M13.0a seals tob-size-imbalance-short-horizon-repricing-v1 with complement-book semantics.",
          "Event features use only information at/before event time; response match is post-event only.",
          "Ask size is complement of opposite bid (not independent depth); size decreases are not cancel/trade/withdrawal.",
          "BTC features are forbidden. Historical discovery/validation/holdout/promotion/freeze are not marked complete.",
        ]
      : [
          "Infrastructure audits exist, but no sealed microstructure alpha family definition/report module was found.",
          "Current capture is top-of-book oriented; full depth / order-flow is not established as available.",
          "M12.9 readiness inventory lists TOB-supported features only; no hypotheses are created here.",
        ],
    executableInputNotes: [
      "Best bid/ask, sizes, valid-book, sequence/resync counters are captured in forward TOB streams.",
      familyDefinitionAvailable
        ? "Primary economic evidence is one-contract executable bid/complement-ask response; midpoint is diagnostic; fees remain gross until bound."
        : "Parity/executable-confirmation designs exist as diagnostics, not a preregisterable entry rule.",
    ],
    multiplicity: familyDefinitionAvailable
      ? {
          status: "needs-work",
          returnHorizonCount: null,
          responseWindowCount: 3,
          magnitudeBinCount: 2,
          timeRemainingBinCount: 2,
          impliedProbabilityBinCount: null,
          atlasAxisGroupCount: null,
          momentumBucketCount: null,
          note:
            "Governed first-pass universe is hard-capped at 12 hypotheses "
            + "(2 |imbalance| thresholds × 3 response horizons × 2 time-remaining bins × 1 fixed direction). "
            + "No continuous threshold search, spread×imbalance, probability, hour, or volatility axes.",
        }
      : {
          status: "needs-definition",
          returnHorizonCount: null,
          responseWindowCount: null,
          magnitudeBinCount: null,
          timeRemainingBinCount: null,
          impliedProbabilityBinCount: null,
          atlasAxisGroupCount: null,
          momentumBucketCount: null,
          note:
            "No coded microstructure alpha search grid was found. "
            + "Do not invent an order-flow thesis from unavailable depth data.",
        },
    overlapsWithCalibrationFade: [
      "Forward-capture readiness includes calibrationFadeSpreadRealism gates.",
      "Cost-aware atlas can adjust calibration-style EV for spread — shared capture economics, different signal thesis if defined.",
    ],
    volatilityContiguityDependency: "not-established",
    volatilityContiguityNote:
      "Microstructure family as currently evidenced does not require completed-candle volatility windows.",
    microstructureDataSupport: dataSupport,
  };
}

export function inventoryMomentumFamily(io: NextFamilyReadinessIo): FamilyInventory {
  const modules = presentPaths(io, MOMENTUM_MODULES);
  const missingFamily = presentPaths(io, MOMENTUM_FAMILY_ANALYSIS_MISSING);
  const candleIntegrityPresent = io.fileExists(
    "src/lib/data/research/completedCandleWindowIntegrity/index.ts",
  );
  const momentumAxisGroups = 4; // momentumBuckets + momentumTime + momentumVolatility + momentumHour
  return {
    familyId: "momentum",
    displayName: "Momentum",
    maturity: modules.present.length >= 2 ? "needs-definition" : "not-established",
    independenceFromCalibrationFade: "medium",
    conceptualThesis:
      "Continuation/reversal from BTC (or market) returns over a lookback — distinct from probability calibration fade, "
      + "but currently only defined as atlas dimension buckets rather than a governed family evidence contract.",
    modulePathsPresent: modules.present,
    modulePathsMissing: [...modules.missing, ...missingFamily.missing],
    npmScriptsPresent: [],
    familyDefinitionAvailable: false,
    causalSemanticsNotes: [
      `Research momentum lookback defaults to ${DEFAULT_RESEARCH_MOMENTUM_LOOKBACK_BARS} one-minute bars `
        + `(strong/moderate thresholds ${MOMENTUM_STRONG_THRESHOLD_PERCENT}% / ${MOMENTUM_MODERATE_THRESHOLD_PERCENT}%).`,
      "Live feature momentum defaults differ from research 15m lookback — family contract must freeze one definition.",
      "No dedicated momentum family analysis CLI/report module was found.",
    ],
    executableInputNotes: [
      "Baseline simpleMomentumStrategyPlugin reads yes-ask (buy side).",
      "Atlas momentum cells feed the shared hypothesis-candidate path, not a sealed momentum confirmatory pipeline.",
    ],
    multiplicity: {
      status: "needs-work",
      returnHorizonCount: null,
      responseWindowCount: null,
      magnitudeBinCount: null,
      timeRemainingBinCount: null,
      impliedProbabilityBinCount: null,
      atlasAxisGroupCount: momentumAxisGroups,
      momentumBucketCount: MOMENTUM_BUCKET_DEFINITIONS.length,
      note:
        `${MOMENTUM_BUCKET_DEFINITIONS.length} momentum buckets across ${momentumAxisGroups} atlas axis groups `
        + "(momentumBuckets, momentumTime, momentumVolatility, momentumHour) "
        + "create a combinatorial search space. A prospective family must freeze a tiny pre-registered subset.",
    },
    overlapsWithCalibrationFade: [
      "Shares mispricing-atlas / hypothesis-candidate machinery and completed-candle windows used by fade volatility.",
      "Signal is return-based rather than calibration-gap based, but discovery path is coupled.",
    ],
    volatilityContiguityDependency: candleIntegrityPresent ? "needs-work" : "not-established",
    volatilityContiguityNote: candleIntegrityPresent
      ? "Any future momentum family using completed 1m candles should opt into requireContiguousWindow / expectedBarIntervalMs=60000. "
        + "Frozen calibration-fade v2 semantics must not be changed."
      : "completedCandleWindowIntegrity module not found; candle-window integrity dependency not established.",
  };
}

export function inventoryAllFamilies(io: NextFamilyReadinessIo): FamilyInventory[] {
  return [
    inventoryLeadLagFamily(io),
    inventoryMicrostructureFamily(io),
    inventoryMomentumFamily(io),
  ].sort((left, right) => left.familyId.localeCompare(right.familyId));
}

export function listEvaluatedFamilyIds(): ResearchFamilyId[] {
  return ["btc-kalshi-lead-lag", "momentum", "spread-liquidity-microstructure"];
}
