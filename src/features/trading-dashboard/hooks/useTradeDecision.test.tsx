import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BtcFeedProvider } from "@/features/btc-feed";
import {
  MarketDataProvider,
  useActiveBtcMarket,
} from "@/features/market-data";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { hashConfig } from "@/lib/trading/config/hashConfig";
import { mockDashboardApiFetch } from "@/test/test-utils";
import { QueryTestProvider } from "@/test/query-test-utils";

import { resolvedSettingsFromInput } from "../test-fixtures/tradingSettings";
import { buildEngineConfigFromSettings } from "../utils/buildEngineConfigFromSettings";
import { useTradeDecision } from "./useTradeDecision";

function BtcFeedWithMarketTarget({ children }: { children: ReactNode }) {
  const { targetPrice } = useActiveBtcMarket();
  return <BtcFeedProvider targetPrice={targetPrice}>{children}</BtcFeedProvider>;
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryTestProvider>
      <MarketDataProvider>
        <BtcFeedWithMarketTarget>{children}</BtcFeedWithMarketTarget>
      </MarketDataProvider>
    </QueryTestProvider>
  );
}

describe("useTradeDecision", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns NO TRADE from live feeds via renderHook", async () => {
    mockDashboardApiFetch();

    const { result } = renderHook(
      () => useTradeDecision(resolvedSettingsFromInput()),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.decision.action).toBe("NO TRADE");
      expect(result.current.snapshot.market?.strikePrice).toBe(59_990.31);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.snapshot.btc?.price).toBeGreaterThan(0);
    expect(result.current.decision.reasoning.steps.length).toBeGreaterThan(0);
  });

  it("maps candle timestamps from chart points when available", async () => {
    mockDashboardApiFetch();

    const { result } = renderHook(
      () => useTradeDecision(resolvedSettingsFromInput()),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.snapshot.btc?.candles.length).toBeGreaterThan(0);
    });

    for (const candle of result.current.snapshot.btc?.candles ?? []) {
      expect(candle.timestamp).toBeGreaterThan(0);
    }
  });

  it("passes resolved min edge threshold into the engine config", async () => {
    mockDashboardApiFetch();
    const resolved = resolvedSettingsFromInput({ minEdgePercent: 9 });

    const { result } = renderHook(() => useTradeDecision(resolved), { wrapper });

    await waitFor(() => {
      expect(result.current.decision.configHash).toBe(
        hashConfig(buildEngineConfigFromSettings(resolved)),
      );
    });

    expect(DEFAULT_ENGINE_CONFIG.minEdgePercent).not.toBe(9);
  });
});
