import { describe, expect, it } from "vitest";

import {
  assertQualityAuditDatesImmutable,
  buildCryptostructCandidateUniverse,
  buildFrozenCryptostructLedgerForM16Er,
  CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
  createEmptyCryptostructDatasetLedger,
  CryptostructLedgerError,
  maintenanceOverlapsM16ErGovernedWindow,
  registerUnacquiredDay,
  seedQualityAuditOnlyDays,
  thursdayMaintenanceUtcHours,
  transitionCryptostructDayStatus,
} from "@/lib/data/research/cryptostructDatasetGovernance";
import {
  buildM16ErDependencePlan,
  buildM16ErFeeContract,
  buildM16ErFixedCohortPlan,
  buildM16ErIdentityBundle,
  buildM16ErPurchaseManifest,
  buildM16ErScientificProtocol,
  computeM16ErClusteredPlanningTradeN,
  evaluateM16ErOutcomeOpenAuthorization,
  M16_ER_ADAPTER_IDENTITY,
  M16_ER_IID_BASELINE_TRADE_N,
  M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY,
  M16_ER_REQUIRED_TRADE_N,
  M16_ER_ROLE,
  runM16ErSyntheticEvaluatorFixture,
} from "@/lib/data/research/m16ExternalReplication";
import {
  M16_EXPECTED_COHORT_PLAN_IDENTITY,
  M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY,
  M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
  M16_EXPECTED_FEE_CONTRACT_IDENTITY,
  M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY,
  buildM16ScientificProtocolIdentity,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16ValidationAuthority";
import { designEffect } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16DependencePlan";

describe("cryptostruct dataset ledger", () => {
  it("seeds five QUALITY_AUDIT_ONLY dates as terminal", () => {
    const ledger = seedQualityAuditOnlyDays(
      createEmptyCryptostructDatasetLedger(),
      "2026-09-23T00:00:00.000Z",
    );
    assertQualityAuditDatesImmutable(ledger);
    for (const d of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
      expect(ledger.days[d]?.status).toBe("QUALITY_AUDIT_ONLY");
      expect(ledger.days[d]?.rawZipSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("forbids reopening QUALITY_AUDIT_ONLY into validation/holdout", () => {
    const ledger = seedQualityAuditOnlyDays(
      createEmptyCryptostructDatasetLedger(),
      "2026-09-23T00:00:00.000Z",
    );
    expect(() =>
      transitionCryptostructDayStatus({
        ledger,
        utcDate: "2026-09-08",
        toStatus: "VALIDATION_RESERVED",
        atUtc: "2026-09-23T01:00:00.000Z",
        reason: "illegal",
      }),
    ).toThrow(CryptostructLedgerError);
  });

  it("append-only transitions for UNACQUIRED → ACQUIRED → VALIDATION_RESERVED", () => {
    let ledger = registerUnacquiredDay(
      createEmptyCryptostructDatasetLedger(),
      "2026-08-15",
    );
    ledger = transitionCryptostructDayStatus({
      ledger,
      utcDate: "2026-08-15",
      toStatus: "ACQUIRED_UNOPENED",
      atUtc: "2026-09-23T02:00:00.000Z",
      reason: "purchase",
      patch: {
        rawZipSha256: "a".repeat(64),
        byteSize: 1,
        acquisitionTimestampUtc: "2026-09-23T02:00:00.000Z",
      },
    });
    ledger = transitionCryptostructDayStatus({
      ledger,
      utcDate: "2026-08-15",
      toStatus: "VALIDATION_RESERVED",
      atUtc: "2026-09-23T02:01:00.000Z",
      reason: "m16-er-reserve",
      patch: { hypothesisReservationIdentity: "test" },
    });
    expect(ledger.transitions.length).toBeGreaterThanOrEqual(3);
    expect(ledger.days["2026-08-15"]?.status).toBe("VALIDATION_RESERVED");
  });
});

describe("cryptostruct candidate universe + maintenance", () => {
  it("builds deterministic untouched universe excluding quality-audit dates", () => {
    const u = buildCryptostructCandidateUniverse();
    expect(u.candidateCount).toBe(u.candidateUntouchedUtcDates.length);
    expect(u.candidateCount).toBe(34);
    for (const d of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
      expect(u.candidateUntouchedUtcDates).not.toContain(d);
    }
    expect(u.candidateUntouchedUtcDates[0]).toBe("2026-08-14");
    expect(u.candidateUntouchedUtcDates.at(-1)).toBe("2026-09-21");
    expect(u.thursdayMaintenanceOverlapsGoverned18_22Z).toBe(false);
    expect(u.universeDefinitionIdentity).toMatch(/^[0-9a-f]{64}$/);
  });

  it("Thursday ET maintenance does not overlap 18–22Z", () => {
    // 2026-09-17 is Thursday
    expect(maintenanceOverlapsM16ErGovernedWindow("2026-09-17")).toBe(false);
    const hours = thursdayMaintenanceUtcHours("2026-09-17");
    expect(hours.endHourUtc).toBeLessThanOrEqual(10);
    expect(hours.startHourUtc).toBeGreaterThanOrEqual(7);
  });

  it("frozen ledger registers candidates as UNACQUIRED and audit as QUALITY_AUDIT_ONLY", () => {
    const ledger = buildFrozenCryptostructLedgerForM16Er();
    assertQualityAuditDatesImmutable(ledger);
    expect(ledger.days["2026-08-14"]?.status).toBe("UNACQUIRED");
    expect(ledger.days["2026-09-21"]?.status).toBe("UNACQUIRED");
  });
});

describe("m16-er protocol freeze", () => {
  it("recomputes dependence N from denser CS incidence", () => {
    const m = M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY;
    expect(m).toBeCloseTo(12.2, 10);
    const de = designEffect(0.1, m);
    expect(de).toBeCloseTo(1 + (12.2 - 1) * 0.1, 10);
    expect(M16_ER_IID_BASELINE_TRADE_N).toBe(155);
    expect(computeM16ErClusteredPlanningTradeN()).toBe(Math.ceil(155 * de));
    expect(M16_ER_REQUIRED_TRADE_N).toBe(Math.ceil(155 * de));
    const dep = buildM16ErDependencePlan();
    expect(dep.requiredTradeN).toBe(M16_ER_REQUIRED_TRADE_N);
    expect(dep.minimumUtcDayClusters).toBe(
      Math.max(24, Math.ceil(dep.requiredTradeN / m)),
    );
    expect(dep.minimumUtcDayClusters).toBeGreaterThanOrEqual(27);
  });

  it("fixed cohort lists exact untouched dates and is adequate", () => {
    const cohort = buildM16ErFixedCohortPlan();
    expect(cohort.fixedDateCount).toBe(34);
    expect(cohort.fixedGovernedHours).toBe(136);
    expect(cohort.adequacyVerdict).toBe("ADEQUATE_UNDER_BLIND_PLANNING");
    expect(cohort.fixedUtcDates).not.toEqual(
      expect.arrayContaining([...CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES]),
    );
    expect(cohort.cohortReservationIdentity).toMatch(/^[0-9a-f]{64}$/);
  });

  it("binds fee historically without inventing outcomes", () => {
    const fee = buildM16ErFeeContract();
    expect(fee.bindsExistingM16FeeSemantics).toBe(true);
    expect(fee.referencedM16FeeContractIdentity).toBe(
      M16_EXPECTED_FEE_CONTRACT_IDENTITY,
    );
    expect(fee.feeContractIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(fee.feeContractIdentity).not.toBe(M16_EXPECTED_FEE_CONTRACT_IDENTITY);
  });

  it("creates distinct M16-ER protocol identity and keeps M16-P sealed", () => {
    const protocol = buildM16ErScientificProtocol();
    const prospective = buildM16ScientificProtocolIdentity();
    expect(protocol.scientificProtocolIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(protocol.scientificProtocolIdentity).not.toBe(prospective);
    expect(protocol.substantiveFamilyIdentity).toBe(
      M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
    );
    expect(protocol.adapterIdentity).toBe(M16_ER_ADAPTER_IDENTITY);
    expect(protocol.role).toBe(M16_ER_ROLE);
    expect(M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY).toMatch(/^[0-9a-f]{64}$/);
    expect(M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY).toMatch(/^[0-9a-f]{64}$/);
    expect(M16_EXPECTED_COHORT_PLAN_IDENTITY).toMatch(/^[0-9a-f]{64}$/);
  });

  it("outcome gate seals economics until all prerequisites met", () => {
    const sealed = evaluateM16ErOutcomeOpenAuthorization();
    expect(sealed.authorized).toBe(false);
    expect(sealed.sealed).toBe(true);
    expect(sealed.blockers.length).toBeGreaterThan(0);
    expect(sealed.forbiddenWhileSealed).toContain("pnl");

    const open = evaluateM16ErOutcomeOpenAuthorization({
      protocolIdentity: buildM16ErScientificProtocol().scientificProtocolIdentity,
      adapterIdentity: M16_ER_ADAPTER_IDENTITY,
      cohortReservationIdentity:
        buildM16ErFixedCohortPlan().cohortReservationIdentity,
      purchasedZipSha256Verified: true,
      qualityAuditComplete: true,
      fixedCohortAdmissionComplete: true,
      sampleAdequacyMet: true,
      pnlPreviouslyOpened: false,
    });
    expect(open.authorized).toBe(true);
  });

  it("purchase manifest does not execute purchase and fits Premium 50 credits", () => {
    const purchase = buildM16ErPurchaseManifest();
    expect(purchase.purchaseExecuted).toBe(false);
    expect(purchase.dayCount).toBe(34);
    expect(purchase.creditsRequired).toBe(34);
    expect(purchase.premiumAllowanceSufficient).toBe(true);
  });

  it("synthetic evaluator fixture works while gate remains sealed for real outcomes", () => {
    const r = runM16ErSyntheticEvaluatorFixture();
    expect(r.confirmationEmitted).toBe(true);
    expect(r.outcomeGateSealed).toBe(true);
    expect(r.adapterIdentity).toBe(M16_ER_ADAPTER_IDENTITY);
    expect(r.feeBindsM16).toBe(true);
  });

  it("identity bundle is deterministic", () => {
    const a = buildM16ErIdentityBundle();
    const b = buildM16ErIdentityBundle();
    expect(a.scientificProtocolIdentity).toBe(b.scientificProtocolIdentity);
    expect(a.scientificInterpretation.notRelabeledProspective).toBe(true);
  });
});
