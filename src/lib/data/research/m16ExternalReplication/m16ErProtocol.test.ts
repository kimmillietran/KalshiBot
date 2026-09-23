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
  buildM16ErSourceContract,
  computeM16ErClusteredPlanningTradeN,
  evaluateM16ErOutcomeOpenAuthorization,
  M16_ER_ADAPTER_IDENTITY,
  M16_ER_IID_BASELINE_TRADE_N,
  M16_ER_OUTCOME_OPEN_BLOCKERS,
  M16_ER_PLANNING_AVG_TRADES_PER_UTC_DAY,
  M16_ER_REQUIRED_TRADE_N,
  M16_ER_ROLE,
  runM16ErSyntheticEvaluatorFixture,
  type M16ErOutcomeOpenInput,
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

/** Explicit affirmative identity presentation for synthetic authorization tests. */
function m16ErAffirmativeIdentityInputs(): Required<
  Pick<
    M16ErOutcomeOpenInput,
    | "protocolIdentity"
    | "cohortReservationIdentity"
    | "adapterIdentity"
    | "sourceContractIdentity"
    | "dependencePlanIdentity"
    | "feeContractIdentity"
  >
> {
  return {
    protocolIdentity: buildM16ErScientificProtocol().scientificProtocolIdentity,
    cohortReservationIdentity:
      buildM16ErFixedCohortPlan().cohortReservationIdentity,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    sourceContractIdentity: buildM16ErSourceContract().sourceContractIdentity,
    dependencePlanIdentity: buildM16ErDependencePlan().dependencePlanIdentity,
    feeContractIdentity: buildM16ErFeeContract().feeContractIdentity,
  };
}

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

  it("outcome gate fails closed by default and requires affirmative identities", () => {
    const sealed = evaluateM16ErOutcomeOpenAuthorization();
    expect(sealed.authorized).toBe(false);
    expect(sealed.sealed).toBe(true);
    expect(sealed.blockers).toContain(
      M16_ER_OUTCOME_OPEN_BLOCKERS.PROTOCOL_MISSING,
    );
    expect(sealed.blockers).toContain(
      M16_ER_OUTCOME_OPEN_BLOCKERS.COHORT_MISSING,
    );
    expect(sealed.forbiddenWhileSealed).toContain("pnl");

    const identities = m16ErAffirmativeIdentityInputs();
    const open = evaluateM16ErOutcomeOpenAuthorization({
      ...identities,
      purchasedZipSha256Verified: true,
      qualityAuditComplete: true,
      fixedCohortAdmissionComplete: true,
      sampleAdequacyMet: true,
      pnlPreviouslyOpened: false,
    });
    expect(open.authorized).toBe(true);
    expect(open.sealed).toBe(false);
  });

  it("rejects booleans-only authorization when protocol identity omitted", () => {
    const identities = m16ErAffirmativeIdentityInputs();
    const rest: M16ErOutcomeOpenInput = { ...identities };
    delete rest.protocolIdentity;
    const gate = evaluateM16ErOutcomeOpenAuthorization({
      ...rest,
      purchasedZipSha256Verified: true,
      qualityAuditComplete: true,
      fixedCohortAdmissionComplete: true,
      sampleAdequacyMet: true,
    });
    expect(gate.authorized).toBe(false);
    expect(gate.sealed).toBe(true);
    expect(gate.blockers).toContain(
      M16_ER_OUTCOME_OPEN_BLOCKERS.PROTOCOL_MISSING,
    );
  });

  it("rejects booleans-only authorization when cohort identity omitted", () => {
    const identities = m16ErAffirmativeIdentityInputs();
    const rest: M16ErOutcomeOpenInput = { ...identities };
    delete rest.cohortReservationIdentity;
    const gate = evaluateM16ErOutcomeOpenAuthorization({
      ...rest,
      purchasedZipSha256Verified: true,
      qualityAuditComplete: true,
      fixedCohortAdmissionComplete: true,
      sampleAdequacyMet: true,
    });
    expect(gate.authorized).toBe(false);
    expect(gate.blockers).toContain(
      M16_ER_OUTCOME_OPEN_BLOCKERS.COHORT_MISSING,
    );
  });

  it("rejects mismatched and empty protocol/cohort identities", () => {
    const identities = m16ErAffirmativeIdentityInputs();
    const ops = {
      purchasedZipSha256Verified: true,
      qualityAuditComplete: true,
      fixedCohortAdmissionComplete: true,
      sampleAdequacyMet: true,
    } as const;

    expect(
      evaluateM16ErOutcomeOpenAuthorization({
        ...identities,
        ...ops,
        protocolIdentity: "0".repeat(64),
      }).blockers,
    ).toContain(M16_ER_OUTCOME_OPEN_BLOCKERS.PROTOCOL_MISMATCH);

    expect(
      evaluateM16ErOutcomeOpenAuthorization({
        ...identities,
        ...ops,
        cohortReservationIdentity: "1".repeat(64),
      }).blockers,
    ).toContain(M16_ER_OUTCOME_OPEN_BLOCKERS.COHORT_MISMATCH);

    expect(
      evaluateM16ErOutcomeOpenAuthorization({
        ...identities,
        ...ops,
        protocolIdentity: "",
      }).blockers,
    ).toContain(M16_ER_OUTCOME_OPEN_BLOCKERS.PROTOCOL_MISSING);

    expect(
      evaluateM16ErOutcomeOpenAuthorization({
        ...identities,
        ...ops,
        cohortReservationIdentity: "",
      }).blockers,
    ).toContain(M16_ER_OUTCOME_OPEN_BLOCKERS.COHORT_MISSING);
  });

  it("rejects omitted/mismatched adapter, source, dependence, and fee identities", () => {
    const identities = m16ErAffirmativeIdentityInputs();
    const ops = {
      purchasedZipSha256Verified: true,
      qualityAuditComplete: true,
      fixedCohortAdmissionComplete: true,
      sampleAdequacyMet: true,
    } as const;

    const cases: Array<{
      omit?: keyof typeof identities;
      override?: Partial<typeof identities>;
      blocker: string;
    }> = [
      {
        omit: "adapterIdentity",
        blocker: M16_ER_OUTCOME_OPEN_BLOCKERS.ADAPTER_MISSING,
      },
      {
        override: { adapterIdentity: "bad" },
        blocker: M16_ER_OUTCOME_OPEN_BLOCKERS.ADAPTER_MISMATCH,
      },
      {
        omit: "sourceContractIdentity",
        blocker: M16_ER_OUTCOME_OPEN_BLOCKERS.SOURCE_MISSING,
      },
      {
        override: { sourceContractIdentity: "bad" },
        blocker: M16_ER_OUTCOME_OPEN_BLOCKERS.SOURCE_MISMATCH,
      },
      {
        omit: "dependencePlanIdentity",
        blocker: M16_ER_OUTCOME_OPEN_BLOCKERS.DEPENDENCE_MISSING,
      },
      {
        override: { dependencePlanIdentity: "bad" },
        blocker: M16_ER_OUTCOME_OPEN_BLOCKERS.DEPENDENCE_MISMATCH,
      },
      {
        omit: "feeContractIdentity",
        blocker: M16_ER_OUTCOME_OPEN_BLOCKERS.FEE_MISSING,
      },
      {
        override: { feeContractIdentity: "bad" },
        blocker: M16_ER_OUTCOME_OPEN_BLOCKERS.FEE_MISMATCH,
      },
    ];

    for (const c of cases) {
      const base = { ...identities };
      if (c.omit) {
        delete base[c.omit];
      }
      const gate = evaluateM16ErOutcomeOpenAuthorization({
        ...base,
        ...c.override,
        ...ops,
      });
      expect(gate.authorized).toBe(false);
      expect(gate.blockers).toContain(c.blocker);
    }
  });

  it("rejects when identities match but an operational prerequisite is false", () => {
    const identities = m16ErAffirmativeIdentityInputs();
    const gate = evaluateM16ErOutcomeOpenAuthorization({
      ...identities,
      purchasedZipSha256Verified: true,
      qualityAuditComplete: true,
      fixedCohortAdmissionComplete: true,
      sampleAdequacyMet: false,
    });
    expect(gate.authorized).toBe(false);
    expect(gate.blockers).toContain(M16_ER_OUTCOME_OPEN_BLOCKERS.ADEQUACY_SHORT);
  });

  it("keeps frozen scientific identities unchanged after gate hardening", () => {
    expect(buildM16ErScientificProtocol().scientificProtocolIdentity).toBe(
      "3f4fdf157b3eb6eb775c8e2f4bab4272e23cfa22a7179fed29fb135012207c65",
    );
    expect(buildM16ErFixedCohortPlan().cohortReservationIdentity).toBe(
      "afdacb697216ba385e8d4d9627deec6610d90fafeb52c83b474bace7d9ae15c0",
    );
    expect(M16_ER_ADAPTER_IDENTITY).toBe(
      "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d",
    );
    expect(buildM16ErDependencePlan().dependencePlanIdentity).toBe(
      "b81c49e9fe574f900c22099c0071cb4607ea1c059952757ef8c95cbc88928603",
    );
    expect(buildM16ErFeeContract().feeContractIdentity).toBe(
      "2c1059ecc142dd6ca9b82375e03fd84b42f55ce6d6f1435a667111eea2d0548f",
    );
    expect(buildM16ErSourceContract().sourceContractIdentity).toBe(
      "63049f060df62092aee62e07fad1691ee5318424d09ebf97c6953cd9dd7149f4",
    );
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
