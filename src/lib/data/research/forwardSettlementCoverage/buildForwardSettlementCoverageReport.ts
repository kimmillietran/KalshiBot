import { posix } from "node:path";

import { resolveSeriesTicker } from "@/lib/data/audit/settlementTrace/settlementTraceUtils";
import { stableStringify } from "@/lib/trading/config/hashConfig";
import {
  joinForwardCaptureSettlements,
  loadKnownSettlementsFromImports,
} from "@/lib/data/research/forwardSettlementJoin";
import type { CapturedMarketSettlementKey } from "@/lib/data/research/forwardSettlementJoin/forwardSettlementJoinTypes";

import { runForwardSettlementBackfill } from "./backfillForwardSettlements";
import {
  classifyInvalidMarketEntry,
  classifyMarketSettlementCoverage,
  countByClassification,
} from "./classifyMarketSettlementCoverage";
import { extractSelectedRunMarketInventory } from "./extractSelectedRunMarketInventory";
import {
  FORWARD_SETTLEMENT_COVERAGE_CAVEATS,
  FORWARD_SETTLEMENT_COVERAGE_DISCLAIMER,
  type ForwardSettlementBackfillDeps,
  type ForwardSettlementCoverageConfig,
  type ForwardSettlementCoverageIo,
  type ForwardSettlementCoverageReport,
  type ForwardSettlementCoverageSummary,
  type ForwardSettlementJoinIntegration,
  type MarketSettlementCoverageEntry,
} from "./forwardSettlementCoverageTypes";

function safeShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function toCapturedMarketSettlementKey(
  entry: MarketSettlementCoverageEntry,
  selectedRunId: string,
): CapturedMarketSettlementKey {
  return {
    marketTicker: entry.marketTicker,
    eventTicker: entry.inventory.eventTicker,
    seriesTicker: resolveSeriesTicker(entry.marketTicker),
    openTime: entry.inventory.firstObservedAt,
    closeTime: entry.inventory.marketCloseTime,
    captureRunIds: [selectedRunId],
    sourceArtifacts: [...entry.inventory.sourceArtifacts],
  };
}

function buildJoinIntegration(input: {
  config: ForwardSettlementCoverageConfig;
  io: ForwardSettlementCoverageIo;
  markets: readonly MarketSettlementCoverageEntry[];
  selectedRunId: string;
  generatedAt: string;
  joinOutputPath: string | null;
}): ForwardSettlementJoinIntegration {
  const joinableMarkets = input.markets.filter(
    (market) => market.classification === "settlement-ready",
  );
  const capturedKeys = joinableMarkets.map((market) =>
    toCapturedMarketSettlementKey(market, input.selectedRunId),
  );

  const settlementSource = loadKnownSettlementsFromImports({
    io: input.io,
    importsDir: input.config.importsDir,
    marketTickers: capturedKeys.map((market) => market.marketTicker),
  });

  const joined = joinForwardCaptureSettlements({
    markets: capturedKeys,
    settlementSource,
    episodes: [],
    evaluatedAt: input.generatedAt,
    inputArtifactsUsed: [
      input.config.captureRunDir,
      ...settlementSource.sourceArtifacts,
    ],
    missingArtifacts: [],
    warnings: [],
    marketOnlyJoin: true,
  });

  const excluded = input.markets
    .filter((market) => market.classification !== "settlement-ready")
    .map((market) => ({
      marketTicker: market.marketTicker,
      reason: market.exclusionReason ?? market.classification,
    }));

  if (input.joinOutputPath && input.io.writeFile && input.io.mkdirSync) {
    const scopedJoinReport = {
      generatedAt: input.generatedAt,
      outputPath: input.joinOutputPath,
      analysisScope: "selected-run",
      selectedRunId: input.selectedRunId,
      selectedRunDirectory: input.config.captureRunDir,
      summary: joined.summary,
      marketJoins: joined.marketJoins,
      episodeJoins: joined.episodeJoins,
      marketsExcludedFromJoin: excluded,
    };
    input.io.mkdirSync(posix.dirname(input.joinOutputPath), { recursive: true });
    input.io.writeFile(input.joinOutputPath, stableStringify(scopedJoinReport));
  }

  return {
    overallVerdict: joined.summary.overallVerdict,
    recommendedNextAction: joined.summary.recommendedNextAction,
    settlementKnownMarketCount: joined.summary.settlementKnownMarketCount,
    settlementCoverageShare: joined.summary.settlementCoverageShare,
    marketsExcludedFromJoin: excluded,
    joinOutputPath: input.joinOutputPath,
  };
}

function resolveRecommendedNextAction(input: {
  markets: readonly MarketSettlementCoverageEntry[];
  coverageShare: number | null;
}): string {
  if (input.markets.length === 0) {
    return "rerun-after-capture";
  }

  const missing = countByClassification(input.markets, "missing-settlement-source");
  const stale = countByClassification(input.markets, "settlement-present-but-stale");
  const pending = countByClassification(input.markets, "market-not-yet-settled");
  const conflicts = countByClassification(
    input.markets,
    "settlement-present-but-conflicting",
  );

  if (conflicts > 0) {
    return "resolve-settlement-conflicts";
  }

  if (pending > 0) {
    return "wait-for-markets-to-settle";
  }

  if ((input.coverageShare ?? 0) < 1 && (missing > 0 || stale > 0)) {
    return "backfill-settlements";
  }

  if ((input.coverageShare ?? 0) >= 1) {
    return "build-outcome-study";
  }

  return "backfill-settlements";
}

function buildSummary(input: {
  config: ForwardSettlementCoverageConfig;
  selectedRunId: string;
  inventoryCount: number;
  markets: readonly MarketSettlementCoverageEntry[];
  joinIntegration: ForwardSettlementJoinIntegration;
  warnings: string[];
  errors: string[];
}): ForwardSettlementCoverageSummary {
  const realMarkets = input.markets.filter(
    (market) => market.classification !== "invalid-market",
  );
  const settledMarketCount = realMarkets.filter(
    (market) => market.classification === "settlement-ready",
  ).length;
  const joinedMarketCount = input.joinIntegration.settlementKnownMarketCount;
  const unresolvedMarketCount = realMarkets.filter(
    (market) => market.classification !== "settlement-ready",
  ).length;

  const coverageShare = safeShare(settledMarketCount, input.inventoryCount);

  return {
    analysisScope: "selected-run",
    selectedRunId: input.selectedRunId,
    selectedRunDirectory: input.config.captureRunDir,
    sourceRunIds: [input.selectedRunId],
    capturedMarketCount: input.inventoryCount,
    settledMarketCount,
    joinedMarketCount,
    unresolvedMarketCount,
    coverageShare,
    readyMarketCount: countByClassification(input.markets, "settlement-ready"),
    staleMarketCount: countByClassification(
      input.markets,
      "settlement-present-but-stale",
    ),
    conflictingMarketCount: countByClassification(
      input.markets,
      "settlement-present-but-conflicting",
    ),
    pendingMarketCount: countByClassification(input.markets, "market-not-yet-settled"),
    missingSourceMarketCount: countByClassification(
      input.markets,
      "missing-settlement-source",
    ),
    importFailedMarketCount: countByClassification(input.markets, "import-failed"),
    invalidMarketCount: countByClassification(input.markets, "invalid-market"),
    excludedFromJoinCount: input.joinIntegration.marketsExcludedFromJoin.length,
    recommendedNextAction: resolveRecommendedNextAction({
      markets: input.markets,
      coverageShare,
    }),
    warnings: input.warnings,
    errors: input.errors,
  };
}

function classifyExtractedMarkets(input: {
  config: ForwardSettlementCoverageConfig;
  io: ForwardSettlementCoverageIo;
  extracted: ReturnType<typeof extractSelectedRunMarketInventory>;
  evaluatedAt: string;
}): MarketSettlementCoverageEntry[] {
  return [
    ...input.extracted.inventory.map((inventory) =>
      classifyMarketSettlementCoverage({
        io: input.io,
        importsDir: input.config.importsDir,
        inventory,
        evaluatedAt: input.evaluatedAt,
        staleAfterCaptureObservation: input.config.staleAfterCaptureObservation,
      })),
    ...input.extracted.excludedTickers.map((entry) =>
      classifyInvalidMarketEntry(entry)),
  ].sort((left, right) => left.marketTicker.localeCompare(right.marketTicker));
}

/** Builds forward settlement coverage report for one selected capture run. */
export async function buildForwardSettlementCoverageReport(input: {
  generatedAt: string;
  config: ForwardSettlementCoverageConfig;
  io: ForwardSettlementCoverageIo;
  backfillDeps?: ForwardSettlementBackfillDeps;
  joinOutputPath?: string | null;
  runBackfill?: boolean;
}): Promise<ForwardSettlementCoverageReport> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const extracted = extractSelectedRunMarketInventory({
    io: input.io,
    captureRunDir: input.config.captureRunDir,
    evaluatedAt: input.generatedAt,
  });
  warnings.push(...extracted.warnings);

  let markets = classifyExtractedMarkets({
    config: input.config,
    io: input.io,
    extracted,
    evaluatedAt: input.generatedAt,
  });

  let backfill = null;
  if (input.runBackfill && input.backfillDeps) {
    backfill = await runForwardSettlementBackfill({
      config: input.config,
      io: input.io,
      markets,
      selectedRunId: extracted.selectedRunId,
      evaluatedAt: input.generatedAt,
      deps: input.backfillDeps,
    });

    markets = classifyExtractedMarkets({
      config: input.config,
      io: input.io,
      extracted,
      evaluatedAt: input.generatedAt,
    });
  }

  const joinIntegration = buildJoinIntegration({
    config: input.config,
    io: input.io,
    markets,
    selectedRunId: extracted.selectedRunId,
    generatedAt: input.generatedAt,
    joinOutputPath: input.joinOutputPath ?? null,
  });

  const summary = buildSummary({
    config: input.config,
    selectedRunId: extracted.selectedRunId,
    inventoryCount: extracted.inventory.length,
    markets,
    joinIntegration,
    warnings,
    errors,
  });

  return {
    generatedAt: input.generatedAt,
    artifactGeneratedAt: input.generatedAt,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    disclaimer: FORWARD_SETTLEMENT_COVERAGE_DISCLAIMER,
    caveats: FORWARD_SETTLEMENT_COVERAGE_CAVEATS,
    config: input.config,
    summary,
    inventory: extracted.inventory,
    markets,
    joinIntegration,
    backfill,
  };
}

export function serializeForwardSettlementCoverageReport(
  report: ForwardSettlementCoverageReport,
): string {
  return stableStringify(report);
}
