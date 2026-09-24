import { nextQuarterHourCloseMs } from "@/lib/data/research/kalshiBrtiAccessProbe/planLiveCloseWindow";

import {
  ONE_CLOSE_CAMPAIGN_ID,
  ONE_CLOSE_CAPTURE_START_BEFORE_MS,
  ONE_CLOSE_CAPTURE_STOP_AFTER_MS,
  ONE_CLOSE_CONNECT_BEFORE_MS,
  ONE_CLOSE_MAX_CONNECTED_MS,
  ONE_CLOSE_READINESS_LEAD_BEFORE_CAPTURE_START_MS,
  OneCloseFidelityError,
  type OneClosePlan,
} from "./types";

/**
 * Freeze exactly one quarter-hour close. When `closeMs` is omitted, uses the
 * next close strictly after `nowMs`. Substitution of a later close is forbidden
 * once this plan object is persisted by the caller.
 */
export function freezeOneClosePlan(input: {
  nowMs: number;
  frozenAtUtc?: string;
  /** Exact close epoch ms — required when resuming a previously frozen target. */
  closeMs?: number;
  campaignId?: string;
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
  const readinessCutoffMs = captureStartMs - ONE_CLOSE_READINESS_LEAD_BEFORE_CAPTURE_START_MS;
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
    frozenAtUtc: input.frozenAtUtc ?? new Date(input.nowMs).toISOString(),
    substitutionForbidden: true,
  };
}

export function classifyMissedSlot(plan: OneClosePlan, nowMs: number): "ok-to-connect" | "late-but-before-close" | "missed-slot" {
  if (nowMs >= plan.closeMs) {
    return "missed-slot";
  }
  if (nowMs > plan.connectEarliestMs) {
    return "late-but-before-close";
  }
  return "ok-to-connect";
}
