import { describe, expect, it } from "vitest";

import {
  O6_FIVE_CLOSE_CAMPAIGN_ID,
  O6_FIVE_CLOSE_COUNT,
  O6_HTTP_CAMPAIGN_CEILING,
  O6_HTTP_PER_CLOSE,
  assertManifestImmutableTargets,
  freezeFiveCloseCampaign,
  markSlotTerminal,
  nextPendingSlot,
  selectFirstEligibleCloseMs,
  sumCampaignHttp,
} from "./freezeFiveClose";
import { O6_FIVE_CLOSE_TIMING } from "@/lib/data/research/kalshiOneCloseSettlementFidelity/freezeOneClose";

describe("O6 five-close freeze", () => {
  it("selects a close with ≥90s connect margin and readiness window", () => {
    const nowMs = Date.parse("2026-09-25T03:24:00Z");
    const first = selectFirstEligibleCloseMs(nowMs, O6_FIVE_CLOSE_TIMING);
    expect(first).toBe(Date.parse("2026-09-25T03:30:00Z"));
    expect(first - nowMs).toBeGreaterThanOrEqual(O6_FIVE_CLOSE_TIMING.connectBeforeMs);
  });

  it("skips a close that is inside the readiness window", () => {
    // 40s before close — past readiness (−120s) and past connect (−90s)
    const nowMs = Date.parse("2026-09-25T03:29:20Z");
    const first = selectFirstEligibleCloseMs(nowMs, O6_FIVE_CLOSE_TIMING);
    expect(first).toBe(Date.parse("2026-09-25T03:45:00Z"));
  });

  it("freezes exactly five immutable quarter-hour targets with O6 timing", () => {
    const nowMs = Date.parse("2026-09-25T03:24:00Z");
    const manifest = freezeFiveCloseCampaign({
      nowMs,
      codeSha: "abc",
      frozenAtUtc: "2026-09-25T03:24:00.000Z",
    });
    expect(manifest.campaignId).toBe(O6_FIVE_CLOSE_CAMPAIGN_ID);
    expect(manifest.targets).toHaveLength(O6_FIVE_CLOSE_COUNT);
    expect(manifest.independentBackup).toBe(false);
    expect(manifest.retentionMode).toBe("local-persistent-only");
    expect(manifest.httpCeilingPerClose).toBe(O6_HTTP_PER_CLOSE);
    expect(manifest.httpCeilingCampaign).toBe(O6_HTTP_CAMPAIGN_CEILING);
    expect(manifest.predeclaredComparisons.fiveHzTo1HzHypotheses).toEqual([]);
    expect(manifest.predeclaredComparisons.recomputeFrom1HzSourceTimestampsOnly).toBe(true);

    const closes = manifest.targets.map((t) => t.closeUtc);
    expect(closes).toEqual([
      "2026-09-25T03:30:00.000Z",
      "2026-09-25T03:45:00.000Z",
      "2026-09-25T04:00:00.000Z",
      "2026-09-25T04:15:00.000Z",
      "2026-09-25T04:30:00.000Z",
    ]);

    const plan0 = manifest.targets[0]!.plan;
    expect(plan0.connectEarliestMs).toBe(plan0.closeMs - 90_000);
    expect(plan0.captureStopMs).toBe(plan0.closeMs + 15_000);
    expect(plan0.maxConnectedMs).toBe(105_000);
    expect(plan0.includeOrderbook).toBe(false);
    expect(plan0.independentBackup).toBe(false);
  });

  it("forbids substituting frozen closes on resume", () => {
    const a = freezeFiveCloseCampaign({
      nowMs: Date.parse("2026-09-25T03:24:00Z"),
      codeSha: "a",
    });
    const b = freezeFiveCloseCampaign({
      nowMs: Date.parse("2026-09-25T03:24:00Z"),
      codeSha: "a",
      firstCloseMs: Date.parse("2026-09-25T03:45:00Z"),
    });
    expect(() => assertManifestImmutableTargets(a, b)).toThrow(/substitution-forbidden/);
  });

  it("tracks terminal slots without resetting pending order", () => {
    let manifest = freezeFiveCloseCampaign({
      nowMs: Date.parse("2026-09-25T03:24:00Z"),
      codeSha: null,
    });
    expect(nextPendingSlot(manifest)?.slotIndex).toBe(0);
    manifest = markSlotTerminal(manifest, 0, {
      status: "missed-slot",
      capture: "missed-slot",
      official: "not-attempted",
      retention: "not-attempted",
      httpConsumed: 0,
      reason: "missed",
      completedAtUtc: "2026-09-25T03:31:00.000Z",
    });
    expect(nextPendingSlot(manifest)?.slotIndex).toBe(1);
    expect(sumCampaignHttp(manifest)).toBe(0);
  });
});
