/**
 * O6 five-close prospective settlement-fidelity campaign.
 * Reuses one-close capture/replay; freezes five immutable quarter-hour targets.
 */

import { nextQuarterHourCloseMs } from "@/lib/data/research/kalshiBrtiAccessProbe/planLiveCloseWindow";
import {
  O6_FIVE_CLOSE_TIMING,
  freezeOneClosePlan,
  type OneCloseTimingProfile,
} from "@/lib/data/research/kalshiOneCloseSettlementFidelity/freezeOneClose";
import {
  ONE_CLOSE_MAX_HTTP,
  QUARTER_HOUR_MEMBERSHIP,
  TRAILING_MEMBERSHIP,
  OneCloseFidelityError,
  type CaptureStatus,
  type OfficialStatus,
  type OneClosePlan,
  type RetentionMode,
  type RetentionStatus,
} from "@/lib/data/research/kalshiOneCloseSettlementFidelity/types";

export const O6_FIVE_CLOSE_CAMPAIGN_ID =
  "kalshi-kxbtc15m-o6-five-close-settlement-fidelity-v0" as const;

export const O6_FIVE_CLOSE_STUDY_ID = O6_FIVE_CLOSE_CAMPAIGN_ID;

export const O6_FIVE_CLOSE_COUNT = 5 as const;

export const O6_HTTP_PER_CLOSE = ONE_CLOSE_MAX_HTTP; // 12
export const O6_HTTP_CAMPAIGN_CEILING = 60 as const;
export const O6_WS_MAX_CONNECTIONS_PER_CLOSE = 2 as const;

export const DEFAULT_O6_FIVE_CLOSE_OUT_DIR =
  "data/research-results/external-kalshi-data-audit/m17-o6-five-close-settlement-fidelity" as const;

export type FiveCloseTargetStatus =
  | "pending"
  | "in-progress"
  | "captured"
  | "missed-slot"
  | "bind-failed"
  | "connect-failed"
  | "limit-stop"
  | "refused-readiness"
  | "failed";

export type FiveCloseTargetRecord = {
  slotIndex: number;
  closeUtc: string;
  closeMs: number;
  closeLocalPdt: string;
  connectEarliestUtc: string;
  captureStartUtc: string;
  captureStopUtc: string;
  readinessCutoffUtc: string;
  plan: OneClosePlan;
  /** Per-slot out dir relative to campaign out root. */
  slotOutDirRel: string;
  /** Per-slot campaign id (HTTP ledger isolation at 12). */
  slotCampaignId: string;
  status: FiveCloseTargetStatus;
  capture: CaptureStatus | null;
  official: OfficialStatus | null;
  retention: RetentionStatus | null;
  httpConsumed: number | null;
  reason: string | null;
  completedAtUtc: string | null;
};

export type FiveCloseCampaignManifest = {
  campaignId: typeof O6_FIVE_CLOSE_CAMPAIGN_ID;
  studyId: typeof O6_FIVE_CLOSE_STUDY_ID;
  codeSha: string | null;
  frozenAtUtc: string;
  retentionMode: "local-persistent-only";
  independentBackup: false;
  /** Explicit local-persistent authorization note (not a durable off-host archive). */
  retentionNote: string;
  httpCeilingPerClose: typeof O6_HTTP_PER_CLOSE;
  httpCeilingCampaign: typeof O6_HTTP_CAMPAIGN_CEILING;
  wsMaxConnectionsPerClose: typeof O6_WS_MAX_CONNECTIONS_PER_CLOSE;
  timing: OneCloseTimingProfile;
  predeclaredComparisons: {
    trailingMembership: typeof TRAILING_MEMBERSHIP;
    quarterHourMembership: typeof QUARTER_HOUR_MEMBERSHIP;
    axes: [
      "raw-string-equality",
      "exact-decimal-equality",
      "diagnostic-half-even-2dp",
    ];
    dualFieldDifferenceAtCount60: true;
    recomputeFrom1HzSourceTimestampsOnly: true;
    fiveHzKeptSeparate: true;
    fiveHzTo1HzHypotheses: [];
    noOffsetSearch: true;
    noThresholdSweep: true;
    noCherryPick: true;
    noPostHocRuleChange: true;
  };
  substitutionForbidden: true;
  targets: FiveCloseTargetRecord[];
  campaignHttpConsumed: number;
  updatedAtUtc: string;
};

function formatPdt(closeMs: number): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(new Date(closeMs));
  } catch {
    return new Date(closeMs).toISOString();
  }
}

/**
 * Earliest quarter-hour close that still has readiness margin
 * (close − readinessBeforeCloseMs > nowMs).
 */
export function selectFirstEligibleCloseMs(
  nowMs: number,
  timing: OneCloseTimingProfile = O6_FIVE_CLOSE_TIMING,
): number {
  let closeMs = nextQuarterHourCloseMs(nowMs);
  for (let i = 0; i < 96; i += 1) {
    const readinessCutoff = closeMs - timing.readinessBeforeCloseMs;
    const connectEarliest = closeMs - timing.connectBeforeMs;
    if (nowMs < readinessCutoff && connectEarliest > nowMs) {
      return closeMs;
    }
    closeMs = nextQuarterHourCloseMs(closeMs);
  }
  throw new OneCloseFidelityError("no-eligible-quarter-hour-close-in-horizon");
}

export function freezeFiveCloseCampaign(input: {
  nowMs: number;
  codeSha: string | null;
  frozenAtUtc?: string;
  firstCloseMs?: number;
}): FiveCloseCampaignManifest {
  const timing = O6_FIVE_CLOSE_TIMING;
  const frozenAtUtc = input.frozenAtUtc ?? new Date(input.nowMs).toISOString();
  const firstCloseMs = input.firstCloseMs
    ?? selectFirstEligibleCloseMs(input.nowMs, timing);
  const targets: FiveCloseTargetRecord[] = [];
  for (let slot = 0; slot < O6_FIVE_CLOSE_COUNT; slot += 1) {
    const closeMs = firstCloseMs + slot * 15 * 60_000;
    const slotCampaignId = `${O6_FIVE_CLOSE_CAMPAIGN_ID}/slot-${slot}`;
    const plan = freezeOneClosePlan({
      nowMs: input.nowMs,
      closeMs,
      campaignId: slotCampaignId,
      retentionMode: "local-persistent-only",
      frozenAtUtc,
      timing,
    });
    const closeTag = plan.closeUtc.replace(/[:.]/g, "-");
    targets.push({
      slotIndex: slot,
      closeUtc: plan.closeUtc,
      closeMs: plan.closeMs,
      closeLocalPdt: formatPdt(plan.closeMs),
      connectEarliestUtc: new Date(plan.connectEarliestMs).toISOString(),
      captureStartUtc: new Date(plan.captureStartMs).toISOString(),
      captureStopUtc: new Date(plan.captureStopMs).toISOString(),
      readinessCutoffUtc: new Date(plan.readinessCutoffMs).toISOString(),
      plan,
      slotOutDirRel: `slots/slot-${slot}-${closeTag}`,
      slotCampaignId,
      status: "pending",
      capture: null,
      official: null,
      retention: null,
      httpConsumed: null,
      reason: null,
      completedAtUtc: null,
    });
  }
  return {
    campaignId: O6_FIVE_CLOSE_CAMPAIGN_ID,
    studyId: O6_FIVE_CLOSE_STUDY_ID,
    codeSha: input.codeSha,
    frozenAtUtc,
    retentionMode: "local-persistent-only",
    independentBackup: false,
    retentionNote:
      "Authorized local-persistent-only with independentBackup=false. "
      + "Same-disk copies are not an independent backup. "
      + "PR #129 durable-archive wording is superseded by this explicit authorization.",
    httpCeilingPerClose: O6_HTTP_PER_CLOSE,
    httpCeilingCampaign: O6_HTTP_CAMPAIGN_CEILING,
    wsMaxConnectionsPerClose: O6_WS_MAX_CONNECTIONS_PER_CLOSE,
    timing,
    predeclaredComparisons: {
      trailingMembership: TRAILING_MEMBERSHIP,
      quarterHourMembership: QUARTER_HOUR_MEMBERSHIP,
      axes: [
        "raw-string-equality",
        "exact-decimal-equality",
        "diagnostic-half-even-2dp",
      ],
      dualFieldDifferenceAtCount60: true,
      recomputeFrom1HzSourceTimestampsOnly: true,
      fiveHzKeptSeparate: true,
      fiveHzTo1HzHypotheses: [],
      noOffsetSearch: true,
      noThresholdSweep: true,
      noCherryPick: true,
      noPostHocRuleChange: true,
    },
    substitutionForbidden: true,
    targets,
    campaignHttpConsumed: 0,
    updatedAtUtc: frozenAtUtc,
  };
}

export function assertManifestImmutableTargets(
  existing: FiveCloseCampaignManifest,
  candidate: FiveCloseCampaignManifest,
): void {
  if (existing.targets.length !== candidate.targets.length) {
    throw new OneCloseFidelityError("five-close-manifest-length-mismatch");
  }
  for (let i = 0; i < existing.targets.length; i += 1) {
    if (existing.targets[i]!.closeMs !== candidate.targets[i]!.closeMs) {
      throw new OneCloseFidelityError(
        `five-close-substitution-forbidden: slot ${i} frozen=${existing.targets[i]!.closeUtc} `
          + `candidate=${candidate.targets[i]!.closeUtc}`,
      );
    }
  }
}

export function sumCampaignHttp(manifest: FiveCloseCampaignManifest): number {
  return manifest.targets.reduce((sum, t) => sum + (t.httpConsumed ?? 0), 0);
}

export function nextPendingSlot(
  manifest: FiveCloseCampaignManifest,
): FiveCloseTargetRecord | null {
  return manifest.targets.find((t) => t.status === "pending" || t.status === "in-progress")
    ?? null;
}

export function markSlotTerminal(
  manifest: FiveCloseCampaignManifest,
  slotIndex: number,
  update: {
    status: FiveCloseTargetStatus;
    capture: CaptureStatus | null;
    official: OfficialStatus | null;
    retention: RetentionStatus | null;
    httpConsumed: number | null;
    reason: string | null;
    completedAtUtc: string;
  },
): FiveCloseCampaignManifest {
  const targets = manifest.targets.map((t) => {
    if (t.slotIndex !== slotIndex) return t;
    return {
      ...t,
      status: update.status,
      capture: update.capture,
      official: update.official,
      retention: update.retention,
      httpConsumed: update.httpConsumed,
      reason: update.reason,
      completedAtUtc: update.completedAtUtc,
    };
  });
  const next: FiveCloseCampaignManifest = {
    ...manifest,
    targets,
    campaignHttpConsumed: targets.reduce((s, t) => s + (t.httpConsumed ?? 0), 0),
    updatedAtUtc: update.completedAtUtc,
  };
  if (next.campaignHttpConsumed > O6_HTTP_CAMPAIGN_CEILING) {
    throw new OneCloseFidelityError(
      `campaign-http-ceiling-exceeded: ${next.campaignHttpConsumed}>${O6_HTTP_CAMPAIGN_CEILING}`,
    );
  }
  return next;
}
