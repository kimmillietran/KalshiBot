import { describe, expect, it } from "vitest";

import {
  createSessionLimitState,
  recordReceivedMessage,
  registerConnectionAttempt,
  requestCleanShutdown,
} from "@/lib/data/research/kalshiSettlementSampleMapping/captureLimits";
import {
  campaignLedgerPath,
  campaignLockPath,
  loadOrCreateCampaignLedger,
  reserveHttpAttempt,
  type CampaignBudgetIo,
} from "@/lib/data/research/kalshiBrtiAccessProbe/campaignBudget";

import { comparePublishedAverage, roundHalfEven2 } from "./compareMembershipAverages";
import { classifyMissedSlot, freezeOneClosePlan } from "./freezeOneClose";
import { runOneCloseSettlementFidelity } from "./runOneCloseSettlementFidelity";
import {
  verifyRetentionReadiness,
  type RetentionIo,
} from "./retentionReadiness";
import { ONE_CLOSE_CAMPAIGN_ID, ONE_CLOSE_MAX_HTTP } from "./types";

function memoryCampaignIo(files: Map<string, string>): CampaignBudgetIo {
  return {
    readFile: (path) => files.get(path) ?? null,
    writeFile: (path, contents) => {
      files.set(path, contents);
    },
    mkdir: () => undefined,
    withExclusiveLock: (_lock, fn) => fn(),
    nowIso: () => "2026-09-24T22:00:00.000Z",
  };
}

function memoryRetentionIo(input: {
  primaryDev: number;
  archiveDev: number;
  archiveRoot?: string;
}): RetentionIo {
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>();
  const archiveRoot = input.archiveRoot ?? "/archive-vol/kalshi";
  const primaryRoot = "/Users/tester/Documents/KalshiResearchArchive/one-close";
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
    deviceId: (path) => {
      if (path.startsWith(archiveRoot) || path === archiveRoot) return input.archiveDev;
      return input.primaryDev;
    },
    env: {
      HOME: "/Users/tester",
      KALSHI_FIDELITY_PRIMARY_ROOT: primaryRoot,
      KALSHI_FIDELITY_ARCHIVE_ROOT: archiveRoot,
    },
  };
}

describe("freezeOneClosePlan", () => {
  it("freezes next quarter-hour with #119 offsets", () => {
    const nowMs = Date.parse("2026-09-24T22:24:03.976Z");
    const plan = freezeOneClosePlan({ nowMs });
    expect(plan.closeUtc).toBe("2026-09-24T22:30:00.000Z");
    expect(plan.connectEarliestMs).toBe(plan.closeMs - 75_000);
    expect(plan.captureStartMs).toBe(plan.closeMs - 70_000);
    expect(plan.captureStopMs).toBe(plan.closeMs + 15_000);
    expect(plan.readinessCutoffMs).toBe(plan.captureStartMs - 30_000);
    expect(plan.includeOrderbook).toBe(false);
    expect(plan.substitutionForbidden).toBe(true);
  });

  it("classifies missed slot after close without substitution", () => {
    const plan = freezeOneClosePlan({
      nowMs: Date.parse("2026-09-24T22:00:00Z"),
      closeMs: Date.parse("2026-09-24T22:30:00Z"),
    });
    expect(classifyMissedSlot(plan, Date.parse("2026-09-24T22:30:00Z"))).toBe("missed-slot");
    expect(classifyMissedSlot(plan, Date.parse("2026-09-24T22:29:00Z"))).toBe("late-but-before-close");
  });
});

describe("retention readiness", () => {
  it("rejects same-device archive roots", () => {
    const readiness = verifyRetentionReadiness({
      io: memoryRetentionIo({ primaryDev: 1, archiveDev: 1 }),
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blocker).toMatch(/same-device/);
  });

  it("accepts distinct-device archive after synthetic round-trip", () => {
    const readiness = verifyRetentionReadiness({
      io: memoryRetentionIo({ primaryDev: 1, archiveDev: 2 }),
      nowIso: "2026-09-24T22:25:00.000Z",
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.roundTripVerified).toBe(true);
    expect(readiness.syntheticSha256).toBe(readiness.retrievedSha256);
  });

  it("blocks when archive env unset", () => {
    const io = memoryRetentionIo({ primaryDev: 1, archiveDev: 2 });
    io.env = { HOME: "/Users/tester" };
    const readiness = verifyRetentionReadiness({ io });
    expect(readiness.ready).toBe(false);
    expect(readiness.blocker).toMatch(/ARCHIVE_ROOT/);
  });
});

describe("budget enforcement", () => {
  it("counts retries toward the 12-attempt ceiling and refuses reset on resume", () => {
    const files = new Map<string, string>();
    const io = memoryCampaignIo(files);
    const dir = "/campaign";
    loadOrCreateCampaignLedger({
      ledgerPath: campaignLedgerPath(dir),
      campaignId: ONE_CLOSE_CAMPAIGN_ID,
      limit: ONE_CLOSE_MAX_HTTP,
      io,
    });
    for (let i = 0; i < ONE_CLOSE_MAX_HTTP; i += 1) {
      reserveHttpAttempt({
        ledgerPath: campaignLedgerPath(dir),
        lockPath: campaignLockPath(dir),
        campaignId: ONE_CLOSE_CAMPAIGN_ID,
        limit: ONE_CLOSE_MAX_HTTP,
        purpose: "live-market-discovery",
        io,
      });
    }
    expect(() => reserveHttpAttempt({
      ledgerPath: campaignLedgerPath(dir),
      lockPath: campaignLockPath(dir),
      campaignId: ONE_CLOSE_CAMPAIGN_ID,
      limit: ONE_CLOSE_MAX_HTTP,
      purpose: "official-settlement-metadata",
      io,
    })).toThrow(/exhausted/);

    const reloaded = loadOrCreateCampaignLedger({
      ledgerPath: campaignLedgerPath(dir),
      campaignId: ONE_CLOSE_CAMPAIGN_ID,
      limit: ONE_CLOSE_MAX_HTTP,
      io,
      requireExisting: true,
    });
    expect(reloaded.consumed).toBe(12);
  });
});

describe("capture deadline helpers", () => {
  it("stops recording after stopAtMs", () => {
    const state = createSessionLimitState({
      startedAtMs: 1_000_000,
      stopAtMs: 1_090_000,
    });
    expect(recordReceivedMessage(state, 10, 1_089_999)).toBe(true);
    expect(recordReceivedMessage(state, 10, 1_090_000)).toBe(false);
    expect(state.stopReason).toBe("deadline");
  });

  it("enforces reconnect attempt cap", () => {
    const state = createSessionLimitState({ startedAtMs: 0, stopAtMs: 90_000 });
    expect(registerConnectionAttempt(state, "multiplexed-ws")).toBe(true);
    expect(registerConnectionAttempt(state, "multiplexed-ws")).toBe(true);
    // mapping default is 2 per stream — third fails
    expect(registerConnectionAttempt(state, "multiplexed-ws")).toBe(false);
    requestCleanShutdown(state, "test");
    expect(state.shutdownRequested).toBe(true);
  });
});

describe("runOneCloseSettlementFidelity gates", () => {
  it("refuses live when retention is blocked and does not consume HTTP", async () => {
    const files = new Map<string, string>();
    const result = await runOneCloseSettlementFidelity({
      repoRoot: "/repo",
      argv: {
        authorizeLive: true,
        skipLive: false,
        closeMs: Date.parse("2026-09-24T22:30:00Z"),
        campaignId: ONE_CLOSE_CAMPAIGN_ID,
        outDir: "out",
        rawDir: "out/raw",
        maxHttp: 12,
      },
      io: {
        writeFile: (path, contents) => {
          files.set(path, contents);
        },
        readFile: (path) => files.get(path) ?? null,
        mkdir: () => undefined,
        exists: (path) => files.has(path),
        nowMs: () => Date.parse("2026-09-24T22:25:00Z"),
      },
      retentionIo: memoryRetentionIo({ primaryDev: 1, archiveDev: 1 }),
      campaignIo: memoryCampaignIo(files),
    });
    expect(result.disposition.capture).toBe("refused-readiness");
    expect(result.disposition.retention).toBe("blocked-prerequisite");
    expect(result.disposition.captured).toBe(false);
    expect(result.httpBudget.consumed).toBe(0);
    expect(result.liveExecution).toBe("refused");
    expect(result.comparisonsFrozenBeforeCapture.trailingMembership).toContain("close−60s");
  });

  it("preserves frozen close on resume instead of rolling forward", async () => {
    const files = new Map<string, string>();
    const io = {
      writeFile: (path: string, contents: string) => {
        files.set(path, contents);
      },
      readFile: (path: string) => files.get(path) ?? null,
      mkdir: () => undefined,
      exists: (path: string) => files.has(path),
      nowMs: () => Date.parse("2026-09-24T22:25:00Z"),
    };
    const first = await runOneCloseSettlementFidelity({
      repoRoot: "/repo",
      argv: {
        authorizeLive: false,
        skipLive: true,
        closeMs: Date.parse("2026-09-24T22:30:00Z"),
        campaignId: ONE_CLOSE_CAMPAIGN_ID,
        outDir: "out",
        rawDir: "out/raw",
        maxHttp: 12,
      },
      io,
      retentionIo: memoryRetentionIo({ primaryDev: 1, archiveDev: 2 }),
      campaignIo: memoryCampaignIo(files),
    });
    expect(first.plan.closeUtc).toBe("2026-09-24T22:30:00.000Z");

    io.nowMs = () => Date.parse("2026-09-24T22:40:00Z");
    const second = await runOneCloseSettlementFidelity({
      repoRoot: "/repo",
      argv: {
        authorizeLive: false,
        skipLive: true,
        closeMs: null,
        campaignId: ONE_CLOSE_CAMPAIGN_ID,
        outDir: "out",
        rawDir: "out/raw",
        maxHttp: 12,
      },
      io,
      retentionIo: memoryRetentionIo({ primaryDev: 1, archiveDev: 2 }),
      campaignIo: memoryCampaignIo(files),
    });
    expect(second.plan.closeUtc).toBe("2026-09-24T22:30:00.000Z");
    expect(second.disposition.capture).toBe("missed-slot");
    expect(second.disposition.rolledToLaterClose).toBe(false);
  });
});

describe("membership average comparison", () => {
  it("reports raw-string vs numeric vs diagnostic rounding separately", () => {
    const agreement = comparePublishedAverage({
      fieldName: "avg_60s_data",
      publishedRaw: "83817.70733333",
      sampleValueRaws: ["83817.70", "83817.71", "83817.72"],
      officialRaw: "83817.71",
    });
    expect(agreement.sampleCount).toBe(3);
    expect(agreement.rawStringEqual).toBe(false);
    expect(typeof agreement.unroundedDiff).toBe("number");
    expect(roundHalfEven2(83817.705)).toBe("83817.70");
  });
});
