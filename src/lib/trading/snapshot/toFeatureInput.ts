import type { FeatureExtractionInput } from "@/lib/features/types";
import type { EvaluationSnapshot } from "@/types/domain/trading";

import { parseVolumeLabelDollars } from "./parseVolumeDollars";

function snapshotCandlesToFeatureCandles(
  candles: NonNullable<EvaluationSnapshot["btc"]>["candles"],
): FeatureExtractionInput["candles"] {
  return candles.map((candle) => ({
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

/**
 * Maps a validated `EvaluationSnapshot` into feature-builder inputs.
 * Caller must ensure guards have passed — market, btc, pricing, and strike are present.
 */
export function snapshotToFeatureInput(
  snapshot: EvaluationSnapshot,
): FeatureExtractionInput {
  const { market, btc, pricing } = snapshot;

  if (!market || !btc || !pricing || market.strikePrice == null) {
    throw new Error("snapshotToFeatureInput requires market, btc, pricing, and strike");
  }

  const evaluatedAtMs = Date.parse(snapshot.evaluatedAt);
  if (!Number.isFinite(evaluatedAtMs)) {
    throw new Error(`Invalid evaluatedAt: ${snapshot.evaluatedAt}`);
  }

  return {
    evaluatedAtMs,
    spotPrice: btc.price,
    candles: snapshotCandlesToFeatureCandles(btc.candles),
    market: {
      strikePrice: market.strikePrice,
      timeRemainingMs: market.timeRemainingMs,
      closeTime: market.closeTime,
    },
    pricing: {
      yesBidCents: pricing.yesBidCents,
      yesAskCents: pricing.yesAskCents,
      noBidCents: pricing.noBidCents,
      noAskCents: pricing.noAskCents,
      volumeDollars: pricing.volumeDollars,
      liquidityQuality: pricing.liquidityQuality,
    },
  };
}

export { parseVolumeLabelDollars };
