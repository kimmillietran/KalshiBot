import { stableStringify } from "@/lib/trading/config/hashConfig";

import { joinForwardCaptureSettlements } from "./joinForwardCaptureSettlements";
import {
  loadForwardSettlementJoinInputs,
} from "./loadForwardSettlementJoinInputs";
import { parseCapturedMarketSettlementKeys } from "./parseCapturedMarketSettlementKeys";
import {
  DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_PATH,
  DEFAULT_FORWARD_QUOTES_CAPTURE_DIR,
  DEFAULT_IMPORTS_DIR,
  DEFAULT_STATIC_PARITY_SCAN_PATH,
  FORWARD_SETTLEMENT_JOIN_CAVEATS,
  FORWARD_SETTLEMENT_JOIN_DISCLAIMER,
  type ForwardSettlementJoinConfig,
  type ForwardSettlementJoinIo,
  type ForwardSettlementJoinReport,
} from "./forwardSettlementJoinTypes";

export function buildForwardSettlementJoinReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: ForwardSettlementJoinConfig;
  io: ForwardSettlementJoinIo;
}): ForwardSettlementJoinReport {
  const missingArtifacts: string[] = [];

  if (!input.io.fileExists(input.config.forwardQuotesDir)) {
    missingArtifacts.push(input.config.forwardQuotesDir);
  }

  if (
    input.config.staticParityScanPath
    && !input.io.fileExists(input.config.staticParityScanPath)
  ) {
    missingArtifacts.push(input.config.staticParityScanPath);
  }

  if (
    input.config.bidOnlyCandidateLifecyclePath
    && !input.io.fileExists(input.config.bidOnlyCandidateLifecyclePath)
  ) {
    missingArtifacts.push(input.config.bidOnlyCandidateLifecyclePath);
  }

  const captured = parseCapturedMarketSettlementKeys({
    io: input.io,
    forwardQuotesDir: input.config.forwardQuotesDir,
    staticParityScanPath: input.config.staticParityScanPath,
    seriesTicker: input.config.seriesTicker,
  });

  const loaded = loadForwardSettlementJoinInputs({
    io: input.io,
    importsDir: input.config.importsDir,
    lifecyclePath: input.config.bidOnlyCandidateLifecyclePath,
    marketTickers: captured.markets.map((market) => market.marketTicker),
    missingArtifactPaths: missingArtifacts,
  });

  const joined = joinForwardCaptureSettlements({
    markets: captured.markets,
    settlementSource: loaded.settlements,
    episodes: loaded.episodes.episodes,
    evaluatedAt: input.generatedAt,
    inputArtifactsUsed: [
      ...captured.inputArtifactsUsed,
      ...(loaded.episodes.sourceArtifact ? [loaded.episodes.sourceArtifact] : []),
    ],
    missingArtifacts: loaded.missingArtifacts,
    warnings: [...captured.warnings, ...loaded.episodes.warnings],
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: FORWARD_SETTLEMENT_JOIN_DISCLAIMER,
    caveats: FORWARD_SETTLEMENT_JOIN_CAVEATS,
    config: input.config,
    summary: joined.summary,
    marketJoins: joined.marketJoins,
    episodeJoins: joined.episodeJoins,
  };
}

export function serializeForwardSettlementJoinReport(
  report: ForwardSettlementJoinReport,
): string {
  return stableStringify(report);
}

export function createDefaultForwardSettlementJoinConfig(
  overrides: Partial<ForwardSettlementJoinConfig> = {},
): ForwardSettlementJoinConfig {
  return {
    forwardQuotesDir: DEFAULT_FORWARD_QUOTES_CAPTURE_DIR,
    importsDir: DEFAULT_IMPORTS_DIR,
    staticParityScanPath: DEFAULT_STATIC_PARITY_SCAN_PATH,
    bidOnlyCandidateLifecyclePath: DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_PATH,
    seriesTicker: "KXBTC15M",
    ...overrides,
  };
}
