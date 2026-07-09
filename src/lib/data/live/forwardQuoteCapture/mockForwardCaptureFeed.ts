import type {
  KalshiOrderbookDeltaMessage,
  KalshiOrderbookSnapshotMessage,
} from "@/features/market-data/orderbook/types";

export function createMockForwardCaptureMessages(
  marketTicker: string,
): Array<KalshiOrderbookSnapshotMessage | KalshiOrderbookDeltaMessage> {
  const snapshot: KalshiOrderbookSnapshotMessage = {
    type: "orderbook_snapshot",
    sid: 1,
    seq: 1,
    msg: {
      market_ticker: marketTicker,
      market_id: "mock-market-id",
      yes_dollars_fp: [
        ["0.4500", "100.00"],
        ["0.4400", "50.00"],
      ],
      no_dollars_fp: [
        ["0.5000", "80.00"],
        ["0.4900", "40.00"],
      ],
    },
  };

  const deltas: KalshiOrderbookDeltaMessage[] = [
    {
      type: "orderbook_delta",
      sid: 1,
      seq: 2,
      msg: {
        market_ticker: marketTicker,
        market_id: "mock-market-id",
        price_dollars: "0.4600",
        delta_fp: "25.00",
        side: "yes",
        ts_ms: 1_700_000_000_000,
      },
    },
    {
      type: "orderbook_delta",
      sid: 1,
      seq: 3,
      msg: {
        market_ticker: marketTicker,
        market_id: "mock-market-id",
        price_dollars: "0.4400",
        delta_fp: "-50.00",
        side: "yes",
        ts_ms: 1_700_000_001_000,
      },
    },
    {
      type: "orderbook_delta",
      sid: 1,
      seq: 8,
      msg: {
        market_ticker: marketTicker,
        market_id: "mock-market-id",
        price_dollars: "0.4700",
        delta_fp: "5.00",
        side: "yes",
        ts_ms: 1_700_000_004_000,
      },
    },
  ];

  const recoverySnapshot: KalshiOrderbookSnapshotMessage = {
    type: "orderbook_snapshot",
    sid: 1,
    seq: 9,
    msg: {
      market_ticker: marketTicker,
      market_id: "mock-market-id",
      yes_dollars_fp: [["0.4700", "30.00"]],
      no_dollars_fp: [["0.5100", "90.00"]],
    },
  };

  return [snapshot, ...deltas, recoverySnapshot];
}

export function createMockBtcSpotRecords(runId: string) {
  return [
    {
      runId,
      source: "coinbase" as const,
      receivedAtLocal: "2026-07-08T12:00:00.000Z",
      exchangeTimestampMs: 1_700_000_000_000,
      priceUsd: 62_500.25,
    },
  ];
}
