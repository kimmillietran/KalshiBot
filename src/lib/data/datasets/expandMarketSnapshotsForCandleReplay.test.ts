import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
} from "@/lib/data/snapshots/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import { adaptHistoricalSnapshot } from "@/lib/data/replay/adaptHistoricalSnapshot";
import { ReplaySession } from "@/lib/data/replay/ReplaySession";
import { BacktestStrategyRunner } from "@/lib/data/backtesting/BacktestStrategyRunner";
import { adaptStrategyPluginToBacktestStrategy } from "@/lib/data/strategies/plugin/adaptStrategyPlugin";
import { buyBelowProbabilityStrategyPlugin } from "@/lib/data/strategies/plugin/builtins/buyBelowProbabilityStrategyPlugin";
import { fairValueDiffusionStrategyPlugin } from "@/lib/data/strategies/plugin/builtins/fairValueDiffusionStrategyPlugin";
import { DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG } from "@/lib/data/backtesting/strategyTypes";
import {
  buildHistoricalDataset,
} from "./HistoricalDatasetBuilder";
import { expandMarketSnapshotsForCandleReplay } from "./expandMarketSnapshotsForCandleReplay";
import { DATASET_BRONZE_CONTENT_TYPE } from "./datasetTypes";
import type { RawHistoricalRecord } from "@/lib/data/types";

const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const TICKER = "KXBTC15M-EXPAND";
const WINDOW_CLOSE = "2026-04-30T19:15:00.000Z";

function envelope<T>(
  record: T,
  provenance: SilverRecordEnvelope<T>["provenance"],
): SilverRecordEnvelope<T> {
  return { record, provenance };
}

function createMultiCandleSnapshot(): HistoricalTradingSnapshot {
  const marketProvenance = {
    source: DataSource.KALSHI_REST,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    fetchId: "fetch-market",
  };

  const candleSpecs = [
    {
      openTime: "2026-04-30T19:00:00.000Z",
      closeTime: "2026-04-30T19:01:00.000Z",
      yesBidCents: 48,
      yesAskCents: 52,
    },
    {
      openTime: "2026-04-30T19:01:00.000Z",
      closeTime: "2026-04-30T19:02:00.000Z",
      yesBidCents: 44,
      yesAskCents: 46,
    },
    {
      openTime: "2026-04-30T19:02:00.000Z",
      closeTime: "2026-04-30T19:03:00.000Z",
      yesBidCents: 0,
      yesAskCents: 0,
    },
  ] as const;

  const marketWindow = {
    eventTime: candleSpecs[0]!.openTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    ticker: TICKER,
    seriesTicker: "KXBTC15M",
    openTime: candleSpecs[0]!.openTime,
    closeTime: WINDOW_CLOSE,
    strikePriceUsd: 59_990.31,
    status: "open" as const,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const kalshiCandles = candleSpecs.map((spec, index) => ({
    eventTime: spec.openTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    ticker: TICKER,
    openTime: spec.openTime,
    closeTime: spec.closeTime,
    yesBidCents: spec.yesBidCents,
    yesAskCents: spec.yesAskCents,
    noBidCents: 100 - spec.yesAskCents,
    noAskCents: 100 - spec.yesBidCents,
    volumeContracts: 100 + index,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  }));

  const btcBars = candleSpecs.map((spec, index) => ({
    eventTime: spec.openTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    openTime: spec.openTime,
    closeTime: spec.closeTime,
    openUsd: 59_980 + index,
    highUsd: 60_010 + index,
    lowUsd: 59_960 + index,
    closeUsd: 59_995 + index,
    volumeBtc: 10 + index,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  }));

  const candleProvenance = (index: number) => ({
    source: DataSource.KALSHI_CANDLES,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    fetchId: `fetch-candle-${index}`,
  });

  const btcProvenance = (index: number) => ({
    source: DataSource.BINANCE_SPOT,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    fetchId: `fetch-btc-${index}`,
  });

  return assembleHistoricalTradingSnapshot({
    marketWindow: envelope(marketWindow, marketProvenance),
    kalshiCandles: kalshiCandles.map((record, index) =>
      envelope(record, candleProvenance(index)),
    ),
    btcBars: btcBars.map((record, index) => envelope(record, btcProvenance(index))),
  });
}

function baseBronze(
  contentType: string,
  payload: Record<string, unknown>,
  options: {
    recordId: string;
    ticker: string;
    eventTime: string;
    source?: (typeof DataSource)[keyof typeof DataSource];
  },
): RawHistoricalRecord {
  return {
    recordId: options.recordId,
    ticker: options.ticker,
    contentType,
    eventTime: options.eventTime,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    payload,
    provenance: {
      source: options.source ?? DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: `fetch-${options.recordId}`,
    },
  };
}

function multiCandleBronzeRecords(
  ticker: string,
  candleQuotes: readonly { yesBid: number; yesAsk: number }[],
): RawHistoricalRecord[] {
  const openTime = "2026-04-30T19:00:00.000Z";
  const records: RawHistoricalRecord[] = [
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.MARKET,
      {
        open_time: openTime,
        close_time: WINDOW_CLOSE,
        floor_strike: 59_990.31,
        event_ticker: "KXBTC15M-EVENT",
        status: "closed",
      },
      { recordId: "market", ticker, eventTime: openTime },
    ),
  ];

  candleQuotes.forEach((quote, index) => {
    const candleOpen = new Date(Date.parse(openTime) + index * 60_000).toISOString();
    const candleClose = new Date(Date.parse(openTime) + (index + 1) * 60_000).toISOString();

    records.push(
      baseBronze(
        SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
        {
          open_time: candleOpen,
          close_time: candleClose,
          yes_bid_cents: quote.yesBid,
          yes_ask_cents: quote.yesAsk,
          no_bid_cents: 100 - quote.yesAsk,
          no_ask_cents: 100 - quote.yesBid,
          volume_contracts: 100,
        },
        {
          recordId: `candle-${index}`,
          ticker,
          eventTime: candleClose,
          source: DataSource.KALSHI_CANDLES,
        },
      ),
      baseBronze(
        DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE,
        {
          open_time: candleOpen,
          close_time: candleClose,
          open_usd: 59_980 + index,
          high_usd: 60_010 + index,
          low_usd: 59_960 + index,
          close_usd: 59_995 + index,
          volume_btc: 10,
        },
        {
          recordId: `btc-${index}`,
          ticker,
          eventTime: candleClose,
          source: DataSource.BINANCE_SPOT,
        },
      ),
    );
  });

  records.push(
    baseBronze(
      SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
      {
        floor_strike: 59_990.31,
        expiration_value: "60010.25",
        result: "yes",
        settlement_ts: WINDOW_CLOSE,
      },
      { recordId: "settlement", ticker, eventTime: openTime },
    ),
  );

  return records;
}

describe("expandMarketSnapshotsForCandleReplay", () => {
  it("expands one market snapshot into one snapshot per Kalshi candle", () => {
    const expanded = expandMarketSnapshotsForCandleReplay(createMultiCandleSnapshot());

    expect(expanded).toHaveLength(3);
    expect(expanded.map((snapshot) => snapshot.kalshiCandles.length)).toEqual([1, 2, 3]);
    expect(expanded.map((snapshot) => snapshot.btcBars.length)).toEqual([1, 2, 3]);
  });

  it("uses current-candle pricing instead of terminal pricing", () => {
    const expanded = expandMarketSnapshotsForCandleReplay(createMultiCandleSnapshot());

    const pricingByStep = expanded.map(
      (snapshot) => adaptHistoricalSnapshot(snapshot).engineInput.pricing,
    );

    expect(pricingByStep[0]).toMatchObject({
      yesBidCents: 48,
      yesAskCents: 52,
      yesMidCents: 50,
    });
    expect(pricingByStep[1]).toMatchObject({
      yesBidCents: 44,
      yesAskCents: 46,
      yesMidCents: 45,
    });
    expect(pricingByStep[2]).toMatchObject({
      yesBidCents: 0,
      yesAskCents: 0,
      yesMidCents: 0,
    });
  });

  it("anchors temporal observedAt to the current candle close time", () => {
    const expanded = expandMarketSnapshotsForCandleReplay(createMultiCandleSnapshot());

    expect(expanded[0]!.temporal.observedAt).toBe("2026-04-30T19:01:00.000Z");
    expect(expanded[1]!.temporal.observedAt).toBe("2026-04-30T19:02:00.000Z");
    expect(expanded[2]!.temporal.observedAt).toBe("2026-04-30T19:03:00.000Z");
  });

  it("omits settlement until the final candle snapshot", () => {
    const snapshot = createMultiCandleSnapshot();
    const withSettlement = assembleHistoricalTradingSnapshot({
      marketWindow: {
        record: snapshot.marketWindow,
        provenance: snapshot.provenance.marketWindow,
      },
      kalshiCandles: snapshot.kalshiCandles.map((record, index) => ({
        record,
        provenance: snapshot.provenance.kalshiCandles[index]!,
      })),
      btcBars: snapshot.btcBars.map((record, index) => ({
        record,
        provenance: snapshot.provenance.btcBars[index]!,
      })),
      settlement: {
        record: {
          eventTime: WINDOW_CLOSE,
          collectionTime: COLLECTION_TIME,
          observedAt: OBSERVED_AT,
          ticker: TICKER,
          strikePriceUsd: 59_990.31,
          settledAt: WINDOW_CLOSE,
          result: "yes" as const,
          settlementPriceUsd: 60_000,
          qualityFlags: [],
          datasetVersion: DATA_CONTRACT_VERSION,
        },
        provenance: {
          source: DataSource.KALSHI_REST,
          collectionTime: COLLECTION_TIME,
          observedAt: OBSERVED_AT,
          fetchId: "fetch-settlement",
        },
      },
    });

    const expanded = expandMarketSnapshotsForCandleReplay(withSettlement);

    expect(expanded[0]!.settlement).toBeNull();
    expect(expanded[1]!.settlement).toBeNull();
    expect(expanded[2]!.settlement).not.toBeNull();
  });

  it("preserves deterministic ordering across repeated expansion", () => {
    const snapshot = createMultiCandleSnapshot();
    const first = expandMarketSnapshotsForCandleReplay(snapshot);
    const second = expandMarketSnapshotsForCandleReplay(snapshot);

    expect(first.map((entry) => entry.temporal.observedAt)).toEqual(
      second.map((entry) => entry.temporal.observedAt),
    );
  });
});

describe("buildHistoricalDataset candle replay expansion", () => {
  it("builds one replay snapshot per Kalshi candle", () => {
    const ticker = "KXBTC15M-MULTI-CANDLE";
    const dataset = buildHistoricalDataset(
      multiCandleBronzeRecords(ticker, [
        { yesBid: 50, yesAsk: 52 },
        { yesBid: 44, yesAsk: 46 },
        { yesBid: 61, yesAsk: 63 },
      ]),
    );

    expect(dataset.snapshots).toHaveLength(3);
    expect(dataset.metadata.snapshotCount).toBe(3);
    expect(new Set(dataset.snapshots.map((snapshot) => snapshot.ticker))).toEqual(
      new Set([ticker]),
    );
  });

  it("drives replay steps with candle-aligned pricing", () => {
    const ticker = "KXBTC15M-REPLAY-PRICING";
    const dataset = buildHistoricalDataset(
      multiCandleBronzeRecords(ticker, [
        { yesBid: 50, yesAsk: 52 },
        { yesBid: 44, yesAsk: 46 },
        { yesBid: 0, yesAsk: 0 },
      ]),
    );

    const session = ReplaySession.create(dataset.snapshots);
    const { results } = session.stepAll();

    expect(results).toHaveLength(3);
    expect(results.map((step) => step.engineInput.pricing.yesAskCents)).toEqual([
      52, 46, 0,
    ]);
    expect(results.map((step) => step.engineInput.pricing.yesMidCents)).toEqual([
      51, 45, 0,
    ]);
    expect(results.map((step) => step.engineInput.btc.price)).toEqual([
      59_995, 59_996, 59_997,
    ]);
  });

  it("records candle-aligned decision trace pricing for buy-below-probability", () => {
    const dataset = buildHistoricalDataset(
      multiCandleBronzeRecords("KXBTC15M-BUY-BELOW", [
        { yesBid: 50, yesAsk: 52 },
        { yesBid: 44, yesAsk: 46 },
        { yesBid: 0, yesAsk: 0 },
      ]),
    );
    const { results } = ReplaySession.create(dataset.snapshots).stepAll();
    const strategy = adaptStrategyPluginToBacktestStrategy(buyBelowProbabilityStrategyPlugin, {
      maxYesMidCents: 50,
      quantity: 1,
    });

    const run = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [...results],
      strategy,
      fillConfig: DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    });

    expect(run.decisionTrace.map((entry) => entry.yesAsk)).toEqual([52, 46, 0]);
    expect(run.decisionTrace[0]!.action).toBe("hold");
    expect(run.decisionTrace[1]!.action).toBe("buy_yes");
    expect(run.steps[1]!.acceptedFills[0]).toMatchObject({
      priceCents: 46,
      quantity: 1,
    });
  });

  it("aligns fair-value-diffusion pricing and BTC data per candle", () => {
    const dataset = buildHistoricalDataset(
      multiCandleBronzeRecords("KXBTC15M-FAIR-VALUE", [
        { yesBid: 50, yesAsk: 52 },
        { yesBid: 44, yesAsk: 46 },
      ]),
    );
    const { results } = ReplaySession.create(dataset.snapshots).stepAll();
    const strategy = adaptStrategyPluginToBacktestStrategy(fairValueDiffusionStrategyPlugin, {
      minimumEdgeThresholdCents: 5,
      minimumTimeRemainingMs: 0,
      volatilityLookbackBars: 2,
      maxPositionSize: 1,
    });

    const run = BacktestStrategyRunner.run({
      initialCashCents: 10_000,
      steps: [...results],
      strategy,
      fillConfig: DEFAULT_BACKTEST_FILL_SIMULATION_CONFIG,
    });

    expect(run.decisionTrace).toHaveLength(2);
    expect(run.decisionTrace.map((entry) => entry.yesMid)).toEqual([51, 45]);
    expect(run.decisionTrace.every((entry) => entry.btcPrice !== null)).toBe(true);
    expect(new Set(run.decisionTrace.map((entry) => entry.btcPrice))).toEqual(
      new Set([59_995, 59_996]),
    );
  });
});
