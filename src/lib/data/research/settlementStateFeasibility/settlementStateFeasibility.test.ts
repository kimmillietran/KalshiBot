import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RemainingAverageThresholdError,
  computeRemainingAverageThreshold,
  verifyM16pSuspensionClaims,
} from "./index";

const M16P_SUSPENSION_FIXTURE_ROOT = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "fixtures/m16p-suspension",
);

describe("computeRemainingAverageThreshold", () => {
  it("computes the 60-sample remaining-average threshold", () => {
    const observed = [100, 100, 100];
    const result = computeRemainingAverageThreshold({
      strike: 100,
      observedSamples: observed,
    });
    expect(result.kind).toBe("remaining-threshold");
    if (result.kind !== "remaining-threshold") return;
    expect(result.remainingCount).toBe(57);
    expect(result.remainingAverageThreshold).toBe(100);
  });

  it("raises the remaining threshold when early samples are below strike", () => {
    const result = computeRemainingAverageThreshold({
      strike: 100,
      observedSamples: [90, 90],
    });
    expect(result.kind).toBe("remaining-threshold");
    if (result.kind !== "remaining-threshold") return;
    // (60*100 - 180) / 58 = 5820/58 = 100.3448...
    expect(result.remainingAverageThreshold).toBeCloseTo(5820 / 58, 10);
  });

  it("handles the completed-window case separately", () => {
    const samples = Array.from({ length: 60 }, () => 101);
    const result = computeRemainingAverageThreshold({
      strike: 100,
      observedSamples: samples,
    });
    expect(result.kind).toBe("completed-window");
    if (result.kind !== "completed-window") return;
    expect(result.remainingCount).toBe(0);
    expect(result.observedMean).toBe(101);
    expect(result.meanMinusStrike).toBe(1);
  });

  it("rejects invalid strikes and oversize windows", () => {
    expect(() =>
      computeRemainingAverageThreshold({ strike: 0, observedSamples: [1] }),
    ).toThrow(RemainingAverageThresholdError);
    expect(() =>
      computeRemainingAverageThreshold({
        strike: 100,
        observedSamples: Array.from({ length: 61 }, () => 1),
      }),
    ).toThrow(RemainingAverageThresholdError);
  });
});

describe("verifyM16pSuspensionClaims", () => {
  it("verifies M16-ER claims and reports M16-P registry discrepancy without opening outcomes", () => {
    const v = verifyM16pSuspensionClaims({
      repoRoot: M16P_SUSPENSION_FIXTURE_ROOT,
      nowIso: "2026-09-23T23:20:45.028Z",
    });
    expect(v.outcomesOpened).toBe(false);
    expect(v.sealedQuarantineIntact).toBe(true);
    expect(v.m16ErClaimsMatchPriorReport).toBe(true);
    expect(v.m16Er.primaryN).toBe(461);
    expect(v.m16Er.primaryG).toBe(34);
    expect(v.m16Er.meanGrossPnlCents).toBeCloseTo(-0.427, 3);
    expect(v.m16Er.meanFeeAdjustedPnlCents).toBeCloseTo(-4.427, 3);
    expect(v.registryDiscrepancyFromPriorZeroClaim).toBe(true);
    expect(v.registryAcceptedCount).toBeGreaterThanOrEqual(1);
    expect(v.schedulerEnabled).toBe(false);
  });
});
