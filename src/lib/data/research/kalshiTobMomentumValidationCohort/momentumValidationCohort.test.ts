import { describe, expect, it } from "vitest";

import {
  PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
  PRIOR_LEAD_LAG_TRAIN_RUN_ID,
  PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
} from "../momentumEvidenceContract";

import {
  assertAdmittedValidationSegmentCannotBecomeHoldout,
  assertBlindIncidenceHasNoOutcomeFields,
  assertHistoricalCannotSelfDeclareClean,
  assertRunEligibleForMomentumValidationCohort,
  assertSealedMomentumIdentitiesMatchPreOpen,
  assertStoppingIgnoresSyntheticEffect,
  bindLockedMomentumValidationCandidate,
  buildBlindIncidenceFromUnitKeys,
  buildBlindIncidenceWithMarketDayCap,
  buildMomentumIndependentUnitKey,
  buildMomentumValidationCohortPlan,
  buildValidationHoldoutIsolationPolicy,
  createEmptyMomentumValidationCohortRegistry,
  deduplicateMomentumValidationCohortUnits,
  evaluateMomentumValidationStopping,
  FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
  MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS,
  MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
  MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_TARGET_ESS,
  MomentumValidationCohortError,
  registerMomentumValidationSegment,
  serializeMomentumValidationCohortPlanJson,
} from "./index";
import type { MomentumValidationAcceptedSegment } from "./momentumValidationCohortTypes";

const PLAN_FREEZE = "2026-09-12T00:00:00.000Z";
const FRESH_START = Date.parse("2026-09-12T12:00:00.000Z");

function makeAcceptedSegment(input: {
  runId: string;
  unitIds: readonly string[];
  captureStartMs?: number;
  ess?: number;
}): MomentumValidationAcceptedSegment {
  const capped = buildBlindIncidenceWithMarketDayCap({
    segmentRunId: input.runId,
    episodeKeys: input.unitIds.map((unitId) => ({ unitId })),
  });
  return {
    runId: input.runId,
    captureRunDir: `data/live-capture/forward-quotes/${input.runId}`,
    captureStartMs: input.captureStartMs ?? FRESH_START,
    captureEndMs: (input.captureStartMs ?? FRESH_START) + 300 * 60_000,
    durationMinutes: 300,
    captureIdentityHash: `capture-${input.runId}`,
    health: {
      passed: true,
      verdict: "ok",
      topOfBookPresent: true,
      failureReasons: [],
    },
    captureEndReason: "duration-elapsed",
    configIdentity: "cfg-test",
    priorResearchRoles: [],
    contaminationClassification: "untouched-for-short-horizon-price-response",
    intendedCohortPosition: null,
    outcomesOpened: false,
    reservedForValidationLineage: true,
    reservedAfterPlanFreeze: true,
    planIdentity: "plan-test",
    reservationAttestationHash: `attest-${input.runId}`,
    accepted: true,
    blindIncidence: {
      ...capped.incidence,
      independentEss: input.ess ?? capped.incidence.independentEss,
    },
    independentUnitIds: capped.independentUnitIds,
  };
}

describe("kalshiTobMomentumValidationCohort", () => {
  it("1-2. exact locked TRAIN candidate required; losers rejected", () => {
    expect(LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID).toBe(
      "W-5000|X-2|H-30000|continuation",
    );
    const ok = bindLockedMomentumValidationCandidate({
      discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
      shortlistCandidateIds: [LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID],
    });
    expect(ok.lockedCandidateId).toBe(LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID);

    expect(() =>
      bindLockedMomentumValidationCandidate({
        discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
        shortlistCandidateIds: ["W-15000|X-3|H-5000|continuation"],
      })
    ).toThrow(/Losing TRAIN candidates cannot enter validation/i);

    expect(() =>
      bindLockedMomentumValidationCandidate({
        discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
        shortlistCandidateIds: [
          LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
          "W-5000|X-2|H-15000|continuation",
        ],
      })
    ).toThrow(/exactly the locked candidate/i);
  });

  it("3-5. family, evidence, and TRAIN discovery identities required", () => {
    const sealed = assertSealedMomentumIdentitiesMatchPreOpen();
    expect(sealed.familyDefinitionIdentity).toBe(KNOWN_M140A_FAMILY_DEFINITION_IDENTITY);
    expect(sealed.evidenceContractIdentity).toBe(KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY);

    expect(() =>
      bindLockedMomentumValidationCandidate({
        discoveryIdentity: "wrong-discovery-identity",
        shortlistCandidateIds: [LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID],
        verifyPreOpenIdentities: false,
      })
    ).toThrow(/TRAIN discovery identity required/i);

    expect(() =>
      bindLockedMomentumValidationCandidate({
        discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
        shortlistCandidateIds: [LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID],
        familyDefinitionIdentity: "bad-family",
        verifyPreOpenIdentities: false,
      })
    ).toThrow(/Family identity required/i);

    expect(() =>
      bindLockedMomentumValidationCandidate({
        discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
        shortlistCandidateIds: [LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID],
        evidenceContractIdentity: "bad-evidence",
        verifyPreOpenIdentities: false,
      })
    ).toThrow(/Evidence identity required/i);
  });

  it("6-9. 300m / ESS 155 / max 8 / 40h budget", () => {
    const { plan, planIdentity } = buildMomentumValidationCohortPlan();
    expect(plan.analysisVersion).toBe(MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION);
    expect(plan.segmentDurationMinutes).toBe(300);
    expect(plan.segmentDurationMinutes).toBe(MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES);
    expect(plan.targetEss).toBe(155);
    expect(plan.targetEss).toBe(MOMENTUM_VALIDATION_TARGET_ESS);
    expect(plan.maxAcceptedSegments).toBe(8);
    expect(plan.maxAcceptedSegments).toBe(MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS);
    expect(plan.maxAcceptedCaptureHours).toBe(40);
    expect(plan.maxAcceptedCaptureHours).toBe(MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS);
    expect(
      (plan.segmentDurationMinutes / 60) * plan.maxAcceptedSegments,
    ).toBe(plan.maxAcceptedCaptureHours);
    expect(planIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.lockedCandidateId).toBe(LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID);
    expect(plan.discoveryIdentity).toBe(KNOWN_M140B_DISCOVERY_IDENTITY);
    expect(plan.noOutcomeAccess).toBe(true);
    expect(plan.quarantine.liveOrdersExecuted).toBe(false);
  });

  it("10-11. segment must be prospectively reserved; historical cannot self-declare", () => {
    const { planIdentity } = buildMomentumValidationCohortPlan();
    const registry = createEmptyMomentumValidationCohortRegistry({
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
    });

    expect(() =>
      assertHistoricalCannotSelfDeclareClean({
        runId: "old-run",
        historicalSelfDeclaredClean: true,
        captureStartMs: FRESH_START,
        planFreezeTimestampIso: PLAN_FREEZE,
      })
    ).toThrow(/cannot self-declare clean/i);

    const incidence = buildBlindIncidenceWithMarketDayCap({
      segmentRunId: "fresh-1",
      episodeKeys: [
        {
          unitId: buildMomentumIndependentUnitKey({
            marketTicker: "M1",
            tradingDayUtc: "2026-09-12",
          }),
        },
      ],
    });

    const withSelfDeclare = registerMomentumValidationSegment(registry, {
      runId: "fresh-1",
      captureRunDir: "data/live-capture/forward-quotes/fresh-1",
      captureStartMs: FRESH_START,
      captureEndMs: FRESH_START + 300 * 60_000,
      durationMinutes: 300,
      captureIdentityHash: "cap-1",
      health: {
        passed: true,
        verdict: "ok",
        topOfBookPresent: true,
        failureReasons: [],
      },
      reservedForValidationLineage: true,
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
      historicalSelfDeclaredClean: true,
      blindIncidence: incidence.incidence,
      independentUnitIds: incidence.independentUnitIds,
    });
    expect(withSelfDeclare.accepted).toHaveLength(0);
    expect(withSelfDeclare.excluded[0]?.exclusionReason).toMatch(/self-declare clean/i);

    const preFreeze = registerMomentumValidationSegment(registry, {
      runId: "fresh-early",
      captureRunDir: "data/live-capture/forward-quotes/fresh-early",
      captureStartMs: Date.parse("2026-09-11T00:00:00.000Z"),
      captureEndMs: Date.parse("2026-09-11T05:00:00.000Z"),
      durationMinutes: 300,
      captureIdentityHash: "cap-early",
      health: {
        passed: true,
        verdict: "ok",
        topOfBookPresent: true,
        failureReasons: [],
      },
      reservedForValidationLineage: true,
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
      blindIncidence: incidence.incidence,
      independentUnitIds: incidence.independentUnitIds,
    });
    expect(preFreeze.accepted).toHaveLength(0);
    expect(preFreeze.excluded[0]?.exclusionReason).toMatch(/pre-freeze|before cohort plan freeze/i);

    const admitted = registerMomentumValidationSegment(registry, {
      runId: "fresh-1",
      captureRunDir: "data/live-capture/forward-quotes/fresh-1",
      captureStartMs: FRESH_START,
      captureEndMs: FRESH_START + 300 * 60_000,
      durationMinutes: 300,
      captureIdentityHash: "cap-1",
      health: {
        passed: true,
        verdict: "ok",
        topOfBookPresent: true,
        failureReasons: [],
      },
      reservedForValidationLineage: true,
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
      blindIncidence: incidence.incidence,
      independentUnitIds: incidence.independentUnitIds,
    });
    expect(admitted.accepted).toHaveLength(1);
    expect(admitted.accepted[0]?.outcomesOpened).toBe(false);
    expect(admitted.accepted[0]?.reservedForValidationLineage).toBe(true);
  });

  it("12-14. prior TRAIN / lead-lag validation / holdout rejected", () => {
    expect(() =>
      assertRunEligibleForMomentumValidationCohort(PRIOR_LEAD_LAG_TRAIN_RUN_ID)
    ).toThrow(/prior TRAIN cannot enter/i);
    expect(() =>
      assertRunEligibleForMomentumValidationCohort(PRIOR_LEAD_LAG_VALIDATION_RUN_ID)
    ).toThrow(/prior lead-lag validation cannot enter/i);
    expect(() =>
      assertRunEligibleForMomentumValidationCohort(PRIOR_LEAD_LAG_HOLDOUT_RUN_ID)
    ).toThrow(/prior holdout cannot enter/i);
  });

  it("15-17. unhealthy excluded, preserved, does not consume budget", () => {
    const { planIdentity } = buildMomentumValidationCohortPlan();
    const registry = createEmptyMomentumValidationCohortRegistry({
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
    });
    const next = registerMomentumValidationSegment(registry, {
      runId: "unhealthy-1",
      captureRunDir: "data/live-capture/forward-quotes/unhealthy-1",
      captureStartMs: FRESH_START,
      captureEndMs: FRESH_START + 300 * 60_000,
      durationMinutes: 300,
      captureIdentityHash: "cap-unhealthy",
      health: {
        passed: false,
        verdict: "degraded",
        topOfBookPresent: true,
        failureReasons: ["gap-detected"],
      },
      reservedForValidationLineage: true,
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
    });
    expect(next.accepted).toHaveLength(0);
    expect(next.excluded).toHaveLength(1);
    expect(next.excluded[0]?.runId).toBe("unhealthy-1");
    expect(next.excluded[0]?.exclusionReason).toMatch(/gap-detected|unhealthy/i);
    expect(next.accepted.length).toBe(0);
  });

  it("18-23. blind counter incidence/ESS; no mid/pnl/sign/direction fields", () => {
    const unitA = buildMomentumIndependentUnitKey({
      marketTicker: "BTC-A",
      tradingDayUtc: "2026-09-12",
    });
    const unitB = buildMomentumIndependentUnitKey({
      marketTicker: "BTC-B",
      tradingDayUtc: "2026-09-12",
    });
    const incidence = buildBlindIncidenceFromUnitKeys({
      segmentRunId: "seg-blind",
      episodes: [
        {
          unitId: unitA,
          countsTowardIndependentN: true,
          responseObservable: true,
          executableObservable: true,
        },
        {
          unitId: unitB,
          countsTowardIndependentN: true,
          responseObservable: true,
          executableObservable: false,
        },
        {
          unitId: unitA,
          countsTowardIndependentN: false,
          responseObservable: true,
          executableObservable: true,
        },
      ],
    });
    expect(incidence.qualifyingEpisodeCount).toBe(2);
    expect(incidence.independentEss).toBe(2);
    expect(incidence.responseObservableCount).toBe(3);
    expect(incidence.executableObservableCount).toBe(2);
    expect(incidence.outcomesOpened).toBe(false);
    expect(incidence).not.toHaveProperty("midpointDelta");
    expect(incidence).not.toHaveProperty("pnl");
    expect(incidence).not.toHaveProperty("signedPnl");
    expect(incidence).not.toHaveProperty("directionConsistency");
    expect(() => assertBlindIncidenceHasNoOutcomeFields(incidence)).not.toThrow();

    expect(() =>
      assertBlindIncidenceHasNoOutcomeFields({
        ...incidence,
        midpointDelta: 1.5,
      })
    ).toThrow(/outcome/i);
    expect(() =>
      assertBlindIncidenceHasNoOutcomeFields({
        ...incidence,
        pnl: 2,
      })
    ).toThrow(/outcome/i);
    expect(() =>
      assertBlindIncidenceHasNoOutcomeFields({
        ...incidence,
        directionConsistency: true,
      })
    ).toThrow(/outcome/i);
    for (const field of ["responseCents", "signedPnl", "midpointDelta", "directionConsistency"]) {
      expect(FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES).toContain(field);
    }
  });

  it("24-26. market-day cap; cross-segment dedup; cohort ESS != sum", () => {
    const shared = buildMomentumIndependentUnitKey({
      marketTicker: "SX",
      tradingDayUtc: "2026-09-12",
    });
    const onlyA = buildMomentumIndependentUnitKey({
      marketTicker: "SA",
      tradingDayUtc: "2026-09-12",
    });
    const onlyB = buildMomentumIndependentUnitKey({
      marketTicker: "SB",
      tradingDayUtc: "2026-09-12",
    });

    const capped = buildBlindIncidenceWithMarketDayCap({
      segmentRunId: "cap-seg",
      episodeKeys: [
        { unitId: shared },
        { unitId: shared },
        { unitId: onlyA },
      ],
    });
    expect(capped.independentUnitIds).toHaveLength(2);
    expect(capped.diagnosticOnlyCount).toBe(1);
    expect(capped.incidence.independentEss).toBe(2);

    const seg1 = makeAcceptedSegment({
      runId: "seg-a",
      unitIds: [shared, onlyA],
      captureStartMs: FRESH_START,
    });
    const seg2 = makeAcceptedSegment({
      runId: "seg-b",
      unitIds: [shared, onlyB],
      captureStartMs: FRESH_START + 1,
    });
    const dedup = deduplicateMomentumValidationCohortUnits([seg1, seg2]);
    expect(dedup.rawPerSegmentEssSum).toBe(4);
    expect(dedup.deduplicatedCohortEss).toBe(3);
    expect(dedup.deduplicatedCohortEss).not.toBe(dedup.rawPerSegmentEssSum);
    expect(dedup.duplicateOrDependentUnitsRemoved).toBe(1);

    const again = deduplicateMomentumValidationCohortUnits([seg2, seg1]);
    expect(again.deduplicatedCohortEss).toBe(dedup.deduplicatedCohortEss);
    expect(again.retainedUnitIds).toEqual(dedup.retainedUnitIds);
  });

  it("27-30. ESS 154 continue; 155/200 ready; segment8+154 underpowered", () => {
    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 154,
        acceptedSegmentCount: 3,
      }).status,
    ).toBe("continue-collection");

    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 155,
        acceptedSegmentCount: 4,
      }).status,
    ).toBe("ready-for-outcome-open");

    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 200,
        acceptedSegmentCount: 5,
      }).status,
    ).toBe("ready-for-outcome-open");

    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 154,
        acceptedSegmentCount: 8,
      }).status,
    ).toBe("underpowered-at-fixed-capture-budget");
  });

  it("31-33. synthetic favorable/unfavorable effect cannot affect stopping", () => {
    expect(() =>
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 100,
        acceptedSegmentCount: 2,
        syntheticEffectCents: 99,
      })
    ).toThrow(/cannot affect validation cohort stopping/i);

    expect(() =>
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 100,
        acceptedSegmentCount: 2,
        syntheticEffectCents: -99,
      })
    ).toThrow(/cannot affect validation cohort stopping/i);

    expect(() =>
      assertStoppingIgnoresSyntheticEffect({
        cumulativeBlindEss: 100,
        acceptedSegmentCount: 2,
        favorableEffectCents: 50,
        unfavorableEffectCents: -50,
      })
    ).not.toThrow();

    const base = evaluateMomentumValidationStopping({
      cumulativeBlindEss: 100,
      acceptedSegmentCount: 2,
    });
    expect(base.status).toBe("continue-collection");
    expect(base.effectPeekingForbidden).toBe(true);
  });

  it("34. admitted validation segment forbidden as holdout", () => {
    expect(() =>
      assertAdmittedValidationSegmentCannotBecomeHoldout({
        runId: "fresh-1",
        admittedToValidationCohort: true,
        proposedRole: "holdout",
      })
    ).toThrow(/validation→holdout reuse is forever forbidden/i);

    expect(() =>
      assertAdmittedValidationSegmentCannotBecomeHoldout({
        runId: "fresh-1",
        admittedToValidationCohort: true,
        proposedRole: "untouched-momentum-holdout",
      })
    ).toThrow(/forever forbidden/i);

    expect(() =>
      assertAdmittedValidationSegmentCannotBecomeHoldout({
        runId: "fresh-1",
        admittedToValidationCohort: true,
        proposedRole: "validation",
      })
    ).not.toThrow();

    const policy = buildValidationHoldoutIsolationPolicy();
    expect(policy.validationToHoldoutForeverForbidden).toBe(true);
    expect(policy.futureHoldoutRequiresSeparateFreshData).toBe(true);
  });

  it("35-37. deterministic plan hash; outcomesOpened false; no live orders", () => {
    const a = buildMomentumValidationCohortPlan();
    const b = buildMomentumValidationCohortPlan();
    expect(a.planIdentity).toBe(b.planIdentity);
    expect(serializeMomentumValidationCohortPlanJson(a)).toBe(
      serializeMomentumValidationCohortPlanJson(b),
    );
    expect(a.plan.quarantine.liveOrdersExecuted).toBe(false);
    expect(a.plan.quarantine.validationOutcomesOpened).toBe(false);
    expect(a.plan.noOutcomeAccess).toBe(true);

    const { planIdentity } = a;
    const registry = createEmptyMomentumValidationCohortRegistry({
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
    });
    const incidence = buildBlindIncidenceWithMarketDayCap({
      segmentRunId: "fresh-hash",
      episodeKeys: [
        {
          unitId: buildMomentumIndependentUnitKey({
            marketTicker: "M9",
            tradingDayUtc: "2026-09-12",
          }),
        },
      ],
    });
    const next = registerMomentumValidationSegment(registry, {
      runId: "fresh-hash",
      captureRunDir: "data/live-capture/forward-quotes/fresh-hash",
      captureStartMs: FRESH_START,
      captureEndMs: FRESH_START + 300 * 60_000,
      durationMinutes: 300,
      captureIdentityHash: "cap-hash",
      health: {
        passed: true,
        verdict: "ok",
        topOfBookPresent: true,
        failureReasons: [],
      },
      reservedForValidationLineage: true,
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
      blindIncidence: incidence.incidence,
      independentUnitIds: incidence.independentUnitIds,
    });
    expect(next.accepted[0]?.outcomesOpened).toBe(false);
    expect(next.accepted[0]?.blindIncidence.outcomesOpened).toBe(false);
  });

  it("accepted segments ordered by captureStartMs then runId", () => {
    const { planIdentity } = buildMomentumValidationCohortPlan();
    let registry = createEmptyMomentumValidationCohortRegistry({
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
    });

    const later = buildBlindIncidenceWithMarketDayCap({
      segmentRunId: "run-z",
      episodeKeys: [
        {
          unitId: buildMomentumIndependentUnitKey({
            marketTicker: "MZ",
            tradingDayUtc: "2026-09-12",
          }),
        },
      ],
    });
    const earlier = buildBlindIncidenceWithMarketDayCap({
      segmentRunId: "run-a",
      episodeKeys: [
        {
          unitId: buildMomentumIndependentUnitKey({
            marketTicker: "MA",
            tradingDayUtc: "2026-09-12",
          }),
        },
      ],
    });

    registry = registerMomentumValidationSegment(registry, {
      runId: "run-z",
      captureRunDir: "dir-z",
      captureStartMs: FRESH_START + 10_000,
      captureEndMs: FRESH_START + 10_000 + 300 * 60_000,
      durationMinutes: 300,
      captureIdentityHash: "cap-z",
      health: {
        passed: true,
        verdict: "ok",
        topOfBookPresent: true,
        failureReasons: [],
      },
      reservedForValidationLineage: true,
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
      blindIncidence: later.incidence,
      independentUnitIds: later.independentUnitIds,
    });
    registry = registerMomentumValidationSegment(registry, {
      runId: "run-a",
      captureRunDir: "dir-a",
      captureStartMs: FRESH_START,
      captureEndMs: FRESH_START + 300 * 60_000,
      durationMinutes: 300,
      captureIdentityHash: "cap-a",
      health: {
        passed: true,
        verdict: "ok",
        topOfBookPresent: true,
        failureReasons: [],
      },
      reservedForValidationLineage: true,
      planIdentity,
      planFreezeTimestampIso: PLAN_FREEZE,
      blindIncidence: earlier.incidence,
      independentUnitIds: earlier.independentUnitIds,
    });

    expect(registry.accepted.map((row) => row.runId)).toEqual(["run-a", "run-z"]);
  });

  it("error class name is stable", () => {
    const err = new MomentumValidationCohortError("x");
    expect(err.name).toBe("MomentumValidationCohortError");
  });
});
