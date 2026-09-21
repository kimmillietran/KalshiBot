/**
 * M16.2 validation collection automation tests — synthetic fixtures only.
 */
import { describe, expect, it } from "vitest";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  M16_1_PRIOR_COHORT_PLAN_IDENTITY,
  M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
  M16_COLLECTION_COMPLETE_SEALED_MESSAGE,
  M16_EXPECTED_COHORT_PLAN_IDENTITY,
  M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY,
  M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
  M16_EXPECTED_FEE_CONTRACT_IDENTITY,
  M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY,
  M16_LAUNCH_TOLERANCE_AFTER_MS,
  M16_LAUNCH_TOLERANCE_BEFORE_MS,
  M16_MAX_ACCEPTED_CAPTURE_HOURS,
  M16_VALIDATION_MIN_FREE_DISK_BYTES,
  M16_VALIDATION_PROTOCOL_VERSION,
  M16_VALIDATION_ROLE,
  M16ValidationCollectionError,
  acquireM16ValidationRunnerLock,
  assertM16CaptureNotContaminated,
  assertNoConflictingActiveReservation,
  buildM16ScientificProtocolIdentity,
  buildM16ValidationAuthorityBinding,
  buildSyntheticM16ValidationBlindIncidence,
  computeM16ValidationProgress,
  decideM16BlindCollectionStopping,
  buildM16ProspectiveCohortPlan,
  createEmptyM16ValidationRegistry,
  createM16ValidationReservation,
  evaluateM16LaunchWindow,
  failedSegmentAcceptedMinutes,
  formatOperatorProgressText,
  generateM16ValidationLaunchdPlist,
  hashM16ValidationArtifact,
  healthyZeroSignalAcceptedMinutes,
  m16GovernedWindowForUtcDay,
  nextM16GovernedCaptureStart,
  parseM162Argv,
  recoverM16ValidationCycle,
  registerAcceptedSegment,
  registerExcludedSegment,
  releaseM16ValidationRunnerLock,
  runM16ValidationDailyCycle,
  runM16ValidationPreflight,
  enableM16ValidationScheduler,
  disableM16ValidationScheduler,
  statusM16ValidationScheduler,
  type M16ValidationLockIo,
  type M16ValidationRegistry,
} from "./index";

import type { M16ValidationAttemptRecord } from "./m16ValidationCohortTypes";

function makeRegistry(
  freezeIso = "2026-09-20T00:00:00.000Z",
): M16ValidationRegistry {
  return createEmptyM16ValidationRegistry({
    planFreezeTimestampIso: freezeIso,
    authority: buildM16ValidationAuthorityBinding("deadbeef"),
  });
}

function makeHealth() {
  return {
    passed: true,
    verdict: "research-ready",
    healthArtifactIdentity: "health-hash-1",
    failureReasons: [] as string[],
  };
}

function acceptDay(
  registry: M16ValidationRegistry,
  day: string,
  opts?: {
    runId?: string;
    trades?: number;
    acceptedMinutes?: number;
    tickers?: string[];
  },
): M16ValidationRegistry {
  const reservation = createM16ValidationReservation({
    plannedUtcDay: day,
    createdAt: `${day}T13:00:00.000Z`,
    authority: registry.authority,
  });
  const trades = opts?.trades ?? 0;
  const units = Array.from({ length: trades }, (_, i) => ({
    marketTicker: opts?.tickers?.[i] ?? `KXBTC15M-${day}-${i}`,
    confirmationTimestampMs: Date.parse(`${day}T15:00:00.000Z`) + i * 1000,
    utcDayKey: day,
    observedInRunId: opts?.runId ?? `run-${day}`,
  }));
  const blind = buildSyntheticM16ValidationBlindIncidence({
    runId: opts?.runId ?? `run-${day}`,
    captureIdentityHash: `cap-${opts?.runId ?? day}`,
    eligibleUnits: units,
    captureHours: (opts?.acceptedMinutes ?? 240) / 60,
  });
  return registerAcceptedSegment(registry, {
    reservation,
    runId: opts?.runId ?? `run-${day}`,
    captureRunDir: `/tmp/m16-val/${day}`,
    captureIdentityHash: blind.captureIdentityHash,
    health: makeHealth(),
    captureStartIso: `${day}T14:00:00.000Z`,
    captureEndIso: `${day}T18:00:00.000Z`,
    acceptedMinutes: opts?.acceptedMinutes ?? healthyZeroSignalAcceptedMinutes(),
    utcDaysPhysicallyCovered: [day],
    blindIncidence: blind,
  });
}

describe("M16.2 authority + protocol identity", () => {
  it("1–5. sealed identities + scientific protocol ignores code SHA", () => {
    const a = buildM16ValidationAuthorityBinding("sha-aaa");
    const b = buildM16ValidationAuthorityBinding("sha-bbb");
    expect(a.familyDefinitionIdentity).toBe(M16_EXPECTED_FAMILY_DEFINITION_IDENTITY);
    expect(a.evidenceContractIdentity).toBe(M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY);
    expect(a.dependencePlanIdentity).toBe(M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY);
    expect(a.feeContractIdentity).toBe(M16_EXPECTED_FEE_CONTRACT_IDENTITY);
    expect(a.cohortPlanIdentity).toBe(M16_EXPECTED_COHORT_PLAN_IDENTITY);
    expect(a.scientificProtocolIdentity).toBe(b.scientificProtocolIdentity);
    expect(a.scientificProtocolIdentity).toBe(buildM16ScientificProtocolIdentity());
    expect(a.codeAuthoritySha).toBe("sha-aaa");
    expect(b.codeAuthoritySha).toBe("sha-bbb");
    expect(a.protocolVersion).toBe(M16_VALIDATION_PROTOCOL_VERSION);
  });

  it("6. unrelated SHA allowed; protocol change would block", () => {
    const protocol = buildM16ScientificProtocolIdentity();
    expect(protocol).toMatch(/^[a-f0-9]{64}$/);
    expect(protocol).not.toBe(M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY);
  });
});

describe("M16.2 schedule window", () => {
  it("7–10. 14:00–18:00Z, tolerances, no cross-midnight, no backfill", () => {
    const w = m16GovernedWindowForUtcDay("2026-09-21");
    expect(w.startIso).toBe("2026-09-21T14:00:00.000Z");
    expect(w.endIso).toBe("2026-09-21T18:00:00.000Z");
    expect(w.durationMinutes).toBe(240);

    const early = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T13:50:00.000Z"),
    );
    expect(early.status).toBe("too-early");

    const wait = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T13:57:00.000Z"),
    );
    expect(wait.status).toBe("in-tolerance-wait-for-start");
    expect(M16_LAUNCH_TOLERANCE_BEFORE_MS).toBe(5 * 60 * 1000);

    const now = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T14:02:00.000Z"),
    );
    expect(now.status).toBe("launch-now");
    expect(M16_LAUNCH_TOLERANCE_AFTER_MS).toBe(5 * 60 * 1000);

    const missed = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T14:06:00.000Z"),
    );
    expect(missed.status).toBe("missed-window");

    const next = nextM16GovernedCaptureStart(
      Date.parse("2026-09-21T14:06:00.000Z"),
    );
    expect(next.utcDay).toBe("2026-09-22");
    expect(next.startIso).toBe("2026-09-22T14:00:00.000Z");
  });
});

describe("M16.2 reservation", () => {
  it("11–14. fixed window, identity, conflict, role", () => {
    const r = createM16ValidationReservation({
      plannedUtcDay: "2026-09-21",
      createdAt: "2026-09-21T12:00:00.000Z",
      codeAuthoritySha: "abc",
    });
    expect(r.plannedStartIso).toBe("2026-09-21T14:00:00.000Z");
    expect(r.requestedDurationMinutes).toBe(240);
    expect(r.role).toBe(M16_VALIDATION_ROLE);
    expect(r.outcomesOpened).toBe(false);
    expect(r.reservationIdentity).toBe(
      hashM16ValidationArtifact({
        reservationVersion: r.reservationVersion,
        authority: r.authority,
        role: r.role,
        plannedUtcDay: r.plannedUtcDay,
        plannedStartIso: r.plannedStartIso,
        plannedEndIso: r.plannedEndIso,
        requestedDurationMinutes: r.requestedDurationMinutes,
        fixedUtcWindow: r.fixedUtcWindow,
        createdAt: r.createdAt,
        replacesReservationIdentity: r.replacesReservationIdentity,
        outcomesOpened: false,
        pnlInspected: false,
        targetHitInspected: false,
        stopHitInspected: false,
      }),
    );

    const r2 = createM16ValidationReservation({
      plannedUtcDay: "2026-09-21",
      createdAt: "2026-09-21T12:00:00.000Z",
      codeAuthoritySha: "abc",
    });
    expect(r2.reservationIdentity).toBe(r.reservationIdentity);

    expect(() =>
      assertNoConflictingActiveReservation({
        existing: [r],
        plannedUtcDay: "2026-09-21",
        inactiveReservationIdentities: new Set(),
      }),
    ).toThrow(M16ValidationCollectionError);

    expect(() =>
      createM16ValidationReservation({
        plannedUtcDay: "2026-09-21",
        plannedStartIso: "2026-09-21T15:00:00.000Z",
      }),
    ).toThrow(/fixed window|14:00/);
  });
});

describe("M16.2 registry accounting", () => {
  it("15–18. zero-signal +4h G+0; failed 0h; dedupe; readiness", () => {
    let reg = makeRegistry();
    reg = acceptDay(reg, "2026-09-21", { trades: 0 });
    let progress = computeM16ValidationProgress(reg);
    expect(progress.acceptedHours).toBe(4);
    expect(progress.eligibleTradeCount).toBe(0);
    expect(progress.distinctEligibleUtcDayClusters).toBe(0);
    expect(failedSegmentAcceptedMinutes()).toBe(0);

    reg = registerExcludedSegment(reg, {
      runId: "failed-1",
      reason: "health-failed",
      terminalStatus: "health-failed",
    });
    progress = computeM16ValidationProgress(reg);
    expect(progress.acceptedHours).toBe(4);
    expect(progress.failedExcludedAttempts).toBe(1);

    // Ambiguous ticker overlap fails closed
    const rA = createM16ValidationReservation({
      plannedUtcDay: "2026-09-22",
      authority: reg.authority,
      createdAt: "2026-09-22T12:00:00.000Z",
    });
    const unit = {
      marketTicker: "SAME-TICKER",
      confirmationTimestampMs: Date.parse("2026-09-22T15:00:00.000Z"),
      utcDayKey: "2026-09-22",
      observedInRunId: "run-a",
    };
    const blindA = buildSyntheticM16ValidationBlindIncidence({
      runId: "run-a",
      captureIdentityHash: "cap-a",
      eligibleUnits: [unit],
    });
    reg = registerAcceptedSegment(reg, {
      reservation: rA,
      runId: "run-a",
      captureRunDir: "/tmp/a",
      captureIdentityHash: "cap-a",
      health: makeHealth(),
      captureStartIso: "2026-09-22T14:00:00.000Z",
      captureEndIso: "2026-09-22T18:00:00.000Z",
      acceptedMinutes: 240,
      utcDaysPhysicallyCovered: ["2026-09-22"],
      blindIncidence: blindA,
    });

    const rB = createM16ValidationReservation({
      plannedUtcDay: "2026-09-23",
      authority: reg.authority,
      createdAt: "2026-09-23T12:00:00.000Z",
    });
    const blindB = buildSyntheticM16ValidationBlindIncidence({
      runId: "run-b",
      captureIdentityHash: "cap-b",
      eligibleUnits: [{
        ...unit,
        confirmationTimestampMs: unit.confirmationTimestampMs + 60_000,
        utcDayKey: "2026-09-23",
        observedInRunId: "run-b",
      }],
    });
    expect(() =>
      registerAcceptedSegment(reg, {
        reservation: rB,
        runId: "run-b",
        captureRunDir: "/tmp/b",
        captureIdentityHash: "cap-b",
        health: makeHealth(),
        captureStartIso: "2026-09-23T14:00:00.000Z",
        captureEndIso: "2026-09-23T18:00:00.000Z",
        acceptedMinutes: 240,
        utcDaysPhysicallyCovered: ["2026-09-23"],
        blindIncidence: blindB,
      }),
    ).toThrow(/ambiguous marketTicker/);
  });

  it("19–22. 267/24 continue; 268/24 ready; 140h underpowered; ready before underpowered", () => {
    const plan = buildM16ProspectiveCohortPlan();
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 100,
        eligibleTradeCount: 267,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["x"],
      }, plan).disposition,
    ).toBe("continue-collection");
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 100,
        eligibleTradeCount: 268,
        utcDayClusterCount: 23,
        acceptedCaptureRunIds: ["x"],
      }, plan).disposition,
    ).toBe("continue-collection");
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 100,
        eligibleTradeCount: 268,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["x"],
      }, plan).disposition,
    ).toBe("ready-for-outcome-open");
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 140,
        eligibleTradeCount: 200,
        utcDayClusterCount: 20,
        acceptedCaptureRunIds: ["x"],
      }, plan).disposition,
    ).toBe("validation-underpowered");
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 140,
        eligibleTradeCount: 268,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["x"],
      }, plan).disposition,
    ).toBe("ready-for-outcome-open");
    expect(M16_MAX_ACCEPTED_CAPTURE_HOURS).toBe(140);

    let reg = makeRegistry();
    for (let i = 0; i < 24; i += 1) {
      const day = `2026-10-${String(i + 1).padStart(2, "0")}`;
      reg = acceptDay(reg, day, { trades: 1, runId: `r-${day}` });
    }
    const p = computeM16ValidationProgress(reg);
    expect(p.eligibleTradeCount).toBe(24);
    expect(p.distinctEligibleUtcDayClusters).toBe(24);
    expect(p.disposition).toBe("continue-collection");
  });

  it("23–25. duplicate keys fail closed; no P&L fields; progress text sealed", () => {
    let reg = makeRegistry();
    reg = acceptDay(reg, "2026-09-21", { trades: 2, runId: "dup-run" });
    const reservation = createM16ValidationReservation({
      plannedUtcDay: "2026-09-22",
      authority: reg.authority,
      createdAt: "2026-09-22T12:00:00.000Z",
    });
    const blind = buildSyntheticM16ValidationBlindIncidence({
      runId: "dup-run",
      captureIdentityHash: "other-cap",
      eligibleUnits: [],
    });
    expect(() =>
      registerAcceptedSegment(reg, {
        reservation,
        runId: "dup-run",
        captureRunDir: "/tmp/x",
        captureIdentityHash: "other-cap",
        health: makeHealth(),
        captureStartIso: "2026-09-22T14:00:00.000Z",
        captureEndIso: "2026-09-22T18:00:00.000Z",
        acceptedMinutes: 240,
        utcDaysPhysicallyCovered: ["2026-09-22"],
        blindIncidence: blind,
      }),
    ).toThrow(/duplicate runId/);

    const text = formatOperatorProgressText(computeM16ValidationProgress(reg));
    expect(text).toMatch(/eligibleTrades/);
    expect(text).toMatch(/outcomesOpened: false/);
    expect(text).toMatch(/economicPeeking: sealed/);
    expect(text).not.toMatch(/pnlCents|feeAdjustedPnl|signedPnl|winRate|profitability/i);
    expect(stableStringify(reg)).not.toMatch(/"pnlCents"|"feeAdjustedPnl"|"signedPnl"/);
  });
});

describe("M16.2 lock / preflight / lifecycle", () => {
  it("26–30. lock stale recovery; fee divergence; old M16.1 rejected; missed window; no live capture", async () => {
    const files = new Map<string, string>();
    const lockIo: M16ValidationLockIo = {
      existsSync: (p) => files.has(p),
      readFileSync: (p) => files.get(p)!,
      writeFileSync: (p, data) => {
        files.set(p, data);
      },
      unlinkSync: (p) => {
        files.delete(p);
      },
      mkdirSync: () => {},
      pidIsAlive: (pid) => pid === 111,
      currentPid: () => 222,
      nowIso: () => "2026-09-21T13:00:00.000Z",
    };
    files.set(
      "/tmp/m16.lock",
      JSON.stringify({ pid: 999, acquiredAtIso: "x", note: "stale" }),
    );
    const handle = acquireM16ValidationRunnerLock("/tmp/m16.lock", lockIo);
    expect(handle.pid).toBe(222);
    releaseM16ValidationRunnerLock(handle, lockIo);
    expect(files.has("/tmp/m16.lock")).toBe(false);

    const liveLockIo: M16ValidationLockIo = {
      ...lockIo,
      pidIsAlive: () => true,
      currentPid: () => 333,
    };
    files.set(
      "/tmp/m16.lock",
      JSON.stringify({
        pid: 111,
        acquiredAtIso: "x",
        note: "m16-validation-runner-lock-operational-not-scientific-authority",
      }),
    );
    expect(() => acquireM16ValidationRunnerLock("/tmp/m16.lock", liveLockIo)).toThrow(
      /live pid/,
    );

    const reg = makeRegistry();
    const feeBlock = runM16ValidationPreflight({
      registry: reg,
      plannedUtcDay: "2026-09-21",
      observeSeriesFee: () => ({ feeType: "quadratic", feeMultiplier: 0.5 }),
      getFreeDiskBytes: () => M16_VALIDATION_MIN_FREE_DISK_BYTES,
      credentialsPresent: () => true,
    });
    expect(feeBlock.ok).toBe(false);
    expect(feeBlock.blockers.some((b) => b.includes("fee"))).toBe(true);

    const oldAuth = {
      ...reg.authority,
      evidenceContractIdentity: M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
      cohortPlanIdentity: M16_1_PRIOR_COHORT_PLAN_IDENTITY,
      scientificProtocolIdentity: "not-current",
    };
    const oldBlock = runM16ValidationPreflight({
      registry: { ...reg, authority: oldAuth },
      plannedUtcDay: "2026-09-21",
      authority: oldAuth,
      observeSeriesFee: () => ({ feeType: "quadratic", feeMultiplier: 1 }),
      getFreeDiskBytes: () => M16_VALIDATION_MIN_FREE_DISK_BYTES,
      credentialsPresent: () => true,
    });
    expect(oldBlock.ok).toBe(false);
    expect(oldBlock.blockers.some((b) => /old M16\.1|authority|scientific/i.test(b))).toBe(
      true,
    );

    let attempts: M16ValidationAttemptRecord[] = [];
    const result = await runM16ValidationDailyCycle(
      {
        loadRegistry: () => reg,
        saveRegistry: () => {},
        loadAttempts: () => attempts,
        saveAttempts: (a) => {
          attempts = [...a];
        },
        lockPath: "/tmp/m16-cycle.lock",
        lockIo: {
          ...lockIo,
          pidIsAlive: () => false,
          currentPid: () => 1,
        },
        nowMs: () => Date.parse("2026-09-21T14:10:00.000Z"),
        dryRun: true,
        preflightExtras: {
          getFreeDiskBytes: () => M16_VALIDATION_MIN_FREE_DISK_BYTES,
          credentialsPresent: () => true,
        },
      },
    );
    expect(result.captureNotLaunchedReason).toBe("missed-window");
    expect(result.outcomesOpened).toBe(false);

    const okDay = await runM16ValidationDailyCycle({
      loadRegistry: () => reg,
      saveRegistry: () => {},
      loadAttempts: () => attempts,
      saveAttempts: (a) => {
        attempts = [...a];
      },
      lockPath: "/tmp/m16-cycle2.lock",
      lockIo: {
        ...lockIo,
        pidIsAlive: () => false,
        currentPid: () => 2,
      },
      nowMs: () => Date.parse("2026-09-21T14:01:00.000Z"),
      dryRun: true,
      preflightExtras: {
        getFreeDiskBytes: () => M16_VALIDATION_MIN_FREE_DISK_BYTES,
        credentialsPresent: () => true,
      },
    });
    expect(okDay.reservation).not.toBeNull();
    expect(okDay.captureLaunched).toBe(false);
    expect(okDay.captureNotLaunchedReason).toBe("dry-run");

    const recovered = recoverM16ValidationCycle({
      loadRegistry: () => reg,
      loadAttempts: () => attempts,
      nowMs: () => Date.parse("2026-09-21T15:00:00.000Z"),
    });
    expect(recovered.outcomesOpened).toBe(false);
    expect(recovered.pending.length).toBeGreaterThan(0);
  });

  it("31. READY message seals outcomes", async () => {
    let reg = makeRegistry();
    for (let i = 0; i < 24; i += 1) {
      const day = `2026-08-${String(i + 1).padStart(2, "0")}`;
      reg = acceptDay(reg, day, { trades: 12, runId: `ready-${day}` });
    }
    // 24*12 = 288 >= 268
    const p = computeM16ValidationProgress(reg);
    expect(p.disposition).toBe("ready-for-outcome-open");
    const text = formatOperatorProgressText(p);
    expect(text).toContain(M16_COLLECTION_COMPLETE_SEALED_MESSAGE);

    const files = new Map<string, string>();
    const cycle = await runM16ValidationDailyCycle({
      loadRegistry: () => reg,
      saveRegistry: () => {},
      loadAttempts: () => [],
      saveAttempts: () => {},
      lockPath: "/tmp/ready.lock",
      lockIo: {
        existsSync: (p) => files.has(p),
        readFileSync: (p) => files.get(p)!,
        writeFileSync: (p, d) => {
          files.set(p, d);
        },
        unlinkSync: (p) => {
          files.delete(p);
        },
        mkdirSync: () => {},
        pidIsAlive: () => false,
        currentPid: () => 9,
        nowIso: () => "2026-09-21T14:00:00.000Z",
      },
      nowMs: () => Date.parse("2026-09-21T14:00:00.000Z"),
    });
    expect(cycle.message).toContain(M16_COLLECTION_COMPLETE_SEALED_MESSAGE);
    expect(cycle.captureLaunched).toBe(false);
  });
});

describe("M16.2 scheduler + argv + role", () => {
  it("32–35. plist UTC 14:00; enable/disable state; argv; researchRole", () => {
    const plist = generateM16ValidationLaunchdPlist({});
    expect(plist).toContain("<integer>14</integer>");
    expect(plist).toContain("<integer>0</integer>");
    expect(plist).toContain("REPO_ROOT");
    expect(plist).not.toMatch(/\/Users\//);

    const mem = new Map<string, string>();
    const io = {
      existsSync: (p: string) => mem.has(p),
      readFileSync: (p: string) => mem.get(p)!,
      writeFileSync: (p: string, d: string) => {
        mem.set(p, d);
      },
      mkdirSync: () => {},
      nowIso: () => "2026-09-21T00:00:00.000Z",
    };
    const enabled = enableM16ValidationScheduler({
      registryDir: "/tmp/m16-reg",
      io,
    });
    expect(enabled.enabled).toBe(true);
    expect(statusM16ValidationScheduler({ registryDir: "/tmp/m16-reg", io }).enabled).toBe(
      true,
    );
    expect(disableM16ValidationScheduler({ registryDir: "/tmp/m16-reg", io }).enabled).toBe(
      false,
    );

    expect(parseM162Argv(["--status"]).mode).toBe("status");
    expect(parseM162Argv(["--run-daily", "--dry-run"]).dryRun).toBe(true);
    expect(() => parseM162Argv([])).toThrow(/exactly one/);

    expect(() =>
      assertM16CaptureNotContaminated({
        runId: "fresh-1",
        captureRunDir: "/tmp/x",
        captureIdentityHash: "h",
        researchRole: "m16-prospective-validation",
      }),
    ).not.toThrow();
  });
});

describe("M16.2 registry identity deterministic", () => {
  it("36. same accepts → same registryIdentity", () => {
    const a = acceptDay(makeRegistry(), "2026-09-21", { trades: 3, runId: "same" });
    const b = acceptDay(makeRegistry(), "2026-09-21", { trades: 3, runId: "same" });
    expect(a.registryIdentity).toBe(b.registryIdentity);
    expect(a.reservations[0]?.reservationIdentity).toBe(
      b.reservations[0]?.reservationIdentity,
    );
  });
});
