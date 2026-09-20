/**
 * M16.1 evidence contract / dependence / fee / cohort / outcome-open tests.
 * Synthetic + governance only — no real P&L.
 */
import { describe, expect, it } from "vitest";

import { KALSHI_FEE_SCHEDULE_VARIANT } from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import {
  NORMAL_Z_ONE_TAILED_ALPHA_005,
  NORMAL_Z_POWER_080,
} from "@/lib/data/research/powerAnalysis/powerAnalysisMath";

import {
  M16_EVIDENCE_ALPHA,
  M16_EVIDENCE_MDE_CENTS,
  M16_EVIDENCE_PLANNING_SD_CENTS,
  M16_EVIDENCE_SIDEDNESS,
  M16_EVIDENCE_TARGET_POWER,
  M16_FORBIDDEN_INCIDENCE_RUN_IDS,
  M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  M16_H0,
  M16_H1,
  M16_MAX_ACCEPTED_CAPTURE_HOURS,
  M16_MIN_UTC_DAY_CLUSTERS,
  M16_OUTCOME_OPEN_BLOCKERS,
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
  M16_VALIDATION_ROLE,
  M16ReversalError,
  assertM16AuthoritativeFeeMatches,
  assertM16ConfirmatoryCaptureAllowed,
  assertM16EconomicOutcomeOpenUnauthorized,
  assertM16SeriesFeeMatchesAttestation,
  buildM16AuthoritativeFeeContract,
  buildM16DependencePlan,
  buildM16EvidenceContract,
  buildM16FamilyDefinition,
  buildM16ProspectiveCohortPlan,
  computeM16AuthoritativeOneContractTakerFeeCents,
  computeM16IidBaselineTradeN,
  decideM16BlindCollectionStopping,
  designEffect,
  evaluateM16OutcomeOpenAuthorization,
  m16UtcDayKey,
  parseM161Argv,
  serializeM16EvidenceContractJson,
  serializeM16ProspectiveCohortPlanJson,
} from "./index";

describe("M16.1 evidence contract", () => {
  it("1–6. H0/H1, one-sided α=.05, power=.80, MDE=5, SD=25, IID N=155", () => {
    const c = buildM16EvidenceContract();
    expect(c.hypothesis.h0).toBe(M16_H0);
    expect(c.hypothesis.h1).toBe(M16_H1);
    expect(c.hypothesis.sidedness).toBe(M16_EVIDENCE_SIDEDNESS);
    expect(c.designAssumptions.alpha).toBe(M16_EVIDENCE_ALPHA);
    expect(c.designAssumptions.targetPower).toBe(M16_EVIDENCE_TARGET_POWER);
    expect(c.designAssumptions.mdeCents).toBe(M16_EVIDENCE_MDE_CENTS);
    expect(c.designAssumptions.planningTradeLevelSdCents).toBe(
      M16_EVIDENCE_PLANNING_SD_CENTS,
    );
    expect(c.designAssumptions.zAlphaOneSided).toBe(NORMAL_Z_ONE_TAILED_ALPHA_005);
    expect(c.designAssumptions.zBetaPower80).toBe(NORMAL_Z_POWER_080);
    expect(computeM16IidBaselineTradeN()).toBe(155);
    expect(c.iidBaseline.iidBaselineTradeN).toBe(155);
    expect(c.collectionTargets.requiredTradeN).toBe(155);
    expect(JSON.stringify(c)).not.toMatch(/adequate-N|adequate N/i);
  });

  it("exact SUPPORT/FAIL/UNDERPOWERED semantics sealed; no rescue metrics", () => {
    const c = buildM16EvidenceContract();
    expect(c.decisionRules.nextActionIfSupported).toBe("eligible-for-fresh-holdout");
    expect(c.decisionRules.nextActionIfFailed).toBe("stop-lineage");
    expect(c.decisionRules.noRescueMetrics).toContain("target-hit-rate");
    expect(c.decisionRules.support).toMatch(/one-sided/);
    expect(c.decisionRules.failStopLineage).toMatch(/stop-lineage/);
  });
});

describe("M16.1 dependence plan", () => {
  it("7–8. UTC-day CRVE method deterministic; min clusters=24", () => {
    const a = buildM16DependencePlan();
    const b = buildM16DependencePlan();
    expect(a.dependencePlanIdentity).toBe(b.dependencePlanIdentity);
    expect(a.minimumUtcDayClusters).toBe(M16_MIN_UTC_DAY_CLUSTERS);
    expect(a.minimumUtcDayClusters).toBe(24);
    expect(a.chronologicalUnit).toBe("utc-calendar-day-of-eligible-confirmation");
    expect(m16UtcDayKey(Date.parse("2026-09-20T23:00:00.000Z"))).toBe("2026-09-20");
    expect(designEffect(0.2, 16)).toBeCloseTo(4.0);
  });
});

describe("M16.1 collection joint requirements + stopping", () => {
  it("9–13. trade N alone / cluster N alone insufficient; joint ready; budget exhaustion", () => {
    const plan = buildM16ProspectiveCohortPlan();
    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 50,
        eligibleTradeCount: 155,
        utcDayClusterCount: 10,
        acceptedCaptureRunIds: ["fresh-a"],
      }, plan).disposition,
    ).toBe("continue-collection");

    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 50,
        eligibleTradeCount: 50,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["fresh-a"],
      }, plan).disposition,
    ).toBe("continue-collection");

    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: 100,
        eligibleTradeCount: 155,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["fresh-a"],
      }, plan).disposition,
    ).toBe("ready-for-outcome-open");

    expect(
      decideM16BlindCollectionStopping({
        acceptedCaptureHours: M16_MAX_ACCEPTED_CAPTURE_HOURS,
        eligibleTradeCount: 100,
        utcDayClusterCount: 10,
        acceptedCaptureRunIds: ["fresh-a"],
      }, plan).disposition,
    ).toBe("validation-underpowered");

    // Outcome-blind: disposition ignores any economic fields (none present)
    expect(plan.stopping.outcomePeekingForbidden).toBe(true);
    expect(plan.stopping.failedSegmentsConsumeAcceptedHourBudget).toBe(false);
  });

  it("14. failed segments do not consume accepted-hour budget (sealed)", () => {
    expect(
      buildM16ProspectiveCohortPlan().stopping.failedSegmentsConsumeAcceptedHourBudget,
    ).toBe(false);
  });
});

describe("M16.1 confirmatory cohort exclusions", () => {
  it("15–17. fresh-role only; incidence/M14/M15 rejected", () => {
    expect(M16_VALIDATION_ROLE).toBe("m16-prospective-validation");
    expect(() => assertM16ConfirmatoryCaptureAllowed(M16_FORBIDDEN_INCIDENCE_RUN_IDS[0]!))
      .toThrow(/forbidden/);
    expect(() => assertM16ConfirmatoryCaptureAllowed(M16_FORBIDDEN_M14_VALIDATION_RUN_IDS[0]!))
      .toThrow(/forbidden/);
    expect(() => assertM16ConfirmatoryCaptureAllowed(M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID))
      .toThrow(/forbidden/);
    expect(() => assertM16ConfirmatoryCaptureAllowed("ok-fresh-run"))
      .not.toThrow();
    expect(() => assertM16ConfirmatoryCaptureAllowed("latest"))
      .toThrow(/latest/);
  });
});

describe("M16.1 authoritative fee", () => {
  it("18–20. fee bound from attestation; wrong identity / divergence blocks", () => {
    const fee = buildM16AuthoritativeFeeContract();
    expect(fee.feeContractStatus).toBe("bound-authoritative-kxbtc15m-standard-taker");
    expect(fee.schedule).toBe(KALSHI_FEE_SCHEDULE_VARIANT.STANDARD);
    expect(fee.attestation.feeType).toBe("quadratic");
    expect(fee.attestation.feeMultiplier).toBe(1);
    expect(assertM16AuthoritativeFeeMatches(fee.feeContractIdentity).feeContractIdentity)
      .toBe(fee.feeContractIdentity);
    expect(() => assertM16AuthoritativeFeeMatches("deadbeef")).toThrow(M16ReversalError);
    expect(() =>
      assertM16SeriesFeeMatchesAttestation({ feeType: "quadratic", feeMultiplier: 1 })
    ).not.toThrow();
    expect(() =>
      assertM16SeriesFeeMatchesAttestation({ feeType: "quadratic", feeMultiplier: 0.5 })
    ).toThrow(/fee_multiplier changed/);
    expect(computeM16AuthoritativeOneContractTakerFeeCents(50)).toBe(2);
  });
});

describe("M16.1 outcome-open gate", () => {
  it("21–24. identity mismatch / already-opened / joint readiness", () => {
    const family = buildM16FamilyDefinition();
    const evidence = buildM16EvidenceContract();
    const dependence = buildM16DependencePlan();
    const fee = buildM16AuthoritativeFeeContract();
    const cohort = buildM16ProspectiveCohortPlan();

    expect(
      evaluateM16OutcomeOpenAuthorization({
        expectedFamilyDefinitionIdentity: "wrong",
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.FAMILY_IDENTITY_MISMATCH);

    expect(
      evaluateM16OutcomeOpenAuthorization({
        expectedEvidenceContractIdentity: "wrong",
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.EVIDENCE_IDENTITY_MISMATCH);

    expect(
      evaluateM16OutcomeOpenAuthorization({
        expectedDependencePlanIdentity: "wrong",
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.DEPENDENCE_IDENTITY_MISMATCH);

    expect(
      evaluateM16OutcomeOpenAuthorization({
        expectedFeeContractIdentity: "wrong",
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.FEE_IDENTITY_MISMATCH);

    expect(
      evaluateM16OutcomeOpenAuthorization({
        observedSeriesFee: { feeType: "quadratic", feeMultiplier: 0.5 },
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.FEE_SCHEDULE_DIVERGED);

    expect(
      evaluateM16OutcomeOpenAuthorization({
        pnlPreviouslyOpened: true,
      }).blockers,
    ).toContain(M16_OUTCOME_OPEN_BLOCKERS.PNL_ALREADY_OPENED);

    // Trade N alone insufficient
    const tradeOnly = evaluateM16OutcomeOpenAuthorization({
      expectedFamilyDefinitionIdentity: family.familyDefinitionIdentity,
      expectedEvidenceContractIdentity: evidence.evidenceContractIdentity,
      expectedDependencePlanIdentity: dependence.dependencePlanIdentity,
      expectedFeeContractIdentity: fee.feeContractIdentity,
      expectedCohortPlanIdentity: cohort.cohortPlanIdentity,
      progress: {
        acceptedCaptureHours: 80,
        eligibleTradeCount: 155,
        utcDayClusterCount: 10,
        acceptedCaptureRunIds: ["fresh-1"],
      },
      researchRolesByRunId: { "fresh-1": M16_VALIDATION_ROLE },
    });
    expect(tradeOnly.authorized).toBe(false);
    expect(tradeOnly.blockers).toContain(M16_OUTCOME_OPEN_BLOCKERS.CLUSTER_N_SHORT);

    // Cluster N alone insufficient
    const clusterOnly = evaluateM16OutcomeOpenAuthorization({
      expectedFamilyDefinitionIdentity: family.familyDefinitionIdentity,
      expectedEvidenceContractIdentity: evidence.evidenceContractIdentity,
      expectedDependencePlanIdentity: dependence.dependencePlanIdentity,
      expectedFeeContractIdentity: fee.feeContractIdentity,
      expectedCohortPlanIdentity: cohort.cohortPlanIdentity,
      progress: {
        acceptedCaptureHours: 80,
        eligibleTradeCount: 50,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["fresh-1"],
      },
      researchRolesByRunId: { "fresh-1": M16_VALIDATION_ROLE },
    });
    expect(clusterOnly.authorized).toBe(false);
    expect(clusterOnly.blockers).toContain(M16_OUTCOME_OPEN_BLOCKERS.TRADE_N_SHORT);

    // Incidence capture contaminates
    const contaminated = evaluateM16OutcomeOpenAuthorization({
      progress: {
        acceptedCaptureHours: 200,
        eligibleTradeCount: 155,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: [M16_FORBIDDEN_INCIDENCE_RUN_IDS[0]!],
      },
    });
    expect(contaminated.blockers).toContain(M16_OUTCOME_OPEN_BLOCKERS.CONTAMINATION);

    // Joint requirements authorize count readiness (synthetic)
    const ready = evaluateM16OutcomeOpenAuthorization({
      expectedFamilyDefinitionIdentity: family.familyDefinitionIdentity,
      expectedEvidenceContractIdentity: evidence.evidenceContractIdentity,
      expectedDependencePlanIdentity: dependence.dependencePlanIdentity,
      expectedFeeContractIdentity: fee.feeContractIdentity,
      expectedCohortPlanIdentity: cohort.cohortPlanIdentity,
      observedSeriesFee: { feeType: "quadratic", feeMultiplier: 1 },
      progress: {
        acceptedCaptureHours: 192,
        eligibleTradeCount: 155,
        utcDayClusterCount: 24,
        acceptedCaptureRunIds: ["fresh-1", "fresh-2"],
      },
      researchRolesByRunId: {
        "fresh-1": M16_VALIDATION_ROLE,
        "fresh-2": M16_VALIDATION_ROLE,
      },
      pnlPreviouslyOpened: false,
    });
    expect(ready.authorized).toBe(true);
    expect(ready.blockers).toEqual([]);

    // Default still unauthorized
    assertM16EconomicOutcomeOpenUnauthorized();
  });
});

describe("M16.1 artifacts + CLI parse", () => {
  it("25–29. no P&L evaluator; identities stable; serialization; latest rejected; mtime unused", () => {
    const e1 = buildM16EvidenceContract();
    const e2 = buildM16EvidenceContract();
    expect(e1.evidenceContractIdentity).toBe(e2.evidenceContractIdentity);
    const s1 = serializeM16EvidenceContractJson(e1);
    const s2 = serializeM16EvidenceContractJson(e2);
    expect(s1).toBe(s2);
    expect(s1).not.toMatch(/pnlCents|targetHit|stopHit|settlementDirection/i);

    const c1 = buildM16ProspectiveCohortPlan();
    expect(serializeM16ProspectiveCohortPlanJson(c1)).toBe(
      serializeM16ProspectiveCohortPlanJson(buildM16ProspectiveCohortPlan()),
    );
    expect(c1.linkedIdentities.evidenceContractIdentity).toBe(
      e1.evidenceContractIdentity,
    );
    expect(c1.segment.standardDurationMinutes).toBe(
      M16_STANDARD_SEGMENT_DURATION_MINUTES,
    );
    expect(c1.budget.maxAcceptedCaptureHours).toBe(200);
    expect(c1.budget.bindingEstimatedHours).toBeGreaterThan(75);

    expect(() => parseM161Argv(["--evidence-contract-only", "--accepted-run-id", "latest"]))
      .toThrow(/latest/);
    const parsed = parseM161Argv([
      "--outcome-open-status",
      "--accepted-hours",
      "10",
      "--eligible-trades",
      "5",
      "--utc-day-clusters",
      "2",
      "--accepted-run-id",
      "fresh-x",
    ]);
    expect(parsed.mode).toBe("outcome-open-status");
    expect(parsed.progress.eligibleTradeCount).toBe(5);
    // No mtime authority fields exist on contracts
    expect(e1).not.toHaveProperty("mtimeMs");
    expect(c1).not.toHaveProperty("mtimeMs");
  });

  it("30. no live-order endpoints in M16.1 sealed artifacts", () => {
    const blob = JSON.stringify({
      evidence: buildM16EvidenceContract(),
      cohort: buildM16ProspectiveCohortPlan(),
      fee: buildM16AuthoritativeFeeContract(),
    });
    expect(blob).not.toMatch(/placeOrder|create_order|liveOrder|POST \/portfolio\/orders/i);
  });
});
