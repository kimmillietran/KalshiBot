import { loadKnownSettlementsFromImports } from "../forwardSettlementJoin/loadForwardSettlementJoinInputs";

import type { SealedV2CandidateMarket } from "./admitV2ConfirmatoryRuns";
import type { CalibrationFadeV2CrossRunValidationIo } from "./calibrationFadeV2CrossRunValidationTypes";

/**
 * Offline settlement overlay on already-admitted candidate tickers only.
 * Does not change evidence mode, admission, candidate membership, or entry time.
 */
export function applyOfflineSettlementOverlay(input: {
  io: CalibrationFadeV2CrossRunValidationIo;
  importsDir: string | null;
  markets: readonly SealedV2CandidateMarket[];
}): {
  markets: SealedV2CandidateMarket[];
  overlayApplied: boolean;
  overlaySourceArtifacts: readonly string[];
} {
  if (!input.importsDir) {
    return {
      markets: [...input.markets],
      overlayApplied: false,
      overlaySourceArtifacts: [],
    };
  }

  const admittedTickers = input.markets.map((market) => market.marketTicker);
  const loaded = loadKnownSettlementsFromImports({
    io: {
      readFile: input.io.readFile,
      fileExists: input.io.fileExists,
      readdir: input.io.readdir ?? (() => []),
      isDirectory: input.io.isDirectory,
    },
    importsDir: input.importsDir,
    marketTickers: admittedTickers,
  });

  const markets = input.markets.map((market) => {
    const settlement = loaded.settlementsByMarket.get(market.marketTicker);
    if (!settlement) {
      return { ...market };
    }
    const settledOutcome = settlement.settledOutcome;
    const calibrationGapSigned =
      settledOutcome === "yes" || settledOutcome === "no"
        ? market.impliedYesProbability - (settledOutcome === "yes" ? 1 : 0)
        : market.calibrationGapSigned;
    return {
      ...market,
      settlementStatus: settlement.settlementStatus,
      settledOutcome,
      calibrationGapSigned,
    };
  });

  return {
    markets,
    overlayApplied: true,
    overlaySourceArtifacts: loaded.sourceArtifacts,
  };
}
