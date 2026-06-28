"use client";

import { useEffect, useRef, useState } from "react";

import { fetchKalshiOrderbook } from "../api/kalshiOrderbookClient";
import { KALSHI_WS_URL } from "../orderbook/constants";
import { KalshiOrderbookWsClient } from "../orderbook/KalshiOrderbookWsClient";
import { OrderbookFeedController } from "../orderbook/OrderbookFeedController";
import type { OrderbookFeedSnapshot } from "../orderbook/types";

const IDLE_SNAPSHOT: OrderbookFeedSnapshot = {
  ticker: null,
  status: "idle",
  pricing: null,
  topOfBook: null,
  lastSeq: null,
  lastUpdateAt: null,
  errorMessage: null,
};

/** Subscribes to deterministic in-memory orderbook pricing for a market ticker. */
export function useOrderbookFeed(ticker: string | null): OrderbookFeedSnapshot {
  const controllerRef = useRef<OrderbookFeedController | null>(null);
  const [snapshot, setSnapshot] = useState<OrderbookFeedSnapshot>(IDLE_SNAPSHOT);

  useEffect(() => {
    if (!ticker) {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      return;
    }

    const controller = new OrderbookFeedController({
      transport: new KalshiOrderbookWsClient(),
      wsUrl: KALSHI_WS_URL,
      fetchSnapshot: async (activeTicker) => {
        const response = await fetchKalshiOrderbook(activeTicker);
        return {
          yesLevels: response.yesLevels,
          noLevels: response.noLevels,
        };
      },
    });

    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(setSnapshot);

    void controller.start(ticker).catch(() => {
      // REST/WS failures are surfaced through snapshot status + errorMessage.
    });

    return () => {
      unsubscribe();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [ticker]);

  if (!ticker) {
    return IDLE_SNAPSHOT;
  }

  return snapshot;
}
