import type { BtcFeedStatus } from "@/features/btc-feed/types";
import type {
  ActiveBtcMarket,
  MarketContractPricing,
} from "@/features/market-data/types";
import { parseVolumeLabelDollars } from "@/lib/trading/snapshot/parseVolumeDollars";
import type {
  BtcFeedStatus as DomainBtcFeedStatus,
  EvaluationSnapshot,
} from "@/types/domain/trading";

import { mapFeatureLifecycleToDomain } from "./mapLifecycle";

export type BuildEvaluationSnapshotInput = {
  evaluatedAt: string;
  noMarket: boolean;
  market: ActiveBtcMarket | null;
  pricing: MarketContractPricing | null;
  btc: {
    price: number;
    change24hPercent: number;
    status: BtcFeedStatus;
    isUsingFallback: boolean;
    candles: readonly {
      timestamp: number;
      open: number;
      high: number;
      low: number;
      close: number;
    }[];
  } | null;
};

function mapBtcFeedStatus(status: BtcFeedStatus): DomainBtcFeedStatus {
  return status;
}

function mapProviderSource(
  status: BtcFeedStatus,
  isUsingFallback: boolean,
): "fallback" | "upstream" | "unknown" {
  if (isUsingFallback || status === "fallback") {
    return "fallback";
  }
  if (status === "live" || status === "stale") {
    return "upstream";
  }
  return "unknown";
}

function pickEvaluatedAt(
  explicit: string,
  market: ActiveBtcMarket | null,
  pricing: MarketContractPricing | null,
): string {
  const candidates = [
    explicit,
    pricing?.updatedAt,
    market?.updatedAt,
  ].filter((value): value is string => Boolean(value));

  return candidates[0] ?? explicit;
}

/**
 * Maps live dashboard feed state into the pure engine `EvaluationSnapshot`.
 */
export function buildEvaluationSnapshot(
  input: BuildEvaluationSnapshotInput,
): EvaluationSnapshot {
  const { evaluatedAt, noMarket, market, pricing, btc } = input;

  const snapshotMarket =
    noMarket || !market
      ? null
      : {
          ticker: market.ticker,
          lifecycle: mapFeatureLifecycleToDomain(market.lifecycle),
          strikePrice: market.targetPrice,
          timeRemainingMs: market.timeRemainingMs,
          closeTime: market.closeTime,
        };

  const snapshotBtc =
    btc === null
      ? null
      : {
          price: btc.price,
          change24hPercent: btc.change24hPercent,
          feedStatus: mapBtcFeedStatus(btc.status),
          providerSource: mapProviderSource(btc.status, btc.isUsingFallback),
          candles: btc.candles.map((candle) => ({
            timestamp: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        };

  const snapshotPricing =
    pricing === null
      ? null
      : {
          yesBidCents: pricing.yes.bidCents,
          yesAskCents: pricing.yes.askCents,
          yesMidCents: pricing.yes.midCents,
          noBidCents: pricing.no.bidCents,
          noAskCents: pricing.no.askCents,
          noMidCents: pricing.no.midCents,
          liquidityQuality: pricing.liquidityQuality,
          volumeDollars: parseVolumeLabelDollars(pricing.volumeLabel),
        };

  return {
    evaluatedAt: pickEvaluatedAt(evaluatedAt, market, pricing),
    market: snapshotMarket,
    btc: snapshotBtc,
    pricing: snapshotPricing,
  };
}
