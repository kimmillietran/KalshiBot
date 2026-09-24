import {
  createKalshiWebSocketAuthHeaders,
} from "@/lib/data/live/kalshiWsCaptureSpike/kalshiAuthHeaders";
import { NodeKalshiAuthenticatedWsClient } from "@/lib/data/live/kalshiWsCaptureSpike/nodeKalshiAuthenticatedWsClient";
import type { KalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";
import { KALSHI_WS_URL } from "@/features/market-data/orderbook/constants";

import { BRTI_INDEX_ID, KalshiBrtiAccessProbeError } from "./types";

export type LiveWindowAverage = {
  valueRaw: string | null;
  windowSize: number | null;
  windowStartTsMs: number | null;
  windowEndTsExclusive: number | null;
};

export type LiveCfbMessageSummary = {
  type: string | null;
  localReceivedAtMs: number;
  providerReceivedAtMs: number | null;
  sourceTsMs: number | null;
  indexId: string | null;
  rawValue: string | null;
  trailingAvg60s: LiveWindowAverage | null;
  last60sWindowedAverage15min: LiveWindowAverage | null;
  hasLast60sWindowedAverage15min: boolean;
  hasAvg60s: boolean;
  valuePresent: boolean;
};

export type LiveCfbProbeResult = {
  attempted: boolean;
  connected: boolean;
  connectionAttempts: number;
  subscriptionAttempts: number;
  channels: string[];
  durationMs: number;
  messagesReceived: number;
  summaries: LiveCfbMessageSummary[];
  handshakeErrorCategory: string | null;
  sawSettlementWindowAverage: boolean;
  limitedBecauseNoSettlementWindow: boolean;
  stoppedAtCap: boolean;
  stoppedAtDeadline: boolean;
  venueSettlementAverage: LiveWindowAverage | null;
};

export type LiveCfbProbeDeps = {
  transport?: {
    connect: (url: string, options?: { headers?: Record<string, string> }) => Promise<void>;
    send: (payload: string) => void;
    close: () => void;
    onMessage: (handler: (payload: string) => void) => void;
    onError?: (handler: (error: Error) => void) => void;
  };
  nowMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  createTransport?: () => NonNullable<LiveCfbProbeDeps["transport"]>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function summarizeLiveMessage(
  payload: string,
  localReceivedAtMs: number,
): LiveCfbMessageSummary {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    parsed = null;
  }
  const record = isRecord(parsed) ? parsed : {};
  const msg = isRecord(record.msg) ? record.msg : {};
  let rawValue: string | null = typeof msg.value_usd === "string" ? msg.value_usd : null;
  let nestedSourceTsMs: number | null = null;
  if (typeof msg.data === "string") {
    try {
      const inner = JSON.parse(msg.data) as unknown;
      if (isRecord(inner)) {
        if (typeof inner.value === "string") {
          rawValue = inner.value;
        }
        // 1Hz CFB wire embeds source time inside msg.data JSON; 5Hz also exposes source_ts_ms.
        if (typeof inner.time === "number") {
          nestedSourceTsMs = inner.time;
        }
      }
    } catch {
      // keep parsed value_usd or null
    }
  }
  return {
    type: typeof record.type === "string" ? record.type : null,
    localReceivedAtMs,
    providerReceivedAtMs: typeof msg.received_at === "number" ? msg.received_at : null,
    sourceTsMs: typeof msg.source_ts_ms === "number"
      ? msg.source_ts_ms
      : typeof msg.time === "number"
        ? msg.time
        : nestedSourceTsMs,
    indexId: typeof msg.index_id === "string" ? msg.index_id : null,
    rawValue,
    trailingAvg60s: readWindowAverage(msg.avg_60s_data),
    last60sWindowedAverage15min: readWindowAverage(msg.last_60s_windowed_average_15min),
    hasLast60sWindowedAverage15min: isRecord(msg.last_60s_windowed_average_15min),
    hasAvg60s: isRecord(msg.avg_60s_data),
    valuePresent: rawValue != null || typeof msg.data === "string",
  };
}

function readWindowAverage(value: unknown): LiveWindowAverage | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    valueRaw: typeof value.value === "string" ? value.value : null,
    windowSize: typeof value.window_size === "number" ? value.window_size : null,
    windowStartTsMs: typeof value.window_start_ts_ms === "number" ? value.window_start_ts_ms : null,
    windowEndTsExclusive: typeof value.window_end_ts_exclusive === "number"
      ? value.window_end_ts_exclusive
      : null,
  };
}

export async function runLiveCfbProbe(input: {
  credentials: KalshiCaptureCredentials;
  durationSeconds: number;
  messageCap: number;
  channels?: string[];
  startAtMs?: number;
  stopAtMs?: number;
  maxConnections?: number;
  deps?: LiveCfbProbeDeps;
}): Promise<LiveCfbProbeResult> {
  if (input.credentials.status !== "available" || !input.credentials.apiKeyId
    || !input.credentials.privateKeyMaterial.privateKeyPem) {
    throw new KalshiBrtiAccessProbeError("credentials-not-available");
  }
  const nowMs = input.deps?.nowMs ?? Date.now;
  const wait = input.deps?.sleep ?? sleep;
  const channels = input.channels ?? ["cfbenchmarks_value"];
  const maxConnections = input.maxConnections ?? 2;
  const summaries: LiveCfbMessageSummary[] = [];
  let handshakeErrorCategory: string | null = null;
  let connected = false;
  let connectionAttempts = 0;
  let subscriptionAttempts = 0;
  const startedWait = nowMs();
  if (input.startAtMs != null && nowMs() < input.startAtMs) {
    while (nowMs() < input.startAtMs) {
      await wait(Math.min(250, input.startAtMs - nowMs()));
    }
  }
  const captureStarted = nowMs();
  const hardDeadline = Math.min(
    input.stopAtMs ?? (captureStarted + input.durationSeconds * 1000),
    captureStarted + input.durationSeconds * 1000,
    captureStarted + 90_000,
  );

  while (connectionAttempts < maxConnections && !connected && nowMs() < hardDeadline) {
    const transport = input.deps?.createTransport?.()
      ?? input.deps?.transport
      ?? new NodeKalshiAuthenticatedWsClient();
    connectionAttempts += 1;
    try {
      const headers = createKalshiWebSocketAuthHeaders({
        apiKeyId: input.credentials.apiKeyId,
        privateKeyPem: input.credentials.privateKeyMaterial.privateKeyPem,
        timestampMs: String(nowMs()),
      });
      transport.onMessage((payload) => {
        if (summaries.length >= input.messageCap || nowMs() >= hardDeadline) {
          return;
        }
        summaries.push(summarizeLiveMessage(payload, nowMs()));
      });
      await transport.connect(input.credentials.wsUrl ?? KALSHI_WS_URL, { headers });
      connected = true;
      for (const [index, channel] of channels.entries()) {
        subscriptionAttempts += 1;
        transport.send(JSON.stringify({
          id: index + 1,
          cmd: "subscribe",
          params: { channels: [channel], index_ids: [BRTI_INDEX_ID] },
        }));
      }
      while (nowMs() < hardDeadline && summaries.length < input.messageCap) {
        await wait(Math.min(250, hardDeadline - nowMs()));
      }
      transport.close();
    } catch (error) {
      transport.close();
      const message = error instanceof Error ? error.message : "live-ws-failed";
      if (/\b401\b/.test(message)) {
        handshakeErrorCategory = "authentication-failure";
      } else if (/\b403\b/.test(message)) {
        handshakeErrorCategory = "entitlement-denial";
      } else {
        handshakeErrorCategory = "upstream-or-transient";
      }
    }
  }

  const settlementFrames = summaries.filter((item) => item.last60sWindowedAverage15min);
  const venueSettlementAverage = [...settlementFrames]
    .reverse()
    .find((item) => item.last60sWindowedAverage15min?.windowSize === 60)
    ?.last60sWindowedAverage15min
    ?? settlementFrames.at(-1)?.last60sWindowedAverage15min
    ?? null;
  const sawSettlementWindowAverage = venueSettlementAverage != null;
  return {
    attempted: true,
    connected,
    connectionAttempts,
    subscriptionAttempts,
    channels,
    durationMs: nowMs() - startedWait,
    messagesReceived: summaries.length,
    summaries: summaries.slice(0, 40),
    handshakeErrorCategory,
    sawSettlementWindowAverage,
    limitedBecauseNoSettlementWindow: connected && !sawSettlementWindowAverage,
    stoppedAtCap: summaries.length >= input.messageCap,
    stoppedAtDeadline: nowMs() >= hardDeadline,
    venueSettlementAverage,
  };
}
