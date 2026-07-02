import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { parseResearchOutputJson } from "@/lib/data/research/aggregation/parseResearchOutputJson";
import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner/HistoricalResearchRunner";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

import { validateSerializedResearchOutputJson } from "./validateSerializedResearchOutputJson";

const MARKET_TICKER = "KXBTC15M-VALIDATOR-A";

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: { recordId: string; ticker: string; eventTime: string },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: "2026-06-27T01:00:00.000Z",
    observedAt: "2026-06-27T01:00:05.000Z",
    payload,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function completeMarketRecords(): RawHistoricalRecord[] {
  const eventTime = "2026-06-26T23:15:00.000Z";
  const closeTime = "2026-06-26T23:30:00.000Z";

  return [
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.MARKET,
      {
        open_time: eventTime,
        close_time: closeTime,
        floor_strike: 59_990.31,
        event_ticker: "KXBTC15M-EVENT",
        status: "closed",
      },
      { recordId: "market", ticker: MARKET_TICKER, eventTime },
    ),
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
      {
        open_time: eventTime,
        close_time: closeTime,
        yes_bid_cents: 48,
        yes_ask_cents: 52,
        no_bid_cents: 47,
        no_ask_cents: 51,
        volume_contracts: 120,
      },
      { recordId: "candle", ticker: MARKET_TICKER, eventTime: closeTime },
    ),
    baseBronze(
      DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
      {
        open_time: eventTime,
        close_time: closeTime,
        open_usd: 59_980.5,
        high_usd: 60_010.25,
        low_usd: 59_960.0,
        close_usd: 59_995.75,
        volume_btc: 12.5,
      },
      { recordId: "btc", ticker: MARKET_TICKER, eventTime: closeTime },
    ),
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: closeTime,
      },
      { recordId: "settlement", ticker: MARKET_TICKER, eventTime },
    ),
  ];
}

describe("validateSerializedResearchOutputJson", () => {
  it("accepts valid runner-format research output", () => {
    const strategyRegistry = StrategyPluginRegistry.createBuiltIn();
    const serialized = runHistoricalResearchFromBronze({
      bronzeRecords: completeMarketRecords(),
      strategy: strategyRegistry.resolveBacktestStrategy("noop", {}),
      engineConfig: DEFAULT_ENGINE_CONFIG,
      initialCashCents: 10_000,
      runId: "validator-run",
      durationMs: 1_000,
    }).serialized;

    expect(validateSerializedResearchOutputJson(serialized, MARKET_TICKER)).toEqual({
      ok: true,
      json: serialized,
    });
    expect(() => parseResearchOutputJson(serialized, MARKET_TICKER)).not.toThrow();
  });

  it("rejects undefined output", () => {
    expect(validateSerializedResearchOutputJson(undefined)).toEqual({
      ok: false,
      errorMessage: "Research runner returned empty or non-string output",
    });
  });

  it("rejects the literal undefined payload", () => {
    expect(validateSerializedResearchOutputJson("undefined")).toEqual({
      ok: false,
      errorMessage: "Research runner returned undefined output",
    });
  });

  it("rejects invalid nested researchRun JSON", () => {
    const json = JSON.stringify({
      dataset: JSON.stringify({ metadata: { marketTickers: [MARKET_TICKER] } }),
      researchRun: '{"durationMs":undefined}',
      metadata: { durationMs: 1000 },
    });

    expect(validateSerializedResearchOutputJson(json, MARKET_TICKER)).toEqual({
      ok: false,
      errorMessage: "researchRun contains invalid JSON",
    });
  });
});
