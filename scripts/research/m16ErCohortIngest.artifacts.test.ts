import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
  buildCryptostructCandidateUniverse,
} from "@/lib/data/research/cryptostructDatasetGovernance";
import {
  buildM16ErFixedCohortPlan,
  buildM16ErScientificProtocol,
  evaluateM16ErOutcomeOpenAuthorization,
  M16_ER_ADAPTER_IDENTITY,
  M16_ER_OUTCOME_OPEN_BLOCKERS,
  M16_ER_REQUIRED_TRADE_N,
  M16_ER_MIN_UTC_DAY_CLUSTERS,
} from "@/lib/data/research/m16ExternalReplication";

const AUDIT = resolve(
  process.cwd(),
  "data/research-results/external-kalshi-data-audit",
);

function readJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(AUDIT, name), "utf8")) as Record<
    string,
    unknown
  >;
}

const FORBIDDEN = [
  '"pnl"',
  '"realizedReturn"',
  '"targetHit"',
  '"stopHit"',
  '"settlement"',
  '"winRate"',
  '"mfe"',
  '"mae"',
  '"exitPrice"',
  '"pValue"',
  '"cr2Result"',
];

describe("m16-er cohort ingest artifacts", () => {
  it("requires ingest artifacts to exist after finalize", () => {
    for (const f of [
      "m16-er-acquisition-manifest.json",
      "m16-er-raw-identities.json",
      "m16-er-quality-admission.json",
      "m16-er-blind-incidence.json",
      "m16-er-readiness.json",
      "m16-er-ingestion-report.md",
    ]) {
      expect(existsSync(resolve(AUDIT, f))).toBe(true);
    }
  });

  it("admits exact 34 frozen dates and never quality-audit dates", () => {
    const cohort = buildM16ErFixedCohortPlan();
    expect(cohort.fixedDateCount).toBe(34);
    const blind = readJson("m16-er-blind-incidence.json");
    const days = blind.days as Array<{ utcDate: string }>;
    expect(days).toHaveLength(34);
    expect(days.map((d) => d.utcDate)).toEqual([...cohort.fixedUtcDates]);
    for (const d of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
      expect(days.map((x) => x.utcDate)).not.toContain(d);
    }
    expect(buildCryptostructCandidateUniverse().candidateCount).toBe(34);
  });

  it("records SHA identities and forbids outcome fields in blind artifacts", () => {
    const ids = readJson("m16-er-raw-identities.json");
    const dayMap = ids.days as Record<string, string>;
    expect(Object.keys(dayMap)).toHaveLength(34);
    for (const sha of Object.values(dayMap)) {
      expect(sha).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const f of [
      "m16-er-blind-incidence.json",
      "m16-er-readiness.json",
      "m16-er-quality-admission.json",
      "m16-er-acquisition-manifest.json",
    ]) {
      const text = readFileSync(resolve(AUDIT, f), "utf8");
      for (const needle of FORBIDDEN) {
        expect(text.includes(needle)).toBe(false);
      }
    }
  });

  it("computes N/G without early stopping and preserves readiness semantics", () => {
    const blind = readJson("m16-er-blind-incidence.json");
    const ready = readJson("m16-er-readiness.json");
    expect(blind.earlyStoppingUsed).toBe(false);
    expect(blind.replacementDatesUsed).toBe(false);
    expect(blind.requiredN).toBe(M16_ER_REQUIRED_TRADE_N);
    expect(blind.requiredG).toBe(M16_ER_MIN_UTC_DAY_CLUSTERS);
    expect(typeof blind.totalN).toBe("number");
    expect(typeof blind.totalG).toBe("number");
    expect((blind.totalN as number) >= M16_ER_REQUIRED_TRADE_N).toBe(true);
    expect((blind.totalG as number) >= M16_ER_MIN_UTC_DAY_CLUSTERS).toBe(true);
    expect(ready.economicEvaluatorInvoked).toBe(false);
    expect(ready.humanCheckpointRequired).toBe(true);
    expect(ready.gateDefaultSealed).toBe(true);
    expect(ready.disposition).toBe("READY_FOR_HUMAN_OUTCOME_OPEN_APPROVAL");
    // Mechanical gate may authorize when identities supplied; this task must
    // not feed that into the evaluator.
    expect(ready.gateProbeWouldAuthorizeIfInvoked).toBe(true);
  });

  it("keeps hardened identity gate fail-closed and frozen identities stable", () => {
    const empty = evaluateM16ErOutcomeOpenAuthorization();
    expect(empty.authorized).toBe(false);
    expect(empty.sealed).toBe(true);
    expect(empty.blockers).toContain(
      M16_ER_OUTCOME_OPEN_BLOCKERS.PROTOCOL_MISSING,
    );
    expect(buildM16ErScientificProtocol().scientificProtocolIdentity).toBe(
      "3f4fdf157b3eb6eb775c8e2f4bab4272e23cfa22a7179fed29fb135012207c65",
    );
    expect(buildM16ErFixedCohortPlan().cohortReservationIdentity).toBe(
      "afdacb697216ba385e8d4d9627deec6610d90fafeb52c83b474bace7d9ae15c0",
    );
    expect(M16_ER_ADAPTER_IDENTITY).toBe(
      "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d",
    );
  });

  it("does not treat zero-signal admitted days as exclusions", () => {
    const blind = readJson("m16-er-blind-incidence.json");
    const days = blind.days as Array<{
      admitted: boolean;
      zeroSignal: boolean;
      exclusionReason: string | null;
      eligibleConfirmations: number;
    }>;
    for (const d of days) {
      if (d.admitted && d.eligibleConfirmations === 0) {
        expect(d.zeroSignal).toBe(true);
        expect(d.exclusionReason).toBeNull();
      }
      if (!d.admitted) {
        expect(d.exclusionReason).toBeTruthy();
      }
    }
  });
});
