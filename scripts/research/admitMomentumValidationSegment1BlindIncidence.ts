/**
 * Operator one-off: Segment 1 outcome-blind incidence + cohort registry admission.
 * Does NOT open validation outcomes / P&L / continuation / signs / p-values.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { createFilesystemMomentumDiscoveryIo } from "@/lib/data/research/kalshiTobMomentumDiscovery";
import {
  assertBlindIncidenceHasNoOutcomeFields,
  buildMomentumValidationCohortPlan,
  createEmptyMomentumValidationCohortRegistry,
  hashCaptureTopOfBookIdentity,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  registerMomentumValidationSegment,
  serializeMomentumValidationCohortRegistryJson,
  streamLockedCandidateBlindIncidence,
} from "@/lib/data/research/kalshiTobMomentumValidationCohort";

const SEGMENT_RUN_ID = "2026-09-13T04-05-01-822Z";
const CAPTURE_RUN_DIR =
  "/Users/builder/Desktop/KalshiBot/data/live-capture/forward-quotes/2026-09-13T04-05-01-822Z";
const RESERVED_META_PATH =
  "/Users/builder/Desktop/KalshiBot/data/research-results/momentum/validation-reserved/segment-1-2026-09-13T04-05-01-822Z.json";
const REGISTRY_PATH =
  "/Users/builder/Desktop/KalshiBot/data/research-results/momentum/validation-cohort/registry-v1.1.json";
/** PR #88 merge time — Segment 1 capture began after this freeze. */
const PLAN_FREEZE_TIMESTAMP_ISO = "2026-09-13T02:58:21Z";
const EXPECTED_PLAN_IDENTITY =
  "1a08e13e8a4e6dcfd1363259f13c940e3e52605b7c2edf860ae716fa2dce4b71";

async function main(): Promise<void> {
  const planArtifact = buildMomentumValidationCohortPlan({
    verifyPreOpenIdentities: false,
  });
  if (planArtifact.planIdentity !== EXPECTED_PLAN_IDENTITY) {
    throw new Error(
      `planIdentity mismatch: got ${planArtifact.planIdentity}, expected ${EXPECTED_PLAN_IDENTITY}`,
    );
  }

  const tobPath = join(CAPTURE_RUN_DIR, "top-of-book.jsonl");
  if (!existsSync(tobPath)) {
    throw new Error(`missing TOB: ${tobPath}`);
  }

  process.stderr.write("hashing top-of-book content identity...\n");
  const captureIdentityHash = await hashCaptureTopOfBookIdentity(tobPath);
  process.stderr.write(`captureIdentityHash=${captureIdentityHash}\n`);

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

  const reserved = JSON.parse(readFileSync(RESERVED_META_PATH, "utf8")) as Record<
    string,
    unknown
  >;
  if (reserved.outcomesOpened !== false) {
    throw new Error("reserved metadata outcomesOpened must remain false");
  }

  const captureStartMs = Date.parse(String(reserved.captureStartTimestamp));
  const captureEndMs = Date.parse(String(reserved.endedAt));
  if (!Number.isFinite(captureStartMs) || !Number.isFinite(captureEndMs)) {
    throw new Error("invalid capture start/end timestamps in reserved metadata");
  }

  let registry = createEmptyMomentumValidationCohortRegistry({
    planIdentity: planArtifact.planIdentity,
    planFreezeTimestampIso: PLAN_FREEZE_TIMESTAMP_ISO,
  });

  registry = registerMomentumValidationSegment(registry, {
    runId: SEGMENT_RUN_ID,
    captureRunDir: CAPTURE_RUN_DIR,
    captureStartMs,
    captureEndMs,
    durationMinutes: 300,
    captureIdentityHash,
    health: {
      passed: true,
      verdict: "capture-research-ready",
      topOfBookPresent: true,
      failureReasons: [],
    },
    captureEndReason: String(reserved.captureEndReason ?? "duration-complete"),
    priorResearchRoles: [],
    contaminationClassification: "untouched-for-short-horizon-price-response",
    intendedCohortPosition: 1,
    reservedForValidationLineage: true,
    planIdentity: planArtifact.planIdentity,
    planFreezeTimestampIso: PLAN_FREEZE_TIMESTAMP_ISO,
    blindIncidence: blind.incidence,
    independentUnitIds: blind.independentUnitIds,
  });

  if (registry.accepted.length !== 1 || registry.excluded.length !== 0) {
    throw new Error(
      `expected exactly one accepted segment; accepted=${registry.accepted.length} `
        + `excluded=${registry.excluded.length} `
        + `reason=${registry.excluded[0]?.exclusionReason ?? "n/a"}`,
    );
  }
  if (registry.accepted[0]!.outcomesOpened !== false) {
    throw new Error("registry accepted segment outcomesOpened must be false");
  }

  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, serializeMomentumValidationCohortRegistryJson(registry), "utf8");

  // Update reserved metadata with blind ESS fields only (no outcome fields).
  const nextReserved = {
    ...reserved,
    outcomesOpened: false,
    captureIdentityHash,
    planIdentity: planArtifact.planIdentity,
    priorPlanIdentity: planArtifact.plan.amendment.priorPlanIdentity,
    planFreezeTimestampIso: PLAN_FREEZE_TIMESTAMP_ISO,
    cohortRegistryPath: REGISTRY_PATH,
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    blindIncidence: blind.incidence,
    independentUnitIds: blind.independentUnitIds,
    blindDiagnostics: {
      tobRecordsScanned: blind.diagnostics.tobRecordsScanned,
      firstCrossingEvents: blind.diagnostics.firstCrossingEvents,
      refractoryEpisodes: blind.diagnostics.refractoryEpisodes,
      outcomesOpened: false as const,
    },
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

  // Outcome-blind summary only — never print P&L / continuation magnitudes.
  const summary = {
    segmentRunId: SEGMENT_RUN_ID,
    candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    planIdentity: planArtifact.planIdentity,
    planFreezeTimestampIso: PLAN_FREEZE_TIMESTAMP_ISO,
    captureIdentityHash,
    registryPath: REGISTRY_PATH,
    reservedMetaPath: RESERVED_META_PATH,
    outcomesOpened: false,
    independentEss: blind.incidence.independentEss,
    qualifyingEpisodeCount: blind.incidence.qualifyingEpisodeCount,
    distinctMarkets: blind.incidence.distinctMarkets,
    distinctMarketDays: blind.incidence.distinctMarketDays,
    responseObservableCount: blind.incidence.responseObservableCount,
    executableObservableCount: blind.incidence.executableObservableCount,
    refractoryEpisodes: blind.diagnostics.refractoryEpisodes,
    firstCrossingEvents: blind.diagnostics.firstCrossingEvents,
    tobRecordsScanned: blind.diagnostics.tobRecordsScanned,
    accepted: true,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
