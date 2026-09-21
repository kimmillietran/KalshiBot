/**
 * M16.2 validation daily-cycle orchestration — injectable IO.
 * Default captureLauncher throws; live capture only via explicit CLI/env gate.
 */
import {
  evaluateM16OutcomeOpenAuthorization,
} from "./m16OutcomeOpenGate";
import {
  buildM16ValidationAuthorityBinding,
} from "./m16ValidationAuthority";
import {
  M16_COLLECTION_COMPLETE_SEALED_MESSAGE,
  M16ValidationCollectionError,
  type M16ValidationAttemptRecord,
  type M16ValidationProgress,
  type M16ValidationRegistry,
  type M16ValidationReservation,
} from "./m16ValidationCohortTypes";
import {
  acquireM16ValidationRunnerLock,
  releaseM16ValidationRunnerLock,
  type M16ValidationLockHandle,
  type M16ValidationLockIo,
} from "./m16ValidationLock";
import {
  runM16ValidationPreflight,
  type M16ValidationPreflightInput,
  type M16ValidationPreflightResult,
} from "./m16ValidationPreflight";
import { computeM16ValidationProgress } from "./m16ValidationRegistry";
import {
  assertNoConflictingActiveReservation,
  createM16ValidationReservation,
} from "./m16ValidationReservation";
import {
  evaluateM16LaunchWindow,
  m16UtcDayFromMs,
  nextM16GovernedCaptureStart,
  type M16LaunchWindowEvaluation,
} from "./m16ValidationSchedule";
import { formatOperatorProgressText } from "./m16ValidationProgressReport";

export { M16_COLLECTION_COMPLETE_SEALED_MESSAGE };

export type M16ValidationCaptureLauncherResult = {
  runId: string;
  captureRunDir: string;
  captureIdentityHash: string;
  captureStartIso: string;
  captureEndIso: string;
};

export type M16ValidationDailyCycleIo = {
  loadRegistry: () => M16ValidationRegistry;
  saveRegistry: (registry: M16ValidationRegistry) => void;
  loadAttempts: () => M16ValidationAttemptRecord[];
  saveAttempts: (attempts: readonly M16ValidationAttemptRecord[]) => void;
  lockPath: string;
  lockIo?: M16ValidationLockIo;
  nowMs: () => number;
  sleepMs?: (ms: number) => Promise<void>;
  /**
   * MUST be injected for real capture. Default throws.
   * CLI wires live capture only behind M16_VALIDATION_ALLOW_LIVE_CAPTURE=1.
   */
  captureLauncher?: (input: {
    reservation: M16ValidationReservation;
    windowStartIso: string;
    durationMinutes: number;
  }) => Promise<M16ValidationCaptureLauncherResult>;
  preflightExtras?: Partial<
    Omit<M16ValidationPreflightInput, "registry" | "plannedUtcDay">
  >;
  dryRun?: boolean;
  log?: (message: string) => void;
};

export type M16ValidationDailyCycleResult = {
  mode: "run-daily";
  launch: M16LaunchWindowEvaluation;
  preflight: M16ValidationPreflightResult | null;
  reservation: M16ValidationReservation | null;
  captureLaunched: boolean;
  captureNotLaunchedReason: string | null;
  progress: M16ValidationProgress;
  message: string;
  outcomesOpened: false;
};

function defaultCaptureLauncher(): never {
  throw new M16ValidationCollectionError(
    "real capture disabled in library; CLI supplies launcher behind "
      + "M16_VALIDATION_ALLOW_LIVE_CAPTURE=1",
  );
}

function inactiveReservationIds(
  registry: M16ValidationRegistry,
): Set<string> {
  const ids = new Set<string>();
  for (const ex of registry.excluded) {
    if (ex.reservationIdentity) ids.add(ex.reservationIdentity);
  }
  for (const r of registry.reservations) {
    if (r.replacesReservationIdentity) {
      ids.add(r.replacesReservationIdentity);
    }
  }
  // Accepted reservations are consummated — still "used" for the day via accepted check.
  for (const a of registry.accepted) {
    ids.add(a.reservationIdentity);
  }
  return ids;
}

export async function runM16ValidationDailyCycle(
  io: M16ValidationDailyCycleIo,
  nowMs?: number,
): Promise<M16ValidationDailyCycleResult> {
  const now = nowMs ?? io.nowMs();
  const log = io.log ?? (() => {});
  let lock: M16ValidationLockHandle | null = null;

  try {
    lock = acquireM16ValidationRunnerLock(io.lockPath, io.lockIo);

    const registry = io.loadRegistry();
    const progress = computeM16ValidationProgress(registry);

    if (progress.disposition === "ready-for-outcome-open") {
      const outcomeGate = evaluateM16OutcomeOpenAuthorization({
        progress: {
          acceptedCaptureHours: progress.acceptedHours,
          eligibleTradeCount: progress.eligibleTradeCount,
          utcDayClusterCount: progress.distinctEligibleUtcDayClusters,
          acceptedCaptureRunIds: registry.accepted.map((s) => s.runId),
        },
      });
      return {
        mode: "run-daily",
        launch: evaluateM16LaunchWindow(now),
        preflight: null,
        reservation: null,
        captureLaunched: false,
        captureNotLaunchedReason: "collection-ready",
        progress,
        message:
          `${M16_COLLECTION_COMPLETE_SEALED_MESSAGE} `
          + `(outcomeOpenAuthorized=${outcomeGate.authorized})`,
        outcomesOpened: false,
      };
    }

    if (progress.disposition === "validation-underpowered") {
      return {
        mode: "run-daily",
        launch: evaluateM16LaunchWindow(now),
        preflight: null,
        reservation: null,
        captureLaunched: false,
        captureNotLaunchedReason: "validation-underpowered",
        progress,
        message: `Collection stopped: ${progress.dispositionRationale}`,
        outcomesOpened: false,
      };
    }

    const launch = evaluateM16LaunchWindow(now);
    if (launch.status === "too-early") {
      return {
        mode: "run-daily",
        launch,
        preflight: null,
        reservation: null,
        captureLaunched: false,
        captureNotLaunchedReason: "too-early",
        progress,
        message: launch.message,
        outcomesOpened: false,
      };
    }
    if (launch.status === "missed-window") {
      // Never backfill missed days.
      return {
        mode: "run-daily",
        launch,
        preflight: null,
        reservation: null,
        captureLaunched: false,
        captureNotLaunchedReason: "missed-window",
        progress,
        message: launch.message,
        outcomesOpened: false,
      };
    }

    if (launch.status === "in-tolerance-wait-for-start") {
      const sleep = io.sleepMs ?? (async (ms: number) => {
        await new Promise((r) => setTimeout(r, ms));
      });
      if (!io.dryRun && launch.waitMs > 0) {
        log(`Waiting ${launch.waitMs}ms until ${launch.window.startIso}`);
        await sleep(launch.waitMs);
      }
    }

    const plannedUtcDay = launch.utcDay;
    const preflight = runM16ValidationPreflight({
      registry,
      plannedUtcDay,
      ...io.preflightExtras,
    });
    if (!preflight.ok) {
      return {
        mode: "run-daily",
        launch,
        preflight,
        reservation: null,
        captureLaunched: false,
        captureNotLaunchedReason: "preflight-blocked",
        progress: preflight.progress,
        message: `Preflight blocked: ${preflight.blockers.join("; ")}`,
        outcomesOpened: false,
      };
    }

    assertNoConflictingActiveReservation({
      existing: registry.reservations,
      plannedUtcDay,
      inactiveReservationIdentities: inactiveReservationIds(registry),
    });

    const reservation = createM16ValidationReservation({
      plannedUtcDay,
      createdAt: new Date(now).toISOString(),
      authority: buildM16ValidationAuthorityBinding(
        registry.authority.codeAuthoritySha,
      ),
    });

    // Persist reservation-only attempt for crash recovery.
    const attempts = [...io.loadAttempts()];
    const attempt: M16ValidationAttemptRecord = {
      attemptId: `attempt-${plannedUtcDay}-${reservation.reservationIdentity.slice(0, 12)}`,
      plannedUtcDay,
      reservationIdentity: reservation.reservationIdentity,
      runId: null,
      status: "reservation-only",
      createdAt: reservation.createdAt,
      updatedAt: reservation.createdAt,
      note: io.dryRun ? "dry-run" : null,
      outcomesOpened: false,
    };
    attempts.push(attempt);
    io.saveAttempts(attempts);

    if (io.dryRun) {
      return {
        mode: "run-daily",
        launch,
        preflight,
        reservation,
        captureLaunched: false,
        captureNotLaunchedReason: "dry-run",
        progress,
        message:
          `Dry-run reservation created for ${plannedUtcDay}; capture-not-launched`,
        outcomesOpened: false,
      };
    }

    const launcher = io.captureLauncher ?? defaultCaptureLauncher;
    try {
      await launcher({
        reservation,
        windowStartIso: launch.window.startIso,
        durationMinutes: launch.window.durationMinutes,
      });
      // Real post-capture admit path is CLI/operator follow-up; library stops at launch.
      return {
        mode: "run-daily",
        launch,
        preflight,
        reservation,
        captureLaunched: true,
        captureNotLaunchedReason: null,
        progress,
        message: `Capture launcher invoked for ${plannedUtcDay}`,
        outcomesOpened: false,
      };
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "capture launcher failed";
      if (reason.includes("real capture disabled")) {
        return {
          mode: "run-daily",
          launch,
          preflight,
          reservation,
          captureLaunched: false,
          captureNotLaunchedReason: "capture-not-launched",
          progress,
          message:
            `Reservation recorded for ${plannedUtcDay}; capture-not-launched `
            + `(live capture requires M16_VALIDATION_ALLOW_LIVE_CAPTURE=1)`,
          outcomesOpened: false,
        };
      }
      throw error;
    }
  } finally {
    if (lock) {
      releaseM16ValidationRunnerLock(lock, io.lockIo);
    }
  }
}

export type M16ValidationRecoverResult = {
  mode: "recover";
  pending: M16ValidationAttemptRecord[];
  nextAction: string;
  progress: M16ValidationProgress;
  outcomesOpened: false;
};

/**
 * Resume pending steps from artifacts. Never backfills missed days.
 * Never shifts window for replacement.
 */
export function recoverM16ValidationCycle(io: {
  loadRegistry: () => M16ValidationRegistry;
  loadAttempts: () => M16ValidationAttemptRecord[];
  nowMs: () => number;
}): M16ValidationRecoverResult {
  const registry = io.loadRegistry();
  const attempts = io.loadAttempts();
  const progress = computeM16ValidationProgress(registry);
  const pending = attempts.filter((a) =>
    a.status === "reservation-only"
    || a.status === "capture-pending"
    || a.status === "health-pending"
    || a.status === "blind-scan-pending"
    || a.status === "registry-pending"
  );

  let nextAction = "no-pending-steps";
  if (progress.disposition === "ready-for-outcome-open") {
    nextAction = M16_COLLECTION_COMPLETE_SEALED_MESSAGE;
  } else if (pending.length > 0) {
    const latest = pending[pending.length - 1]!;
    nextAction = `resume-from-${latest.status} day=${latest.plannedUtcDay}`;
  } else {
    const next = nextM16GovernedCaptureStart(io.nowMs());
    nextAction = `await-next-window ${next.startIso}`;
  }

  return {
    mode: "recover",
    pending,
    nextAction,
    progress,
    outcomesOpened: false,
  };
}

export function statusM16ValidationCycle(io: {
  loadRegistry: () => M16ValidationRegistry;
  nowMs: () => number;
}): {
  mode: "status";
  progress: M16ValidationProgress;
  launch: M16LaunchWindowEvaluation;
  operatorText: string;
  nextStart: ReturnType<typeof nextM16GovernedCaptureStart>;
  outcomesOpened: false;
} {
  const registry = io.loadRegistry();
  const progress = computeM16ValidationProgress(registry);
  const now = io.nowMs();
  return {
    mode: "status",
    progress,
    launch: evaluateM16LaunchWindow(now),
    operatorText: formatOperatorProgressText(progress),
    nextStart: nextM16GovernedCaptureStart(now),
    outcomesOpened: false,
  };
}

export function preflightM16ValidationCycle(
  io: M16ValidationDailyCycleIo,
  utcDay?: string,
): M16ValidationPreflightResult {
  const registry = io.loadRegistry();
  const day = utcDay ?? m16UtcDayFromMs(io.nowMs());
  return runM16ValidationPreflight({
    registry,
    plannedUtcDay: day,
    ...io.preflightExtras,
  });
}
