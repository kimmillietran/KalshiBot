import { createKalshiWebSocketAuthHeaders } from "@/lib/data/live/kalshiWsCaptureSpike/kalshiAuthHeaders";
import { NodeKalshiAuthenticatedWsClient } from "@/lib/data/live/kalshiWsCaptureSpike/nodeKalshiAuthenticatedWsClient";
import { OrderbookCaptureBook } from "@/lib/data/live/kalshiWsCaptureSpike/orderbookCaptureBook";
import type { KalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";
import { KALSHI_WS_URL } from "@/features/market-data/orderbook/constants";
import { summarizeLiveMessage, type LiveCfbMessageSummary } from "@/lib/data/research/kalshiBrtiAccessProbe/runLiveCfbProbe";
import { BRTI_INDEX_ID } from "@/lib/data/research/kalshiBrtiAccessProbe/types";
import type {
  KalshiOrderbookDeltaMessage,
  KalshiOrderbookSnapshotMessage,
} from "@/features/market-data/orderbook/types";

import type { ReceiptTimedQuote } from "./alignQuotes";
import type { LiveMarketIdentity } from "./bindLiveMarket";
import {
  createSessionLimitState,
  recordReceivedMessage,
  registerConnectionAttempt,
  requestCleanShutdown,
  type SessionLimitState,
  type SynchronizedWindowPlan,
} from "./captureLimits";
import type { VenueAverageUpdate } from "./inferVenueAverageMapping";
import { classifyAverageField } from "./inferVenueAverageMapping";
import {
  CFB_1HZ_CHANNEL,
  CFB_5HZ_CHANNEL,
  ORDERBOOK_CHANNEL,
  SettlementSampleMappingError,
} from "./types";

export type MappingTransport = {
  connect: (url: string, options?: { headers?: Record<string, string> }) => Promise<void>;
  send: (payload: string) => void;
  close: () => void;
  onMessage: (handler: (payload: string) => void) => void;
  onError?: (handler: (error: Error) => void) => void;
};

export type SynchronizedCaptureDeps = {
  createTransport?: () => MappingTransport;
  nowMs?: () => number;
  monoMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  appendRaw?: (line: string) => void;
};

export type CapturedStreamEvent = {
  stream: "cfb-1hz" | "cfb-5hz" | "orderbook" | "unknown";
  localReceivedAtMs: number;
  localReceivedAtMonoMs: number;
  providerTimestampMs: number | null;
  type: string | null;
  bytes: number;
};

export type SynchronizedCaptureResult = {
  attempted: boolean;
  connected: boolean;
  connectionAttempts: number;
  subscriptionAttempts: number;
  channels: string[];
  planned: SynchronizedWindowPlan;
  actualStartMs: number | null;
  actualStopMs: number | null;
  connectedBeforeWindow: boolean;
  limits: SessionLimitState;
  handshakeErrorCategory: string | null;
  events: CapturedStreamEvent[];
  cfbSummaries: LiveCfbMessageSummary[];
  venueAverages: VenueAverageUpdate[];
  rawBrti: Array<{
    sourceTsMs: number | null;
    valueRaw: string | null;
    localReceivedAtMs: number;
    localReceivedAtMonoMs: number;
    channelHint: "cfb-1hz" | "cfb-5hz" | "unknown";
  }>;
  quotes: ReceiptTimedQuote[];
  bookDiagnostics: {
    snapshots: number;
    deltas: number;
    gaps: number;
    invalid: number;
    reconnects: number;
  };
  flushed: boolean;
  closedCleanly: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifyStream(payload: unknown, defaultHint: CapturedStreamEvent["stream"]): CapturedStreamEvent["stream"] {
  if (!isRecord(payload)) {
    return defaultHint;
  }
  if (payload.type === "orderbook_snapshot" || payload.type === "orderbook_delta") {
    return "orderbook";
  }
  const msg = isRecord(payload.msg) ? payload.msg : {};
  if (isRecord(msg.last_60s_windowed_average_15min) || isRecord(msg.avg_60s_data)) {
    return "cfb-1hz";
  }
  if (typeof msg.data === "string" && !isRecord(msg.last_60s_windowed_average_15min)) {
    return "cfb-5hz";
  }
  if (typeof msg.value_usd === "string") {
    return "cfb-1hz";
  }
  return defaultHint;
}

function maybeApplyBook(
  book: OrderbookCaptureBook,
  parsed: unknown,
  diagnostics: SynchronizedCaptureResult["bookDiagnostics"],
): "snapshot" | "delta" | "gap" | "invalid" | "ignored" {
  if (!isRecord(parsed) || !isRecord(parsed.msg)) {
    return "ignored";
  }
  if (parsed.type === "orderbook_snapshot") {
    try {
      book.applySnapshot(parsed as KalshiOrderbookSnapshotMessage);
      diagnostics.snapshots += 1;
      return "snapshot";
    } catch {
      diagnostics.invalid += 1;
      return "invalid";
    }
  }
  if (parsed.type === "orderbook_delta") {
    try {
      const result = book.applyDelta(parsed as KalshiOrderbookDeltaMessage);
      diagnostics.deltas += 1;
      if (result === "gap") {
        diagnostics.gaps += 1;
        return "gap";
      }
      return "delta";
    } catch {
      diagnostics.invalid += 1;
      return "invalid";
    }
  }
  return "ignored";
}

function pushAverage(
  averages: VenueAverageUpdate[],
  summary: LiveCfbMessageSummary,
  fieldName: "last_60s_windowed_average_15min" | "avg_60s_data",
  monoMs: number,
): void {
  const window = fieldName === "last_60s_windowed_average_15min"
    ? summary.last60sWindowedAverage15min
    : summary.trailingAvg60s;
  if (window == null) {
    return;
  }
  averages.push({
    fieldName,
    fieldKind: classifyAverageField(fieldName),
    valueRaw: window.valueRaw,
    count: window.windowSize,
    sumRaw: null,
    windowStartTsMs: window.windowStartTsMs,
    windowEndTsExclusive: window.windowEndTsExclusive,
    providerTimestampMs: summary.providerReceivedAtMs ?? summary.sourceTsMs,
    localReceivedAtMs: summary.localReceivedAtMs,
    localReceivedAtMonoMs: monoMs,
  });
}

export async function runSynchronizedCapture(input: {
  credentials: KalshiCaptureCredentials;
  market: LiveMarketIdentity;
  plan: SynchronizedWindowPlan;
  deps?: SynchronizedCaptureDeps;
}): Promise<SynchronizedCaptureResult> {
  if (input.credentials.status !== "available" || !input.credentials.apiKeyId
    || !input.credentials.privateKeyMaterial.privateKeyPem) {
    throw new SettlementSampleMappingError("credentials-not-available");
  }
  const nowMs = input.deps?.nowMs ?? Date.now;
  const monoMs = input.deps?.monoMs ?? (() => performance.now());
  const wait = input.deps?.sleep ?? sleep;
  const channels = [CFB_1HZ_CHANNEL, CFB_5HZ_CHANNEL, ORDERBOOK_CHANNEL];
  const result: SynchronizedCaptureResult = {
    attempted: true,
    connected: false,
    connectionAttempts: 0,
    subscriptionAttempts: 0,
    channels,
    planned: input.plan,
    actualStartMs: null,
    actualStopMs: null,
    connectedBeforeWindow: false,
    limits: createSessionLimitState({
      startedAtMs: input.plan.actualStartMs,
      stopAtMs: input.plan.stopMs,
    }),
    handshakeErrorCategory: null,
    events: [],
    cfbSummaries: [],
    venueAverages: [],
    rawBrti: [],
    quotes: [],
    bookDiagnostics: {
      snapshots: 0,
      deltas: 0,
      gaps: 0,
      invalid: 0,
      reconnects: 0,
    },
    flushed: false,
    closedCleanly: false,
  };

  while (nowMs() < input.plan.actualStartMs) {
    await wait(Math.min(250, input.plan.actualStartMs - nowMs()));
  }

  const book = new OrderbookCaptureBook({
    marketTicker: input.market.ticker,
    seriesTicker: input.market.seriesTicker,
    eventTicker: input.market.eventTicker,
  });
  let reconnects = 0;

  while (
    registerConnectionAttempt(result.limits, "multiplexed-ws")
    && !result.limits.shutdownRequested
    && nowMs() < input.plan.stopMs
  ) {
    if (nowMs() < input.plan.actualStartMs) {
      result.connectedBeforeWindow = true;
    }
    const transport = input.deps?.createTransport?.() ?? new NodeKalshiAuthenticatedWsClient();
    result.connectionAttempts += 1;
    if (result.connectionAttempts > 1) {
      reconnects += 1;
      result.bookDiagnostics.reconnects = reconnects;
    }
    try {
      transport.onMessage((payload) => {
        const receivedAtMs = nowMs();
        const receivedAtMonoMs = monoMs();
        const bytes = Buffer.byteLength(payload);
        if (!recordReceivedMessage(result.limits, bytes, receivedAtMs)) {
          try {
            transport.close();
          } catch {
            // already closing
          }
          return;
        }
        input.deps?.appendRaw?.(JSON.stringify({
          receivedAtMs,
          receivedAtMonoMs,
          bytes,
          payload,
        }));
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(payload) as unknown;
        } catch {
          parsed = null;
        }
        const stream = classifyStream(parsed, "unknown");
        const summary = summarizeLiveMessage(payload, receivedAtMs);
        result.events.push({
          stream,
          localReceivedAtMs: receivedAtMs,
          localReceivedAtMonoMs: receivedAtMonoMs,
          providerTimestampMs: summary.providerReceivedAtMs ?? summary.sourceTsMs,
          type: summary.type,
          bytes,
        });
        if (stream === "orderbook") {
          const apply = maybeApplyBook(book, parsed, result.bookDiagnostics);
          if (apply === "snapshot" || apply === "delta" || apply === "gap") {
            const top = book.toTopOfBookRecord({
              runId: "settlement-sample-mapping",
              receivedAtLocal: new Date(receivedAtMs).toISOString(),
              exchangeTimestampMs: summary.providerReceivedAtMs,
              rawMessageType: summary.type ?? "orderbook",
            });
            result.quotes.push({
              receivedAtMs,
              receivedAtMonoMs,
              exchangeTimestampMs: top.exchangeTimestampMs,
              bookState: top.bookState,
              yesBidCents: top.yesBestBidCents,
              yesBidSize: top.yesBestBidSize,
              yesAskCents: top.yesBestAskCents,
              yesAskSize: top.yesBestAskSize,
              noBidCents: top.noBestBidCents,
              noBidSize: top.noBestBidSize,
              noAskCents: top.noBestAskCents,
              noAskSize: top.noBestAskSize,
              sequence: top.sequence,
              sequenceGap: apply === "gap" || top.bookState === "gap-detected",
              reconnectsBefore: reconnects,
            });
          }
          return;
        }
        result.cfbSummaries.push(summary);
        if (summary.valuePresent) {
          result.rawBrti.push({
            sourceTsMs: summary.sourceTsMs,
            valueRaw: summary.rawValue,
            localReceivedAtMs: receivedAtMs,
            localReceivedAtMonoMs: receivedAtMonoMs,
            channelHint: stream === "cfb-5hz" || stream === "cfb-1hz" ? stream : "unknown",
          });
        }
        pushAverage(result.venueAverages, summary, "last_60s_windowed_average_15min", receivedAtMonoMs);
        pushAverage(result.venueAverages, summary, "avg_60s_data", receivedAtMonoMs);
      });
      const headers = createKalshiWebSocketAuthHeaders({
        apiKeyId: input.credentials.apiKeyId,
        privateKeyPem: input.credentials.privateKeyMaterial.privateKeyPem,
        timestampMs: String(nowMs()),
      });
      result.actualStartMs = nowMs();
      await transport.connect(input.credentials.wsUrl ?? KALSHI_WS_URL, { headers });
      result.connected = true;
      const subscribe = [
        { id: 1, cmd: "subscribe", params: { channels: [CFB_1HZ_CHANNEL], index_ids: [BRTI_INDEX_ID] } },
        { id: 2, cmd: "subscribe", params: { channels: [CFB_5HZ_CHANNEL], index_ids: [BRTI_INDEX_ID] } },
        {
          id: 3,
          cmd: "subscribe",
          params: { channels: [ORDERBOOK_CHANNEL], market_tickers: [input.market.ticker] },
        },
      ];
      for (const message of subscribe) {
        result.subscriptionAttempts += 1;
        transport.send(JSON.stringify(message));
      }
      while (nowMs() < input.plan.stopMs && !result.limits.shutdownRequested) {
        await wait(Math.min(250, input.plan.stopMs - nowMs()));
      }
      requestCleanShutdown(result.limits, result.limits.stopReason ?? "planned-stop");
      transport.close();
      result.closedCleanly = true;
      break;
    } catch (error) {
      transport.close();
      const message = error instanceof Error ? error.message : "live-ws-failed";
      if (/\b401\b/.test(message)) {
        result.handshakeErrorCategory = "authentication-failure";
      } else if (/\b403\b/.test(message)) {
        result.handshakeErrorCategory = "entitlement-denial";
      } else {
        result.handshakeErrorCategory = "upstream-or-transient";
      }
    }
  }

  result.actualStopMs = nowMs();
  result.flushed = true;
  return result;
}
