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
  assertNoValidationOutcomesOpenedBeforeSegmentationAmendment,
  assertRunEligibleForMomentumValidationCohort,
  assertSealedMomentumIdentitiesMatchPreOpen,
  assertStoppingIgnoresSyntheticEffect,
  assertValidMomentumValidationSegmentDuration,
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
  isValidMomentumValidationSegmentDuration,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_COHORT_AMENDMENT_REASON,
  MOMENTUM_VALIDATION_COHORT_AMENDMENT_VERSION,
  MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
  MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
  MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES,
  MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP,
  MOMENTUM_VALIDATION_STANDARD_FUTURE_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_TARGET_ESS,
  MomentumValidationCohortError,
  ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY,
  registerMomentumValidationSegment,
  serializeMomentumValidationCohortPlanJson,
  sumAcceptedCaptureHours,
} from "./index";
import type { MomentumValidationAcceptedSegment } from "./momentumValidationCohortTypes";

const PLAN_FREEZE = "2026-09-12T00:00:00.000Z";
const FRESH_START = Date.parse("2026-09-12T12:00:00.000Z");
const SEGMENT_1_RUN_ID = "2026-09-13T04-05-01-822Z";

function makeAcceptedSegment(input: {
  runId: string;
  unitIds: readonly string[];
  captureStartMs?: number;
  ess?: number;
  durationMinutes?: number;
}): MomentumValidationAcceptedSegment {
  const durationMinutes = input.durationMinutes ?? 300;
  const capped = buildBlindIncidenceWithMarketDayCap({
    segmentRunId: input.runId,
    episodeKeys: input.unitIds.map((unitId) => ({ unitId })),
  });
  return {
    runId: input.runId,
    captureRunDir: `data/live-capture/forward-quotes/${input.runId}`,
    captureStartMs: input.captureStartMs ?? FRESH_START,
    captureEndMs: (input.captureStartMs ?? FRESH_START) + durationMinutes * 60_000,
    durationMinutes,
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

  it("6-9. flexible ≤480m / ESS 155 / 40h budget / amendment lineage", () => {
    const { plan, planIdentity } = buildMomentumValidationCohortPlan();
    expect(plan.analysisVersion).toBe(MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION);
    expect(plan.analysisVersion).toBe("momentum-validation-cohort-plan-v1.1");
    expect(plan.standardFutureSegmentDurationMinutes).toBe(480);
    expect(plan.standardFutureSegmentDurationMinutes).toBe(
      MOMENTUM_VALIDATION_STANDARD_FUTURE_SEGMENT_DURATION_MINUTES,
    );
    expect(plan.maxSegmentDurationMinutes).toBe(480);
    expect(plan.maxSegmentDurationMinutes).toBe(
      MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES,
    );
    expect(plan.segment1GrandfatheredDurationMinutes).toBe(300);
    expect(plan.segment1GrandfatheredDurationMinutes).toBe(
      MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES,
    );
    expect(plan.segmentDurationMinutes).toBe(300);
    expect(plan.targetEss).toBe(155);
    expect(plan.targetEss).toBe(MOMENTUM_VALIDATION_TARGET_ESS);
    expect(plan.maxAcceptedCaptureHours).toBe(40);
    expect(plan.maxAcceptedCaptureHours).toBe(MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS);
    expect(plan.segmentCountSafetyCap).toBe(MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP);
    expect(plan.stoppingRule.kind).toBe("fixed-n-with-max-accepted-capture-hours");
    expect(plan.stoppingRule.maxAcceptedCaptureHours).toBe(40);
    expect(plan.amendment.priorPlanIdentity).toBe(
      ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY,
    );
    expect(plan.amendment.version).toBe(MOMENTUM_VALIDATION_COHORT_AMENDMENT_VERSION);
    expect(plan.amendment.reason).toBe(MOMENTUM_VALIDATION_COHORT_AMENDMENT_REASON);
    expect(planIdentity).toMatch(/^[a-f0-9]{64}$/);
    expect(planIdentity).not.toBe(ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY);
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

  it("27-30. ESS 154 continue; 155 ready; hours>=40 underpowered", () => {
    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 154,
        cumulativeAcceptedCaptureHours: 15,
        acceptedSegmentCount: 3,
      }).status,
    ).toBe("continue-collection");

    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 155,
        cumulativeAcceptedCaptureHours: 20,
        acceptedSegmentCount: 4,
      }).status,
    ).toBe("ready-for-outcome-open");

    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 200,
        cumulativeAcceptedCaptureHours: 40,
        acceptedSegmentCount: 5,
      }).status,
    ).toBe("ready-for-outcome-open");

    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 154,
        cumulativeAcceptedCaptureHours: 40,
        acceptedSegmentCount: 5,
      }).status,
    ).toBe("underpowered-at-fixed-capture-budget");

    // Segment count alone must not stop under the 40h budget.
    expect(
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 154,
        cumulativeAcceptedCaptureHours: 39.9,
        acceptedSegmentCount: 8,
      }).status,
    ).toBe("continue-collection");
  });

  it("31-33. synthetic favorable/unfavorable effect cannot affect stopping", () => {
    expect(() =>
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 100,
        cumulativeAcceptedCaptureHours: 10,
        acceptedSegmentCount: 2,
        syntheticEffectCents: 99,
      })
    ).toThrow(/cannot affect validation cohort stopping/i);

    expect(() =>
      evaluateMomentumValidationStopping({
        cumulativeBlindEss: 100,
        cumulativeAcceptedCaptureHours: 10,
        acceptedSegmentCount: 2,
        syntheticEffectCents: -99,
      })
    ).toThrow(/cannot affect validation cohort stopping/i);

    expect(() =>
      assertStoppingIgnoresSyntheticEffect({
        cumulativeBlindEss: 100,
        cumulativeAcceptedCaptureHours: 10,
        favorableEffectCents: 50,
        unfavorableEffectCents: -50,
      })
    ).not.toThrow();

    const base = evaluateMomentumValidationStopping({
      cumulativeBlindEss: 100,
      cumulativeAcceptedCaptureHours: 10,
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

  describe("v1.1 flexible segmentation amendment", () => {
    it("1-4. Segment 1 @300m valid; 480m valid; >480 and <=0 rejected", () => {
      expect(() => assertValidMomentumValidationSegmentDuration(300)).not.toThrow();
      expect(() => assertValidMomentumValidationSegmentDuration(480)).not.toThrow();
      expect(isValidMomentumValidationSegmentDuration(300)).toBe(true);
      expect(isValidMomentumValidationSegmentDuration(480)).toBe(true);
      expect(isValidMomentumValidationSegmentDuration(481)).toBe(false);
      expect(isValidMomentumValidationSegmentDuration(0)).toBe(false);
      expect(isValidMomentumValidationSegmentDuration(-1)).toBe(false);
      expect(() => assertValidMomentumValidationSegmentDuration(481)).toThrow(/<= 480/);
      expect(() => assertValidMomentumValidationSegmentDuration(0)).toThrow(/> 0/);
      expect(() => assertValidMomentumValidationSegmentDuration(-5)).toThrow(/> 0/);

      const { planIdentity } = buildMomentumValidationCohortPlan();
      const registry = createEmptyMomentumValidationCohortRegistry({
        planIdentity,
        planFreezeTimestampIso: PLAN_FREEZE,
      });
      const incidence300 = buildBlindIncidenceWithMarketDayCap({
        segmentRunId: SEGMENT_1_RUN_ID,
        episodeKeys: [
          {
            unitId: buildMomentumIndependentUnitKey({
              marketTicker: "SEG1",
              tradingDayUtc: "2026-09-13",
            }),
          },
        ],
      });
      const admitted300 = registerMomentumValidationSegment(registry, {
        runId: SEGMENT_1_RUN_ID,
        captureRunDir: `data/live-capture/forward-quotes/${SEGMENT_1_RUN_ID}`,
        captureStartMs: FRESH_START,
        captureEndMs: FRESH_START + 300 * 60_000,
        durationMinutes: 300,
        captureIdentityHash: "cap-seg1-300",
        health: {
          passed: true,
          verdict: "capture-research-ready",
          topOfBookPresent: true,
          failureReasons: [],
        },
        reservedForValidationLineage: true,
        planIdentity,
        planFreezeTimestampIso: PLAN_FREEZE,
        intendedCohortPosition: 1,
        blindIncidence: incidence300.incidence,
        independentUnitIds: incidence300.independentUnitIds,
      });
      expect(admitted300.accepted).toHaveLength(1);
      expect(admitted300.accepted[0]?.durationMinutes).toBe(300);
      expect(admitted300.accepted[0]?.runId).toBe(SEGMENT_1_RUN_ID);

      const incidence480 = buildBlindIncidenceWithMarketDayCap({
        segmentRunId: "seg-480",
        episodeKeys: [
          {
            unitId: buildMomentumIndependentUnitKey({
              marketTicker: "SEG2",
              tradingDayUtc: "2026-09-14",
            }),
          },
        ],
      });
      const admitted480 = registerMomentumValidationSegment(admitted300, {
        runId: "seg-480",
        captureRunDir: "data/live-capture/forward-quotes/seg-480",
        captureStartMs: FRESH_START + 1,
        captureEndMs: FRESH_START + 1 + 480 * 60_000,
        durationMinutes: 480,
        captureIdentityHash: "cap-seg-480",
        health: {
          passed: true,
          verdict: "ok",
          topOfBookPresent: true,
          failureReasons: [],
        },
        reservedForValidationLineage: true,
        planIdentity,
        planFreezeTimestampIso: PLAN_FREEZE,
        intendedCohortPosition: 2,
        blindIncidence: incidence480.incidence,
        independentUnitIds: incidence480.independentUnitIds,
      });
      expect(admitted480.accepted).toHaveLength(2);

      const rejectedOver = registerMomentumValidationSegment(registry, {
        runId: "seg-over",
        captureRunDir: "dir-over",
        captureStartMs: FRESH_START,
        captureEndMs: FRESH_START + 481 * 60_000,
        durationMinutes: 481,
        captureIdentityHash: "cap-over",
        health: {
          passed: true,
          verdict: "ok",
          topOfBookPresent: true,
          failureReasons: [],
        },
        reservedForValidationLineage: true,
        planIdentity,
        planFreezeTimestampIso: PLAN_FREEZE,
        blindIncidence: incidence480.incidence,
        independentUnitIds: incidence480.independentUnitIds,
      });
      expect(rejectedOver.accepted).toHaveLength(0);
      expect(rejectedOver.excluded[0]?.exclusionReason).toMatch(/<= 480/);
    });

    it("5-9. 40h budget fixed; segmentation does not change candidate/ESS/semantics/identities", () => {
      const { plan } = buildMomentumValidationCohortPlan();
      expect(plan.maxAcceptedCaptureHours).toBe(40);
      expect(plan.lockedCandidateId).toBe("W-5000|X-2|H-30000|continuation");
      expect(plan.targetEss).toBe(155);
      expect(plan.independentUnitPolicy.crossSegmentDedup).toMatch(/at-most-one-independent-unit/);
      expect(plan.familyDefinitionIdentity).toBe(KNOWN_M140A_FAMILY_DEFINITION_IDENTITY);
      expect(plan.evidenceContractIdentity).toBe(KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY);
      expect(plan.discoveryIdentity).toBe(KNOWN_M140B_DISCOVERY_IDENTITY);
      expect(plan.noOutcomeAccess).toBe(true);
      expect(plan.quarantine.validationOutcomesOpened).toBe(false);
      expect(plan.amendment.segmentationOnly).toBe(true);
      expect(plan.amendment.reason).toBe(
        "operational segmentation only; no validation outcomes opened",
      );
    });

    it("10-11. multiple durations aggregate hours; failed hours excluded", () => {
      const accepted = [
        makeAcceptedSegment({
          runId: "a300",
          unitIds: [
            buildMomentumIndependentUnitKey({
              marketTicker: "A",
              tradingDayUtc: "2026-09-13",
            }),
          ],
          durationMinutes: 300,
        }),
        makeAcceptedSegment({
          runId: "b480",
          unitIds: [
            buildMomentumIndependentUnitKey({
              marketTicker: "B",
              tradingDayUtc: "2026-09-14",
            }),
          ],
          durationMinutes: 480,
          captureStartMs: FRESH_START + 1,
        }),
      ];
      expect(sumAcceptedCaptureHours(accepted)).toBe(13);
      // Failed/excluded segments are not in accepted[]; hours must not include them.
      expect(sumAcceptedCaptureHours([])).toBe(0);
      expect(sumAcceptedCaptureHours([accepted[0]!])).toBe(5);
    });

    it("12. cross-segment ESS still deduplicates under mixed durations", () => {
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
      const seg1 = makeAcceptedSegment({
        runId: "dur-a",
        unitIds: [shared, onlyA],
        durationMinutes: 300,
      });
      const seg2 = makeAcceptedSegment({
        runId: "dur-b",
        unitIds: [shared, onlyB],
        durationMinutes: 480,
        captureStartMs: FRESH_START + 1,
      });
      const dedup = deduplicateMomentumValidationCohortUnits([seg1, seg2]);
      expect(dedup.rawPerSegmentEssSum).toBe(4);
      expect(dedup.deduplicatedCohortEss).toBe(3);
      expect(dedup.duplicateOrDependentUnitsRemoved).toBe(1);
    });

    it("13-16. stopping: ESS ready / continue / underpowered; effect ignored", () => {
      expect(
        evaluateMomentumValidationStopping({
          cumulativeBlindEss: 155,
          cumulativeAcceptedCaptureHours: 5,
        }).status,
      ).toBe("ready-for-outcome-open");
      expect(
        evaluateMomentumValidationStopping({
          cumulativeBlindEss: 100,
          cumulativeAcceptedCaptureHours: 13,
        }).status,
      ).toBe("continue-collection");
      expect(
        evaluateMomentumValidationStopping({
          cumulativeBlindEss: 100,
          cumulativeAcceptedCaptureHours: 40,
        }).status,
      ).toBe("underpowered-at-fixed-capture-budget");
      expect(() =>
        evaluateMomentumValidationStopping({
          cumulativeBlindEss: 100,
          cumulativeAcceptedCaptureHours: 13,
          syntheticEffectCents: 12,
        })
      ).toThrow(/cannot affect/);
      expect(() =>
        evaluateMomentumValidationStopping({
          cumulativeBlindEss: 100,
          cumulativeAcceptedCaptureHours: 13,
          syntheticPValue: 0.01,
        })
      ).toThrow(/cannot affect/);
    });

    it("17. existing 5h Segment 1 remains immutable at 300m", () => {
      const { plan } = buildMomentumValidationCohortPlan();
      expect(plan.segment1GrandfatheredDurationMinutes).toBe(300);
      expect(plan.segment1GrandfatheredDurationMinutes).not.toBe(480);
      expect(plan.standardFutureSegmentDurationMinutes).toBe(480);
    });

    it("18-19. validation→holdout forbidden; no real outcomes read; fail-closed on peek", () => {
      expect(() =>
        assertAdmittedValidationSegmentCannotBecomeHoldout({
          runId: SEGMENT_1_RUN_ID,
          admittedToValidationCohort: true,
          proposedRole: "holdout",
        })
      ).toThrow(/forever forbidden/i);

      expect(() =>
        assertNoValidationOutcomesOpenedBeforeSegmentationAmendment({
          validationExecutablePnlComputed: false,
          midpointContinuationComputed: false,
          responseDirectionInspected: false,
          validationEffectEstimateInspected: false,
          pValueCalculated: false,
        })
      ).not.toThrow();

      expect(() =>
        assertNoValidationOutcomesOpenedBeforeSegmentationAmendment({
          validationExecutablePnlComputed: true,
        })
      ).toThrow(/FAIL CLOSED/);

      expect(() =>
        buildMomentumValidationCohortPlan({
          outcomeAccessAttestation: {
            midpointContinuationComputed: true,
          },
        })
      ).toThrow(/FAIL CLOSED/);
    });
  });
});
