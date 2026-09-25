import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";

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
import {
  parseO6FiveCloseArgv,
  runO6FiveCloseCampaign,
  type FiveCloseIo,
} from "./runFiveCloseCampaign";
import { O6_FIVE_CLOSE_TIMING } from "@/lib/data/research/kalshiOneCloseSettlementFidelity/freezeOneClose";
import type { RetentionIo } from "@/lib/data/research/kalshiOneCloseSettlementFidelity/retentionReadiness";

function memoryRetentionIo(input: {
  primaryDev: number;
  primaryRoot?: string;
}): RetentionIo {
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>();
  const primaryRoot = input.primaryRoot
    ?? "/Users/tester/Documents/KalshiResearchArchive/one-close";
  return {
    exists: (path) => files.has(path) || dirs.has(path),
    mkdir: (path) => {
      dirs.add(path);
    },
    writeFile: (path, contents) => {
      files.set(path, Buffer.isBuffer(contents) ? contents : Buffer.from(contents));
    },
    readFile: (path) => {
      const buf = files.get(path);
      if (!buf) throw new Error(`missing ${path}`);
      return buf;
    },
    rename: (from, to) => {
      const buf = files.get(from);
      if (!buf) throw new Error(`missing ${from}`);
      files.set(to, buf);
      files.delete(from);
    },
    deviceId: () => input.primaryDev,
    env: {
      HOME: "/Users/tester",
      KALSHI_FIDELITY_PRIMARY_ROOT: primaryRoot,
    },
  };
}

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

describe("O6 five-close campaign orchestration", () => {
  function memoryIo(seed: {
    nowMs: number;
    files?: Record<string, string>;
  }): FiveCloseIo & { files: Map<string, string> } {
    const files = new Map<string, string>(Object.entries(seed.files ?? {}));
    const nowMs = seed.nowMs;
    return {
      files,
      writeFile: (path, contents) => {
        files.set(path, contents);
      },
      readFile: (path) => files.get(path) ?? null,
      mkdir: () => undefined,
      exists: (path) => files.has(path),
      nowMs: () => nowMs,
      sleep: async () => undefined,
      codeSha: () => "test-sha",
    };
  }

  function readyRetentionIo(primaryRoot: string): RetentionIo {
    return memoryRetentionIo({ primaryDev: 1, primaryRoot });
  }

  it("parses freeze-only and authorize-live flags", () => {
    expect(parseO6FiveCloseArgv(["--freeze-only"])).toEqual({
      authorizeLive: false,
      freezeOnly: true,
      outDir: "data/research-results/external-kalshi-data-audit/m17-o6-five-close-settlement-fidelity",
    });
    expect(parseO6FiveCloseArgv(["--authorize-live", "--out-dir", "tmp/out"])).toEqual({
      authorizeLive: true,
      freezeOnly: false,
      outDir: "tmp/out",
    });
  });

  it("freeze-only writes schedule and refuses live execution", async () => {
    const io = memoryIo({ nowMs: Date.parse("2026-09-25T03:24:00Z") });
    const result = await runO6FiveCloseCampaign({
      repoRoot: "/repo",
      argv: {
        authorizeLive: false,
        freezeOnly: true,
        outDir: "out",
      },
      io,
      retentionIo: readyRetentionIo(
        "/Users/tester/Documents/KalshiResearchArchive/o6-five-close",
      ),
    });
    expect(result.liveExecution).toBe("freeze-only");
    expect(result.manifest.targets).toHaveLength(5);
    expect(result.slotReports).toEqual([]);
    expect(io.files.has("/repo/out/five-close-campaign-manifest.json")).toBe(true);
    expect(io.files.has("/repo/out/five-close-frozen-schedule.json")).toBe(true);
  });

  it("recovers in-progress slot from durable live-result instead of mislabeling missed", async () => {
    const nowMs = Date.parse("2026-09-25T03:24:00Z");
    const frozen = freezeFiveCloseCampaign({
      nowMs,
      codeSha: "test-sha",
      frozenAtUtc: "2026-09-25T03:24:00.000Z",
    });
    const slot0 = {
      ...frozen.targets[0]!,
      status: "in-progress" as const,
      reason: "live-executing",
    };
    const manifest = {
      ...frozen,
      targets: [slot0, ...frozen.targets.slice(1)],
    };
    const liveResult = {
      slotIndex: 0,
      closeUtc: slot0.closeUtc,
      capture: "ok" as const,
      official: "retrieved" as const,
      retention: "verified" as const,
      httpConsumed: 4,
      reason: null,
      completedAtUtc: "2026-09-25T03:30:20.000Z",
    };
    const liveResultPath = join(
      "/repo/out",
      slot0.slotOutDirRel,
      "slot-live-result.json",
    );
    const io = memoryIo({
      // After last close — without recovery slot0 would become missed-slot;
      // remaining slots are missed with no substitution.
      nowMs: Date.parse("2026-09-25T04:35:00Z"),
      files: {
        "/repo/out/five-close-campaign-manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
        [liveResultPath]: `${JSON.stringify(liveResult, null, 2)}\n`,
      },
    });

    const executeSpy = vi.fn();
    const result = await runO6FiveCloseCampaign({
      repoRoot: "/repo",
      argv: {
        authorizeLive: true,
        freezeOnly: false,
        outDir: "out",
      },
      io,
      retentionIo: readyRetentionIo(
        "/Users/tester/Documents/KalshiResearchArchive/o6-five-close",
      ),
      liveDeps: {
        nowMs: () => Date.parse("2026-09-25T04:35:00Z"),
        sleep: async () => undefined,
        // Should not be invoked; recovered + remaining missed
        capture: executeSpy as never,
      },
    });

    expect(result.liveExecution).toBe("executed");
    expect(result.manifest.targets[0]!.status).toBe("captured");
    expect(result.manifest.targets[0]!.httpConsumed).toBe(4);
    expect(result.manifest.targets[0]!.capture).toBe("ok");
    // Remaining slots past readiness/close → missed, no substitution of new closes
    expect(result.manifest.targets.slice(1).every((t) => t.status === "missed-slot")).toBe(true);
    expect(result.manifest.targets.map((t) => t.closeUtc)).toEqual(frozen.targets.map((t) => t.closeUtc));
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it("fails abandoned in-progress partial raw without re-running or substituting", async () => {
    const nowMs = Date.parse("2026-09-25T03:24:00Z");
    const frozen = freezeFiveCloseCampaign({
      nowMs,
      codeSha: "test-sha",
      frozenAtUtc: "2026-09-25T03:24:00.000Z",
    });
    const slot0 = {
      ...frozen.targets[0]!,
      status: "in-progress" as const,
      reason: "live-executing",
    };
    const manifest = {
      ...frozen,
      targets: [slot0, ...frozen.targets.slice(1)],
    };
    const primaryRoot = "/Users/tester/Documents/KalshiResearchArchive/o6-five-close";
    const partialRaw = join(
      primaryRoot,
      O6_FIVE_CLOSE_CAMPAIGN_ID,
      `slot-0-${slot0.closeUtc.replace(/[:.]/g, "-")}`,
      "raw",
      "synchronized-capture.jsonl",
    );
    const ledgerPath = join("/repo/out", slot0.slotOutDirRel, "http-budget-ledger.json");
    const io = memoryIo({
      // After campaign window — partial-raw handling must still win for slot0.
      nowMs: Date.parse("2026-09-25T04:35:00Z"),
      files: {
        "/repo/out/five-close-campaign-manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
        [partialRaw]: "{\"partial\":true}\n",
        [ledgerPath]: `${JSON.stringify({ consumed: 3, limit: 12 }, null, 2)}\n`,
      },
    });
    // exists() must see the partial raw path
    const baseExists = io.exists.bind(io);
    io.exists = (path) => path === partialRaw || baseExists(path);

    const captureSpy = vi.fn();
    const result = await runO6FiveCloseCampaign({
      repoRoot: "/repo",
      argv: {
        authorizeLive: true,
        freezeOnly: false,
        outDir: "out",
      },
      io,
      retentionIo: readyRetentionIo(primaryRoot),
      liveDeps: {
        nowMs: () => Date.parse("2026-09-25T04:35:00Z"),
        sleep: async () => undefined,
        capture: captureSpy as never,
      },
    });

    expect(result.manifest.targets[0]!.status).toBe("failed");
    expect(result.manifest.targets[0]!.reason).toMatch(/abandoned-in-progress-partial-raw/);
    expect(result.manifest.targets[0]!.httpConsumed).toBe(3);
    expect(result.manifest.targets.slice(1).every((t) => t.status === "missed-slot")).toBe(true);
    expect(result.manifest.targets.map((t) => t.closeUtc)).toEqual(frozen.targets.map((t) => t.closeUtc));
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("retries in-progress slot after readiness cutoff when close is still ahead", async () => {
    const nowMs = Date.parse("2026-09-25T03:24:00Z");
    const frozen = freezeFiveCloseCampaign({
      nowMs,
      codeSha: "test-sha",
      frozenAtUtc: "2026-09-25T03:24:00.000Z",
    });
    const slot0 = {
      ...frozen.targets[0]!,
      status: "in-progress" as const,
      reason: "live-executing",
    };
    // Past readiness (close−120s) but still before connect (close−90s).
    let clock = slot0.plan.readinessCutoffMs + 1_000;
    expect(clock).toBeLessThan(slot0.plan.connectEarliestMs);
    const manifest = {
      ...frozen,
      targets: [slot0, ...frozen.targets.slice(1)],
    };
    const io = memoryIo({
      nowMs: clock,
      files: {
        "/repo/out/five-close-campaign-manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
      },
    });
    io.nowMs = () => clock;
    // After the first slot attempt, jump past the campaign so remaining slots miss.
    io.sleep = async () => {
      clock = Date.parse("2026-09-25T04:35:00Z");
    };

    const result = await runO6FiveCloseCampaign({
      repoRoot: "/repo",
      argv: {
        authorizeLive: true,
        freezeOnly: false,
        outDir: "out",
      },
      io,
      retentionIo: readyRetentionIo(
        "/Users/tester/Documents/KalshiResearchArchive/o6-five-close",
      ),
      liveDeps: {
        nowMs: () => clock,
        sleep: async () => undefined,
        // Fail ledger write immediately so executeLiveOneClose throws before
        // filesystem capture paths — proves we entered live retry, not miss.
        campaignIo: {
          readFile: () => null,
          writeFile: () => {
            throw new Error("forced-ledger-fail-for-retry-test");
          },
          mkdir: () => undefined,
          withExclusiveLock: (_lockPath, fn) => fn(),
        },
      },
    });

    expect(result.manifest.targets[0]!.status).toBe("failed");
    expect(result.manifest.targets[0]!.reason).toMatch(/forced-ledger-fail-for-retry-test/);
    expect(result.manifest.targets.slice(1).every((t) => t.status === "missed-slot")).toBe(true);
  });
});
