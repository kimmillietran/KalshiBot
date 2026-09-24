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

import {
  comparePublishedAverage,
  comparePublishedAverageForStream,
  QUARTER_HOUR_WINDOW_LABEL,
  TRAILING_WINDOW_LABEL,
  roundHalfEven2,
} from "./compareMembershipAverages";
import { classifyConnectedCaptureStatus } from "./executeLiveOneClose";
import { classifyMissedSlot, freezeOneClosePlan } from "./freezeOneClose";
import { runOneCloseSettlementFidelity } from "./runOneCloseSettlementFidelity";
import {
  verifyRetentionReadiness,
  resolveRetentionPaths,
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
  archiveDev?: number;
  archiveRoot?: string | null;
  primaryRoot?: string;
}): RetentionIo {
  const files = new Map<string, Buffer>();
  const dirs = new Set<string>();
  const primaryRoot = input.primaryRoot
    ?? "/Users/tester/Documents/KalshiResearchArchive/one-close";
  const archiveRoot = input.archiveRoot === null
    ? null
    : (input.archiveRoot ?? "/archive-vol/kalshi");
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
      if (archiveRoot && (path.startsWith(archiveRoot) || path === archiveRoot)) {
        return input.archiveDev ?? 2;
      }
      return input.primaryDev;
    },
    env: {
      HOME: "/Users/tester",
      KALSHI_FIDELITY_PRIMARY_ROOT: primaryRoot,
      ...(archiveRoot
        ? { KALSHI_FIDELITY_ARCHIVE_ROOT: archiveRoot }
        : {}),
    },
  };
}

describe("freezeOneClosePlan", () => {
  it("freezes next quarter-hour with authorized offsets", () => {
    const nowMs = Date.parse("2026-09-24T22:31:57Z");
    const plan = freezeOneClosePlan({ nowMs, retentionMode: "local-persistent-only" });
    expect(plan.closeUtc).toBe("2026-09-24T22:45:00.000Z");
    expect(plan.connectEarliestMs).toBe(plan.closeMs - 75_000);
    expect(plan.captureStartMs).toBe(plan.closeMs - 70_000);
    // min(close+20s, connect+90s) => close+15s when connect at -75s
    expect(plan.captureStopMs).toBe(plan.closeMs + 15_000);
    expect(plan.readinessCutoffMs).toBe(plan.closeMs - 100_000);
    expect(plan.includeOrderbook).toBe(false);
    expect(plan.independentBackup).toBe(false);
    expect(plan.substitutionForbidden).toBe(true);
  });

  it("classifies missed slot after close without substitution", () => {
    const plan = freezeOneClosePlan({
      nowMs: Date.parse("2026-09-24T22:00:00Z"),
      closeMs: Date.parse("2026-09-24T22:45:00Z"),
    });
    expect(classifyMissedSlot(plan, Date.parse("2026-09-24T22:45:00Z"))).toBe("missed-slot");
    expect(classifyMissedSlot(plan, Date.parse("2026-09-24T22:44:00Z"))).toBe("late-but-before-close");
  });
});

describe("retention readiness", () => {
  it("accepts local-persistent-only with write/read round-trip and independentBackup=false", () => {
    const readiness = verifyRetentionReadiness({
      io: memoryRetentionIo({ primaryDev: 1, archiveRoot: null }),
      mode: "local-persistent-only",
      nowIso: "2026-09-24T22:32:00.000Z",
      campaignId: ONE_CLOSE_CAMPAIGN_ID,
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.independentBackup).toBe(false);
    expect(readiness.roundTripVerified).toBe(true);
    expect(readiness.syntheticSha256).toBe(readiness.retrievedSha256);
  });

  it("rejects independent-archive when archive is same device", () => {
    const readiness = verifyRetentionReadiness({
      io: memoryRetentionIo({ primaryDev: 1, archiveDev: 1 }),
      mode: "independent-archive",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blocker).toMatch(/same-device/);
  });

  it("accepts independent-archive on distinct devices", () => {
    const readiness = verifyRetentionReadiness({
      io: memoryRetentionIo({ primaryDev: 1, archiveDev: 2 }),
      mode: "independent-archive",
      nowIso: "2026-09-24T22:32:00.000Z",
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.independentBackup).toBe(true);
  });

  it("rejects primary roots under temp/worktree paths", () => {
    const readiness = verifyRetentionReadiness({
      io: memoryRetentionIo({
        primaryDev: 1,
        archiveRoot: null,
        primaryRoot: "/Users/tester/Developer/kalshi-builder2/tmp-archive",
      }),
      mode: "local-persistent-only",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blocker).toMatch(/forbidden-location/);
  });
  it("rejects local write failure during round-trip", () => {
    const base = memoryRetentionIo({ primaryDev: 1, archiveRoot: null });
    const readiness = verifyRetentionReadiness({
      io: {
        ...base,
        writeFile: () => {
          throw new Error("ENOSPC");
        },
      },
      mode: "local-persistent-only",
      nowIso: "2026-09-24T22:32:00.000Z",
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blocker).toMatch(/roundtrip-failed|ENOSPC/);
  });
  it("rejects unsupported retention modes instead of treating them as archive", () => {
    const io = memoryRetentionIo({ primaryDev: 1, archiveRoot: null });
    const resolved = resolveRetentionPaths({
      io,
      mode: "not-a-mode" as never,
    });
    expect("blocker" in resolved).toBe(true);
    if ("blocker" in resolved) {
      expect(resolved.blocker).toMatch(/unsupported-retention-mode/);
    }
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
        closeMs: Date.parse("2026-09-24T22:45:00Z"),
        campaignId: ONE_CLOSE_CAMPAIGN_ID,
        outDir: "out",
        rawDir: "out/raw",
        maxHttp: 12,
        retentionMode: "local-persistent-only",
      },
      io: {
        writeFile: (path, contents) => {
          files.set(path, contents);
        },
        readFile: (path) => files.get(path) ?? null,
        mkdir: () => undefined,
        exists: (path) => files.has(path),
        nowMs: () => Date.parse("2026-09-24T22:32:00Z"),
      },
      retentionIo: memoryRetentionIo({
        primaryDev: 1,
        archiveRoot: null,
        primaryRoot: "/tmp/not-allowed",
      }),
      campaignIo: memoryCampaignIo(files),
    });
    expect(result.disposition.capture).toBe("refused-readiness");
    expect(result.disposition.retention).toBe("blocked-prerequisite");
    expect(result.httpBudget.consumed).toBe(0);
    expect(result.plan.independentBackup).toBe(false);
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
      nowMs: () => Date.parse("2026-09-24T22:32:00Z"),
    };
    const first = await runOneCloseSettlementFidelity({
      repoRoot: "/repo",
      argv: {
        authorizeLive: false,
        skipLive: true,
        closeMs: Date.parse("2026-09-24T22:45:00Z"),
        campaignId: ONE_CLOSE_CAMPAIGN_ID,
        outDir: "out",
        rawDir: "out/raw",
        maxHttp: 12,
        retentionMode: "local-persistent-only",
      },
      io,
      retentionIo: memoryRetentionIo({ primaryDev: 1, archiveRoot: null }),
      campaignIo: memoryCampaignIo(files),
    });
    expect(first.plan.closeUtc).toBe("2026-09-24T22:45:00.000Z");

    io.nowMs = () => Date.parse("2026-09-24T22:50:00Z");
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
        retentionMode: "local-persistent-only",
      },
      io,
      retentionIo: memoryRetentionIo({ primaryDev: 1, archiveRoot: null }),
      campaignIo: memoryCampaignIo(files),
    });
    expect(second.plan.closeUtc).toBe("2026-09-24T22:45:00.000Z");
    expect(second.disposition.capture).toBe("missed-slot");
    expect(second.disposition.rolledToLaterClose).toBe(false);
  });

  it("normalizes legacy plans missing retentionMode to local-persistent-only", async () => {
    const files = new Map<string, string>();
    const legacyPlan = {
      campaignId: ONE_CLOSE_CAMPAIGN_ID,
      closeUtc: "2026-09-24T22:45:00.000Z",
      closeMs: Date.parse("2026-09-24T22:45:00Z"),
      connectEarliestMs: Date.parse("2026-09-24T22:45:00Z") - 75_000,
      captureStartMs: Date.parse("2026-09-24T22:45:00Z") - 70_000,
      captureStopMs: Date.parse("2026-09-24T22:45:00Z") + 15_000,
      readinessCutoffMs: Date.parse("2026-09-24T22:45:00Z") - 100_000,
      maxConnectedMs: 90_000,
      indexSymbol: "BRTI",
      includeOrderbook: false,
      frozenAtUtc: "2026-09-24T22:30:00.000Z",
      substitutionForbidden: true,
    };
    files.set("/repo/out/one-close-plan.json", `${JSON.stringify(legacyPlan, null, 2)}\n`);
    const result = await runOneCloseSettlementFidelity({
      repoRoot: "/repo",
      argv: {
        authorizeLive: false,
        skipLive: true,
        closeMs: Date.parse("2026-09-24T22:45:00Z"),
        campaignId: ONE_CLOSE_CAMPAIGN_ID,
        outDir: "out",
        rawDir: "out/raw",
        maxHttp: 12,
        retentionMode: "local-persistent-only",
      },
      io: {
        writeFile: (path, contents) => {
          files.set(path, contents);
        },
        readFile: (path) => files.get(path) ?? null,
        mkdir: () => undefined,
        exists: (path) => files.has(path),
        nowMs: () => Date.parse("2026-09-24T22:32:00Z"),
      },
      retentionIo: memoryRetentionIo({ primaryDev: 1, archiveRoot: null }),
      campaignIo: memoryCampaignIo(files),
    });
    expect(result.plan.retentionMode).toBe("local-persistent-only");
    expect(result.plan.independentBackup).toBe(false);
    expect(result.retentionReadiness.ready).toBe(true);
    expect(result.retentionReadiness.independentBackup).toBe(false);
  });

  it("skips live when past readiness cutoff without substitution", async () => {
    const files = new Map<string, string>();
    const result = await runOneCloseSettlementFidelity({
      repoRoot: "/repo",
      argv: {
        authorizeLive: true,
        skipLive: false,
        closeMs: Date.parse("2026-09-24T22:45:00Z"),
        campaignId: ONE_CLOSE_CAMPAIGN_ID,
        outDir: "out",
        rawDir: "out/raw",
        maxHttp: 12,
        retentionMode: "local-persistent-only",
      },
      io: {
        writeFile: (path, contents) => {
          files.set(path, contents);
        },
        readFile: (path) => files.get(path) ?? null,
        mkdir: () => undefined,
        exists: (path) => files.has(path),
        nowMs: () => Date.parse("2026-09-24T22:43:30Z"),
      },
      retentionIo: memoryRetentionIo({ primaryDev: 1, archiveRoot: null }),
      campaignIo: memoryCampaignIo(files),
    });
    expect(result.liveExecution).toBe("skipped-past-readiness-cutoff");
    expect(result.disposition.rolledToLaterClose).toBe(false);
    expect(result.httpBudget.consumed).toBe(0);
  });
});

describe("capture status classification", () => {
  it("marks unclean shutdown without stopReason as limit-stop, not ok", () => {
    expect(classifyConnectedCaptureStatus({
      stopReason: null,
      closedCleanly: false,
    })).toEqual({
      capture: "limit-stop",
      reason: "capture-unclean-shutdown",
    });
  });

  it("accepts planned-stop and clean close as ok", () => {
    expect(classifyConnectedCaptureStatus({
      stopReason: "planned-stop",
      closedCleanly: false,
    }).capture).toBe("ok");
    expect(classifyConnectedCaptureStatus({
      stopReason: null,
      closedCleanly: true,
    }).capture).toBe("ok");
  });
});

describe("stream-separated membership comparisons", () => {
  const closeMs = Date.parse("2026-09-24T23:15:00Z");

  function tick(input: {
    sourceTsMs: number | null;
    valueRaw: string;
    channelHint: "cfb-1hz" | "cfb-5hz";
    receivedAtMs?: number;
  }) {
    return {
      sourceTsMs: input.sourceTsMs,
      valueRaw: input.valueRaw,
      localReceivedAtMs: input.receivedAtMs ?? (input.sourceTsMs ?? 0) + 10,
      localReceivedAtMonoMs: 0,
      channelHint: input.channelHint,
    };
  }

  it("keeps 1Hz and 5Hz collections distinct and rejects mixed-stream input", () => {
    const oneHz = [
      tick({ sourceTsMs: closeMs - 1_000, valueRaw: "100.00", channelHint: "cfb-1hz" }),
    ];
    const fiveHz = [
      tick({ sourceTsMs: closeMs - 1_000, valueRaw: "200.00", channelHint: "cfb-5hz" }),
    ];
    expect(oneHz.every((row) => row.channelHint === "cfb-1hz")).toBe(true);
    expect(fiveHz.every((row) => row.channelHint === "cfb-5hz")).toBe(true);
    expect(() => comparePublishedAverageForStream({
      fieldName: "avg_60s_data",
      publishedRaw: "100.00",
      sourceStream: "cfb-1hz",
      membership: TRAILING_WINDOW_LABEL,
      closeMs,
      streamObservations: [...oneHz, ...fiveHz],
    })).toThrow(/stream-contamination/);
  });

  it("marks comparison unavailable when verified 1Hz source-ts samples are insufficient", () => {
    const sparse = Array.from({ length: 2 }, (_, index) => tick({
      sourceTsMs: closeMs - 60_000 + (index + 1) * 1_000,
      valueRaw: "84278.00",
      channelHint: "cfb-1hz",
    }));
    const result = comparePublishedAverageForStream({
      fieldName: "avg_60s_data",
      publishedRaw: "84278.84333333",
      officialRaw: "84278.84",
      sourceStream: "cfb-1hz",
      membership: TRAILING_WINDOW_LABEL,
      closeMs,
      streamObservations: sparse,
    });
    expect(result.status).toBe("unavailable");
    expect(result.sourceStream).toBe("cfb-1hz");
    expect(result.timestampDomain).toBe("source");
    expect(result.sampleCount).toBe(2);
    expect(result.recomputedFromSamplesRaw).toBeNull();
    expect(result.unavailableReason).toMatch(/need-60/);
    expect(result.vsOfficial?.diagnosticRound2HalfEvenEqual).toBe(true);
  });

  it("does not substitute receipt timestamps for missing source timestamps", () => {
    const receiptOnly = Array.from({ length: 60 }, (_, index) => tick({
      sourceTsMs: null,
      valueRaw: "84278.00",
      channelHint: "cfb-1hz",
      receivedAtMs: closeMs - 60_000 + (index + 1) * 1_000,
    }));
    const result = comparePublishedAverageForStream({
      fieldName: "last_60s_windowed_average_15min",
      publishedRaw: "84278.80883333",
      sourceStream: "cfb-1hz",
      membership: QUARTER_HOUR_WINDOW_LABEL,
      closeMs,
      streamObservations: receiptOnly,
    });
    expect(result.status).toBe("unavailable");
    expect(result.missingSourceTimestampInStream).toBe(60);
    expect(result.verifiedSourceTimestampedInWindow).toBe(0);
  });

  it("compares when exactly 60 verified 1Hz source-ts samples fill the membership window", () => {
    const samples = Array.from({ length: 60 }, (_, index) => tick({
      // trailing [close−60s, close): seconds close-60 ... close-1
      sourceTsMs: closeMs - 60_000 + index * 1_000,
      valueRaw: "84278.84",
      channelHint: "cfb-1hz",
    }));
    const result = comparePublishedAverageForStream({
      fieldName: "avg_60s_data",
      publishedRaw: "84278.84000000",
      officialRaw: "84278.84",
      sourceStream: "cfb-1hz",
      membership: TRAILING_WINDOW_LABEL,
      closeMs,
      streamObservations: samples,
    });
    expect(result.status).toBe("compared");
    expect(result.sampleCount).toBe(60);
    expect(result.sourceStream).toBe("cfb-1hz");
    expect(result.rawStringEqual).toBe(true);
    expect(Math.abs(result.unroundedDiff ?? 1)).toBeLessThan(1e-8);
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
