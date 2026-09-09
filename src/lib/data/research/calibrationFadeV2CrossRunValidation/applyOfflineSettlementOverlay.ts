import { loadKnownSettlementsFromImports } from "../forwardSettlementJoin/loadForwardSettlementJoinInputs";
import { deriveV2NoHoldToSettlementReturns } from "../calibrationFadeV2ForwardValidation/deriveV2NoHoldToSettlementReturns";

import type { SealedV2CandidateMarket } from "./admitV2ConfirmatoryRuns";
import {
  CalibrationFadeV2CrossRunValidationError,
  type CalibrationFadeV2CrossRunValidationIo,
} from "./calibrationFadeV2CrossRunValidationTypes";
import {
  assertV2ExecutableReturnPairIntegrity,
  isV2ExecutableReturnEvaluable,
} from "./v2ExecutableReturnIntegrity";

function resolveOverlayExecutableReturns(input: {
  market: SealedV2CandidateMarket;
  settledOutcome: string;
}): {
  grossReturnCents: number | null;
  feeAdjustedReturnCents: number | null;
} {
  // Trusted sealed executable evidence is immutable once present.
  if (isV2ExecutableReturnEvaluable(input.market)) {
    return {
      grossReturnCents: input.market.grossReturnCents,
      feeAdjustedReturnCents: input.market.feeAdjustedReturnCents,
    };
  }

  return deriveV2NoHoldToSettlementReturns({
    noAskCents: input.market.noAskCents,
    executableAvailable: input.market.executableAvailable,
    settledOutcome: input.settledOutcome,
  });
}

/**
 * Offline settlement overlay on already-admitted candidate tickers only.
 * Does not change evidence mode, admission, candidate membership, or entry time.
 * When settlement becomes known and sealed executable returns are absent, derives
 * the same NO hold-to-settlement returns as the single-run v2 evaluator.
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
      const returns = resolveOverlayExecutableReturns({
        market,
        settledOutcome: sealedOutcome,
      });
      const overlaid = {
        ...market,
        settlementStatus: settlement.settlementStatus,
        settledOutcome: sealedOutcome,
        marketTicker: market.marketTicker,
        entryTimestamp: market.entryTimestamp,
        noAskCents: market.noAskCents,
        executableAvailable: market.executableAvailable,
        grossReturnCents: returns.grossReturnCents,
        feeAdjustedReturnCents: returns.feeAdjustedReturnCents,
      };
      assertV2ExecutableReturnPairIntegrity(
        overlaid,
        `Overlay market ${market.marketTicker}`,
      );
      return overlaid;
    }
    const settledOutcome = settlement.settledOutcome;
    const calibrationGapSigned =
      settledOutcome === "yes" || settledOutcome === "no"
        ? market.impliedYesProbability - (settledOutcome === "yes" ? 1 : 0)
        : market.calibrationGapSigned;
    const returns = resolveOverlayExecutableReturns({
      market,
      settledOutcome,
    });
    const overlaid = {
      ...market,
      settlementStatus: settlement.settlementStatus,
      settledOutcome,
      calibrationGapSigned,
      marketTicker: market.marketTicker,
      entryTimestamp: market.entryTimestamp,
      noAskCents: market.noAskCents,
      executableAvailable: market.executableAvailable,
      grossReturnCents: returns.grossReturnCents,
      feeAdjustedReturnCents: returns.feeAdjustedReturnCents,
    };
    assertV2ExecutableReturnPairIntegrity(
      overlaid,
      `Overlay market ${market.marketTicker}`,
    );
    return overlaid;
  });

  return {
    markets,
    overlayApplied: true,
    overlaySourceArtifacts: loaded.sourceArtifacts,
  };
}
