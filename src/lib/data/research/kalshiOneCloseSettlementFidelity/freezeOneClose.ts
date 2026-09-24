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
export function freezeOneClosePlan(input: {
  nowMs: number;
  frozenAtUtc?: string;
  closeMs?: number;
  campaignId?: string;
  retentionMode?: RetentionMode;
}): OneClosePlan {
  const closeMs = input.closeMs ?? nextQuarterHourCloseMs(input.nowMs);
  if (input.closeMs == null && closeMs <= input.nowMs) {
    throw new OneCloseFidelityError("freeze-failed: next-close-not-after-now");
  }
  const connectEarliestMs = closeMs - ONE_CLOSE_CONNECT_BEFORE_MS;
  const captureStartMs = closeMs - ONE_CLOSE_CAPTURE_START_BEFORE_MS;
  const captureStopMs = Math.min(
    closeMs + ONE_CLOSE_CAPTURE_STOP_AFTER_MS,
    connectEarliestMs + ONE_CLOSE_MAX_CONNECTED_MS,
  );
  const readinessCutoffMs = closeMs - ONE_CLOSE_READINESS_BEFORE_CLOSE_MS;
  const retentionMode = input.retentionMode ?? "local-persistent-only";
  return {
    campaignId: input.campaignId ?? ONE_CLOSE_CAMPAIGN_ID,
    closeUtc: new Date(closeMs).toISOString(),
    closeMs,
    connectEarliestMs,
    captureStartMs,
    captureStopMs,
    readinessCutoffMs,
    maxConnectedMs: ONE_CLOSE_MAX_CONNECTED_MS,
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
