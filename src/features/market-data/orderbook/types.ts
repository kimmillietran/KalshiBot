import type { MarketContractPricing } from "../types";

export type OrderbookSide = "yes" | "no";

export type OrderbookLevel = readonly [priceDollars: string, quantityFp: string];

export type OrderbookState = {
  marketTicker: string;
  yesLevels: Readonly<Record<string, string>>;
  noLevels: Readonly<Record<string, string>>;
  lastSeq: number | null;
  updatedAtMs: number | null;
};

export type OrderbookTopOfBook = {
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
};

export type OrderbookFeedStatus =
  | "idle"
  | "connecting"
  | "live"
  | "stale"
  | "resyncing"
  | "disconnected"
  | "error";

export type OrderbookFeedSnapshot = {
  ticker: string | null;
  status: OrderbookFeedStatus;
  pricing: MarketContractPricing | null;
  topOfBook: OrderbookTopOfBook | null;
  lastSeq: number | null;
  lastUpdateAt: string | null;
  errorMessage: string | null;
};

export type KalshiOrderbookSnapshotMessage = {
  type: "orderbook_snapshot";
  /** Optional client command id when the snapshot acknowledges get_snapshot. */
  id?: number;
  sid: number;
  seq: number;
  msg: {
    market_ticker: string;
    market_id: string;
    yes_dollars_fp?: OrderbookLevel[];
    no_dollars_fp?: OrderbookLevel[];
  };
};

export type KalshiOrderbookDeltaMessage = {
  type: "orderbook_delta";
  sid: number;
  seq: number;
  msg: {
    market_ticker: string;
    market_id: string;
    price_dollars: string;
    delta_fp: string;
    side: OrderbookSide;
    ts_ms?: number;
  };
};

export type KalshiOrderbookWireMessage =
  | KalshiOrderbookSnapshotMessage
  | KalshiOrderbookDeltaMessage
  | { type: string; sid?: number; seq?: number; msg?: unknown };

export type KalshiWsTransport = {
  connect(url: string, options?: { headers?: Record<string, string> }): Promise<void>;
  send(payload: string): void;
  close(): void;
  onOpen(handler: () => void): void;
  onMessage(handler: (payload: string) => void): void;
  onClose(handler: (code?: number, reason?: string) => void): void;
  onError(handler: (error: Error) => void): void;
};

export type KalshiWsProbeTransport = KalshiWsTransport & {
  ping?: () => void;
  onPong?: (handler: () => void) => void;
};

export type FetchOrderbookSnapshot = (
  ticker: string,
) => Promise<{
  yesLevels: OrderbookLevel[];
  noLevels: OrderbookLevel[];
}>;
