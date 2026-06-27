"use client";

import { useMemo } from "react";

import { useBtcFeedContext } from "@/features/btc-feed/BtcFeedProvider";
import { useActiveBtcMarket } from "@/features/market-data";
import {
  DEFAULT_ENGINE_CONFIG,
  evaluate,
} from "@/lib/trading";
import type { EvaluationSnapshot, TradeDecision } from "@/types/domain/trading";

import { buildEvaluationSnapshot } from "../mapping/buildEvaluationSnapshot";

export type TradeDecisionState = {
  snapshot: EvaluationSnapshot;
  decision: TradeDecision;
  isConnected: boolean;
};

function resolveEvaluatedAt(
  btcUpdatedAt: Date | null,
  marketUpdatedAt: string | undefined,
  pricingUpdatedAt: string | undefined,
): string {
  const candidates = [
    btcUpdatedAt?.toISOString(),
    pricingUpdatedAt,
    marketUpdatedAt,
  ].filter((value): value is string => Boolean(value));

  return candidates[0] ?? new Date(0).toISOString();
}

/** Builds an `EvaluationSnapshot` from live feeds and runs the pure engine. */
export function useTradeDecision(): TradeDecisionState {
  const btc = useBtcFeedContext();
  const market = useActiveBtcMarket();

  return useMemo(() => {
    const evaluatedAt = resolveEvaluatedAt(
      btc.lastUpdated,
      market.market?.updatedAt,
      market.pricing?.updatedAt,
    );

    const snapshot = buildEvaluationSnapshot({
      evaluatedAt,
      noMarket: market.noMarket,
      market: market.market,
      pricing: market.pricing,
      btc: {
        price: btc.price,
        change24hPercent: btc.change24hPercent,
        status: btc.status,
        isUsingFallback: btc.isUsingFallback,
        candles: btc.candles,
      },
    });

    const decision = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);

    return {
      snapshot,
      decision,
      isConnected: true,
    };
  }, [
    btc.candles,
    btc.change24hPercent,
    btc.isUsingFallback,
    btc.lastUpdated,
    btc.price,
    btc.status,
    market.market,
    market.noMarket,
    market.pricing,
  ]);
}
