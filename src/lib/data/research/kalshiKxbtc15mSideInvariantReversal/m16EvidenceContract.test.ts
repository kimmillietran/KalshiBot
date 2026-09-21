/**
 * M16.1a evidence / dependence / CR2 / cohort / outcome-open tests.
 * Synthetic + governance only — no real P&L.
 */
import { describe, expect, it } from "vitest";

import {
  M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY,
  M16_FAMILY_DEFINITION_IDENTITY,
  M16_1_PRIOR_COHORT_PLAN_IDENTITY,
  M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY,
  M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
  M16_CR2_INFERENCE_METHOD,
  M16_EVIDENCE_ALPHA,
  M16_EVIDENCE_MDE_CENTS,
  M16_EVIDENCE_PLANNING_SD_CENTS,
  M16_EVIDENCE_TARGET_POWER,
  M16_FIXED_UTC_WINDOW,
  M16_H0,
  M16_H1,
  M16_MAX_ACCEPTED_CAPTURE_HOURS,
  M16_MAX_ACCEPTED_SEGMENTS_PER_UTC_DAY,
  M16_MIN_UTC_DAY_CLUSTERS,
  M16_OUTCOME_OPEN_BLOCKERS,
  M16_PLANNING_WITHIN_UTC_DAY_ICC,
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
  M16_VALIDATION_ROLE,
  M16ReversalError,
  assertM16EconomicOutcomeOpenUnauthorized,
  assertM16FixedUtcWindowInsideSingleDay,
  buildM16AuthoritativeFeeContract,
  buildM16DependencePlan,
  buildM16EvidenceContract,
  buildM16FamilyDefinition,
  buildM16ProspectiveCohortPlan,
  computeM16ClusteredPlanningTradeN,
  computeM16Cr2ClusterMeanInference,
  computeM16IidBaselineTradeN,
  decideM16BlindCollectionStopping,
  designEffect,
  evaluateM16OutcomeOpenAuthorization,
} from "./index";

describe("M16.1a strategy + IID baseline unchanged", () => {
  it("1–2. family identity unchanged; IID baseline remains 155", () => {
    const family = buildM16FamilyDefinition();
    expect(family.familyDefinitionIdentity).toBe(M16_FAMILY_DEFINITION_IDENTITY);
    expect(family.tradePolicy.upsideTargetBidCents).toBe(55);
    expect(computeM16IidBaselineTradeN()).toBe(155);
    expect(buildM16EvidenceContract().iidBaseline.iidBaselineTradeN).toBe(155);
  });
});

describe("M16.1a power / dependence correction", () => {
  it("3–7. ICC=.10, 4h cluster size, DE, requiredTradeN=268, min G=24", () => {
    expect(M16_PLANNING_WITHIN_UTC_DAY_ICC).toBe(0.1);
    expect(M16_STANDARD_SEGMENT_DURATION_MINUTES).toBe(240);
    const m = 2.0625339816796635 * 4;
    expect(designEffect(0.1, m)).toBeCloseTo(1 + (m - 1) * 0.1);
    expect(computeM16ClusteredPlanningTradeN()).toBe(268);
    const evidence = buildM16EvidenceContract();
    expect(evidence.collectionTargets.requiredTradeN).toBe(268);
    expect(evidence.collectionTargets.iidBaselineTradeN).toBe(155);
    expect(evidence.collectionTargets.minimumUtcDayClusters).toBe(24);
    expect(M16_MIN_UTC_DAY_CLUSTERS).toBe(24);
    expect(evidence.hypothesis.h0).toBe(M16_H0);
    expect(evidence.hypothesis.h1).toBe(M16_H1);
    expect(evidence.designAssumptions.alpha).toBe(M16_EVIDENCE_ALPHA);
    expect(evidence.designAssumptions.targetPower).toBe(M16_EVIDENCE_TARGET_POWER);
    expect(evidence.designAssumptions.mdeCents).toBe(M16_EVIDENCE_MDE_CENTS);
    expect(evidence.designAssumptions.planningTradeLevelSdCents).toBe(
      M16_EVIDENCE_PLANNING_SD_CENTS,
    );
    expect(evidence.primaryInferenceMethod).toBe(M16_CR2_INFERENCE_METHOD);
  });

  it("8–11. readiness joint gate + 140h underpowered", () => {
    const plan = buildM16ProspectiveCohortPlan();
    expect(plan.budget.maxAcceptedCaptureHours).toBe(140);
    expect(M16_MAX_ACCEPTED_CAPTURE_HOURS).toBe(140);
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 100,
        eligibleTradeCount: 267,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["a"],
      }, plan).disposition,
    ).toBe("continue-collection");
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 100,
        eligibleTradeCount: 268,
        utcDayClusterCount: 23,
        acceptedCaptureRunIds: ["a"],
      }, plan).disposition,
    ).toBe("continue-collection");
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 100,
        eligibleTradeCount: 268,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["a"],
      }, plan).disposition,
    ).toBe("ready-for-outcome-open");
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 140,
        eligibleTradeCount: 200,
        utcDayClusterCount: 20,
        acceptedCaptureRunIds: ["a"],
      }, plan).disposition,
    ).toBe("validation-underpowered");
  });

  it("12. old N155 does not authorize readiness", () => {
    const plan = buildM16ProspectiveCohortPlan();
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 100,
        eligibleTradeCount: 155,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["a"],
      }, plan).disposition,
    ).toBe("continue-collection");
  });
});

describe("M16.1a collection policy", () => {
  it("13–16. 240m segment, no cross-midnight, max 1/day, fixed window", () => {
    expect(M16_STANDARD_SEGMENT_DURATION_MINUTES).toBe(240);
    expect(M16_MAX_ACCEPTED_SEGMENTS_PER_UTC_DAY).toBe(1);
    expect(M16_FIXED_UTC_WINDOW).toContain("18:00-22:00");
    const plan = buildM16ProspectiveCohortPlan();
    expect(plan.segment.acceptedSegmentMustRemainWithinSingleUtcDay).toBe(true);
    expect(() =>
      assertM16FixedUtcWindowInsideSingleDay({
        plannedUtcDay: "2026-10-01",
        plannedStartIso: "2026-10-01T18:00:00.000Z",
        durationMinutes: 240,
      })
    ).not.toThrow();
    expect(() =>
      assertM16FixedUtcWindowInsideSingleDay({
        plannedUtcDay: "2026-10-01",
        plannedStartIso: "2026-10-01T12:00:00.000Z",
        durationMinutes: 240,
      })
    ).toThrow(/fixed window/);
  });

  it("17–18. zero-signal vs failed capture semantics sealed", () => {
    const plan = buildM16ProspectiveCohortPlan();
    expect(plan.zeroSignalHealthyDay.consumesAcceptedHours).toBe(true);
    expect(plan.zeroSignalHealthyDay.incrementsEligibleUtcDayClusterN).toBe(false);
    expect(plan.stopping.failedSegmentsConsumeAcceptedHourBudget).toBe(false);
  });
});

describe("M16.1a CR2 inference", () => {
  it("20–22. CR2 fixture, df=G-1, mean>0 required for support", () => {
    // Two clusters, positive overall mean, unequal cluster means (CR2 SE > 0)
    // N=4, ȳ=10; ȳ1=14, ȳ2=6
    // ũ1 = √(4/2)*2*(14-10)=8√2; ũ2=√(4/2)*2*(6-10)=-8√2
    // V = (128+128)/16 = 16; SE = 4; t = 10/4 = 2.5; df=1
    const positive = computeM16Cr2ClusterMeanInference([
      { clusterKey: "d1", valueCents: 12 },
      { clusterKey: "d1", valueCents: 16 },
      { clusterKey: "d2", valueCents: 4 },
      { clusterKey: "d2", valueCents: 8 },
    ]);
    expect(positive.g).toBe(2);
    expect(positive.degreesOfFreedom).toBe(1);
    expect(positive.sampleMeanCents).toBe(10);
    expect(positive.cr2Variance).toBeCloseTo(16, 10);
    expect(positive.cr2StandardError).toBeCloseTo(4, 10);
    expect(positive.tStatistic).toBeCloseTo(2.5, 10);
    expect(positive.sampleMeanStrictlyPositive).toBe(true);
    expect(positive.method).toBe(M16_CR2_INFERENCE_METHOD);

    // Independent hand check for equal n_g=2, N=4, ȳ=11, ȳ1=11, ȳ2=11 → SE=0 fail
    expect(() =>
      computeM16Cr2ClusterMeanInference([
        { clusterKey: "a", valueCents: 5 },
        { clusterKey: "a", valueCents: 5 },
        { clusterKey: "b", valueCents: 5 },
        { clusterKey: "b", valueCents: 5 },
      ])
    ).toThrow(/zero variance/);

    // Negative mean cannot support even if rejection would otherwise look strong
    // N=4, ȳ=-10; ȳ1=-14, ȳ2=-6 → SE=4; t=-2.5; mean not >0
    const negative = computeM16Cr2ClusterMeanInference([
      { clusterKey: "d1", valueCents: -12 },
      { clusterKey: "d1", valueCents: -16 },
      { clusterKey: "d2", valueCents: -4 },
      { clusterKey: "d2", valueCents: -8 },
    ]);
    expect(negative.sampleMeanCents).toBe(-10);
    expect(negative.sampleMeanStrictlyPositive).toBe(false);
    expect(negative.supportCriterionMet).toBe(false);

    // Unequal cluster sizes
    const unequal = computeM16Cr2ClusterMeanInference([
      { clusterKey: "d1", valueCents: 20 },
      { clusterKey: "d2", valueCents: 2 },
      { clusterKey: "d2", valueCents: 4 },
      { clusterKey: "d2", valueCents: 0 },
    ]);
    expect(unequal.n).toBe(4);
    expect(unequal.g).toBe(2);
    expect(unequal.cr2Variance).toBeGreaterThan(0);

    expect(() =>
      computeM16Cr2ClusterMeanInference([
        { clusterKey: "only", valueCents: 1 },
        { clusterKey: "only", valueCents: 2 },
      ])
    ).toThrow(/G≥2/);

    expect(() =>
      computeM16Cr2ClusterMeanInference([
        { clusterKey: "a", valueCents: 1 },
        { clusterKey: "a", valueCents: 2 },
        { clusterKey: "a", valueCents: 3 },
        { clusterKey: "b", valueCents: Number.NaN },
      ])
    ).toThrow(M16ReversalError);
  });
});

describe("M16.1a supersession + outcome-open gate", () => {
  it("23–26. old identities cannot open; new identities required", () => {
    const family = buildM16FamilyDefinition();
    const evidence = buildM16EvidenceContract();
    const dependence = buildM16DependencePlan();
    const fee = buildM16AuthoritativeFeeContract();
    const cohort = buildM16ProspectiveCohortPlan();

    expect(evidence.evidenceContractIdentity).not.toBe(
      M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
    );
    expect(dependence.dependencePlanIdentity).not.toBe(
      M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY,
    );
    expect(cohort.cohortPlanIdentity).not.toBe(M16_1_PRIOR_COHORT_PLAN_IDENTITY);
    expect(fee.feeContractIdentity).toBe(M16_AUTHORITATIVE_FEE_CONTRACT_IDENTITY);
    expect(evidence.supersedesEvidenceContractIdentity).toBe(
      M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
    );

    expect(
      evaluateM16OutcomeOpenAuthorization({
        expectedEvidenceContractIdentity: M16_1_PRIOR_EVIDENCE_CONTRACT_IDENTITY,
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.SUPERSEDED_EVIDENCE_IDENTITY);

    expect(
      evaluateM16OutcomeOpenAuthorization({
        expectedDependencePlanIdentity: M16_1_PRIOR_DEPENDENCE_PLAN_IDENTITY,
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.SUPERSEDED_DEPENDENCE_IDENTITY);

    expect(
      evaluateM16OutcomeOpenAuthorization({
        expectedCohortPlanIdentity: M16_1_PRIOR_COHORT_PLAN_IDENTITY,
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.SUPERSEDED_COHORT_IDENTITY);

    // 155 trades + 24 days still blocked
    const oldN = evaluateM16OutcomeOpenAuthorization({
      expectedFamilyDefinitionIdentity: family.familyDefinitionIdentity,
      expectedEvidenceContractIdentity: evidence.evidenceContractIdentity,
      expectedDependencePlanIdentity: dependence.dependencePlanIdentity,
      expectedFeeContractIdentity: fee.feeContractIdentity,
      expectedCohortPlanIdentity: cohort.cohortPlanIdentity,
      progress: {
        acceptedCaptureHours: 100,
        eligibleTradeCount: 155,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["fresh-1"],
      },
      researchRolesByRunId: { "fresh-1": M16_VALIDATION_ROLE },
    });
    expect(oldN.authorized).toBe(false);
    expect(oldN.blockers).toContain(M16_OUTCOME_OPEN_BLOCKERS.TRADE_N_SHORT);
    expect(oldN.blockers).toContain(M16_OUTCOME_OPEN_BLOCKERS.OLD_N155_THRESHOLD);

    const ready = evaluateM16OutcomeOpenAuthorization({
      expectedFamilyDefinitionIdentity: family.familyDefinitionIdentity,
      expectedEvidenceContractIdentity: evidence.evidenceContractIdentity,
      expectedDependencePlanIdentity: dependence.dependencePlanIdentity,
      expectedFeeContractIdentity: fee.feeContractIdentity,
      expectedCohortPlanIdentity: cohort.cohortPlanIdentity,
      observedSeriesFee: { feeType: "quadratic", feeMultiplier: 1 },
      progress: {
        acceptedCaptureHours: 130,
        eligibleTradeCount: 268,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["fresh-1"],
      },
      researchRolesByRunId: { "fresh-1": M16_VALIDATION_ROLE },
    });
    expect(ready.authorized).toBe(true);
    expect(ready.primaryInferenceMethod).toBe(M16_CR2_INFERENCE_METHOD);

    assertM16EconomicOutcomeOpenUnauthorized();
  });

  it("27–30. synthetic sensitivity deterministic; no strategy/live-order drift", () => {
    const d1 = buildM16DependencePlan();
    const d2 = buildM16DependencePlan();
    expect(d1.dependencePlanIdentity).toBe(d2.dependencePlanIdentity);
    expect(d1.syntheticDesignEffectSensitivity.map((r) => r.rho)).toEqual([
      0, 0.05, 0.1, 0.2, 0.3,
    ]);
    const primary = d1.syntheticDesignEffectSensitivity.find((r) => r.rho === 0.1);
    expect(primary?.role).toBe("primary-planning");
    expect(primary?.iidBaselineInflatedN).toBe(268);

    const family = buildM16FamilyDefinition();
    expect(JSON.stringify(family)).not.toMatch(/placeOrder|create_order/i);
    expect(family.setup.abortIfLBelow).toBe(30);
    expect(family.confirmationStateMachine.higherHighConfirmation).toContain(
      "strictly-greater-than-H",
    );
  });
});
