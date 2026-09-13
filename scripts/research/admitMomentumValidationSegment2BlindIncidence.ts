/**
 * Operator one-off: Segment 2 outcome-blind incidence + cohort registry admission.
 * Loads the existing Segment 1 registry, admits Segment 2, deduplicates ESS,
 * and evaluates the sealed stopping rule. Does NOT open validation outcomes.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createFilesystemMomentumDiscoveryIo } from "@/lib/data/research/kalshiTobMomentumDiscovery";
import {
  assertBlindIncidenceHasNoOutcomeFields,
  buildMomentumValidationCohortPlan,
  deduplicateMomentumValidationCohortUnits,
  evaluateMomentumValidationStopping,
  hashCaptureTopOfBookIdentity,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  registerMomentumValidationSegment,
  serializeMomentumValidationCohortRegistryJson,
  serializeMomentumValidationStoppingJson,
  streamLockedCandidateBlindIncidence,
  sumAcceptedCaptureHours,
  type MomentumValidationCohortRegistry,
} from "@/lib/data/research/kalshiTobMomentumValidationCohort";

const SEGMENT_RUN_ID = "2026-09-13T09-38-54-911Z";
const CAPTURE_RUN_DIR =
  "/Users/builder/Desktop/KalshiBot/data/live-capture/forward-quotes/2026-09-13T09-38-54-911Z";
const RESERVED_META_PATH =
  "/Users/builder/Desktop/KalshiBot/data/research-results/momentum/validation-reserved/segment-2-2026-09-13T09-38-54-911Z.json";
const RUN_RESERVED_PATH = join(
  CAPTURE_RUN_DIR,
  "m14-momentum-validation-reserved-segment-2.json",
);
const REGISTRY_PATH =
  "/Users/builder/Desktop/KalshiBot/data/research-results/momentum/validation-cohort/registry-v1.1.json";
const HEALTH_AUDIT_PATH = join(CAPTURE_RUN_DIR, "capture-health-audit.json");
const PLAN_FREEZE_TIMESTAMP_ISO = "2026-09-13T02:58:21Z";
const EXPECTED_PLAN_IDENTITY =
  "1a08e13e8a4e6dcfd1363259f13c940e3e52605b7c2edf860ae716fa2dce4b71";
const EXPECTED_FAMILY =
  "764fd36d67f8152077666119ddd1049bcd6940d259f21b60ec7138fa3ad4795d";
const EXPECTED_EVIDENCE =
  "97c310c929733a92d4e3aa460b85e58d406f1888ed8f24ea43a4c0b69d24dee7";
const EXPECTED_DISCOVERY =
  "7a05a2dadd2ec21c382f52ebe804bf606ac3df0b6cb69194b3e6af9ce1abeaee";
const DECLARED_DURATION_MINUTES = 480;
const INTENDED_COHORT_POSITION = 2;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertReservationGates(reserved: Record<string, unknown>): void {
  if (reserved.outcomesOpened !== false) {
    throw new Error("reserved metadata outcomesOpened must remain false");
  }
  if (reserved.candidate !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new Error(
      `candidate mismatch: got ${String(reserved.candidate)}, expected ${LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID}`,
    );
  }
  if (reserved.durationMinutes !== DECLARED_DURATION_MINUTES) {
    throw new Error(
      `durationMinutes mismatch: got ${String(reserved.durationMinutes)}, expected ${DECLARED_DURATION_MINUTES}`,
    );
  }
  if (reserved.cohortPlanIdentity !== EXPECTED_PLAN_IDENTITY) {
    throw new Error(
      `cohortPlanIdentity mismatch: got ${String(reserved.cohortPlanIdentity)}`,
    );
  }
  if (reserved.familyDefinitionIdentity !== EXPECTED_FAMILY) {
    throw new Error("familyDefinitionIdentity mismatch");
  }
  if (reserved.evidenceContractIdentity !== EXPECTED_EVIDENCE) {
    throw new Error("evidenceContractIdentity mismatch");
  }
  if (reserved.trainDiscoveryIdentity !== EXPECTED_DISCOVERY) {
    throw new Error("trainDiscoveryIdentity mismatch");
  }
  if (reserved.captureRunId !== SEGMENT_RUN_ID) {
    throw new Error(`captureRunId mismatch: got ${String(reserved.captureRunId)}`);
  }
  const anti = reserved.antiShoppingAssertion;
  if (anti == null || typeof anti !== "object") {
    throw new Error("antiShoppingAssertion missing");
  }
  const antiRecord = anti as Record<string, unknown>;
  for (const key of [
    "validationExecutablePnlComputed",
    "midpointContinuationComputed",
    "responseDirectionInspected",
    "validationEffectEstimateInspected",
    "pValueCalculated",
  ]) {
    if (antiRecord[key] !== false) {
      throw new Error(`antiShoppingAssertion.${key} must be false`);
    }
  }
}

async function main(): Promise<void> {
  const planArtifact = buildMomentumValidationCohortPlan({
    verifyPreOpenIdentities: false,
  });
  if (planArtifact.planIdentity !== EXPECTED_PLAN_IDENTITY) {
    throw new Error(
      `planIdentity mismatch: got ${planArtifact.planIdentity}, expected ${EXPECTED_PLAN_IDENTITY}`,
    );
  }

  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`existing cohort registry missing: ${REGISTRY_PATH}`);
  }
  if (!existsSync(HEALTH_AUDIT_PATH)) {
    throw new Error(`governed health audit missing: ${HEALTH_AUDIT_PATH}`);
  }
  if (!existsSync(RESERVED_META_PATH)) {
    throw new Error(`reserved metadata missing: ${RESERVED_META_PATH}`);
  }
  if (!existsSync(RUN_RESERVED_PATH)) {
    throw new Error(`run-dir reservation missing: ${RUN_RESERVED_PATH}`);
  }

  const reserved = JSON.parse(readFileSync(RESERVED_META_PATH, "utf8")) as Record<
    string,
    unknown
  >;
  const runReserved = JSON.parse(readFileSync(RUN_RESERVED_PATH, "utf8")) as Record<
    string,
    unknown
  >;
  assertReservationGates(reserved);
  assertReservationGates(runReserved);

  const healthAudit = JSON.parse(readFileSync(HEALTH_AUDIT_PATH, "utf8")) as {
    selectedRunId?: string;
    summary?: { verdict?: string; recommendedNextAction?: string };
  };
  if (healthAudit.selectedRunId !== SEGMENT_RUN_ID) {
    throw new Error(
      `health audit selectedRunId mismatch: got ${String(healthAudit.selectedRunId)}`,
    );
  }
  if (healthAudit.summary?.verdict !== "capture-research-ready") {
    throw new Error(
      `health audit not research-ready: ${String(healthAudit.summary?.verdict)}`,
    );
  }
  const healthArtifactIdentity = sha256File(HEALTH_AUDIT_PATH);

  const tobPath = join(CAPTURE_RUN_DIR, "top-of-book.jsonl");
  if (!existsSync(tobPath)) {
    throw new Error(`missing TOB: ${tobPath}`);
  }

  process.stderr.write("hashing top-of-book content identity...\n");
  const captureIdentityHash = await hashCaptureTopOfBookIdentity(tobPath);
  process.stderr.write(`captureIdentityHash=${captureIdentityHash}\n`);
  process.stderr.write(`healthArtifactIdentity=${healthArtifactIdentity}\n`);

  const io = createFilesystemMomentumDiscoveryIo();
  process.stderr.write("streaming locked-candidate blind incidence...\n");
  const blind = await streamLockedCandidateBlindIncidence({
    io,
    segmentRunId: SEGMENT_RUN_ID,
    captureRunDir: CAPTURE_RUN_DIR,
    log: (message) => {
      process.stderr.write(`${message}\n`);
    },
  });

  assertBlindIncidenceHasNoOutcomeFields(blind.incidence);
  if (blind.incidence.outcomesOpened !== false) {
    throw new Error("outcomesOpened must be false");
  }
  if (blind.diagnostics.candidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new Error("candidate mismatch");
  }

  const captureStartMs = Date.parse(String(reserved.captureStartTimestamp));
  const statusPath = join(CAPTURE_RUN_DIR, "capture-run-status.json");
  const status = JSON.parse(readFileSync(statusPath, "utf8")) as {
    endedAt?: string;
    captureEndReason?: string;
  };
  const captureEndMs = Date.parse(String(status.endedAt));
  if (!Number.isFinite(captureStartMs) || !Number.isFinite(captureEndMs)) {
    throw new Error("invalid capture start/end timestamps");
  }
  const actualDurationMinutes = (captureEndMs - captureStartMs) / 60_000;

  const existing = JSON.parse(
    readFileSync(REGISTRY_PATH, "utf8"),
  ) as MomentumValidationCohortRegistry;
  if (existing.planIdentity !== EXPECTED_PLAN_IDENTITY) {
    throw new Error("existing registry planIdentity mismatch");
  }
  if (existing.planFreezeTimestampIso !== PLAN_FREEZE_TIMESTAMP_ISO) {
    throw new Error("existing registry freeze timestamp mismatch");
  }
  if (existing.accepted.length !== 1 || existing.accepted[0]?.runId !== "2026-09-13T04-05-01-822Z") {
    throw new Error(
      `expected Segment 1 only in registry before Segment 2 admit; got accepted=${existing.accepted.length}`,
    );
  }
  if (existing.accepted.some((row) => row.runId === SEGMENT_RUN_ID)) {
    throw new Error("Segment 2 already present in registry");
  }

  const registry = registerMomentumValidationSegment(existing, {
    runId: SEGMENT_RUN_ID,
    captureRunDir: CAPTURE_RUN_DIR,
    captureStartMs,
    captureEndMs,
    durationMinutes: DECLARED_DURATION_MINUTES,
    captureIdentityHash,
    health: {
      passed: true,
      verdict: "capture-research-ready",
      topOfBookPresent: true,
      failureReasons: [],
    },
    captureEndReason: String(status.captureEndReason ?? "duration-complete"),
    priorResearchRoles: [],
    contaminationClassification: "untouched-for-short-horizon-price-response",
    intendedCohortPosition: INTENDED_COHORT_POSITION,
    reservedForValidationLineage: true,
    planIdentity: planArtifact.planIdentity,
    planFreezeTimestampIso: PLAN_FREEZE_TIMESTAMP_ISO,
    blindIncidence: blind.incidence,
    independentUnitIds: blind.independentUnitIds,
  });

  const segment2 = registry.accepted.find((row) => row.runId === SEGMENT_RUN_ID);
  if (!segment2 || segment2.outcomesOpened !== false) {
    const excluded = registry.excluded.find((row) => row.runId === SEGMENT_RUN_ID);
    throw new Error(
      `Segment 2 not accepted; exclusion=${excluded?.exclusionReason ?? "n/a"}`,
    );
  }

  const dedup = deduplicateMomentumValidationCohortUnits(registry.accepted);
  const acceptedCaptureHours = sumAcceptedCaptureHours(registry.accepted);
  const stopping = evaluateMomentumValidationStopping({
    cumulativeBlindEss: dedup.deduplicatedCohortEss,
    cumulativeAcceptedCaptureHours: acceptedCaptureHours,
    acceptedSegmentCount: registry.accepted.length,
  });

  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, serializeMomentumValidationCohortRegistryJson(registry), "utf8");

  const stoppingPath = join(
    dirname(REGISTRY_PATH),
    `stopping-after-segment-2-${SEGMENT_RUN_ID}.json`,
  );
  writeFileSync(stoppingPath, serializeMomentumValidationStoppingJson(stopping), "utf8");

  const nextReserved = {
    ...reserved,
    outcomesOpened: false,
    captureStatus: "completed",
    endedAt: status.endedAt,
    captureEndReason: status.captureEndReason ?? "duration-complete",
    durationMinutesActual: actualDurationMinutes,
    captureIdentityHash,
    healthArtifactIdentity,
    captureHealthAuditVerdict: healthAudit.summary?.verdict,
    captureHealthAuditRecommendedNextAction: healthAudit.summary?.recommendedNextAction,
    planIdentity: planArtifact.planIdentity,
    priorPlanIdentity: planArtifact.plan.amendment.priorPlanIdentity,
    planFreezeTimestampIso: PLAN_FREEZE_TIMESTAMP_ISO,
    cohortRegistryPath: REGISTRY_PATH,
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    intendedCohortPosition: INTENDED_COHORT_POSITION,
    role: "validation",
    blindIncidence: blind.incidence,
    independentUnitIds: blind.independentUnitIds,
    blindDiagnostics: {
      tobRecordsScanned: blind.diagnostics.tobRecordsScanned,
      firstCrossingEvents: blind.diagnostics.firstCrossingEvents,
      refractoryEpisodes: blind.diagnostics.refractoryEpisodes,
      outcomesOpened: false as const,
    },
    cohortDedup: {
      segment1BlindEss: existing.accepted[0]!.blindIncidence.independentEss,
      segment2BlindEss: blind.incidence.independentEss,
      rawPerSegmentEssSum: dedup.rawPerSegmentEssSum,
      cumulativeDeduplicatedBlindEss: dedup.deduplicatedCohortEss,
      duplicateOrDependentUnitsRemoved: dedup.duplicateOrDependentUnitsRemoved,
    },
    stopping,
    isolationClassification: {
      ...(typeof reserved.isolationClassification === "object"
        && reserved.isolationClassification != null
        ? (reserved.isolationClassification as Record<string, unknown>)
        : {}),
      outcomesOpened: false,
      blindIncidenceComputed: true,
      validationOutcomesOpened: false,
    },
  };
  writeFileSync(RESERVED_META_PATH, `${JSON.stringify(nextReserved, null, 2)}\n`, "utf8");
  writeFileSync(RUN_RESERVED_PATH, `${JSON.stringify(nextReserved, null, 2)}\n`, "utf8");

  const summary = {
    segmentRunId: SEGMENT_RUN_ID,
    candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    planIdentity: planArtifact.planIdentity,
    planFreezeTimestampIso: PLAN_FREEZE_TIMESTAMP_ISO,
    captureIdentityHash,
    healthArtifactIdentity,
    registryPath: REGISTRY_PATH,
    reservedMetaPath: RESERVED_META_PATH,
    stoppingPath,
    outcomesOpened: false,
    cohortPosition: INTENDED_COHORT_POSITION,
    role: "validation",
    admissionAccepted: true,
    segment1BlindEss: existing.accepted[0]!.blindIncidence.independentEss,
    segment2BlindEss: blind.incidence.independentEss,
    cumulativeDeduplicatedBlindEss: dedup.deduplicatedCohortEss,
    rawPerSegmentEssSum: dedup.rawPerSegmentEssSum,
    duplicateOrDependentUnitsRemoved: dedup.duplicateOrDependentUnitsRemoved,
    acceptedCaptureHours,
    remainingAcceptedCaptureHours: stopping.remainingAcceptedCaptureHours,
    cohortStatus: stopping.status,
    qualifyingEpisodeCount: blind.incidence.qualifyingEpisodeCount,
    distinctMarkets: blind.incidence.distinctMarkets,
    distinctMarketDays: blind.incidence.distinctMarketDays,
    responseObservableCount: blind.incidence.responseObservableCount,
    executableObservableCount: blind.incidence.executableObservableCount,
    refractoryEpisodes: blind.diagnostics.refractoryEpisodes,
    firstCrossingEvents: blind.diagnostics.firstCrossingEvents,
    tobRecordsScanned: blind.diagnostics.tobRecordsScanned,
    actualDurationMinutes,
    declaredDurationMinutes: DECLARED_DURATION_MINUTES,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
