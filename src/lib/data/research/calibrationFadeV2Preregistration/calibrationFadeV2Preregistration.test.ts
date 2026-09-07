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
  CALIBRATION_FADE_V2_CONCLUSION,
  CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
  CALIBRATION_FADE_V2_FREEZE_TIMESTAMP,
  CALIBRATION_FADE_V2_HYPOTHESIS_ID,
  CALIBRATION_FADE_V2_SOURCE_CANDIDATE_ID,
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
const WRONG_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

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

function loadMutatedConfig(mutator: (doc: Record<string, unknown>) => void) {
  const content = mutateJson(V2_CONFIG_PATH, mutator);
  return () =>
    loadCalibrationFadeV2HypothesisSpec({
      io: {
        readFile: (path) => (path === V2_CONFIG_PATH ? content : readFileSync(path, "utf8")),
        fileExists: () => true,
      },
    });
}

function loadMutatedProvenance(mutator: (doc: Record<string, unknown>) => void) {
  const content = mutateJson(V2_PROVENANCE_PATH, mutator);
  return () =>
    loadCalibrationFadeV2Provenance({
      io: {
        readFile: (path) => (path === V2_PROVENANCE_PATH ? content : readFileSync(path, "utf8")),
        fileExists: () => true,
      },
    });
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

  it("1b. v2 config remains byte-identical to recorded freeze commit", () => {
    const freezeBytes = execFileSync("git", [
      "show",
      `${CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA}:${V2_CONFIG_PATH}`,
    ]);
    const working = readFileSync(V2_CONFIG_PATH);
    expect(Buffer.compare(working, freezeBytes)).toBe(0);
    expect(sha256File(V2_CONFIG_PATH)).toBe(
      createHash("sha256").update(freezeBytes).digest("hex"),
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

    expect(loadMutatedConfig((doc) => {
      (doc.volatilityDefinition as Record<string, unknown>).maximumSourceGapMs = 0;
    })).toThrow(/explicit null|Sentinels 0 and 5000|forbidden/i);

    expect(loadMutatedConfig((doc) => {
      (doc.volatilityDefinition as Record<string, unknown>).maximumSourceGapMs = 5000;
    })).toThrow(/explicit null|Sentinels 0 and 5000|forbidden/i);
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

  it("config identity is bound to canonical hypothesis/source-candidate IDs", () => {
    const { spec } = loadCalibrationFadeV2HypothesisSpec({ io: filesystemIo() });
    expect(spec.hypothesisId).toBe(CALIBRATION_FADE_V2_HYPOTHESIS_ID);
    expect(spec.sourceCandidateId).toBe(CALIBRATION_FADE_V2_SOURCE_CANDIDATE_ID);

    expect(loadMutatedConfig((doc) => {
      doc.hypothesisId = "other-hypothesis";
    })).toThrow(/hypothesisId must be/);

    expect(loadMutatedConfig((doc) => {
      doc.sourceCandidateId = "other-candidate";
    })).toThrow(/sourceCandidateId must be/);

    expect(loadMutatedConfig((doc) => {
      doc.hypothesisVersion = "v1";
    })).toThrow(/hypothesisVersion must be/);

    expect(loadMutatedConfig((doc) => {
      (doc.volatilityDefinition as Record<string, unknown>).provider = "binance-spot";
    })).toThrow(/provider must be/);

    expect(loadMutatedConfig((doc) => {
      (doc.volatilityDefinition as Record<string, unknown>).providerInstrument = "BTCUSDT";
    })).toThrow(/providerInstrument must be/);

    expect(loadMutatedConfig((doc) => {
      (doc.volatilityDefinition as Record<string, unknown>).sourceRecordType = "btc-spot-jsonl-points";
    })).toThrow(/sourceRecordType must be/);
  });

  it("13. lineage exploratory passes=false with reviewed stats", () => {
    const { provenance } = loadCalibrationFadeV2Provenance({ io: filesystemIo() });
    expect(provenance.historicalCandidateLineage.observationCount).toBe(457);
    expect(provenance.historicalCandidateLineage.uniqueTradingDays).toBe(63);
    expect(provenance.historicalCandidateLineage.passes).toBe(false);
    expect(provenance.historicalCandidateLineage.robustnessScore).toBe(59);
    expect(provenance.hypothesisVersion).toBe("v2");
    expect(provenance.hypothesisId).toBe(CALIBRATION_FADE_V2_HYPOTHESIS_ID);
    expect(provenance.sourceCandidateId).toBe(CALIBRATION_FADE_V2_SOURCE_CANDIDATE_ID);
    expect(provenance.conclusion).toBe(CALIBRATION_FADE_V2_CONCLUSION);
    expect(provenance.v2FreezeCommitSha).toBe(CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA);
    expect(provenance.v2FreezeCommitTimestamp).toBe(CALIBRATION_FADE_V2_FREEZE_TIMESTAMP);
    expect(provenance.descendsFromV1ConfigPath).toBe(V1_CONFIG_PATH);
    expect(provenance.intentionalDifferences[0]?.id).toBe("volatility-source-contract");
    expect(provenance.intentionalDifferences[0]?.v1Unchanged).toBe(true);
    expect(provenance.intentionalDifferences[0]?.notIntegrityCorrectionToV1).toBe(true);
  });

  it("13b. provenance identity mismatch fails closed", () => {
    expect(loadMutatedProvenance((doc) => {
      doc.hypothesisId = "other-hypothesis-id";
    })).toThrow(/hypothesisId must be/);

    expect(loadMutatedProvenance((doc) => {
      doc.sourceCandidateId = "other-source-candidate";
    })).toThrow(/sourceCandidateId must be/);

    expect(loadMutatedProvenance((doc) => {
      doc.hypothesisVersion = "v1";
    })).toThrow(/hypothesisVersion must be/);

    expect(loadMutatedProvenance((doc) => {
      doc.configPath = V1_CONFIG_PATH;
    })).toThrow(/configPath must be/);

    expect(loadMutatedProvenance((doc) => {
      doc.conclusion = "totally-different";
    })).toThrow(/conclusion must be/);
  });

  it("13c. freeze SHA/timestamp must equal canonical immutable freeze identity", () => {
    expect(loadMutatedProvenance((doc) => {
      doc.originalFreezeCommitSha = WRONG_SHA;
      doc.v2FreezeCommitSha = WRONG_SHA;
      (doc.prospectiveEvidenceBoundary as Record<string, unknown>).freezeCommitSha = WRONG_SHA;
    })).toThrow(/must be 1c5ef9da3ef5e48af26c05b850183b0e8d4290d0/);

    expect(loadMutatedProvenance((doc) => {
      doc.v2FreezeCommitSha = WRONG_SHA;
    })).toThrow(/v2FreezeCommitSha must match|must be 1c5ef9/);

    expect(loadMutatedProvenance((doc) => {
      doc.v2FreezeCommitTimestamp = "2026-09-07T00:00:00.000Z";
      (doc.prospectiveEvidenceBoundary as Record<string, unknown>).freezeTimestamp =
        "2026-09-07T00:00:00.000Z";
    })).toThrow(/must be 2026-09-06T15:59:43-07:00/);

    expect(loadMutatedProvenance((doc) => {
      doc.v2FreezeCommitTimestamp = "2026-09-07T00:00:00.000Z";
    })).toThrow(/v2FreezeCommitTimestamp must match|must be 2026-09-06T15:59:43-07:00/);

    expect(loadMutatedProvenance((doc) => {
      (doc.prospectiveEvidenceBoundary as Record<string, unknown>).freezeTimestamp =
        "2026-09-07T00:00:00.000Z";
    })).toThrow(/must match|must be 2026-09-06T15:59:43-07:00/);

    expect(loadMutatedProvenance((doc) => {
      doc.v2FreezeCommitTimestamp = "not-a-timestamp";
      (doc.prospectiveEvidenceBoundary as Record<string, unknown>).freezeTimestamp = "not-a-timestamp";
    })).toThrow(/ISO-8601|must be/);

    expect(loadMutatedProvenance((doc) => {
      doc.v2FreezeCommitTimestamp = "";
      (doc.prospectiveEvidenceBoundary as Record<string, unknown>).freezeTimestamp = "";
    })).toThrow(/non-empty|required|must be/);
  });

  it("14–15. pre-freeze / Aug-4 are non-confirmatory under canonical freeze chronology", () => {
    const { provenance } = loadCalibrationFadeV2Provenance({ io: filesystemIo() });
    expect(provenance.nonConfirmatoryPolicy.preFreezeRuns).toBe("diagnostic-only");
    expect(provenance.nonConfirmatoryPolicy.aug4RunStartIso).toBe(AUG4_RUN_START);
    expect(provenance.nonConfirmatoryPolicy.aug4Status).toMatch(/excluded/i);

    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: provenance,
        runStartIso: AUG4_RUN_START,
      }),
    ).toBe(false);

    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: provenance,
        runStartIso: CALIBRATION_FADE_V2_FREEZE_TIMESTAMP,
      }),
    ).toBe(false);

    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: provenance.prospectiveEvidenceBoundary,
        runStartIso: "2026-09-06T15:59:43.001-07:00",
      }),
    ).toBe(true);

    // Raw fake earlier boundary cannot become confirmatory.
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: {
          kind: "strictly-after-freeze-commit",
          freezeCommitSha: WRONG_SHA,
          freezeTimestamp: "2020-01-01T00:00:00.000Z",
          rule: provenance.prospectiveEvidenceBoundary.rule,
        },
        runStartIso: AUG4_RUN_START,
      }),
    ).toBe(false);

    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: {
          kind: "strictly-after-freeze-commit",
          freezeCommitSha: WRONG_SHA,
          freezeTimestamp: CALIBRATION_FADE_V2_FREEZE_TIMESTAMP,
          rule: provenance.prospectiveEvidenceBoundary.rule,
        },
        runStartIso: "2026-09-07T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("14c. malformed freeze/run timestamps fail closed (ineligible)", () => {
    const canonicalBoundary = {
      kind: "strictly-after-freeze-commit" as const,
      freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
      freezeTimestamp: CALIBRATION_FADE_V2_FREEZE_TIMESTAMP,
      rule: "strictly after",
    };
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: canonicalBoundary,
        runStartIso: "not-a-timestamp",
      }),
    ).toBe(false);
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: canonicalBoundary,
        runStartIso: "",
      }),
    ).toBe(false);
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: {
          ...canonicalBoundary,
          freezeTimestamp: "not-a-timestamp",
        },
        runStartIso: "2026-09-07T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      isProspectiveConfirmatoryEvidenceEligible({
        freezeBoundary: {
          ...canonicalBoundary,
          freezeTimestamp: "",
        },
        runStartIso: "2026-09-07T00:00:00.000Z",
      }),
    ).toBe(false);
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

  it("17. completed-candle availability requires explicit true (no silent spot fallback)", () => {
    expect(V2_COMPLETED_CANDLE_SOURCE_CONTRACT.silentSpotTickFallbackAllowed).toBe(false);
    expect(V2_COMPLETED_CANDLE_SOURCE_CONTRACT.failClosedWhenUnavailable).toBe(true);

    expect(() =>
      failClosedIfCompletedCandleSourceUnavailable({
        sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
        sourceAvailable: true,
      }),
    ).not.toThrow();

    expect(() =>
      failClosedIfCompletedCandleSourceUnavailable({
        sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
        sourceAvailable: false,
      }),
    ).toThrow(/sourceAvailable=false|unavailable/i);

    expect(() =>
      failClosedIfCompletedCandleSourceUnavailable({
        sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
        // @ts-expect-error intentional omitted availability
        sourceAvailable: undefined,
      }),
    ).toThrow(/sourceAvailable=undefined|unavailable/i);

    expect(() =>
      failClosedIfCompletedCandleSourceUnavailable({
        sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
      } as { sourceRecordType: string; sourceAvailable: boolean }),
    ).toThrow(/sourceAvailable=undefined|unavailable/i);

    expect(() =>
      failClosedIfCompletedCandleSourceUnavailable({
        sourceRecordType: "btc-spot-jsonl-points",
        sourceAvailable: true,
      }),
    ).toThrow(/completed-candle source unavailable|silent spot-tick fallback is forbidden/i);
  });

  it("rejects pending freeze when requiring finalized identity", () => {
    const { provenance } = loadCalibrationFadeV2Provenance({ io: filesystemIo() });
    if (provenance.v2FreezeCommitSha === PENDING_FREEZE_IDENTITY) {
      expect(() => requireFinalizedFreezeBoundary(provenance)).toThrow(/pending|fails closed/i);
    } else {
      expect(() => requireFinalizedFreezeBoundary(provenance)).not.toThrow();
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
