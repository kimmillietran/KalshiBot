import {
  createKalshiWebSocketAuthHeaders,
} from "@/lib/data/live/kalshiWsCaptureSpike/kalshiAuthHeaders";
import { NodeKalshiAuthenticatedWsClient } from "@/lib/data/live/kalshiWsCaptureSpike/nodeKalshiAuthenticatedWsClient";
import type { KalshiCaptureCredentials } from "@/lib/data/live/kalshiWsCaptureSpike/resolveKalshiCaptureCredentials";
import { KALSHI_WS_URL } from "@/features/market-data/orderbook/constants";

import { BRTI_INDEX_ID, KalshiBrtiAccessProbeError } from "./types";

export type LiveCfbMessageSummary = {
  type: string | null;
  localReceivedAtMs: number;
  providerReceivedAtMs: number | null;
  sourceTsMs: number | null;
  indexId: string | null;
  hasLast60sWindowedAverage15min: boolean;
  hasAvg60s: boolean;
  valuePresent: boolean;
};

export type LiveCfbProbeResult = {
  attempted: boolean;
  connected: boolean;
  channels: string[];
  durationMs: number;
  messagesReceived: number;
  summaries: LiveCfbMessageSummary[];
  handshakeErrorCategory: string | null;
  sawSettlementWindowAverage: boolean;
  limitedBecauseNoSettlementWindow: boolean;
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
  return {
    type: typeof record.type === "string" ? record.type : null,
    localReceivedAtMs,
    providerReceivedAtMs: typeof msg.received_at === "number" ? msg.received_at : null,
    sourceTsMs: typeof msg.source_ts_ms === "number"
      ? msg.source_ts_ms
      : typeof msg.time === "number" ? msg.time : null,
    indexId: typeof msg.index_id === "string" ? msg.index_id : null,
    hasLast60sWindowedAverage15min: isRecord(msg.last_60s_windowed_average_15min),
    hasAvg60s: isRecord(msg.avg_60s_data),
    valuePresent: typeof msg.value_usd === "string" || typeof msg.data === "string",
  };
}

export async function runLiveCfbProbe(input: {
  credentials: KalshiCaptureCredentials;
  durationSeconds: number;
  messageCap: number;
  deps?: LiveCfbProbeDeps;
}): Promise<LiveCfbProbeResult> {
  if (input.credentials.status !== "available" || !input.credentials.apiKeyId
    || !input.credentials.privateKeyMaterial.privateKeyPem) {
    throw new KalshiBrtiAccessProbeError("credentials-not-available");
  }
  const nowMs = input.deps?.nowMs ?? Date.now;
  const wait = input.deps?.sleep ?? sleep;
  const transport = input.deps?.transport ?? new NodeKalshiAuthenticatedWsClient();
  const channels = ["cfbenchmarks_value", "cfbenchmarks_value_5hz"];
  const summaries: LiveCfbMessageSummary[] = [];
  let handshakeErrorCategory: string | null = null;
  let connected = false;
  const started = nowMs();

  try {
    const headers = createKalshiWebSocketAuthHeaders({
      apiKeyId: input.credentials.apiKeyId,
      privateKeyPem: input.credentials.privateKeyMaterial.privateKeyPem,
      timestampMs: String(nowMs()),
    });
    transport.onMessage((payload) => {
      if (summaries.length >= input.messageCap) {
        return;
      }
      summaries.push(summarizeLiveMessage(payload, nowMs()));
    });
    await transport.connect(input.credentials.wsUrl ?? KALSHI_WS_URL, { headers });
    connected = true;
    transport.send(JSON.stringify({
      id: 1,
      cmd: "subscribe",
      params: { channels: ["cfbenchmarks_value"], index_ids: [BRTI_INDEX_ID] },
    }));
    transport.send(JSON.stringify({
      id: 2,
      cmd: "subscribe",
      params: { channels: ["cfbenchmarks_value_5hz"], index_ids: [BRTI_INDEX_ID] },
    }));
    const deadline = started + input.durationSeconds * 1000;
    while (nowMs() < deadline && summaries.length < input.messageCap) {
      await wait(Math.min(250, deadline - nowMs()));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "live-ws-failed";
    if (/\b401\b/.test(message)) {
      handshakeErrorCategory = "authentication-failure";
    } else if (/\b403\b/.test(message)) {
      handshakeErrorCategory = "entitlement-denial";
    } else {
      handshakeErrorCategory = "upstream-or-transient";
    }
  } finally {
    transport.close();
  }

  const sawSettlementWindowAverage = summaries.some((item) => item.hasLast60sWindowedAverage15min);
  return {
    attempted: true,
    connected,
    channels,
    durationMs: nowMs() - started,
    messagesReceived: summaries.length,
    summaries: summaries.slice(0, 20),
    handshakeErrorCategory,
    sawSettlementWindowAverage,
    limitedBecauseNoSettlementWindow: connected && !sawSettlementWindowAverage,
  };
}
