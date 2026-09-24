import {
  MAPPING_MAX_CONNECTIONS_PER_STREAM,
  MAPPING_MAX_DURATION_MS,
  MAPPING_MAX_MESSAGES,
  MAPPING_MAX_POST_CLOSE_SETTLEMENT,
  MAPPING_MAX_RAW_BYTES,
  MAPPING_POST_CLOSE_MS,
  MAPPING_PRE_CLOSE_MS,
} from "./types";
import { nextQuarterHourCloseMs } from "@/lib/data/research/kalshiBrtiAccessProbe/planLiveCloseWindow";

export type SynchronizedWindowPlan = {
  closeMs: number;
  plannedStartMs: number;
  actualStartMs: number;
  stopMs: number;
  durationMs: number;
  lateStart: boolean;
  closeIso: string;
  plannedStartIso: string;
  actualStartIso: string;
  stopIso: string;
};

export type SessionLimitState = {
  messagesReceived: number;
  rawBytes: number;
  connectionAttemptsByStream: Record<string, number>;
  startedAtMs: number;
  stopAtMs: number;
  shutdownRequested: boolean;
  stopReason: string | null;
};

export function planSynchronizedWindow(nowMs: number): SynchronizedWindowPlan {
  let closeMs = nextQuarterHourCloseMs(nowMs);
  let plannedStartMs = closeMs - MAPPING_PRE_CLOSE_MS;
  let stopMs = closeMs + MAPPING_POST_CLOSE_MS;
  if (nowMs >= stopMs) {
    closeMs = nextQuarterHourCloseMs(closeMs);
    plannedStartMs = closeMs - MAPPING_PRE_CLOSE_MS;
    stopMs = closeMs + MAPPING_POST_CLOSE_MS;
  }
  const lateStart = nowMs > plannedStartMs && nowMs < stopMs;
  const actualStartMs = lateStart ? nowMs : plannedStartMs;
  const durationMs = Math.min(stopMs - actualStartMs, MAPPING_MAX_DURATION_MS);
  return {
    closeMs,
    plannedStartMs,
    actualStartMs,
    stopMs: actualStartMs + durationMs,
    durationMs,
    lateStart,
    closeIso: new Date(closeMs).toISOString(),
    plannedStartIso: new Date(plannedStartMs).toISOString(),
    actualStartIso: new Date(actualStartMs).toISOString(),
    stopIso: new Date(actualStartMs + durationMs).toISOString(),
  };
}

export function createSessionLimitState(input: {
  startedAtMs: number;
  stopAtMs: number;
}): SessionLimitState {
  return {
    messagesReceived: 0,
    rawBytes: 0,
    connectionAttemptsByStream: {},
    startedAtMs: input.startedAtMs,
    stopAtMs: input.stopAtMs,
    shutdownRequested: false,
    stopReason: null,
  };
}

export function registerConnectionAttempt(state: SessionLimitState, stream: string): boolean {
  const used = state.connectionAttemptsByStream[stream] ?? 0;
  if (used >= MAPPING_MAX_CONNECTIONS_PER_STREAM) {
    state.stopReason = state.stopReason ?? `connection-attempt-limit:${stream}`;
    return false;
  }
  state.connectionAttemptsByStream[stream] = used + 1;
  return true;
}

export function recordReceivedMessage(state: SessionLimitState, bytes: number, nowMs: number): boolean {
  if (state.shutdownRequested) {
    return false;
  }
  if (nowMs >= state.stopAtMs) {
    requestCleanShutdown(state, "deadline");
    return false;
  }
  if (nowMs - state.startedAtMs >= MAPPING_MAX_DURATION_MS) {
    requestCleanShutdown(state, "max-duration");
    return false;
  }
  if (state.messagesReceived >= MAPPING_MAX_MESSAGES) {
    requestCleanShutdown(state, "message-cap");
    return false;
  }
  if (state.rawBytes + bytes > MAPPING_MAX_RAW_BYTES) {
    requestCleanShutdown(state, "byte-cap");
    return false;
  }
  state.messagesReceived += 1;
  state.rawBytes += bytes;
  return true;
}

export function requestCleanShutdown(state: SessionLimitState, reason: string): void {
  if (state.shutdownRequested) {
    return;
  }
  state.shutdownRequested = true;
  state.stopReason = reason;
}

export function remainingPostCloseSettlementAttempts(used: number): number {
  return Math.max(0, MAPPING_MAX_POST_CLOSE_SETTLEMENT - used);
}

export const SESSION_LIMITS = {
  preCloseMs: MAPPING_PRE_CLOSE_MS,
  postCloseMs: MAPPING_POST_CLOSE_MS,
  maxDurationMs: MAPPING_MAX_DURATION_MS,
  maxMessages: MAPPING_MAX_MESSAGES,
  maxRawBytes: MAPPING_MAX_RAW_BYTES,
  maxConnectionsPerStream: MAPPING_MAX_CONNECTIONS_PER_STREAM,
} as const;
