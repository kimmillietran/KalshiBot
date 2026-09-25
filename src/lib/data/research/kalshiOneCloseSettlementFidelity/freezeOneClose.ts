import { nextQuarterHourCloseMs } from "@/lib/data/research/kalshiBrtiAccessProbe/planLiveCloseWindow";

import {
  ONE_CLOSE_CAMPAIGN_ID,
  ONE_CLOSE_CAPTURE_START_BEFORE_MS,
  ONE_CLOSE_CAPTURE_STOP_AFTER_MS,
  ONE_CLOSE_CONNECT_BEFORE_MS,
  ONE_CLOSE_MAX_CONNECTED_MS,
  ONE_CLOSE_READINESS_BEFORE_CLOSE_MS,
  OneCloseFidelityError,
  type OneClosePlan,
  type RetentionMode,
} from "./types";

/**
 * Freeze exactly one quarter-hour close. When `closeMs` is omitted, uses the
 * next close strictly after `nowMs`. Substitution of a later close is forbidden
 * once this plan object is persisted by the caller.
 *
 * Capture stop is min(close+20s, connect+90s) so the connected window never
 * exceeds 90s when connecting at close−75s (effective stop = close+15s).
 */
export type OneCloseTimingProfile = {
  connectBeforeMs: number;
  captureStartBeforeMs: number;
  captureStopAfterMs: number;
  maxConnectedMs: number;
  readinessBeforeCloseMs: number;
};

export const DEFAULT_ONE_CLOSE_TIMING: OneCloseTimingProfile = {
  connectBeforeMs: ONE_CLOSE_CONNECT_BEFORE_MS,
  captureStartBeforeMs: ONE_CLOSE_CAPTURE_START_BEFORE_MS,
  captureStopAfterMs: ONE_CLOSE_CAPTURE_STOP_AFTER_MS,
  maxConnectedMs: ONE_CLOSE_MAX_CONNECTED_MS,
  readinessBeforeCloseMs: ONE_CLOSE_READINESS_BEFORE_CLOSE_MS,
};

/**
 * O6 five-close protocol: connect ≥90s before close, capture ≥15s after,
 * connected window covers the full interval (105s).
 */
export const O6_FIVE_CLOSE_TIMING: OneCloseTimingProfile = {
  connectBeforeMs: 90_000,
  captureStartBeforeMs: 85_000,
  captureStopAfterMs: 15_000,
  maxConnectedMs: 105_000,
  readinessBeforeCloseMs: 120_000,
};

export function freezeOneClosePlan(input: {
  nowMs: number;
  frozenAtUtc?: string;
  closeMs?: number;
  campaignId?: string;
  retentionMode?: RetentionMode;
  timing?: OneCloseTimingProfile;
}): OneClosePlan {
  const timing = input.timing ?? DEFAULT_ONE_CLOSE_TIMING;
  const closeMs = input.closeMs ?? nextQuarterHourCloseMs(input.nowMs);
  if (input.closeMs == null && closeMs <= input.nowMs) {
    throw new OneCloseFidelityError("freeze-failed: next-close-not-after-now");
  }
  const connectEarliestMs = closeMs - timing.connectBeforeMs;
  const captureStartMs = closeMs - timing.captureStartBeforeMs;
  const captureStopMs = Math.min(
    closeMs + timing.captureStopAfterMs,
    connectEarliestMs + timing.maxConnectedMs,
  );
  const readinessCutoffMs = closeMs - timing.readinessBeforeCloseMs;
  const retentionMode = input.retentionMode ?? "local-persistent-only";
  return {
    campaignId: input.campaignId ?? ONE_CLOSE_CAMPAIGN_ID,
    closeUtc: new Date(closeMs).toISOString(),
    closeMs,
    connectEarliestMs,
    captureStartMs,
    captureStopMs,
    readinessCutoffMs,
    maxConnectedMs: timing.maxConnectedMs,
    indexSymbol: "BRTI",
    includeOrderbook: false,
    retentionMode,
    independentBackup: retentionMode === "independent-archive",
    frozenAtUtc: input.frozenAtUtc ?? new Date(input.nowMs).toISOString(),
    substitutionForbidden: true,
  };
}

export function classifyMissedSlot(
  plan: OneClosePlan,
  nowMs: number,
): "ok-to-connect" | "late-but-before-close" | "missed-slot" {
  if (nowMs >= plan.closeMs) {
    return "missed-slot";
  }
  if (nowMs > plan.connectEarliestMs) {
    return "late-but-before-close";
  }
  return "ok-to-connect";
}

export function toSynchronizedWindowPlan(input: {
  plan: OneClosePlan;
  nowMs: number;
}): {
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
} {
  const plannedStartMs = input.plan.connectEarliestMs;
  const lateStart = input.nowMs > plannedStartMs && input.nowMs < input.plan.captureStopMs;
  const actualStartMs = lateStart ? input.nowMs : plannedStartMs;
  const stopMs = Math.min(
    input.plan.captureStopMs,
    actualStartMs + input.plan.maxConnectedMs,
  );
  const durationMs = stopMs - actualStartMs;
  return {
    closeMs: input.plan.closeMs,
    plannedStartMs,
    actualStartMs,
    stopMs,
    durationMs,
    lateStart,
    closeIso: input.plan.closeUtc,
    plannedStartIso: new Date(plannedStartMs).toISOString(),
    actualStartIso: new Date(actualStartMs).toISOString(),
    stopIso: new Date(stopMs).toISOString(),
  };
}
