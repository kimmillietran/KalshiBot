import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { DataQualityFlag } from "@/lib/data/schemas";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
} from "@/lib/data/snapshots/types";
import { serializeHistoricalTradingSnapshot } from "@/lib/data/snapshots/HistoricalSnapshotAssembler";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";
import { MarketLifecycle } from "@/types/domain/trading";

import { adaptHistoricalSnapshot } from "./adaptHistoricalSnapshot";
import { ReplayAdaptationError, ReplayAdaptationErrorCode } from "./errors";
import { REPLAY_BTC_FEED_STATUS, REPLAY_BTC_PROVIDER_SOURCE } from "./types";

const EVENT_TIME = "2026-06-26T23:15:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const OPEN_TIME_A = "2026-06-26T23:15:00.000Z";
const OPEN_TIME_B = "2026-06-26T23:16:00.000Z";
const CLOSE_TIME_A = "2026-06-26T23:16:00.000Z";
const CLOSE_TIME_B = "2026-06-26T23:17:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const TICKER = "KXBTC15M-26JUN261930-30";
const SERIES = "KXBTC15M";

const temporalFields = {
  eventTime: EVENT_TIME,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
};

const marketProvenance = {
  source: DataSource.KALSHI_REST,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-market-1",
};

const candleProvenanceA = {
  source: DataSource.KALSHI_CANDLES,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-candle-a",
};

const candleProvenanceB = {
  source: DataSource.KALSHI_CANDLES,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-candle-b",
};

const btcProvenanceA = {
  source: DataSource.BINANCE_SPOT,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-btc-a",
};

const marketWindow = {
  ...temporalFields,
  ticker: TICKER,
  seriesTicker: SERIES,
  openTime: OPEN_TIME_A,
  closeTime: WINDOW_CLOSE,
  strikePriceUsd: 59_990.31,
  status: "open" as const,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

const kalshiCandleA = {
  ...temporalFields,
  ticker: TICKER,
  openTime: OPEN_TIME_A,
  closeTime: CLOSE_TIME_A,
  yesBidCents: 48,
  yesAskCents: 52,
  noBidCents: 47,
  noAskCents: 51,
  volumeContracts: 120,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

const kalshiCandleB = {
  ...kalshiCandleA,
  openTime: OPEN_TIME_B,
  closeTime: CLOSE_TIME_B,
  eventTime: OPEN_TIME_B,
  yesBidCents: 55,
  yesAskCents: 58,
  noBidCents: 41,
  noAskCents: 44,
};

const btcBarA = {
  ...temporalFields,
  openTime: OPEN_TIME_A,
  closeTime: CLOSE_TIME_A,
  openUsd: 59_980.5,
  highUsd: 60_010.25,
  lowUsd: 59_960.0,
  closeUsd: 59_995.75,
  volumeBtc: 12.5,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

function envelope<T>(
  record: T,
  provenance: SilverRecordEnvelope<T>["provenance"],
): SilverRecordEnvelope<T> {
  return { record, provenance };
}

function createValidInput(
  overrides: Partial<SnapshotAssemblyInput> = {},
): SnapshotAssemblyInput {
  return {
    marketWindow: envelope(marketWindow, marketProvenance),
    kalshiCandles: [
      envelope(kalshiCandleA, candleProvenanceA),
      envelope(kalshiCandleB, candleProvenanceB),
    ],
    btcBars: [envelope(btcBarA, btcProvenanceA)],
    ...overrides,
  };
}

function createValidSnapshot(
  overrides: Partial<SnapshotAssemblyInput> = {},
): HistoricalTradingSnapshot {
  return assembleHistoricalTradingSnapshot(createValidInput(overrides));
}

function cloneSnapshot(
  snapshot: HistoricalTradingSnapshot,
): HistoricalTradingSnapshot {
  return JSON.parse(
    serializeHistoricalTradingSnapshot(snapshot),
  ) as HistoricalTradingSnapshot;
}

describe("adaptHistoricalSnapshot", () => {
  it("maps a historical trading snapshot into an EvaluationSnapshot", () => {
    const snapshot = createValidSnapshot();
    const result = adaptHistoricalSnapshot(snapshot);

    expect(result.engineInput.evaluatedAt).toBe(OBSERVED_AT);
    expect(result.engineInput.market).toEqual({
      ticker: TICKER,
      lifecycle: MarketLifecycle.ACTIVE,
      strikePrice: 59_990.31,
      timeRemainingMs:
        Date.parse(WINDOW_CLOSE) - Date.parse(OBSERVED_AT),
      closeTime: WINDOW_CLOSE,
    });
    expect(result.engineInput.btc).toMatchObject({
      price: 59_995.75,
      change24hPercent: null,
      feedStatus: REPLAY_BTC_FEED_STATUS,
      providerSource: REPLAY_BTC_PROVIDER_SOURCE,
      candles: [
        {
          timestamp: Date.parse(CLOSE_TIME_A),
          open: 59_980.5,
          high: 60_010.25,
          low: 59_960.0,
          close: 59_995.75,
        },
      ],
    });
    expect(result.engineInput.pricing).toEqual({
      yesBidCents: 55,
      yesAskCents: 58,
      yesMidCents: 57,
      noBidCents: 41,
      noAskCents: 44,
      noMidCents: 43,
      liquidityQuality: "Good",
      volumeDollars: null,
    });
  });

  it("preserves temporal metadata and provenance", () => {
    const snapshot = createValidSnapshot();
    const result = adaptHistoricalSnapshot(snapshot);

    expect(result.temporal).toEqual(snapshot.temporal);
    expect(result.provenance).toEqual(snapshot.provenance);
    expect(result.sourceTicker).toBe(TICKER);
    expect(result.sourceSnapshot).toBe(snapshot);
  });

  it("rejects snapshots without Kalshi candles", () => {
    const snapshot = cloneSnapshot(
      createValidSnapshot({ kalshiCandles: [envelope(kalshiCandleA, candleProvenanceA)] }),
    );
    snapshot.kalshiCandles = [];

    expect(() => adaptHistoricalSnapshot(snapshot)).toThrow(ReplayAdaptationError);
    try {
      adaptHistoricalSnapshot(snapshot);
    } catch (error) {
      expect((error as ReplayAdaptationError).code).toBe(
        ReplayAdaptationErrorCode.MISSING_KALSHI_CANDLES,
      );
    }
  });

  it("rejects snapshots without BTC bars", () => {
    const snapshot = cloneSnapshot(createValidSnapshot());
    snapshot.btcBars = [];

    expect(() => adaptHistoricalSnapshot(snapshot)).toThrow(ReplayAdaptationError);
    try {
      adaptHistoricalSnapshot(snapshot);
    } catch (error) {
      expect((error as ReplayAdaptationError).code).toBe(
        ReplayAdaptationErrorCode.MISSING_BTC_BARS,
      );
    }
  });

  it("rejects ticker mismatches between snapshot root and market window", () => {
    const snapshot = cloneSnapshot(createValidSnapshot());
    snapshot.ticker = "OTHER-TICKER";

    expect(() => adaptHistoricalSnapshot(snapshot)).toThrow(ReplayAdaptationError);
    try {
      adaptHistoricalSnapshot(snapshot);
    } catch (error) {
      expect((error as ReplayAdaptationError).code).toBe(
        ReplayAdaptationErrorCode.TICKER_MISMATCH,
      );
    }
  });

  it("produces deterministic output for identical snapshots", () => {
    const snapshot = createValidSnapshot();
    const first = adaptHistoricalSnapshot(snapshot);
    const second = adaptHistoricalSnapshot(snapshot);

    expect(first).toEqual(second);
    expect(JSON.stringify(first.engineInput)).toBe(
      JSON.stringify(second.engineInput),
    );
  });

  it("uses the last kalshi candle and btc bar for pricing and spot price", () => {
    const btcBarB = {
      ...btcBarA,
      openTime: OPEN_TIME_B,
      closeTime: CLOSE_TIME_B,
      closeUsd: 60_100.0,
    };
    const btcProvenanceB = {
      ...btcProvenanceA,
      fetchId: "fetch-btc-b",
    };

    const snapshot = createValidSnapshot({
      kalshiCandles: [
        envelope(kalshiCandleA, candleProvenanceA),
        envelope(kalshiCandleB, candleProvenanceB),
      ],
      btcBars: [
        envelope(btcBarA, btcProvenanceA),
        envelope(btcBarB, btcProvenanceB),
      ],
    });
    const result = adaptHistoricalSnapshot(snapshot);

    expect(result.engineInput.btc.price).toBe(60_100.0);
    expect(result.engineInput.pricing.yesBidCents).toBe(55);
    expect(result.engineInput.pricing.noAskCents).toBe(44);
  });

  it("maps market window status to engine lifecycle", () => {
    const closedSnapshot = createValidSnapshot({
      marketWindow: envelope(
        { ...marketWindow, status: "closed" as const },
        marketProvenance,
      ),
    });
    const settledSnapshot = createValidSnapshot({
      marketWindow: envelope(
        { ...marketWindow, status: "settled" as const },
        marketProvenance,
      ),
    });

    expect(
      adaptHistoricalSnapshot(closedSnapshot).engineInput.market.lifecycle,
    ).toBe(MarketLifecycle.CLOSED);
    expect(
      adaptHistoricalSnapshot(settledSnapshot).engineInput.market.lifecycle,
    ).toBe(MarketLifecycle.SETTLED);
  });

  it("derives liquidity quality from merged quality flags", () => {
    const poorSnapshot = createValidSnapshot({
      marketWindow: envelope(
        {
          ...marketWindow,
          qualityFlags: [DataQualityFlag.MISSING_BID_ASK],
        },
        marketProvenance,
      ),
    });
    const fairSnapshot = createValidSnapshot({
      kalshiCandles: [
        envelope(
          {
            ...kalshiCandleB,
            qualityFlags: [DataQualityFlag.PARTIAL_WINDOW],
          },
          candleProvenanceB,
        ),
      ],
    });
    const goodSnapshot = createValidSnapshot();

    expect(
      adaptHistoricalSnapshot(poorSnapshot).engineInput.pricing.liquidityQuality,
    ).toBe("Poor");
    expect(
      adaptHistoricalSnapshot(fairSnapshot).engineInput.pricing.liquidityQuality,
    ).toBe("Fair");
    expect(
      adaptHistoricalSnapshot(goodSnapshot).engineInput.pricing.liquidityQuality,
    ).toBe("Good");
  });

  it("allows negative timeRemainingMs when observedAt is after market close", () => {
    const snapshot = createValidSnapshot({
      marketWindow: envelope(
        {
          ...marketWindow,
          closeTime: "2026-06-27T00:30:00.000Z",
        },
        marketProvenance,
      ),
    });
    const result = adaptHistoricalSnapshot(snapshot);

    expect(result.engineInput.market.timeRemainingMs).toBeLessThan(0);
  });

  it("does not map settlement into engine input", () => {
    const settlementRecord = {
      ...temporalFields,
      ticker: TICKER,
      strikePriceUsd: 59_990.31,
      settledAt: "2026-06-27T00:30:00.000Z",
      result: "yes" as const,
      settlementPriceUsd: 60_000,
      qualityFlags: [],
      datasetVersion: DATA_CONTRACT_VERSION,
    };
    const snapshot = createValidSnapshot({
      settlement: envelope(settlementRecord, {
        source: DataSource.KALSHI_REST,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT,
        fetchId: "fetch-settlement-1",
      }),
    });
    const result = adaptHistoricalSnapshot(snapshot);

    expect(snapshot.settlement).not.toBeNull();
    expect(result.provenance.settlement).not.toBeNull();
    expect(result.engineInput).not.toHaveProperty("settlement");
  });
});
