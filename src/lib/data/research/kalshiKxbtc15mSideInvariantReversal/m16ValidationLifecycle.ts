/**
 * M16.2a validation daily-cycle orchestration — injectable IO.
 * End-to-end: reservation → canonical capture → health → blind admit.
 * Live capture only via explicit CLI/env gate M16_VALIDATION_ALLOW_LIVE_CAPTURE=1.
 */
import {
  evaluateM16OutcomeOpenAuthorization,
} from "./m16OutcomeOpenGate";
import {
  buildM16ValidationAuthorityBinding,
} from "./m16ValidationAuthority";
import {
  admitM16ValidationCaptureAfterHealth,
  type M16PostCapturePipelineDeps,
} from "./m16ValidationAdmitPipeline";
import {
  M16_COLLECTION_COMPLETE_SEALED_MESSAGE,
  M16ValidationCollectionError,
  type M16ValidationAttemptRecord,
  type M16ValidationCaptureLauncherResult,
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
import {
  appendM16ValidationReservation,
  computeM16ValidationProgress,
  registerExcludedSegment,
} from "./m16ValidationRegistry";
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
import {
  disableM16ValidationScheduler,
} from "./m16ValidationScheduler";

export { M16_COLLECTION_COMPLETE_SEALED_MESSAGE };

export type { M16ValidationCaptureLauncherResult };

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
  postCapture?: M16PostCapturePipelineDeps;
  /** Optional: auto-disable local scheduler state after READY/UNDERPOWERED. */
  onTerminalCampaign?: (progress: M16ValidationProgress) => void;
  registryDir?: string;
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
  capture: M16ValidationCaptureLauncherResult | null;
  admitted: boolean;
  excluded: boolean;
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
  for (const a of registry.accepted) {
    ids.add(a.reservationIdentity);
  }
  return ids;
}

function maybeDisableScheduler(
  io: M16ValidationDailyCycleIo,
  progress: M16ValidationProgress,
): void {
  if (
    progress.disposition !== "ready-for-outcome-open"
    && progress.disposition !== "validation-underpowered"
  ) {
    return;
  }
  if (io.onTerminalCampaign) {
    io.onTerminalCampaign(progress);
    return;
  }
  if (io.registryDir) {
    disableM16ValidationScheduler({ registryDir: io.registryDir });
  }
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

    let registry = io.loadRegistry();
    let progress = computeM16ValidationProgress(registry);

    if (progress.disposition === "ready-for-outcome-open") {
      const outcomeGate = evaluateM16OutcomeOpenAuthorization({
        progress: {
          acceptedCaptureHours: progress.acceptedHours,
          eligibleTradeCount: progress.eligibleTradeCount,
          utcDayClusterCount: progress.distinctEligibleUtcDayClusters,
          acceptedCaptureRunIds: registry.accepted.map((s) => s.runId),
        },
      });
      maybeDisableScheduler(io, progress);
      return {
        mode: "run-daily",
        launch: evaluateM16LaunchWindow(now),
        preflight: null,
        reservation: null,
        captureLaunched: false,
        captureNotLaunchedReason: "collection-ready",
        capture: null,
        admitted: false,
        excluded: false,
        progress,
        message:
          `${M16_COLLECTION_COMPLETE_SEALED_MESSAGE} `
          + `(outcomeOpenAuthorized=${outcomeGate.authorized})`,
        outcomesOpened: false,
      };
    }

    if (progress.disposition === "validation-underpowered") {
      maybeDisableScheduler(io, progress);
      return {
        mode: "run-daily",
        launch: evaluateM16LaunchWindow(now),
        preflight: null,
        reservation: null,
        captureLaunched: false,
        captureNotLaunchedReason: "validation-underpowered",
        capture: null,
        admitted: false,
        excluded: false,
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
        capture: null,
        admitted: false,
        excluded: false,
        progress,
        message: launch.message,
        outcomesOpened: false,
      };
    }
    if (launch.status === "missed-window") {
      return {
        mode: "run-daily",
        launch,
        preflight: null,
        reservation: null,
        captureLaunched: false,
        captureNotLaunchedReason: "missed-window",
        capture: null,
        admitted: false,
        excluded: false,
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
        capture: null,
        admitted: false,
        excluded: false,
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

    // Persist reservation BEFORE any live capture.
    registry = appendM16ValidationReservation(registry, reservation);
    io.saveRegistry(registry);

    const attemptId =
      `attempt-${plannedUtcDay}-${reservation.reservationIdentity.slice(0, 12)}`;
    let attempts = [...io.loadAttempts()];
    const attempt: M16ValidationAttemptRecord = {
      attemptId,
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
        capture: null,
        admitted: false,
        excluded: false,
        progress,
        message:
          `Dry-run reservation created for ${plannedUtcDay}; capture-not-launched`,
        outcomesOpened: false,
      };
    }

    const launcher = io.captureLauncher ?? defaultCaptureLauncher;
    attempts = attempts.map((a) =>
      a.attemptId === attemptId
        ? {
          ...a,
          status: "capture-pending" as const,
          updatedAt: new Date(io.nowMs()).toISOString(),
        }
        : a,
    );
    io.saveAttempts(attempts);

    let capture: M16ValidationCaptureLauncherResult;
    try {
      capture = await launcher({
        reservation,
        windowStartIso: launch.window.startIso,
        durationMinutes: launch.window.durationMinutes,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "capture launcher failed";
      if (reason.includes("real capture disabled")) {
        attempts = attempts.map((a) =>
          a.attemptId === attemptId
            ? {
              ...a,
              status: "capture-not-launched" as const,
              updatedAt: new Date(io.nowMs()).toISOString(),
              note: reason,
            }
            : a,
        );
        io.saveAttempts(attempts);
        return {
          mode: "run-daily",
          launch,
          preflight,
          reservation,
          captureLaunched: false,
          captureNotLaunchedReason: "capture-not-launched",
          capture: null,
          admitted: false,
          excluded: false,
          progress,
          message:
            `Reservation recorded for ${plannedUtcDay}; capture-not-launched `
            + `(live capture requires M16_VALIDATION_ALLOW_LIVE_CAPTURE=1)`,
          outcomesOpened: false,
        };
      }
      throw error;
    }

    log(`Capture complete runId=${capture.runId}; auditing + blind admit`);
    const admit = await admitM16ValidationCaptureAfterHealth(
      {
        registry,
        reservation,
        capture,
        attemptId,
        attempts,
      },
      io.postCapture,
    );
    io.saveRegistry(admit.registry);
    io.saveAttempts(admit.attempts);
    progress = admit.progress;
    maybeDisableScheduler(io, progress);

    return {
      mode: "run-daily",
      launch,
      preflight,
      reservation,
      captureLaunched: true,
      captureNotLaunchedReason: null,
      capture,
      admitted: admit.admitted,
      excluded: admit.excluded,
      progress,
      message: admit.message,
      outcomesOpened: false,
    };
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
  resumed: boolean;
  outcomesOpened: false;
};

/**
 * Deterministic crash recovery. Idempotent. Never backfills missed days.
 * Never shifts window for replacement. Never duplicates capture/admission.
 */
export async function recoverM16ValidationCycle(io: {
  loadRegistry: () => M16ValidationRegistry;
  saveRegistry?: (registry: M16ValidationRegistry) => void;
  loadAttempts: () => M16ValidationAttemptRecord[];
  saveAttempts?: (attempts: readonly M16ValidationAttemptRecord[]) => void;
  nowMs: () => number;
  lockPath?: string;
  lockIo?: M16ValidationLockIo;
  postCapture?: M16PostCapturePipelineDeps;
  findReservation?: (
    registry: M16ValidationRegistry,
    reservationIdentity: string,
  ) => M16ValidationReservation | null;
}): Promise<M16ValidationRecoverResult> {
  let lock: M16ValidationLockHandle | null = null;
  try {
    if (io.lockPath) {
      lock = acquireM16ValidationRunnerLock(io.lockPath, io.lockIo);
    }

    let registry = io.loadRegistry();
    let attempts = [...io.loadAttempts()];
    let progress = computeM16ValidationProgress(registry);
    const now = io.nowMs();
    const pending = attempts.filter((a) =>
      a.status === "reservation-only"
      || a.status === "capture-pending"
      || a.status === "health-pending"
      || a.status === "blind-scan-pending"
      || a.status === "registry-pending"
    );

    if (progress.disposition === "ready-for-outcome-open") {
      return {
        mode: "recover",
        pending,
        nextAction: M16_COLLECTION_COMPLETE_SEALED_MESSAGE,
        progress,
        resumed: false,
        outcomesOpened: false,
      };
    }

    if (pending.length === 0) {
      const next = nextM16GovernedCaptureStart(now);
      return {
        mode: "recover",
        pending,
        nextAction: `await-next-window ${next.startIso}`,
        progress,
        resumed: false,
        outcomesOpened: false,
      };
    }

    const latest = pending[pending.length - 1]!;
    const launch = evaluateM16LaunchWindow(now, latest.plannedUtcDay);

    // Reservation/capture never started and sealed window is gone → miss day.
    if (
      (latest.status === "reservation-only" || latest.status === "capture-pending")
      && (!latest.captureRunDir || !latest.runId)
    ) {
      if (launch.status === "missed-window" || launch.status === "too-early") {
        // too-early for *today* after missing yesterday's window still means
        // that planned day's launch window is gone if planned day < today.
        const today = m16UtcDayFromMs(now);
        if (latest.plannedUtcDay < today || launch.status === "missed-window") {
          const reservation = registry.reservations.find(
            (r) => r.reservationIdentity === latest.reservationIdentity,
          ) ?? null;
          registry = registerExcludedSegment(registry, {
            reservation,
            runId: latest.runId,
            captureIdentityHash: latest.captureIdentityHash ?? null,
            reason: "missed-window-after-reservation-no-capture",
            terminalStatus: "missed-window",
          });
          attempts = attempts.map((a) =>
            a.attemptId === latest.attemptId
              ? {
                ...a,
                status: "missed-window" as const,
                updatedAt: new Date(now).toISOString(),
                note: "recover: sealed window gone; no backfill",
              }
              : a,
          );
          io.saveRegistry?.(registry);
          io.saveAttempts?.(attempts);
          progress = computeM16ValidationProgress(registry);
          return {
            mode: "recover",
            pending: attempts.filter((a) =>
              a.status === "reservation-only"
              || a.status === "capture-pending"
              || a.status === "health-pending"
              || a.status === "blind-scan-pending"
              || a.status === "registry-pending"
            ),
            nextAction: `missed-window recorded for ${latest.plannedUtcDay}; await-next-window`,
            progress,
            resumed: true,
            outcomesOpened: false,
          };
        }
      }
      return {
        mode: "recover",
        pending,
        nextAction:
          `resume-from-${latest.status} day=${latest.plannedUtcDay} `
          + `(await live capture within launch tolerance; no shifted window)`,
        progress,
        resumed: false,
        outcomesOpened: false,
      };
    }

    // Post-capture recovery: health / blind / registry.
    if (
      latest.runId
      && latest.captureRunDir
      && latest.captureIdentityHash
      && latest.reservationIdentity
      && (
        latest.status === "health-pending"
        || latest.status === "blind-scan-pending"
        || latest.status === "registry-pending"
        || latest.status === "capture-pending"
      )
    ) {
      const reservation =
        (io.findReservation?.(registry, latest.reservationIdentity)
          ?? registry.reservations.find(
            (r) => r.reservationIdentity === latest.reservationIdentity,
          ))
        ?? null;
      if (!reservation) {
        throw new M16ValidationCollectionError(
          `recover: reservation ${latest.reservationIdentity} missing`,
        );
      }
      const admit = await admitM16ValidationCaptureAfterHealth(
        {
          registry,
          reservation,
          capture: {
            runId: latest.runId,
            captureRunDir: latest.captureRunDir,
            captureIdentityHash: latest.captureIdentityHash,
            captureStartIso: reservation.plannedStartIso,
            captureEndIso: reservation.plannedEndIso,
          },
          attemptId: latest.attemptId,
          attempts,
        },
        io.postCapture,
      );
      io.saveRegistry?.(admit.registry);
      io.saveAttempts?.(admit.attempts);
      return {
        mode: "recover",
        pending: admit.attempts.filter((a) =>
          a.status === "reservation-only"
          || a.status === "capture-pending"
          || a.status === "health-pending"
          || a.status === "blind-scan-pending"
          || a.status === "registry-pending"
        ),
        nextAction: admit.message,
        progress: admit.progress,
        resumed: true,
        outcomesOpened: false,
      };
    }

    return {
      mode: "recover",
      pending,
      nextAction: `resume-from-${latest.status} day=${latest.plannedUtcDay}`,
      progress,
      resumed: false,
      outcomesOpened: false,
    };
  } finally {
    if (lock) {
      releaseM16ValidationRunnerLock(lock, io.lockIo);
    }
  }
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
