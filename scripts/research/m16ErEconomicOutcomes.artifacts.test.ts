import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildM16ErEvidenceContract,
  buildM16ErScientificProtocol,
  M16_ER_ADAPTER_IDENTITY,
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

describe("m16-er economic outcome artifacts", () => {
  it("requires primary + authorization artifacts after finalize", () => {
    for (const f of [
      "m16-er-outcome-open-authorization.json",
      "m16-er-primary-economic-result.json",
      "m16-er-economic-diagnostics.json",
      "m16-er-day-clusters.json",
      "m16-er-economic-result.md",
    ]) {
      expect(existsSync(resolve(AUDIT, f))).toBe(true);
    }
  });

  it("records human authorization and frozen identities on primary", () => {
    const auth = readJson("m16-er-outcome-open-authorization.json");
    const primary = readJson("m16-er-primary-economic-result.json");
    expect(auth.humanOutcomeOpenApproval).toBe(true);
    expect(auth.economicOutcomesPreviouslyOpened).toBe(false);
    expect(primary.scientificProtocolIdentity).toBe(
      buildM16ErScientificProtocol().scientificProtocolIdentity,
    );
    expect(primary.adapterIdentity).toBe(M16_ER_ADAPTER_IDENTITY);
    expect(primary.evidenceContractIdentity).toBe(
      buildM16ErEvidenceContract().evidenceContractIdentity,
    );
    expect(primary.blindConfirmations).toBe(461);
    expect(typeof primary.primaryN).toBe("number");
    expect(typeof primary.primaryG).toBe("number");
    expect(typeof primary.meanFeeAdjustedPnlCents).toBe("number");
    expect(typeof primary.oneSidedPValue).toBe("number");
    expect(typeof primary.primaryResultContentSha256).toBe("string");
    expect(
      (primary.primaryResultContentSha256 as string).length,
    ).toBe(64);
  });

  it("does not use planning MDE as a success threshold field", () => {
    const primary = readJson("m16-er-primary-economic-result.json");
    const text = JSON.stringify(primary);
    expect(text.includes("planningMdeAsThreshold")).toBe(false);
    expect(primary.hypothesisDecision).toBe("fail-to-reject-H0");
    expect(M16_ER_REQUIRED_TRADE_N).toBe(329);
    expect(M16_ER_MIN_UTC_DAY_CLUSTERS).toBe(27);
    expect(primary.primaryN).toBe(461);
    expect(primary.primaryG).toBe(34);
  });

  it("keeps QUALITY_AUDIT_ONLY dates out of day-cluster diagnostics keys", () => {
    const days = readJson("m16-er-day-clusters.json");
    const audit = [
      "2026-09-08",
      "2026-09-09",
      "2026-09-14",
      "2026-09-18",
      "2026-09-20",
    ];
    const keys = (
      days.days as Array<{ utcDayKey: string }>
    ).map((d) => d.utcDayKey);
    for (const d of audit) {
      expect(keys).not.toContain(d);
    }
  });
});
