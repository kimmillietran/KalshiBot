import { loadKnownSettlementsFromImports } from "../forwardSettlementJoin/loadForwardSettlementJoinInputs";

import type { SealedV2CandidateMarket } from "./admitV2ConfirmatoryRuns";
import {
  CalibrationFadeV2CrossRunValidationError,
  type CalibrationFadeV2CrossRunValidationIo,
} from "./calibrationFadeV2CrossRunValidationTypes";
import { assertV2ExecutableReturnPairIntegrity } from "./v2ExecutableReturnIntegrity";

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
    for (const market of input.markets) {
      assertV2ExecutableReturnPairIntegrity(market, `Sealed market ${market.marketTicker}`);
    }
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
    assertV2ExecutableReturnPairIntegrity(market, `Sealed market ${market.marketTicker}`);
    const settlement = loaded.settlementsByMarket.get(market.marketTicker);
    if (!settlement) {
      return { ...market };
    }
    const sealedOutcome = market.settledOutcome;
    if (sealedOutcome === "yes" || sealedOutcome === "no") {
      if (settlement.settledOutcome !== sealedOutcome) {
        throw new CalibrationFadeV2CrossRunValidationError(
          `Offline settlement overlay conflicts with sealed outcome for ${market.marketTicker}: `
            + `sealed=${sealedOutcome} import=${settlement.settledOutcome}`,
        );
      }
      return {
        ...market,
        settlementStatus: settlement.settlementStatus,
        settledOutcome: sealedOutcome,
        marketTicker: market.marketTicker,
        entryTimestamp: market.entryTimestamp,
        noAskCents: market.noAskCents,
        executableAvailable: market.executableAvailable,
        grossReturnCents: market.grossReturnCents,
        feeAdjustedReturnCents: market.feeAdjustedReturnCents,
      };
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
      marketTicker: market.marketTicker,
      entryTimestamp: market.entryTimestamp,
      noAskCents: market.noAskCents,
      executableAvailable: market.executableAvailable,
      grossReturnCents: market.grossReturnCents,
      feeAdjustedReturnCents: market.feeAdjustedReturnCents,
    };
  });

  return {
    markets,
    overlayApplied: true,
    overlaySourceArtifacts: loaded.sourceArtifacts,
  };
}
