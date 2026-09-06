import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  createCalibrationFadeForwardValidationIo,
} from "../calibrationFadeForwardValidation/createCalibrationFadeForwardValidationIo";
import { loadFrozenHypothesisSpec } from "../calibrationFadeForwardValidation/loadFrozenHypothesisSpec";

import {
  DEFAULT_CALIBRATION_FADE_V1_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
  PENDING_FREEZE_IDENTITY,
  V2_COMPLETED_CANDLE_SOURCE_CONTRACT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
  failClosedIfCompletedCandleSourceUnavailable,
  isProspectiveConfirmatoryEvidenceEligible,
  loadCalibrationFadeV2HypothesisSpec,
  loadCalibrationFadeV2Provenance,
  requireFinalizedFreezeBoundary,
} from "./index";

const V1_CONFIG_PATH = DEFAULT_CALIBRATION_FADE_V1_HYPOTHESIS_CONFIG_PATH;
const V2_CONFIG_PATH = DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH;
const V2_PROVENANCE_PATH = DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH;
const AUG4_RUN_START = "2026-08-04T10:33:33.601Z";
const BASE_SHA = "6baa1b4eaae907b7325033dd0063162079d36a92";

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function filesystemIo() {
  return {
    readFile: (path: string) => readFileSync(path, "utf8"),
    fileExists: (path: string) => {
      try {
        readFileSync(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function mutateJson(path: string, mutator: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutator(doc);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

describe("M12.6a calibration-fade v2 preregistration", () => {
  it("1. v1 config remains byte-identical to base SHA content", () => {
    const baseBytes = execFileSync("git", ["show", `${BASE_SHA}:${V1_CONFIG_PATH}`]);
    const working = readFileSync(V1_CONFIG_PATH);
    expect(Buffer.compare(working, baseBytes)).toBe(0);
    expect(sha256File(V1_CONFIG_PATH)).toBe(
      createHash("sha256").update(baseBytes).digest("hex"),
    );
  });

  it("2. v1 still loads with maximumSourceGapMs=5000", () => {
    const { spec } = loadFrozenHypothesisSpec({
      io: createCalibrationFadeForwardValidationIo(),
      hypothesisConfigPath: V1_CONFIG_PATH,
    });
    expect(spec.volatilityDefinition.maximumSourceGapMs).toBe(5000);
    expect(DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH).toBe(V1_CONFIG_PATH);
  });

  it("3–5. v2 has no operative gap gate; not 0; not 5000", () => {
    const { spec } = loadCalibrationFadeV2HypothesisSpec({ io: filesystemIo() });
    expect(spec.volatilityDefinition.adjacentSourceGapPolicy).toBe("none");
    expect(spec.volatilityDefinition.maximumSourceGapMs).toBeNull();
    expect(spec.volatilityDefinition.maximumSourceGapMs).not.toBe(0);
    expect(spec.volatilityDefinition.maximumSourceGapMs).not.toBe(5000);

    const withZero = mutateJson(V2_CONFIG_PATH, (doc) => {
      const vol = doc.volatilityDefinition as Record<string, unknown>;
      vol.maximumSourceGapMs = 0;
    });
    expect(() =>
      loadCalibrationFadeV2HypothesisSpec({
        io: {
          readFile: (path) => (path === V2_CONFIG_PATH ? withZero : readFileSync(path, "utf8")),
          fileExists: () => true,
        },
      }),
    ).toThrow(/explicit null|Sentinels 0 and 5000|forbidden/i);

    const with5000 = mutateJson(V2_CONFIG_PATH, (doc) => {
      const vol = doc.volatilityDefinition as Record<string, unknown>;
      vol.maximumSourceGapMs = 5000;
    });
    expect(() =>
      loadCalibrationFadeV2HypothesisSpec({
        io: {
          readFile: (path) => (path === V2_CONFIG_PATH ? with5000 : readFileSync(path, "utf8")),
          fileExists: () => true,
        },
      }),
    ).toThrow(/explicit null|Sentinels 0 and 5000|forbidden/i);
  });

  it("6–9. Coinbase completed 1m OHLC, exchange close time, causal completed only, omit/no-fill", () => {
    const { spec } = loadCalibrationFadeV2HypothesisSpec({ io: filesystemIo() });
    const vol = spec.volatilityDefinition;
    expect(vol.provider).toBe("coinbase-spot");
    expect(vol.providerInstrument).toBe("BTC-USD");
    expect(vol.sourceRecordType).toBe("exchange-completed-1m-ohlc");
    expect(vol.timestampField).toBe("exchange-candle-close-time");
    expect(vol.timestampMeaning).toBe("exchange-candle-close-time");
    expect(vol.causalOnly).toBe(true);
    expect(vol.quoteMinutePolicy).toBe("exclude-in-progress-minute-as-completed-candle");
    expect(vol.missingMinuteBehavior).toBe("omit-missing-exchange-candles-no-fill");
    expect(vol.fillInterpolation).toBe("none");
  });

  it("10–12. lookback 10 / 11 closes, vol-high 0.60, exact thirds, <15m", () => {
    const { spec } = loadCalibrationFadeV2HypothesisSpec({ io: filesystemIo() });
    expect(spec.volatilityDefinition.lookbackBars).toBe(10);
    expect(spec.volatilityDefinition.requiredCloseCount).toBe(11);
    expect(spec.eligibilityRules.volatility.minInclusive).toBe(0.6);
    expect(spec.eligibilityRules.probability.minInclusive).toBe(1 / 3);
    expect(spec.eligibilityRules.probability.maxExclusive).toBe(2 / 3);
    expect(spec.eligibilityRules.timeRemainingMs.maxExclusive).toBe(900_000);
  });

  it("13. lineage exploratory passes=false with reviewed stats", () => {
    const { provenance } = loadCalibrationFadeV2Provenance({ io: filesystemIo() });
    expect(provenance.historicalCandidateLineage.observationCount).toBe(457);
    expect(provenance.historicalCandidateLineage.uniqueTradingDays).toBe(63);
    expect(provenance.historicalCandidateLineage.passes).toBe(false);
    expect(provenance.historicalCandidateLineage.robustnessScore).toBe(59);
    expect(provenance.hypothesisVersion).toBe("v2");
    expect(provenance.descendsFromV1ConfigPath).toBe(V1_CONFIG_PATH);
    expect(provenance.intentionalDifferences[0]?.id).toBe("volatility-source-contract");
    expect(provenance.intentionalDifferences[0]?.v1Unchanged).toBe(true);
    expect(provenance.intentionalDifferences[0]?.notIntegrityCorrectionToV1).toBe(true);
  });

  it("14–15. pre-freeze / Aug-4 are non-confirmatory", () => {
    const { provenance } = loadCalibrationFadeV2Provenance({ io: filesystemIo() });
    expect(provenance.nonConfirmatoryPolicy.preFreezeRuns).toBe("diagnostic-only");
    expect(provenance.nonConfirmatoryPolicy.aug4RunStartIso).toBe(AUG4_RUN_START);
    expect(provenance.nonConfirmatoryPolicy.aug4Status).toMatch(/excluded/i);

    // Pending freeze → fail closed (not eligible).
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: provenance,
        runStartIso: AUG4_RUN_START,
      }),
    ).toBe(false);

    const finalizedBoundary = {
      kind: "strictly-after-freeze-commit" as const,
      freezeCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      freezeTimestamp: "2026-09-06T22:00:00.000Z",
      rule: provenance.prospectiveEvidenceBoundary.rule,
    };
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: finalizedBoundary,
        runStartIso: AUG4_RUN_START,
      }),
    ).toBe(false);
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: finalizedBoundary,
        runStartIso: "2026-08-03T03:21:26.351Z",
      }),
    ).toBe(false);
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: finalizedBoundary,
        runStartIso: "2026-09-06T22:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: finalizedBoundary,
        runStartIso: "2026-09-06T22:00:00.001Z",
      }),
    ).toBe(true);
  });

  it("16. v1 and v2 coexist; default forward path remains v1", () => {
    expect(DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH).toBe(V1_CONFIG_PATH);
    expect(DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH).not.toBe(
      DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
    );
    const v1 = loadFrozenHypothesisSpec({
      io: createCalibrationFadeForwardValidationIo(),
    });
    const v2 = loadCalibrationFadeV2HypothesisSpec({ io: filesystemIo() });
    expect(v1.spec.hypothesisVersion).toBe("v1");
    expect(v2.spec.hypothesisVersion).toBe("v2");
    expect(v1.spec.volatilityDefinition.maximumSourceGapMs).toBe(5000);
    expect(v2.spec.volatilityDefinition.maximumSourceGapMs).toBeNull();
  });

  it("17. missing completed-candle source fails closed (no silent spot fallback)", () => {
    expect(V2_COMPLETED_CANDLE_SOURCE_CONTRACT.silentSpotTickFallbackAllowed).toBe(false);
    expect(V2_COMPLETED_CANDLE_SOURCE_CONTRACT.failClosedWhenUnavailable).toBe(true);
    expect(() =>
      failClosedIfCompletedCandleSourceUnavailable({
        sourceRecordType: "btc-spot-jsonl-points",
      }),
    ).toThrow(/completed-candle source unavailable|silent spot-tick fallback is forbidden/i);
    expect(() =>
      failClosedIfCompletedCandleSourceUnavailable({
        sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
        sourceAvailable: false,
      }),
    ).toThrow(/unavailable/i);
    expect(() =>
      failClosedIfCompletedCandleSourceUnavailable({
        sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
        sourceAvailable: true,
      }),
    ).not.toThrow();
  });

  it("rejects pending freeze when requiring finalized identity", () => {
    const { provenance } = loadCalibrationFadeV2Provenance({ io: filesystemIo() });
    if (provenance.v2FreezeCommitSha === PENDING_FREEZE_IDENTITY) {
      expect(() => requireFinalizedFreezeBoundary(provenance)).toThrow(/pending|fails closed/i);
    }
  });

  it("provenance schema is distinct from v1 and documents corpus caveat", () => {
    const { provenance } = loadCalibrationFadeV2Provenance({ io: filesystemIo() });
    expect(provenance.schema).toBe("calibration-fade-hypothesis-preregistration");
    expect(provenance.version).toBe(1);
    expect(provenance.limitations.some((item) => item.includes("19110") && item.includes("10474"))).toBe(
      true,
    );
    expect(V2_PROVENANCE_PATH).toContain("provenance/");
  });
});
