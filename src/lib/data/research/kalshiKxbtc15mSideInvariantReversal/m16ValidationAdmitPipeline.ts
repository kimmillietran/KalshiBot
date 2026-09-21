/**
 * M16.2a post-capture admit pipeline: health → blind scan → registry.
 * Never opens P&L / target / stop / settlement.
 */
import { createFilesystemMomentumDiscoveryIo } from "@/lib/data/research/kalshiTobMomentumDiscovery";

import {
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
  M16_VALIDATION_ROLE,
} from "./m16ProspectiveCohortPlan";
import { streamM16ValidationBlindIncidence } from "./m16ValidationBlindIncidence";
import {
  M16ValidationCollectionError,
  type M16ValidationAttemptRecord,
  type M16ValidationBlindIncidence,
  type M16ValidationCaptureLauncherResult,
  type M16ValidationProgress,
  type M16ValidationRegistry,
  type M16ValidationReservation,
  type M16ValidationSegmentHealth,
} from "./m16ValidationCohortTypes";
import { auditM16ValidationCaptureHealth } from "./m16ValidationHealthGate";
import {
  computeM16ValidationProgress,
  healthyZeroSignalAcceptedMinutes,
  registerAcceptedSegment,
  registerExcludedSegment,
} from "./m16ValidationRegistry";
import { m16UtcDayFromMs } from "./m16ValidationSchedule";

export type M16PostCapturePipelineDeps = {
  auditHealth?: (input: {
    captureRunDir: string;
    runId: string;
  }) => Promise<{ health: M16ValidationSegmentHealth }>;
  blindScan?: (input: {
    runId: string;
    captureRunDir: string;
    captureIdentityHash: string;
  }) => Promise<M16ValidationBlindIncidence>;
  nowIso?: () => string;
};

export type M16PostCapturePipelineResult = {
  registry: M16ValidationRegistry;
  progress: M16ValidationProgress;
  health: M16ValidationSegmentHealth | null;
  blindIncidence: M16ValidationBlindIncidence | null;
  attemptStatus: M16ValidationAttemptRecord["status"];
  admitted: boolean;
  excluded: boolean;
  message: string;
};

function updateAttempt(
  attempts: readonly M16ValidationAttemptRecord[],
  attemptId: string,
  patch: Partial<M16ValidationAttemptRecord>,
  nowIso: string,
): M16ValidationAttemptRecord[] {
  return attempts.map((a) =>
    a.attemptId === attemptId
      ? { ...a, ...patch, updatedAt: nowIso, outcomesOpened: false as const }
      : a,
  );
}

/**
 * Idempotent post-capture path: health audit → blind structural scan → registry.
 */
export async function admitM16ValidationCaptureAfterHealth(
  input: {
    registry: M16ValidationRegistry;
    reservation: M16ValidationReservation;
    capture: M16ValidationCaptureLauncherResult;
    attemptId: string;
    attempts: readonly M16ValidationAttemptRecord[];
  },
  deps: M16PostCapturePipelineDeps = {},
): Promise<M16PostCapturePipelineResult & {
  attempts: M16ValidationAttemptRecord[];
}> {
  const nowIso = deps.nowIso?.() ?? new Date().toISOString();
  let attempts = [...input.attempts];
  let registry = input.registry;

  // Already accepted for this reservation/run → idempotent no-op.
  const alreadyAccepted = registry.accepted.find(
    (s) =>
      s.reservationIdentity === input.reservation.reservationIdentity
      || s.runId === input.capture.runId
      || s.captureIdentityHash === input.capture.captureIdentityHash,
  );
  if (alreadyAccepted) {
    return {
      registry,
      progress: computeM16ValidationProgress(registry),
      health: {
        passed: true,
        verdict: "already-accepted",
        healthArtifactIdentity: alreadyAccepted.healthArtifactIdentity,
        failureReasons: [],
      },
      blindIncidence: alreadyAccepted.blindIncidence,
      attemptStatus: "accepted",
      admitted: true,
      excluded: false,
      message: `idempotent: run ${input.capture.runId} already accepted`,
      attempts: updateAttempt(attempts, input.attemptId, {
        status: "accepted",
        runId: input.capture.runId,
        captureRunDir: input.capture.captureRunDir,
        captureIdentityHash: input.capture.captureIdentityHash,
      }, nowIso),
    };
  }

  const alreadyExcluded = registry.excluded.find(
    (s) =>
      s.runId === input.capture.runId
      || (s.captureIdentityHash != null
        && s.captureIdentityHash === input.capture.captureIdentityHash)
      || s.reservationIdentity === input.reservation.reservationIdentity,
  );
  if (alreadyExcluded) {
    return {
      registry,
      progress: computeM16ValidationProgress(registry),
      health: null,
      blindIncidence: null,
      attemptStatus: "excluded",
      admitted: false,
      excluded: true,
      message: `idempotent: run already excluded (${alreadyExcluded.reason})`,
      attempts: updateAttempt(attempts, input.attemptId, {
        status: "excluded",
        runId: input.capture.runId,
        captureRunDir: input.capture.captureRunDir,
        captureIdentityHash: input.capture.captureIdentityHash,
      }, nowIso),
    };
  }

  attempts = updateAttempt(attempts, input.attemptId, {
    status: "health-pending",
    runId: input.capture.runId,
    captureRunDir: input.capture.captureRunDir,
    captureIdentityHash: input.capture.captureIdentityHash,
  }, nowIso);

  const auditHealth =
    deps.auditHealth
    ?? ((args) => auditM16ValidationCaptureHealth(args));
  const { health } = await auditHealth({
    captureRunDir: input.capture.captureRunDir,
    runId: input.capture.runId,
  });

  if (!health.passed) {
    registry = registerExcludedSegment(registry, {
      reservation: input.reservation,
      runId: input.capture.runId,
      captureIdentityHash: input.capture.captureIdentityHash,
      reason: health.failureReasons.join("; ") || health.verdict,
      terminalStatus: "health-failed",
    });
    attempts = updateAttempt(attempts, input.attemptId, {
      status: "excluded",
      healthArtifactIdentity: health.healthArtifactIdentity,
    }, nowIso);
    return {
      registry,
      progress: computeM16ValidationProgress(registry),
      health,
      blindIncidence: null,
      attemptStatus: "excluded",
      admitted: false,
      excluded: true,
      message:
        `Unhealthy capture excluded (0 accepted hours): ${health.verdict}`,
      attempts,
    };
  }

  attempts = updateAttempt(attempts, input.attemptId, {
    status: "blind-scan-pending",
    healthArtifactIdentity: health.healthArtifactIdentity,
  }, nowIso);

  const blindScan =
    deps.blindScan
    ?? (async (args) =>
      streamM16ValidationBlindIncidence({
        io: createFilesystemMomentumDiscoveryIo(),
        runId: args.runId,
        captureRunDir: args.captureRunDir,
        captureIdentityHash: args.captureIdentityHash,
        researchRole: M16_VALIDATION_ROLE,
      }));

  const blindIncidence = await blindScan({
    runId: input.capture.runId,
    captureRunDir: input.capture.captureRunDir,
    captureIdentityHash: input.capture.captureIdentityHash,
  });

  if (blindIncidence.outcomesOpened !== false) {
    throw new M16ValidationCollectionError("blind incidence opened outcomes");
  }
  if (
    blindIncidence.quarantine.pnlOpened
    || blindIncidence.quarantine.targetHitInspected
    || blindIncidence.quarantine.stopHitInspected
    || blindIncidence.quarantine.settlementDirectionInspected
  ) {
    throw new M16ValidationCollectionError(
      "blind incidence must remain economically sealed",
    );
  }

  attempts = updateAttempt(attempts, input.attemptId, {
    status: "registry-pending",
  }, nowIso);

  const startMs = Date.parse(input.capture.captureStartIso);
  const endMs = Date.parse(input.capture.captureEndIso);
  const utcDays = [
    ...new Set([
      m16UtcDayFromMs(startMs),
      m16UtcDayFromMs(Math.max(startMs, endMs - 1)),
    ]),
  ];

  registry = registerAcceptedSegment(registry, {
    reservation: input.reservation,
    runId: input.capture.runId,
    captureRunDir: input.capture.captureRunDir,
    captureIdentityHash: input.capture.captureIdentityHash,
    health,
    captureStartIso: input.capture.captureStartIso,
    captureEndIso: input.capture.captureEndIso,
    acceptedMinutes: healthyZeroSignalAcceptedMinutes(),
    utcDaysPhysicallyCovered: utcDays,
    blindIncidence,
  });

  attempts = updateAttempt(attempts, input.attemptId, {
    status: "accepted",
  }, nowIso);

  const progress = computeM16ValidationProgress(registry);
  const zeroSignal =
    blindIncidence.eligibleTradeCountRaw === 0
      ? " healthy zero-signal (+4h, G+0)"
      : ` eligibleTrades+=${blindIncidence.eligibleTradeCountRaw}`;

  return {
    registry,
    progress,
    health,
    blindIncidence,
    attemptStatus: "accepted",
    admitted: true,
    excluded: false,
    message:
      `Accepted ${input.capture.runId} `
      + `(${M16_STANDARD_SEGMENT_DURATION_MINUTES}m)${zeroSignal}`,
    attempts,
  };
}
