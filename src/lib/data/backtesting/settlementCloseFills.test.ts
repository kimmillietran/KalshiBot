import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
} from "@/lib/data/snapshots/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import { computeBacktestMetrics } from "./BacktestMetrics";
import { deriveBacktestMetricsInput } from "./deriveBacktestMetricsInput";
import { buildSettlementCloseFills } from "./settlementCloseFills";
import type { TradeFillInput } from "./ledgerTypes";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";

const TICKER = "KXBTC15M-SETTLE";
const T0 = "2026-04-30T19:00:00.000Z";
const T1 = "2026-04-30T19:15:00.000Z";

function buyFill(overrides: Partial<TradeFillInput> = {}) {
  return {
    ticker: TICKER,
    side: "yes" as const,
    action: "buy" as const,
    priceCents: 50,
    quantity: 3,
    feeCents: 1,
    occurredAt: T0,
    sourceStepIndex: 0,
    ...overrides,
  };
}

function envelope<T>(
  record: T,
  provenance: SilverRecordEnvelope<T>["provenance"],
): SilverRecordEnvelope<T> {
  return { record, provenance };
}

function createSnapshotWithSettlement(
  result: "yes" | "no",
): HistoricalTradingSnapshot {
  const provenance = {
    source: DataSource.KALSHI_REST,
    collectionTime: T0,
    observedAt: T0,
    fetchId: "fetch-settlement",
  };

  return assembleHistoricalTradingSnapshot({
    marketWindow: envelope(
      {
        eventTime: T0,
        collectionTime: T0,
        observedAt: T0,
        ticker: TICKER,
        seriesTicker: "KXBTC15M",
        openTime: T0,
        closeTime: T1,
        strikePriceUsd: 60_000,
        status: "settled" as const,
        qualityFlags: [],
        datasetVersion: DATA_CONTRACT_VERSION,
      },
      provenance,
    ),
    kalshiCandles: [
      envelope(
        {
          eventTime: T0,
          collectionTime: T0,
          observedAt: T0,
          ticker: TICKER,
          openTime: T0,
          closeTime: T0,
          yesBidCents: 48,
          yesAskCents: 52,
          noBidCents: 47,
          noAskCents: 51,
          volumeContracts: 100,
          qualityFlags: [],
          datasetVersion: DATA_CONTRACT_VERSION,
        },
        provenance,
      ),
    ],
    btcBars: [
      envelope(
        {
          eventTime: T0,
          collectionTime: T0,
          observedAt: T0,
          openTime: T0,
          closeTime: T0,
          openUsd: 59_980,
          highUsd: 60_010,
          lowUsd: 59_960,
          closeUsd: 60_000,
          volumeBtc: 1,
          qualityFlags: [],
          datasetVersion: DATA_CONTRACT_VERSION,
        },
        provenance,
      ),
    ],
    settlement: envelope(
      {
        eventTime: T1,
        collectionTime: T0,
        observedAt: T0,
        ticker: TICKER,
        strikePriceUsd: 60_000,
        settlementPriceUsd: 60_010,
        result,
        settledAt: T1,
        qualityFlags: [],
        datasetVersion: DATA_CONTRACT_VERSION,
      },
      provenance,
    ),
  });
}

function replayStep(snapshot: HistoricalTradingSnapshot): ReplayStepResult {
  return {
    stepIndex: 0,
    sourceTicker: TICKER,
    temporal: snapshot.temporal,
    provenance: snapshot.provenance,
    engineInput: {
      evaluatedAt: snapshot.temporal.observedAt,
      pricing: {
        yesBidCents: 48,
        yesAskCents: 52,
        yesMidCents: 50,
        noBidCents: 47,
        noAskCents: 51,
        noMidCents: 49,
      },
      btc: { price: 60_000, candles: [] },
      market: {
        ticker: TICKER,
        strikePrice: 60_000,
        timeRemainingMs: 0,
        closeTime: T1,
      },
    },
    engineOutput: { action: "NO TRADE", reasoning: [] },
    sourceSnapshot: snapshot,
  };
}

describe("buildSettlementCloseFills", () => {
  it("creates a settlement sell for an open yes position", () => {
    const snapshot = createSnapshotWithSettlement("yes");
    const fills = [
      {
        fillId: "fill-1",
        ...buyFill(),
      },
    ];

    const settlementFills = buildSettlementCloseFills([replayStep(snapshot)], fills);

    expect(settlementFills).toHaveLength(1);
    expect(settlementFills[0]).toMatchObject({
      action: "sell",
      side: "yes",
      priceCents: 100,
      quantity: 3,
    });
  });
});

describe("deriveBacktestMetricsInput settlement closes", () => {
  it("counts hold-to-settlement activity as a closed trade without changing fill metrics", () => {
    const snapshot = createSnapshotWithSettlement("yes");
    const fills = [
      {
        fillId: "fill-1",
        ...buyFill(),
      },
    ];
    const replayResults = [replayStep(snapshot)];

    const metricsInput = deriveBacktestMetricsInput({
      replayResults,
      fills,
      initialCashCents: 10_000,
    });
    const metrics = computeBacktestMetrics(metricsInput);

    expect(metrics.fillCount).toBe(1);
    expect(metrics.contractsFilled).toBe(3);
    expect(metrics.tradeCount).toBe(1);
    expect(metrics.winningTradeCount).toBe(1);
  });
});
