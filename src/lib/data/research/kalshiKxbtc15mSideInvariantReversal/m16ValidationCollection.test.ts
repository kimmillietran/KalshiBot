/**
 * M16.2 validation collection automation tests — synthetic fixtures only.
 */
import { describe, expect, it } from "vitest";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  M16_1A_PRIOR_COHORT_PLAN_IDENTITY,
  M16_1A_PRIOR_SCIENTIFIC_PROTOCOL_IDENTITY,
  M16_1_PRIOR_COHORT_PLAN_IDENTITY,
  M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
  M16_CANONICAL_CAPTURE_SERIES,
  M16_COLLECTION_COMPLETE_SEALED_MESSAGE,
  M16_EXPECTED_COHORT_PLAN_IDENTITY,
  M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY,
  M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
  M16_EXPECTED_FEE_CONTRACT_IDENTITY,
  M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY,
  M16_FIXED_UTC_WINDOW_END_HHMM,
  M16_FIXED_UTC_WINDOW_START_HHMM,
  M16_LAUNCH_TOLERANCE_AFTER_MS,
  M16_LAUNCH_TOLERANCE_BEFORE_MS,
  M16_MAX_ACCEPTED_CAPTURE_HOURS,
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
  M16_SUPERSEDED_SCIENTIFIC_PROTOCOL_IDENTITY,
  M16_VALIDATION_ALLOW_LIVE_CAPTURE_ENV,
  M16_VALIDATION_MIN_FREE_DISK_BYTES,
  M16_VALIDATION_PROTOCOL_VERSION,
  M16_VALIDATION_ROLE,
  M16ValidationCollectionError,
  acquireM16ValidationRunnerLock,
  admitM16ValidationCaptureAfterHealth,
  appendM16ValidationReservation,
  assertM16CaptureNotContaminated,
  assertM16SchedulerPlistHasNoSecrets,
  assertNoConflictingActiveReservation,
  assertReservationUsesFixedWindow,
  buildM16CanonicalForwardQuoteCaptureConfig,
  buildM16ProspectiveCohortPlan,
  buildM16ScientificProtocolIdentity,
  buildM16ValidationAuthorityBinding,
  buildSyntheticM16ValidationBlindIncidence,
  computeM16ValidationProgress,
  createEmptyM16ValidationRegistry,
  createM16ValidationReservation,
  decideM16BlindCollectionStopping,
  diagnoseM16ValidationScheduler,
  disableM16ValidationScheduler,
  enableM16ValidationScheduler,
  evaluateM16LaunchWindow,
  failedSegmentAcceptedMinutes,
  formatOperatorProgressText,
  generateM16ValidationLaunchdPlist,
  hashM16ValidationArtifact,
  healthyZeroSignalAcceptedMinutes,
  isM16LiveCaptureAllowed,
  m16EnvLoaderAvoidsDesktop,
  m16GovernedWindowForUtcDay,
  m16PdtLocalHourMapsToScientificStart,
  m16PstLocalHourMapsToScientificStart,
  mapCaliforniaLocalHourToUtcHour,
  nextM16GovernedCaptureStart,
  parseDfAvailableKilobytes,
  parseM16LaunchctlPrintDiagnostics,
  parseM162Argv,
  readM16WrapperLastInvocationIso,
  recoverM16ValidationCycle,
  registerAcceptedSegment,
  registerExcludedSegment,
  releaseM16ValidationRunnerLock,
  resolveM16KalshiEnvLoaderPath,
  runM16ValidationDailyCycle,
  runM16ValidationPreflight,
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
    captureStartIso: `${day}T18:00:00.000Z`,
    captureEndIso: `${day}T22:00:00.000Z`,
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
  it("7–10. 18:00–22:00Z, tolerances, no cross-midnight, no backfill", () => {
    const w = m16GovernedWindowForUtcDay("2026-09-21");
    expect(w.startIso).toBe("2026-09-21T18:00:00.000Z");
    expect(w.endIso).toBe("2026-09-21T22:00:00.000Z");
    expect(w.durationMinutes).toBe(240);

    const early = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T17:54:00.000Z"),
    );
    expect(early.status).toBe("too-early");

    const wait = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T17:57:00.000Z"),
    );
    expect(wait.status).toBe("in-tolerance-wait-for-start");
    expect(M16_LAUNCH_TOLERANCE_BEFORE_MS).toBe(5 * 60 * 1000);

    const now = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T18:02:00.000Z"),
    );
    expect(now.status).toBe("launch-now");
    expect(M16_LAUNCH_TOLERANCE_AFTER_MS).toBe(5 * 60 * 1000);

    const missed = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T18:06:00.000Z"),
    );
    expect(missed.status).toBe("missed-window");

    const next = nextM16GovernedCaptureStart(
      Date.parse("2026-09-21T18:06:00.000Z"),
    );
    expect(next.utcDay).toBe("2026-09-22");
    expect(next.startIso).toBe("2026-09-22T18:00:00.000Z");
  });
});

describe("M16.2 reservation", () => {
  it("11–14. fixed window, identity, conflict, role", () => {
    const r = createM16ValidationReservation({
      plannedUtcDay: "2026-09-21",
      createdAt: "2026-09-21T12:00:00.000Z",
      codeAuthoritySha: "abc",
    });
    expect(r.plannedStartIso).toBe("2026-09-21T18:00:00.000Z");
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
    ).toThrow(/fixed window|18:00/);
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
      captureStartIso: "2026-09-22T18:00:00.000Z",
      captureEndIso: "2026-09-22T22:00:00.000Z",
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
        captureStartIso: "2026-09-23T18:00:00.000Z",
        captureEndIso: "2026-09-23T22:00:00.000Z",
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
        captureStartIso: "2026-09-22T18:00:00.000Z",
        captureEndIso: "2026-09-22T22:00:00.000Z",
        acceptedMinutes: 240,
        utcDaysPhysicallyCovered: ["2026-09-22"],
        blindIncidence: blind,
      }),
    ).toThrow(/duplicate runId/);

    const text = formatOperatorProgressText(computeM16ValidationProgress(reg));
    expect(text).toMatch(/Eligible reversals:/);
    expect(text).toMatch(/Outcomes:\nSEALED/);
    expect(text).toMatch(/No economics/);
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
        nowMs: () => Date.parse("2026-09-21T18:10:00.000Z"),
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
      nowMs: () => Date.parse("2026-09-21T18:01:00.000Z"),
      dryRun: true,
      preflightExtras: {
        getFreeDiskBytes: () => M16_VALIDATION_MIN_FREE_DISK_BYTES,
        credentialsPresent: () => true,
      },
    });
    expect(okDay.reservation).not.toBeNull();
    expect(okDay.captureLaunched).toBe(false);
    expect(okDay.captureNotLaunchedReason).toBe("dry-run");

    const recovered = await recoverM16ValidationCycle({
      loadRegistry: () => reg,
      loadAttempts: () => attempts,
      nowMs: () => Date.parse("2026-09-21T19:00:00.000Z"),
    });
    expect(recovered.outcomesOpened).toBe(false);
    // Dry-run reservation with sealed window gone → missed-window lineage.
    expect(recovered.resumed).toBe(true);
    expect(recovered.nextAction).toMatch(/missed-window|await-next-window/);
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
        nowIso: () => "2026-09-21T18:00:00.000Z",
      },
      nowMs: () => Date.parse("2026-09-21T18:00:00.000Z"),
    });
    expect(cycle.message).toContain(M16_COLLECTION_COMPLETE_SEALED_MESSAGE);
    expect(cycle.captureLaunched).toBe(false);
  });
});

describe("M16.2 scheduler + argv + role", () => {
  it("32–35. plist UTC 18:00; enable/disable state; argv; researchRole", () => {
    const plist = generateM16ValidationLaunchdPlist({});
    expect(plist).toContain("<integer>10</integer>");
    expect(plist).toContain("<integer>11</integer>");
    expect(plist).toContain("<integer>0</integer>");
    expect(plist).toContain("<string>UTC</string>");
    expect(plist).toContain("/opt/homebrew/bin");
    expect(plist).toMatch(/<key>PATH<\/key>\s*<string>\/opt\/homebrew\/bin:/);
    expect(plist).toContain("REPO_ROOT");
    expect(plist).toContain("scripts/shell/run-m16-validation-daily.sh");
    expect(plist).toMatch(/<key>StartCalendarInterval<\/key>\s*<array>/);
    expect(plist).not.toMatch(
      /<key>StartCalendarInterval<\/key>\s*<dict>[\s\S]*?<integer>18<\/integer>/,
    );
    expect(plist).not.toMatch(/BEGIN (RSA |EC )?PRIVATE KEY/);
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

  it("37. reservation-only append recomputes registryIdentity", () => {
    const base = makeRegistry();
    const reservation = createM16ValidationReservation({
      plannedUtcDay: "2026-09-21",
      createdAt: "2026-09-21T12:00:00.000Z",
      authority: base.authority,
    });
    const updated = appendM16ValidationReservation(base, reservation);
    expect(updated.reservations).toHaveLength(1);
    expect(updated.registryIdentity).not.toBe(base.registryIdentity);
    expect(
      appendM16ValidationReservation(updated, reservation).registryIdentity,
    ).toBe(updated.registryIdentity);
  });
});

describe("M16.1b California daytime window amendment", () => {
  it("38–45. window, tolerance edges, no shift, no cross-midnight", () => {
    expect(M16_FIXED_UTC_WINDOW_START_HHMM).toBe("18:00");
    expect(M16_FIXED_UTC_WINDOW_END_HHMM).toBe("22:00");
    expect(M16_STANDARD_SEGMENT_DURATION_MINUTES).toBe(240);

    const tooEarly = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T17:54:00.000Z"),
    );
    expect(tooEarly.status).toBe("too-early");

    const wait = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T17:55:00.000Z"),
    );
    expect(wait.status).toBe("in-tolerance-wait-for-start");

    const launch = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T18:05:00.000Z"),
    );
    expect(launch.status).toBe("launch-now");

    const late = evaluateM16LaunchWindow(
      Date.parse("2026-09-21T18:06:00.000Z"),
    );
    expect(late.status).toBe("missed-window");

    // Missed day must NOT silently become 19:00–23:00Z
    const next = nextM16GovernedCaptureStart(
      Date.parse("2026-09-21T18:06:00.000Z"),
    );
    expect(next.startIso).toBe("2026-09-22T18:00:00.000Z");
    expect(next.startIso).not.toBe("2026-09-21T19:00:00.000Z");

    expect(() =>
      createM16ValidationReservation({
        plannedUtcDay: "2026-09-21",
        plannedStartIso: "2026-09-21T19:00:00.000Z",
      }),
    ).toThrow(/fixed window|18:00/);

    const w = m16GovernedWindowForUtcDay("2026-09-21");
    expect(new Date(w.endMs - 1).toISOString().slice(0, 10)).toBe("2026-09-21");
  });

  it("46–52. identities: family/evidence/dependence/fee unchanged; cohort+protocol change", () => {
    const a = buildM16ValidationAuthorityBinding(null);
    const plan = buildM16ProspectiveCohortPlan();
    expect(a.familyDefinitionIdentity).toBe(M16_EXPECTED_FAMILY_DEFINITION_IDENTITY);
    expect(a.evidenceContractIdentity).toBe(M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY);
    expect(a.dependencePlanIdentity).toBe(M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY);
    expect(a.feeContractIdentity).toBe(M16_EXPECTED_FEE_CONTRACT_IDENTITY);
    expect(a.cohortPlanIdentity).toBe(M16_EXPECTED_COHORT_PLAN_IDENTITY);
    expect(a.cohortPlanIdentity).not.toBe(M16_1A_PRIOR_COHORT_PLAN_IDENTITY);
    expect(a.scientificProtocolIdentity).not.toBe(
      M16_1A_PRIOR_SCIENTIFIC_PROTOCOL_IDENTITY,
    );
    expect(a.scientificProtocolIdentity).not.toBe(
      M16_SUPERSEDED_SCIENTIFIC_PROTOCOL_IDENTITY,
    );
    expect(plan.milestone).toBe("m16.1b-prospective-validation-cohort-plan");
    expect(plan.supersedesCohortPlanIdentity).toBe(M16_1A_PRIOR_COHORT_PLAN_IDENTITY);
    expect(plan.evidenceThresholds.requiredTradeN).toBe(268);
    expect(plan.evidenceThresholds.minimumUtcDayClusters).toBe(24);
    expect(plan.budget.maxAcceptedCaptureHours).toBe(140);
    expect(M16_MAX_ACCEPTED_CAPTURE_HOURS).toBe(140);
    expect(plan.segment.standardDurationMinutes).toBe(240);
    expect(plan.stopping.outcomePeekingForbidden).toBe(true);
    expect(plan.stopping.pnlPeekingForbidden).toBe(true);
  });

  it("53–56. old protocol/cohort rejected; reservation binds 18–22Z", () => {
    const reg = makeRegistry();
    expect(reg.authority.cohortPlanIdentity).toBe(M16_EXPECTED_COHORT_PLAN_IDENTITY);

    const oldAuth = {
      ...reg.authority,
      cohortPlanIdentity: M16_1A_PRIOR_COHORT_PLAN_IDENTITY,
      scientificProtocolIdentity: M16_1A_PRIOR_SCIENTIFIC_PROTOCOL_IDENTITY,
    };
    const blocked = runM16ValidationPreflight({
      registry: { ...reg, authority: oldAuth },
      plannedUtcDay: "2026-09-21",
      authority: oldAuth,
      observeSeriesFee: () => ({ feeType: "quadratic", feeMultiplier: 1 }),
      getFreeDiskBytes: () => M16_VALIDATION_MIN_FREE_DISK_BYTES,
      credentialsPresent: () => true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.blockers.some((b) => /14:00|18:00–22:00|superseded/i.test(b)))
      .toBe(true);

    const r = createM16ValidationReservation({
      plannedUtcDay: "2026-09-21",
      createdAt: "2026-09-21T12:00:00.000Z",
      authority: reg.authority,
    });
    expect(r.fixedUtcWindow).toBe("18:00-22:00Z");
    expect(r.plannedStartIso).toBe("2026-09-21T18:00:00.000Z");
    expect(r.plannedEndIso).toBe("2026-09-21T22:00:00.000Z");
    expect(() => assertReservationUsesFixedWindow(r)).not.toThrow();

    // Synthetic old-window reservation shape must fail fixed-window assert
    const oldWindowReservation = {
      ...r,
      fixedUtcWindow: "14:00-18:00Z" as "18:00-22:00Z",
      plannedStartIso: "2026-09-21T14:00:00.000Z",
      plannedEndIso: "2026-09-21T18:00:00.000Z",
    };
    expect(() => assertReservationUsesFixedWindow(oldWindowReservation)).toThrow(
      /18:00-22:00Z/,
    );
  });

  it("57. scheduler dual local Hours 10+11; TZ=UTC child-only; no live capture in tests", () => {
    const plist = generateM16ValidationLaunchdPlist({});
    expect(plist).toMatch(/<key>Hour<\/key>\s*<integer>10<\/integer>/);
    expect(plist).toMatch(/<key>Hour<\/key>\s*<integer>11<\/integer>/);
    expect(plist).toMatch(/<key>TZ<\/key>\s*<string>UTC<\/string>/);
    expect(M16_LAUNCH_TOLERANCE_BEFORE_MS).toBe(5 * 60 * 1000);
    expect(M16_LAUNCH_TOLERANCE_AFTER_MS).toBe(5 * 60 * 1000);
    // Tests never set M16_VALIDATION_ALLOW_LIVE_CAPTURE or open sockets
    expect(process.env.M16_VALIDATION_ALLOW_LIVE_CAPTURE).toBeUndefined();
  });
});

describe("M16.2a live wiring + admit + recovery", () => {
  it("env gate + canonical config + protocol unchanged", () => {
    expect(isM16LiveCaptureAllowed({})).toBe(false);
    expect(isM16LiveCaptureAllowed({ [M16_VALIDATION_ALLOW_LIVE_CAPTURE_ENV]: "1" }))
      .toBe(true);
    const cfg = buildM16CanonicalForwardQuoteCaptureConfig({});
    expect(cfg.series).toBe(M16_CANONICAL_CAPTURE_SERIES);
    expect(cfg.durationMinutes).toBe(240);
    expect(cfg.maxMarkets).toBe(5);
    expect(cfg.topOfBookThrottleMs).toBe(1000);
    expect(cfg.captureBtcSpot).toBe(true);
    expect(cfg.dryRun).toBe(false);
    expect(buildM16ScientificProtocolIdentity()).toBe(
      "1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824",
    );
    expect(() => parseM162Argv(["--fixture-admit", "--status"])).toThrow(/fixture-admit/);
  });

  it("reservation before launcher; auto health→blind→admit; zero-signal +4h", async () => {
    let reg = makeRegistry();
    let attempts: M16ValidationAttemptRecord[] = [];
    let launcherCalls = 0;
    let reservationSeenBeforeLaunch = false;
    const order: string[] = [];

    const result = await runM16ValidationDailyCycle({
      loadRegistry: () => reg,
      saveRegistry: (r) => {
        reg = r;
        if (r.reservations.length > 0) order.push("reservation-persisted");
      },
      loadAttempts: () => attempts,
      saveAttempts: (a) => {
        attempts = [...a];
      },
      lockPath: "/tmp/m16-2a-e2e.lock",
      lockIo: {
        existsSync: () => false,
        readFileSync: () => "",
        writeFileSync: () => {},
        unlinkSync: () => {},
        mkdirSync: () => {},
        pidIsAlive: () => false,
        currentPid: () => 42,
        nowIso: () => "2026-09-21T18:00:00.000Z",
      },
      nowMs: () => Date.parse("2026-09-21T18:00:00.000Z"),
      sleepMs: async () => {},
      dryRun: false,
      preflightExtras: {
        getFreeDiskBytes: () => M16_VALIDATION_MIN_FREE_DISK_BYTES,
        credentialsPresent: () => true,
      },
      captureLauncher: async ({ reservation, durationMinutes, windowStartIso }) => {
        launcherCalls += 1;
        reservationSeenBeforeLaunch = reg.reservations.some(
          (r) => r.reservationIdentity === reservation.reservationIdentity,
        );
        order.push("launcher");
        expect(durationMinutes).toBe(240);
        expect(windowStartIso).toBe("2026-09-21T18:00:00.000Z");
        expect(reservation.role).toBe(M16_VALIDATION_ROLE);
        return {
          runId: "2026-09-21T18-00-00-000Z",
          captureRunDir: "/tmp/m16-cap/2026-09-21T18-00-00-000Z",
          captureIdentityHash: "cap-hash-e2e-1",
          captureStartIso: reservation.plannedStartIso,
          captureEndIso: reservation.plannedEndIso,
        };
      },
      postCapture: {
        auditHealth: async () => {
          order.push("health");
          return {
            health: {
              passed: true,
              verdict: "capture-research-ready",
              healthArtifactIdentity: "health-e2e-1",
              failureReasons: [],
            },
          };
        },
        blindScan: async ({ runId, captureIdentityHash }) => {
          order.push("blind");
          return buildSyntheticM16ValidationBlindIncidence({
            runId,
            captureIdentityHash,
            eligibleUnits: [],
            captureHours: 4,
          });
        },
      },
    });

    expect(reservationSeenBeforeLaunch).toBe(true);
    expect(launcherCalls).toBe(1);
    expect(result.captureLaunched).toBe(true);
    expect(result.admitted).toBe(true);
    expect(result.excluded).toBe(false);
    expect(order.indexOf("reservation-persisted")).toBeLessThan(order.indexOf("launcher"));
    expect(order.indexOf("launcher")).toBeLessThan(order.indexOf("health"));
    expect(order.indexOf("health")).toBeLessThan(order.indexOf("blind"));
    expect(result.progress.acceptedHours).toBe(4);
    expect(result.progress.eligibleTradeCount).toBe(0);
    expect(result.progress.distinctEligibleUtcDayClusters).toBe(0);
    expect(stableStringify(result)).not.toMatch(/"pnlCents"|"feeAdjustedPnl"|"targetHit"/);
  });

  it("unhealthy → exclude 0h; duplicate register blocked; recovery idempotent", async () => {
    let reg = makeRegistry();
    let attempts: M16ValidationAttemptRecord[] = [];
    const reservation = createM16ValidationReservation({
      plannedUtcDay: "2026-09-22",
      createdAt: "2026-09-22T12:00:00.000Z",
      authority: reg.authority,
    });
    reg = appendM16ValidationReservation(reg, reservation);
    const attemptId = "attempt-recover-1";
    attempts = [{
      attemptId,
      plannedUtcDay: "2026-09-22",
      reservationIdentity: reservation.reservationIdentity,
      runId: "run-unhealthy",
      captureRunDir: "/tmp/bad",
      captureIdentityHash: "bad-hash",
      status: "health-pending",
      createdAt: "2026-09-22T18:00:00.000Z",
      updatedAt: "2026-09-22T18:00:00.000Z",
      note: null,
      outcomesOpened: false,
    }];

    const excluded = await admitM16ValidationCaptureAfterHealth(
      {
        registry: reg,
        reservation,
        capture: {
          runId: "run-unhealthy",
          captureRunDir: "/tmp/bad",
          captureIdentityHash: "bad-hash",
          captureStartIso: reservation.plannedStartIso,
          captureEndIso: reservation.plannedEndIso,
        },
        attemptId,
        attempts,
      },
      {
        auditHealth: async () => ({
          health: {
            passed: false,
            verdict: "capture-gappy",
            healthArtifactIdentity: "health-bad",
            failureReasons: ["gappy"],
          },
        }),
      },
    );
    expect(excluded.excluded).toBe(true);
    expect(excluded.progress.acceptedHours).toBe(0);

    const again = await admitM16ValidationCaptureAfterHealth(
      {
        registry: excluded.registry,
        reservation,
        capture: {
          runId: "run-unhealthy",
          captureRunDir: "/tmp/bad",
          captureIdentityHash: "bad-hash",
          captureStartIso: reservation.plannedStartIso,
          captureEndIso: reservation.plannedEndIso,
        },
        attemptId,
        attempts: excluded.attempts,
      },
      {
        auditHealth: async () => {
          throw new Error("should not re-audit");
        },
      },
    );
    expect(again.message).toMatch(/idempotent/);
    expect(again.progress.acceptedHours).toBe(0);
  });

  it("READY / UNDERPOWERED block future capture; lock concurrency; disk parse; wrapper secrets", async () => {
    let reg = makeRegistry();
    for (let i = 0; i < 24; i += 1) {
      const day = `2026-08-${String(i + 1).padStart(2, "0")}`;
      reg = acceptDay(reg, day, { trades: 12, runId: `ready-${day}` });
    }
    expect(computeM16ValidationProgress(reg).disposition).toBe("ready-for-outcome-open");

    let launcherCalls = 0;
    const ready = await runM16ValidationDailyCycle({
      loadRegistry: () => reg,
      saveRegistry: () => {},
      loadAttempts: () => [],
      saveAttempts: () => {},
      lockPath: "/tmp/m16-ready.lock",
      lockIo: {
        existsSync: () => false,
        readFileSync: () => "",
        writeFileSync: () => {},
        unlinkSync: () => {},
        mkdirSync: () => {},
        pidIsAlive: () => false,
        currentPid: () => 7,
        nowIso: () => "2026-09-21T18:00:00.000Z",
      },
      nowMs: () => Date.parse("2026-09-21T18:00:00.000Z"),
      captureLauncher: async () => {
        launcherCalls += 1;
        throw new Error("should not launch");
      },
    });
    expect(ready.captureLaunched).toBe(false);
    expect(ready.captureNotLaunchedReason).toBe("collection-ready");
    expect(launcherCalls).toBe(0);

    const files = new Map<string, string>();
    const lockIo: M16ValidationLockIo = {
      existsSync: (p) => files.has(p),
      readFileSync: (p) => files.get(p)!,
      writeFileSync: (p, d) => {
        files.set(p, d);
      },
      unlinkSync: (p) => {
        files.delete(p);
      },
      mkdirSync: () => {},
      pidIsAlive: () => true,
      currentPid: () => 99,
      nowIso: () => "2026-09-21T18:00:00.000Z",
    };
    acquireM16ValidationRunnerLock("/tmp/m16-dup.lock", {
      ...lockIo,
      currentPid: () => 1,
      pidIsAlive: () => false,
    });
    // Live pid holds lock
    files.set(
      "/tmp/m16-dup.lock",
      JSON.stringify({
        pid: 12345,
        acquiredAtIso: "2026-09-21T18:00:00.000Z",
        note: "m16-validation-runner-lock-operational-not-scientific-authority",
      }),
    );
    expect(() =>
      acquireM16ValidationRunnerLock("/tmp/m16-dup.lock", {
        ...lockIo,
        pidIsAlive: (pid) => pid === 12345,
        currentPid: () => 2,
      }),
    ).toThrow(/lock held/);

    expect(parseDfAvailableKilobytes(
      "Filesystem 1024-blocks Used Available Capacity Mounted on\n"
        + "/dev/disk1 1000000 400000 600000 40% /\n",
    )).toBe(600000);

    const plist = generateM16ValidationLaunchdPlist({
      repoRootPlaceholder: "/repo",
    });
    expect(() => assertM16SchedulerPlistHasNoSecrets(plist)).not.toThrow();
    expect(plist).toContain("run-m16-validation-daily.sh");
    expect(plist).not.toContain("M16_VALIDATION_ALLOW_LIVE_CAPTURE");
  });
});

describe("M16.2b California dual local launchd triggers", () => {
  it("PDT/PST local hours map to 18:00Z; nonmatching hours do not", () => {
    expect(m16PdtLocalHourMapsToScientificStart(11)).toBe(true);
    expect(m16PdtLocalHourMapsToScientificStart(10)).toBe(false);
    expect(m16PstLocalHourMapsToScientificStart(10)).toBe(true);
    expect(m16PstLocalHourMapsToScientificStart(11)).toBe(false);
    expect(mapCaliforniaLocalHourToUtcHour({
      localHour: 11,
      offsetHoursWestOfUtc: 7,
    })).toBe(18);
    expect(mapCaliforniaLocalHourToUtcHour({
      localHour: 10,
      offsetHoursWestOfUtc: 8,
    })).toBe(18);
  });

  it("nonmatching UTC instants exit without launch (PDT 10:00 / PST 11:00)", async () => {
    // PDT 10:00 local = 17:00Z → too-early (before 17:55)
    const pdtEarly = evaluateM16LaunchWindow(
      Date.parse("2026-07-15T17:00:00.000Z"),
    );
    expect(pdtEarly.status).toBe("too-early");

    // PST 11:00 local = 19:00Z → missed-window
    const pstLate = evaluateM16LaunchWindow(
      Date.parse("2026-01-15T19:00:00.000Z"),
    );
    expect(pstLate.status).toBe("missed-window");

    let launcherCalls = 0;
    const earlyCycle = await runM16ValidationDailyCycle({
      loadRegistry: () => makeRegistry(),
      saveRegistry: () => {},
      loadAttempts: () => [],
      saveAttempts: () => {},
      lockPath: "/tmp/m16-2b-early.lock",
      lockIo: {
        existsSync: () => false,
        readFileSync: () => "",
        writeFileSync: () => {},
        unlinkSync: () => {},
        mkdirSync: () => {},
        pidIsAlive: () => false,
        currentPid: () => 3,
        nowIso: () => "2026-07-15T17:00:00.000Z",
      },
      nowMs: () => Date.parse("2026-07-15T17:00:00.000Z"),
      dryRun: false,
      captureLauncher: async () => {
        launcherCalls += 1;
        throw new Error("must not launch");
      },
    });
    expect(earlyCycle.captureLaunched).toBe(false);
    expect(earlyCycle.captureNotLaunchedReason).toBe("too-early");
    expect(launcherCalls).toBe(0);

    const lateCycle = await runM16ValidationDailyCycle({
      loadRegistry: () => makeRegistry(),
      saveRegistry: () => {},
      loadAttempts: () => [],
      saveAttempts: () => {},
      lockPath: "/tmp/m16-2b-late.lock",
      lockIo: {
        existsSync: () => false,
        readFileSync: () => "",
        writeFileSync: () => {},
        unlinkSync: () => {},
        mkdirSync: () => {},
        pidIsAlive: () => false,
        currentPid: () => 4,
        nowIso: () => "2026-01-15T19:00:00.000Z",
      },
      nowMs: () => Date.parse("2026-01-15T19:00:00.000Z"),
      dryRun: false,
      captureLauncher: async () => {
        launcherCalls += 1;
        throw new Error("must not launch");
      },
    });
    expect(lateCycle.captureLaunched).toBe(false);
    expect(lateCycle.captureNotLaunchedReason).toBe("missed-window");
    expect(launcherCalls).toBe(0);
    expect(buildM16ScientificProtocolIdentity()).toBe(
      "1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824",
    );
  });

  it("diagnostics distinguish loaded vs verifiedFired; parse launchctl + wrapper log", () => {
    const parsed = parseM16LaunchctlPrintDiagnostics(`
gui/501/com.kalshibot.m16-validation-collection = {
	runs = 0
	last exit code = (never exited)
}
`);
    expect(parsed.loaded).toBe(true);
    expect(parsed.runs).toBe(0);
    expect(parsed.lastExitStatus).toBe("(never exited)");

    const fired = parseM16LaunchctlPrintDiagnostics(`
com.kalshibot.m16-validation-collection = {
	runs = 3
	last exit code = 0
}
`);
    expect(fired.runs).toBe(3);
    expect(fired.lastExitStatus).toBe("0");

    const mem = new Map<string, string>();
    mem.set(
      "data/research-results/m16-validation-collection/scheduler/wrapper.log",
      "M16.2b launch 2026-09-22T17-55-01Z repo=/repo caffeinate=1 live=1\n",
    );
    const last = readM16WrapperLastInvocationIso({
      registryDir: "data/research-results/m16-validation-collection",
      io: {
        existsSync: (p) => mem.has(p),
        readFileSync: (p) => mem.get(p)!,
        writeFileSync: () => {},
        mkdirSync: () => {},
        nowIso: () => "2026-09-22T00:00:00.000Z",
      },
    });
    expect(last).toBe("2026-09-22T17:55:01.000Z");

    const diag = diagnoseM16ValidationScheduler({
      registryDir: "data/research-results/m16-validation-collection",
      io: {
        existsSync: (p) => mem.has(p),
        readFileSync: (p) => mem.get(p)!,
        writeFileSync: () => {},
        mkdirSync: () => {},
        nowIso: () => "2026-09-22T00:00:00.000Z",
        spawnSync: () => ({
          status: 0,
          stdout:
            "com.kalshibot.m16-validation-collection = {\n\truns = 0\n"
            + "\tlast exit code = (never exited)\n}\n",
          stderr: "",
        }),
      },
    });
    expect(diag.loaded).toBe(true);
    expect(diag.verifiedFired).toBe(false);
    expect(diag.launchctlRuns).toBe(0);
    expect(diag.triggerHoursLocal).toEqual([10, 11]);
    expect(diag.scientificWindowUtc).toBe("18:00-22:00Z");
    expect(diag.calendarUsesLocalClock).toBe(true);
  });
});

describe("M16.2c portable env loader selection", () => {
  it("repo-local wins over Desktop; override wins over both", () => {
    const files = new Set([
      "/Users/builder/Developer/kalshi-builder2/load-kalshi-env.sh",
      "/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh",
      "/custom/loader.sh",
    ]);
    const exists = (p: string) => files.has(p);

    const relocated = resolveM16KalshiEnvLoaderPath({
      repoRoot: "/Users/builder/Developer/kalshi-builder2",
      fileExists: exists,
    });
    expect(relocated.source).toBe("repo-local");
    expect(relocated.selectedPath).toBe(
      "/Users/builder/Developer/kalshi-builder2/load-kalshi-env.sh",
    );
    expect(m16EnvLoaderAvoidsDesktop(relocated)).toBe(true);

    const override = resolveM16KalshiEnvLoaderPath({
      repoRoot: "/Users/builder/Developer/kalshi-builder2",
      env: { KALSHI_ENV_LOADER: "/custom/loader.sh" },
      fileExists: exists,
    });
    expect(override.source).toBe("KALSHI_ENV_LOADER");
    expect(override.selectedPath).toBe("/custom/loader.sh");
    expect(m16EnvLoaderAvoidsDesktop(override)).toBe(true);

    const legacyOnly = resolveM16KalshiEnvLoaderPath({
      repoRoot: "/tmp/empty-repo",
      fileExists: (p) => p === "/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh",
    });
    expect(legacyOnly.source).toBe("legacy-desktop");
    expect(m16EnvLoaderAvoidsDesktop(legacyOnly)).toBe(false);

    const none = resolveM16KalshiEnvLoaderPath({
      repoRoot: "/tmp/empty-repo",
      fileExists: () => false,
    });
    expect(none.source).toBe("none");
    expect(none.selectedPath).toBeNull();
  });

  it("wrapper script prefers REPO_ROOT loader before Desktop fallback", async () => {
    const { readFileSync } = await import("node:fs");
    const wrapper = readFileSync(
      "scripts/shell/run-m16-validation-daily.sh",
      "utf8",
    );
    const repoIdx = wrapper.indexOf('REPO_ROOT}/load-kalshi-env.sh');
    const desktopIdx = wrapper.indexOf(
      "/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh",
    );
    const overrideIdx = wrapper.indexOf("KALSHI_ENV_LOADER");
    expect(overrideIdx).toBeGreaterThan(-1);
    expect(repoIdx).toBeGreaterThan(-1);
    expect(desktopIdx).toBeGreaterThan(-1);
    expect(overrideIdx).toBeLessThan(repoIdx);
    expect(repoIdx).toBeLessThan(desktopIdx);
    expect(buildM16ScientificProtocolIdentity()).toBe(
      "1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824",
    );
  });
});
