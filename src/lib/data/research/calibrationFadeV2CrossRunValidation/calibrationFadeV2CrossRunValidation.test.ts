import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import { createMemoryCalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/createCalibrationFadeForwardValidationIo";
import { CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION } from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import {
  CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
  CALIBRATION_FADE_V2_HYPOTHESIS_ID,
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
  loadCalibrationFadeV2HypothesisSpec,
} from "../calibrationFadeV2Preregistration";

import { analyzeCalibrationFadeV2CrossRun } from "./analyzeCalibrationFadeV2CrossRun";
import { computeV2RunSetHash } from "./computeV2RunSetHash";
import { parseCalibrationFadeV2CrossRunValidationArgv } from "./parseCalibrationFadeV2CrossRunValidationArgv";
import { CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION } from "./calibrationFadeV2CrossRunValidationTypes";

const CONFIG_BYTES = readFileSync(DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH, "utf8");
const PROVENANCE_BYTES = readFileSync(DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH, "utf8");
const FROZEN_HASH = fnv1a32(
  stableStringify(
    loadCalibrationFadeV2HypothesisSpec({
      io: {
        readFile: (path) => readFileSync(path, "utf8"),
        fileExists: () => true,
      },
    }).spec,
  ),
);
const POST_FREEZE_START = "2026-09-08T07:46:44.416Z";
const PRE_FREEZE_START = "2026-09-01T00:00:00.000Z";
const REAL_TICKERS = ["KXBTC15M-26SEP081000-00", "KXBTC15M-26SEP081015-15"] as const;

function quality(runId: string) {
  return {
    selectedRunId: runId,
    captureHealthSource: "run-scoped-capture-health-audit",
    runDurationSeconds: 28_800,
    validBookShare: 0.99,
    btcJoinCoverageShare: 0.99,
    bidSizeCoverageShare: 0.99,
    reconnectCount: 0,
    sequenceGapCount: 0,
    suspectedSystemSleepSeconds: 0,
    captureVerdict: "capture-research-ready",
    reconciliationVerdict: "ok",
    nativeCaptureVerdict: "ok",
    captureEndReason: "duration-elapsed",
    terminalFailureReason: null,
    completedNormally: true,
    researchReadyVerified: true,
    auditFingerprintsVerified: true,
  };
}

function market(ticker: string, extras: Record<string, unknown> = {}) {
  return {
    marketTicker: ticker,
    entryTimestamp: extras.entryTimestamp ?? "2026-09-08T10:00:05.000Z",
    impliedYesProbability: 0.5,
    noAskCents: 48,
    executableAvailable: true,
    settlementStatus: extras.settlementStatus ?? "unknown",
    settledOutcome: extras.settledOutcome ?? "unknown",
    grossReturnCents: null,
    feeAdjustedReturnCents: null,
    calibrationGapSigned: extras.calibrationGapSigned ?? null,
    ...extras,
  };
}

function report(input: {
  runId: string;
  markets: readonly ReturnType<typeof market>[];
  episodes?: number;
  overrides?: Record<string, unknown>;
  identityOverrides?: Record<string, unknown>;
}) {
  const topLevelOverrides = { ...(input.overrides ?? {}) };
  const overrideIdentity =
    typeof topLevelOverrides.evidenceIdentity === "object"
      && topLevelOverrides.evidenceIdentity !== null
      && !Array.isArray(topLevelOverrides.evidenceIdentity)
      ? (topLevelOverrides.evidenceIdentity as Record<string, unknown>)
      : undefined;
  delete topLevelOverrides.evidenceIdentity;
  const evidenceIdentity = {
    hypothesisId: CALIBRATION_FADE_V2_HYPOTHESIS_ID,
    hypothesisVersion: "v2",
    configurationHash: FROZEN_HASH,
    freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    sourceContractId: V2_REQUIRED_SOURCE_RECORD_TYPE,
    captureRunId: input.runId,
    captureStartedAt: POST_FREEZE_START,
    evidenceMode: "confirmatory",
    confirmatoryEligibility: true,
    confirmatoryIneligibilityReason: null,
    ...input.identityOverrides,
    ...overrideIdentity,
  };
  return {
    analysisVersion: CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION,
    analysisScope: "selected-run",
    selectedRunId: input.runId,
    selectedRunDirectory: `data/live-capture/forward-quotes/${input.runId}`,
    sourceRunIds: [input.runId],
    hypothesisId: CALIBRATION_FADE_V2_HYPOTHESIS_ID,
    hypothesisVersion: "v2",
    hypothesisConfigurationHash: FROZEN_HASH,
    freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
    sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
    sourceContractId: V2_REQUIRED_SOURCE_RECORD_TYPE,
    captureRunId: input.runId,
    captureStartedAt: POST_FREEZE_START,
    evidenceMode: "confirmatory",
    confirmatoryEligibility: true,
    confirmatoryIneligibilityReason: null,
    recordsScanned: 1000,
    marketsScanned: input.markets.length,
    btcSpotRecordsScanned: 100,
    candleObservationsScanned: 200,
    qualifyingObservationCount: 10,
    candidateEpisodeCount: input.episodes ?? input.markets.length,
    candidateMarketCount: new Set(input.markets.map((entry) => entry.marketTicker)).size,
    executableCandidateCount: 0,
    settlementCoverageShare: 0,
    warnings: [],
    selectedRunQuality: quality(input.runId),
    featureCompatibility: {
      probabilityMeasureAvailable: true,
      volatilityMeasureAvailable: true,
      timeRemainingAvailable: true,
      incompatibleFeatures: [],
      spotUsedForVolatility: false,
    },
    summary: {
      interpretationClassification: "insufficient-forward-events",
      recommendedNextAction: "collect-additional-clean-forward-captures",
      rationale: "fixture",
    },
    ...topLevelOverrides,
    evidenceIdentity,
  };
}

function readiness(
  runId: string,
  verdict = "v2-capture-ready",
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    selectedRunId: runId,
    captureRunDir: `data/live-capture/forward-quotes/${runId}`,
    verdict,
    confirmatoryEligibility: true,
    ...overrides,
  };
}

function seedFrozenConfigs(files: Record<string, string>): void {
  files[DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH] = CONFIG_BYTES;
  files[DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH] = PROVENANCE_BYTES;
}

function seedAdmittedRun(
  files: Record<string, string>,
  runId: string,
  markets: readonly ReturnType<typeof market>[],
  options?: {
    episodes?: number;
    reportOverrides?: Record<string, unknown>;
    identityOverrides?: Record<string, unknown>;
    readinessVerdict?: string;
    readinessOverrides?: Record<string, unknown>;
  },
): void {
  const payload = report({
    runId,
    markets,
    episodes: options?.episodes,
    overrides: options?.reportOverrides,
    identityOverrides: options?.identityOverrides,
  });
  files[`data/research-results/calibration-fade-v2/confirmatory/${runId}/calibration-fade-forward-validation.json`] =
    JSON.stringify(payload);
  files[`data/research-results/calibration-fade-v2/confirmatory/${runId}/calibration-fade-forward-markets.jsonl`] =
    `${markets.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  files[`data/research-results/calibration-fade-v2/readiness/${runId}/capture-readiness.json`] =
    JSON.stringify(readiness(runId, options?.readinessVerdict, options?.readinessOverrides));
}

function mutateAdmittedReport(
  files: Record<string, string>,
  runId: string,
  mutate: (payload: Record<string, unknown>) => void,
): void {
  const path =
    `data/research-results/calibration-fade-v2/confirmatory/${runId}/calibration-fade-forward-validation.json`;
  const payload = JSON.parse(files[path]!) as Record<string, unknown>;
  mutate(payload);
  files[path] = JSON.stringify(payload);
}

function importResult(ticker: string, outcome: "yes" | "no"): string {
  return JSON.stringify({
    bronzeRecords: [
      {
        contentType: "kalshi.historical.settlement",
        ticker,
        payload: {
          market: {
            ticker,
            event_ticker: "KXBTC15M-26SEP081000",
            result: outcome,
            settlement_ts: "2026-09-08T10:15:00Z",
          },
        },
      },
    ],
  });
}

function analyzePair(
  files: Record<string, string>,
  dirs: readonly string[],
  runA: string,
  runB: string,
  extraArgv: string[] = [],
) {
  seedFrozenConfigs(files);
  const io = createMemoryCalibrationFadeForwardValidationIo(files, dirs);
  return analyzeCalibrationFadeV2CrossRun({
    config: parseCalibrationFadeV2CrossRunValidationArgv([
      "--capture-run-dir",
      `data/live-capture/forward-quotes/${runA}`,
      "--capture-run-dir",
      `data/live-capture/forward-quotes/${runB}`,
      "--evidence-mode",
      "confirmatory",
      ...extraArgv,
    ]),
    io,
    generatedAt: "2026-09-08T12:00:00.000Z",
  });
}

function expectRejected(argv: readonly string[], pattern: RegExp): void {
  expect(() => parseCalibrationFadeV2CrossRunValidationArgv(argv)).toThrow(pattern);
}

function expectAnalyzeRejected(
  files: Record<string, string>,
  runA: string,
  runB: string,
  pattern: RegExp,
  extraArgv: string[] = [],
  dirs: readonly string[] = [],
): void {
  seedFrozenConfigs(files);
  const io = createMemoryCalibrationFadeForwardValidationIo(files, dirs);
  expect(() =>
    analyzeCalibrationFadeV2CrossRun({
      config: parseCalibrationFadeV2CrossRunValidationArgv([
        "--capture-run-dir",
        `data/live-capture/forward-quotes/${runA}`,
        "--capture-run-dir",
        `data/live-capture/forward-quotes/${runB}`,
        "--evidence-mode",
        "confirmatory",
        ...extraArgv,
      ]),
      io,
      generatedAt: "2026-09-08T12:00:00.000Z",
    }),
  ).toThrow(pattern);
}

describe("calibrationFadeV2CrossRunValidation CLI", () => {
  it("rejects a single capture-run-dir", () => {
    expectRejected(
      ["--capture-run-dir", "data/live-capture/forward-quotes/run-a", "--evidence-mode", "confirmatory"],
      /at least two explicit/,
    );
  });

  it("rejects --latest", () => {
    expectRejected(["--latest", "--evidence-mode", "confirmatory"], /Unknown CLI flag|--latest/);
  });

  it("rejects --use-latest", () => {
    expectRejected(["--use-latest", "--evidence-mode", "confirmatory"], /Unknown CLI flag|--use-latest|latest/);
  });

  it("rejects empty, dot, and parent run-dir segments", () => {
    expectRejected(
      ["--capture-run-dir", ".", "--capture-run-dir", "run-b", "--evidence-mode", "confirmatory"],
      /Invalid capture run directory/,
    );
    expectRejected(
      ["--capture-run-dir", "..", "--capture-run-dir", "run-b", "--evidence-mode", "confirmatory"],
      /Invalid capture run directory/,
    );
  });

  it("rejects unknown CLI flags", () => {
    expectRejected(
      [
        "--capture-run-dir",
        "a",
        "--capture-run-dir",
        "b",
        "--evidence-mode",
        "confirmatory",
        "--newest",
      ],
      /Unknown CLI flag/,
    );
  });

  it("rejects omitted evidence mode", () => {
    expectRejected(
      ["--capture-run-dir", "run-a", "--capture-run-dir", "run-b"],
      /--evidence-mode is required/,
    );
  });

  it("rejects diagnostic evidence mode", () => {
    expectRejected(
      ["--capture-run-dir", "run-a", "--capture-run-dir", "run-b", "--evidence-mode", "diagnostic"],
      /must be confirmatory/,
    );
  });

  it("rejects a duplicate normalized run dir", () => {
    expectRejected(
      [
        "--capture-run-dir",
        "data/live-capture/forward-quotes/run-a/",
        "--capture-run-dir",
        "data/live-capture/forward-quotes/run-a",
        "--evidence-mode",
        "confirmatory",
      ],
      /Duplicate normalized/,
    );
  });

  it("rejects a duplicate resolved runId", () => {
    expectRejected(
      [
        "--capture-run-dir",
        "data/a/run-shared",
        "--capture-run-dir",
        "data/b/run-shared",
        "--evidence-mode",
        "confirmatory",
      ],
      /Duplicate resolved runId/,
    );
  });
});

describe("calibrationFadeV2CrossRunValidation admission and aggregation", () => {
  it("uses the frozen v2 configuration hash 79e2a134", () => {
    expect(FROZEN_HASH).toBe("79e2a134");
  });

  it("reorders the same run set to the same runSetHash and output path", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1"), market("M2")]);
    seedAdmittedRun(files, "run-b", [market("M3"), market("M4")]);
    seedFrozenConfigs(files);
    const io = createMemoryCalibrationFadeForwardValidationIo(files);
    const left = analyzeCalibrationFadeV2CrossRun({
      config: parseCalibrationFadeV2CrossRunValidationArgv([
        "--capture-run-dir",
        "data/live-capture/forward-quotes/run-a",
        "--capture-run-dir",
        "data/live-capture/forward-quotes/run-b",
        "--evidence-mode",
        "confirmatory",
      ]),
      io,
      generatedAt: "2026-09-08T12:00:00.000Z",
    });
    const right = analyzeCalibrationFadeV2CrossRun({
      config: parseCalibrationFadeV2CrossRunValidationArgv([
        "--capture-run-dir",
        "data/live-capture/forward-quotes/run-b",
        "--capture-run-dir",
        "data/live-capture/forward-quotes/run-a",
        "--evidence-mode",
        "confirmatory",
      ]),
      io,
      generatedAt: "2026-09-08T13:00:00.000Z",
    });
    expect(left.report.runSetHash).toBe(right.report.runSetHash);
    expect(left.report.settlementSnapshotHash).toBe(right.report.settlementSnapshotHash);
    expect(left.report.outputPath).toBe(right.report.outputPath);
    expect(left.report.outputPath).toContain(
      `/calibration-fade-v2/cross-run/confirmatory/${left.report.runSetHash}/settlement-snapshots/${left.report.settlementSnapshotHash}/`,
    );
    expect(left.report.outputPath).not.toContain("/latest");
    expect(left.report.outputPath).not.toContain("calibration-fade-cross-run-validation.json");
    expect(JSON.stringify(left.report.provenance.runSetHashPayload)).not.toMatch(/mtime/i);
    expect(JSON.stringify(left.report.provenance.settlementSnapshotPayload)).not.toMatch(/mtime/i);
  });

  function expectAdmissionOverrideRejected(overrides: Record<string, unknown>, pattern: RegExp): void {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")], { reportOverrides: overrides });
    seedAdmittedRun(files, "run-b", [market("M2")]);
    expectAnalyzeRejected(files, "run-a", "run-b", pattern);
  }

  it("rejects a v1 artifact", () => {
    expectAdmissionOverrideRejected(
      { analysisVersion: "calibration-fade-forward-validation-v1" },
      /v1|analysisVersion/,
    );
  });

  it("rejects a hypothesisVersion mismatch", () => {
    expectAdmissionOverrideRejected({ hypothesisVersion: "v1" }, /hypothesisVersion/);
  });

  it("rejects a configurationHash mismatch", () => {
    expectAdmissionOverrideRejected({ hypothesisConfigurationHash: "deadbeef" }, /configurationHash/);
  });

  it("rejects a freezeCommitSha mismatch", () => {
    expectAdmissionOverrideRejected({ freezeCommitSha: "0".repeat(40) }, /freezeCommitSha/);
  });

  it("rejects a sourceRecordType mismatch", () => {
    expectAdmissionOverrideRejected({ sourceRecordType: "btc-spot-ticks" }, /sourceRecordType/);
  });

  it("rejects confirmatoryEligibility=false", () => {
    expectAdmissionOverrideRejected({ confirmatoryEligibility: false }, /confirmatoryEligibility/);
  });

  it("rejects a pre-freeze captureStartedAt", () => {
    expectAdmissionOverrideRejected(
      {
        captureStartedAt: PRE_FREEZE_START,
        evidenceIdentity: { captureStartedAt: PRE_FREEZE_START },
      },
      /prospectively eligible/,
    );
  });

  it("rejects nested evidenceIdentity.captureRunId that disagrees with the explicit run", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")], {
      identityOverrides: { captureRunId: "run-b" },
    });
    seedAdmittedRun(files, "run-b", [market("M2")]);
    expectAnalyzeRejected(files, "run-a", "run-b", /evidenceIdentity\.captureRunId mismatch/);
  });

  it("rejects nested pre-freeze captureStartedAt even when top-level is post-freeze", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")], {
      identityOverrides: { captureStartedAt: PRE_FREEZE_START },
    });
    seedAdmittedRun(files, "run-b", [market("M2")]);
    expectAnalyzeRejected(files, "run-a", "run-b", /evidenceIdentity\.captureStartedAt mismatch/);
  });

  it("rejects top-level captureRunId mismatch even when nested identity is correct", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")], {
      reportOverrides: { captureRunId: "wrong-run" },
    });
    seedAdmittedRun(files, "run-b", [market("M2")]);
    expectAnalyzeRejected(files, "run-a", "run-b", /evidenceIdentity\.captureRunId mismatch/);
  });

  it("rejects a missing top-level captureRunId even when nested is valid", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")]);
    mutateAdmittedReport(files, "run-a", (payload) => {
      delete payload.captureRunId;
    });
    expectAnalyzeRejected(files, "run-a", "run-b", /captureRunId missing at top-level/);
  });

  it("rejects a missing nested captureRunId even when top-level is valid", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")]);
    mutateAdmittedReport(files, "run-a", (payload) => {
      const identity = payload.evidenceIdentity as Record<string, unknown>;
      delete identity.captureRunId;
    });
    expectAnalyzeRejected(files, "run-a", "run-b", /evidenceIdentity\.captureRunId missing/);
  });

  it("rejects a missing top-level captureStartedAt even when nested is valid", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")]);
    mutateAdmittedReport(files, "run-a", (payload) => {
      delete payload.captureStartedAt;
    });
    expectAnalyzeRejected(files, "run-a", "run-b", /captureStartedAt missing at top-level/);
  });

  it("rejects a missing nested captureStartedAt even when top-level is valid", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")]);
    mutateAdmittedReport(files, "run-a", (payload) => {
      const identity = payload.evidenceIdentity as Record<string, unknown>;
      delete identity.captureStartedAt;
    });
    expectAnalyzeRejected(files, "run-a", "run-b", /evidenceIdentity\.captureStartedAt missing/);
  });

  it("admits matching top-level and nested capture identity", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")]);
    const sealed = JSON.parse(
      files["data/research-results/calibration-fade-v2/confirmatory/run-a/calibration-fade-forward-validation.json"]!,
    ) as {
      selectedRunId: string;
      captureRunId: string;
      captureStartedAt: string;
      evidenceIdentity: { captureRunId: string; captureStartedAt: string };
    };
    expect(sealed.selectedRunId).toBe("run-a");
    expect(sealed.captureRunId).toBe("run-a");
    expect(sealed.evidenceIdentity.captureRunId).toBe("run-a");
    expect(sealed.captureStartedAt).toBe(POST_FREEZE_START);
    expect(sealed.evidenceIdentity.captureStartedAt).toBe(POST_FREEZE_START);
    const result = analyzePair(files, [], "run-a", "run-b");
    expect(result.report.selectedRunIds).toEqual(["run-a", "run-b"]);
    expect(result.report.interpretationClassification).toBe("insufficient-forward-events");
  });

  it("rejects incompatible featureCompatibility", () => {
    expectAdmissionOverrideRejected(
      {
        featureCompatibility: {
          probabilityMeasureAvailable: true,
          volatilityMeasureAvailable: false,
          timeRemainingAvailable: true,
          incompatibleFeatures: ["volatility"],
          spotUsedForVolatility: false,
        },
      },
      /incompatibleFeatures/,
    );
  });

  it("rejects spotUsedForVolatility=true", () => {
    expectAdmissionOverrideRejected(
      {
        featureCompatibility: {
          probabilityMeasureAvailable: true,
          volatilityMeasureAvailable: true,
          timeRemainingAvailable: true,
          incompatibleFeatures: [],
          spotUsedForVolatility: true,
        },
      },
      /spotUsedForVolatility/,
    );
  });

  it("rejects capture health that is not formally research-ready", () => {
    expectAdmissionOverrideRejected(
      { selectedRunQuality: { ...quality("run-a"), captureVerdict: "capture-gappy" } },
      /capture-research-ready/,
    );
  });

  it("rejects researchReadyVerified=false", () => {
    expectAdmissionOverrideRejected(
      { selectedRunQuality: { ...quality("run-a"), researchReadyVerified: false } },
      /researchReadyVerified/,
    );
  });

  it("rejects analysisVersion mismatch across the selected set", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")], {
      reportOverrides: { analysisVersion: "calibration-fade-v2-forward-validation-v9" },
    });
    expectAnalyzeRejected(files, "run-a", "run-b", /analysisVersion/);
  });

  it("rejects a missing readiness artifact", () => {
    const missing: Record<string, string> = {};
    seedAdmittedRun(missing, "run-a", [market("M1")]);
    seedAdmittedRun(missing, "run-b", [market("M2")]);
    delete missing["data/research-results/calibration-fade-v2/readiness/run-b/capture-readiness.json"];
    expectAnalyzeRejected(missing, "run-a", "run-b", /readiness artifact missing|v2 readiness artifact missing/i);
  });

  it("rejects a readiness verdict other than v2-capture-ready", () => {
    const notReady: Record<string, string> = {};
    seedAdmittedRun(notReady, "run-a", [market("M1")]);
    seedAdmittedRun(notReady, "run-b", [market("M2")], { readinessVerdict: "v2-capture-not-ready" });
    expectAnalyzeRejected(notReady, "run-a", "run-b", /v2-capture-ready/);
  });

  it("rejects readiness confirmatoryEligibility that is not true", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")], {
      readinessOverrides: { confirmatoryEligibility: false },
    });
    expectAnalyzeRejected(files, "run-a", "run-b", /Readiness confirmatoryEligibility must be true/);
  });

  it("rejects a readiness captureRunDir that identifies a different run", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")], {
      readinessOverrides: { captureRunDir: "data/live-capture/forward-quotes/run-a" },
    });
    expectAnalyzeRejected(files, "run-a", "run-b", /Readiness captureRunDir must identify explicit run run-b/);
  });

  it("admits an equivalent readiness captureRunDir that resolves to the same runId", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")], {
      readinessOverrides: { captureRunDir: "/tmp/archive/data/live-capture/forward-quotes/run-a/" },
    });
    seedAdmittedRun(files, "run-b", [market("M2")]);
    const result = analyzePair(files, [], "run-a", "run-b");
    expect(result.report.selectedRunIds).toEqual(["run-a", "run-b"]);
  });

  it("rejects malformed confirmatory JSON", () => {
    const malformedJson: Record<string, string> = {};
    seedAdmittedRun(malformedJson, "run-a", [market("M1")]);
    seedAdmittedRun(malformedJson, "run-b", [market("M2")]);
    malformedJson[
      "data/research-results/calibration-fade-v2/confirmatory/run-b/calibration-fade-forward-validation.json"
    ] = "{not-json";
    expectAnalyzeRejected(malformedJson, "run-a", "run-b", /Malformed confirmatory JSON/);
  });

  it("rejects malformed markets JSONL", () => {
    const malformedMarkets: Record<string, string> = {};
    seedAdmittedRun(malformedMarkets, "run-a", [market("M1")]);
    seedAdmittedRun(malformedMarkets, "run-b", [market("M2")]);
    malformedMarkets[
      "data/research-results/calibration-fade-v2/confirmatory/run-b/calibration-fade-forward-markets.jsonl"
    ] = "{not-json\n";
    expectAnalyzeRejected(malformedMarkets, "run-a", "run-b", /Malformed confirmatory markets JSONL/);
  });

  it("rejects a market row identity mismatch", () => {
    const identity: Record<string, string> = {};
    seedAdmittedRun(identity, "run-a", [market("M1")]);
    seedAdmittedRun(identity, "run-b", [market("M2", { selectedRunId: "other-run" })]);
    expectAnalyzeRejected(identity, "run-a", "run-b", /Market row identity mismatch/);
  });

  it("counts 79 episodes / 2 markets as 2 independent markets", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(
      files,
      "2026-09-08T07-46-44-416Z",
      [market(REAL_TICKERS[0]), market(REAL_TICKERS[1])],
      { episodes: 79 },
    );
    seedAdmittedRun(files, "run-companion", [market("KXBTC15M-26SEP081030-00"), market("KXBTC15M-26SEP081045-15")]);
    const result = analyzePair(files, [], "2026-09-08T07-46-44-416Z", "run-companion");
    expect(result.report.perRunSummaries.find((run) => run.runId === "2026-09-08T07-46-44-416Z")).toMatchObject({
      candidateEpisodeCount: 79,
      candidateMarketCount: 2,
    });
    expect(result.report.uniqueCandidateMarketCount).toBe(4);
    expect(result.report.evaluatedIndependentCandidateMarketCount).toBe(4);
    expect(result.report.interpretationClassification).toBe("insufficient-forward-events");
  });

  it("deduplicates the same ticker across confirmatory runs", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("SHARED")]);
    seedAdmittedRun(files, "run-b", [market("SHARED", { entryTimestamp: "2026-09-08T11:00:00.000Z" })]);
    const result = analyzePair(files, [], "run-a", "run-b");
    expect(result.report.rawCandidateAppearanceCount).toBe(2);
    expect(result.report.uniqueCandidateMarketCount).toBe(1);
    expect(result.appearanceLines.join("\n")).toContain("suppressed-later-than-earliest-causal-entry");
  });

  it("counts 2 + 4 markets with one overlap as 5 independent markets", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1"), market("M2")]);
    seedAdmittedRun(files, "run-b", [market("M2"), market("M3"), market("M4"), market("M5")]);
    const result = analyzePair(files, [], "run-a", "run-b");
    expect(result.report.rawCandidateAppearanceCount).toBe(6);
    expect(result.report.uniqueCandidateMarketCount).toBe(5);
    expect(result.report.evaluatedIndependentCandidateMarketCount).toBe(5);
  });

  it("marks a conflicting target side as not evaluated", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("CONFLICT", { targetOutcomeSide: "no" }), market("OK1")]);
    seedAdmittedRun(files, "run-b", [
      market("CONFLICT", { targetOutcomeSide: "yes", entryTimestamp: "2026-09-08T11:00:00.000Z" }),
      market("OK2"),
    ]);
    const result = analyzePair(files, [], "run-a", "run-b");
    expect(result.report.uniqueCandidateMarketCount).toBe(3);
    expect(result.report.evaluatedIndependentCandidateMarketCount).toBe(2);
    expect(result.appearanceLines.join("\n")).toContain("conflicting-target-side");
  });

  it("keeps unresolved settlements in the candidate set and reports incomplete coverage", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1"), market("M2"), market("M3")]);
    seedAdmittedRun(files, "run-b", [market("M4"), market("M5")]);
    const result = analyzePair(files, [], "run-a", "run-b");
    expect(result.report.evaluatedIndependentCandidateMarketCount).toBe(5);
    expect(result.report.settlementCoverageShare).toBe(0);
    expect(result.report.interpretationClassification).toBe("settlement-coverage-incomplete");
  });

  it("applies settlement overlay without changing evidence mode or adding tickers", () => {
    const files: Record<string, string> = {};
    const tickers = [
      "KXBTC15M-26SEP081000-00",
      "KXBTC15M-26SEP081015-15",
      "KXBTC15M-26SEP081030-00",
      "KXBTC15M-26SEP081045-15",
      "KXBTC15M-26SEP081100-00",
    ];
    const extra = "KXBTC15M-26SEP081200-00";
    const dirs = [
      "data/imports",
      "data/imports/KXBTC15M",
      `data/imports/KXBTC15M/${tickers[0]}`,
      `data/imports/KXBTC15M/${extra}`,
    ];
    seedAdmittedRun(files, "run-a", [market(tickers[0]!), market(tickers[1]!), market(tickers[2]!)]);
    seedAdmittedRun(files, "run-b", [market(tickers[3]!), market(tickers[4]!)]);
    files[`data/imports/KXBTC15M/${tickers[0]}/import-result.json`] = importResult(tickers[0]!, "no");
    files[`data/imports/KXBTC15M/${extra}/import-result.json`] = importResult(extra, "yes");
    const without = analyzePair({ ...files }, dirs, "run-a", "run-b");
    const withOverlay = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    expect(withOverlay.report.evidenceMode).toBe("confirmatory");
    expect(withOverlay.report.uniqueCandidateMarketCount).toBe(without.report.uniqueCandidateMarketCount);
    expect(withOverlay.report.selectedRunIds).toEqual(without.report.selectedRunIds);
    expect(withOverlay.report.runSetHash).toBe(without.report.runSetHash);
    expect(withOverlay.report.settlementSnapshotHash).not.toBe(without.report.settlementSnapshotHash);
    expect(withOverlay.report.outputPath).not.toBe(without.report.outputPath);
    expect(withOverlay.report.settlementCoverageShare).toBe(0.2);
    expect(withOverlay.report.interpretationClassification).toBe("settlement-coverage-incomplete");
    expect(withOverlay.marketLines.join("\n")).not.toContain(extra);
    expect(withOverlay.report.evaluatedExecutableCandidateCount).toBe(0);
    expect(withOverlay.report.grossReturnCents).toBeNull();
    expect(withOverlay.report.feeAdjustedReturnCents).toBeNull();
    const overlayMarket = JSON.parse(
      withOverlay.marketLines.find((line) => line.includes(tickers[0]!)) ?? "{}",
    ) as {
      selectedCanonicalEntry?: {
        executableAvailable?: boolean;
        settledOutcome?: string;
        grossReturnCents?: number | null;
        feeAdjustedReturnCents?: number | null;
      };
    };
    expect(overlayMarket.selectedCanonicalEntry?.executableAvailable).toBe(true);
    expect(overlayMarket.selectedCanonicalEntry?.settledOutcome).toBe("no");
    expect(overlayMarket.selectedCanonicalEntry?.grossReturnCents).toBeNull();
    expect(overlayMarket.selectedCanonicalEntry?.feeAdjustedReturnCents).toBeNull();
  });

  it("does not manufacture zero-return executable evidence from overlay-settled null returns", () => {
    const files: Record<string, string> = {};
    const ticker = "KXBTC15M-26SEP081000-00";
    const companion = "KXBTC15M-26SEP081015-15";
    const dirs = ["data/imports", "data/imports/KXBTC15M", `data/imports/KXBTC15M/${ticker}`];
    seedAdmittedRun(files, "run-a", [
      market(ticker, {
        executableAvailable: true,
        settlementStatus: "unknown",
        settledOutcome: "unknown",
        grossReturnCents: null,
        feeAdjustedReturnCents: null,
      }),
    ]);
    seedAdmittedRun(files, "run-b", [market(companion)]);
    files[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "no");
    const result = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    expect(result.report.evaluatedExecutableCandidateCount).toBe(0);
    expect(result.report.grossReturnCents).toBeNull();
    expect(result.report.feeAdjustedReturnCents).toBeNull();
    expect(result.report.settlementCoverageShare).toBe(0.5);
    expect(result.report.interpretationClassification).not.toMatch(
      /forward-supports-executable-fade|forward-contradicts-executability/,
    );
  });

  it("preserves valid sealed executable returns and counts them as evaluated", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [
      market("KXBTC15M-26SEP081000-00", {
        settledOutcome: "no",
        settlementStatus: "known",
        grossReturnCents: 57,
        feeAdjustedReturnCents: 56,
        calibrationGapSigned: -0.5,
      }),
    ]);
    seedAdmittedRun(files, "run-b", [market("KXBTC15M-26SEP081015-15")]);
    const result = analyzePair(files, [], "run-a", "run-b");
    expect(result.report.evaluatedExecutableCandidateCount).toBe(1);
    expect(result.report.grossReturnCents).toBe(57);
    expect(result.report.feeAdjustedReturnCents).toBe(56);
  });

  it("preserves sealed returns when overlay repeats the same settled outcome", () => {
    const files: Record<string, string> = {};
    const ticker = "KXBTC15M-26SEP081000-00";
    const dirs = ["data/imports", "data/imports/KXBTC15M", `data/imports/KXBTC15M/${ticker}`];
    seedAdmittedRun(files, "run-a", [
      market(ticker, {
        settledOutcome: "no",
        settlementStatus: "known",
        grossReturnCents: 57,
        feeAdjustedReturnCents: 56,
        calibrationGapSigned: -0.5,
      }),
    ]);
    seedAdmittedRun(files, "run-b", [market("KXBTC15M-26SEP081015-15")]);
    files[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "no");
    const result = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    expect(result.report.evaluatedExecutableCandidateCount).toBe(1);
    expect(result.report.grossReturnCents).toBe(57);
    expect(result.report.feeAdjustedReturnCents).toBe(56);
    expect(result.report.runSetHash).toBe(analyzePair({ ...files }, dirs, "run-a", "run-b").report.runSetHash);
    expect(result.report.settlementSnapshotHash).toBe(
      analyzePair({ ...files }, dirs, "run-a", "run-b").report.settlementSnapshotHash,
    );
  });

  it("fails closed when overlay contradicts a sealed settled outcome", () => {
    const files: Record<string, string> = {};
    const ticker = "KXBTC15M-26SEP081000-00";
    seedAdmittedRun(files, "run-a", [
      market(ticker, {
        settledOutcome: "no",
        settlementStatus: "known",
        grossReturnCents: 57,
        feeAdjustedReturnCents: 56,
        calibrationGapSigned: -0.5,
      }),
    ]);
    seedAdmittedRun(files, "run-b", [market("KXBTC15M-26SEP081015-15")]);
    files[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "yes");
    expectAnalyzeRejected(
      files,
      "run-a",
      "run-b",
      /conflicts with sealed outcome/,
      ["--imports-dir", "data/imports"],
      ["data/imports", "data/imports/KXBTC15M", `data/imports/KXBTC15M/${ticker}`],
    );
  });

  it("keeps settlement coverage and calibration when executable returns remain unknown", () => {
    const files: Record<string, string> = {};
    const tickers = [
      "KXBTC15M-26SEP081000-00",
      "KXBTC15M-26SEP081015-15",
      "KXBTC15M-26SEP081030-00",
      "KXBTC15M-26SEP081045-15",
      "KXBTC15M-26SEP081100-00",
    ];
    const dirs = ["data/imports", "data/imports/KXBTC15M", ...tickers.map((ticker) => `data/imports/KXBTC15M/${ticker}`)];
    seedAdmittedRun(files, "run-a", [market(tickers[0]!), market(tickers[1]!), market(tickers[2]!)]);
    seedAdmittedRun(files, "run-b", [market(tickers[3]!), market(tickers[4]!)]);
    for (const ticker of tickers) {
      files[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "no");
    }
    const result = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    expect(result.report.evaluatedIndependentCandidateMarketCount).toBe(5);
    expect(result.report.settlementCoverageShare).toBe(1);
    expect(result.report.evaluatedExecutableCandidateCount).toBe(0);
    expect(result.report.grossReturnCents).toBeNull();
    expect(result.report.feeAdjustedReturnCents).toBeNull();
    expect(result.report.interpretationClassification).not.toBe("insufficient-forward-events");
    expect(result.report.interpretationClassification).not.toBe("settlement-coverage-incomplete");
    expect(result.report.interpretationClassification).not.toMatch(
      /forward-supports-executable-fade|forward-contradicts-executability/,
    );
  });

  it("does not invent executable returns for a non-executable overlay-settled market", () => {
    const files: Record<string, string> = {};
    const ticker = "KXBTC15M-26SEP081000-00";
    const dirs = ["data/imports", "data/imports/KXBTC15M", `data/imports/KXBTC15M/${ticker}`];
    seedAdmittedRun(files, "run-a", [
      market(ticker, {
        executableAvailable: false,
        noAskCents: null,
      }),
    ]);
    seedAdmittedRun(files, "run-b", [market("KXBTC15M-26SEP081015-15")]);
    files[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "yes");
    const result = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    expect(result.report.settlementCoverageShare).toBe(0.5);
    expect(result.report.evaluatedExecutableCandidateCount).toBe(0);
    expect(result.report.grossReturnCents).toBeNull();
    expect(result.report.feeAdjustedReturnCents).toBeNull();
    const overlayMarket = JSON.parse(
      result.marketLines.find((line) => line.includes(ticker)) ?? "{}",
    ) as {
      selectedCanonicalEntry?: {
        executableAvailable?: boolean;
        settledOutcome?: string;
        grossReturnCents?: number | null;
        feeAdjustedReturnCents?: number | null;
      };
    };
    expect(overlayMarket.selectedCanonicalEntry?.executableAvailable).toBe(false);
    expect(overlayMarket.selectedCanonicalEntry?.settledOutcome).toBe("yes");
    expect(overlayMarket.selectedCanonicalEntry?.grossReturnCents).toBeNull();
    expect(overlayMarket.selectedCanonicalEntry?.feeAdjustedReturnCents).toBeNull();
  });

  it("fails closed on partial sealed executable returns", () => {
    const grossOnly: Record<string, string> = {};
    seedAdmittedRun(grossOnly, "run-a", [
      market("KXBTC15M-26SEP081000-00", {
        settledOutcome: "no",
        settlementStatus: "known",
        grossReturnCents: 57,
        feeAdjustedReturnCents: null,
        calibrationGapSigned: -0.5,
      }),
    ]);
    seedAdmittedRun(grossOnly, "run-b", [market("KXBTC15M-26SEP081015-15")]);
    expectAnalyzeRejected(grossOnly, "run-a", "run-b", /partial executable returns/);

    const feeOnly: Record<string, string> = {};
    seedAdmittedRun(feeOnly, "run-a", [
      market("KXBTC15M-26SEP081000-00", {
        settledOutcome: "no",
        settlementStatus: "known",
        grossReturnCents: null,
        feeAdjustedReturnCents: 56,
        calibrationGapSigned: -0.5,
      }),
    ]);
    seedAdmittedRun(feeOnly, "run-b", [market("KXBTC15M-26SEP081015-15")]);
    expectAnalyzeRejected(feeOnly, "run-a", "run-b", /partial executable returns/);
  });

  it("rejects a diagnostic artifact even when settlements exist", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")], {
      reportOverrides: { evidenceMode: "diagnostic", confirmatoryEligibility: false },
    });
    files["data/imports/KXBTC15M/M2/import-result.json"] = importResult("M2", "yes");
    expectAnalyzeRejected(files, "run-a", "run-b", /evidenceMode|confirmatoryEligibility/, [
      "--imports-dir",
      "data/imports",
    ]);
  });

  it("changes runSetHash when sealed confirmatory bytes change and stays deterministic otherwise", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")]);
    const first = analyzePair(files, [], "run-a", "run-b");
    const second = analyzePair({ ...files }, [], "run-a", "run-b");
    expect(first.report.runSetHash).toBe(second.report.runSetHash);
    expect(first.report.provenance.runSetHashPayload.analysisVersion).toBe(
      CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION,
    );
    expect(first.report.provenance.runSetHashPayload).not.toHaveProperty("mtime");

    seedAdmittedRun(files, "run-b", [market("M2-CHANGED")]);
    const changed = analyzePair(files, [], "run-a", "run-b");
    expect(changed.report.runSetHash).not.toBe(first.report.runSetHash);
  });

  it("fails closed on same-hash semantic overwrite and allows equivalent republish", () => {
    const files: Record<string, string> = {};
    seedAdmittedRun(files, "run-a", [market("M1")]);
    seedAdmittedRun(files, "run-b", [market("M2")]);
    const first = analyzePair(files, [], "run-a", "run-b");
    const conflicting = {
      ...first.report,
      interpretationClassification: "forward-supports-calibration-effect",
    };
    files[first.report.outputPath] = JSON.stringify(conflicting);
    expectAnalyzeRejected(files, "run-a", "run-b", /different semantic body/);

    files[first.report.outputPath] = JSON.stringify({
      ...first.report,
      generatedAt: "2026-09-08T18:00:00.000Z",
      artifactGeneratedAt: "2026-09-08T18:00:00.000Z",
    });
    const republish = analyzePair(files, [], "run-a", "run-b");
    expect(republish.report.runSetHash).toBe(first.report.runSetHash);
    expect(republish.report.settlementSnapshotHash).toBe(first.report.settlementSnapshotHash);
  });

  it("does not hash mtime in the v2 runSetHash payload", () => {
    const hashed = computeV2RunSetHash({
      hypothesisId: CALIBRATION_FADE_V2_HYPOTHESIS_ID,
      configurationHash: FROZEN_HASH,
      freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
      sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
      selectedRunIds: ["b", "a"],
      perRun: [
        {
          runId: "b",
          configurationHash: FROZEN_HASH,
          freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
          evidenceMode: "confirmatory",
          sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
          analysisVersion: CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION,
          confirmatoryReportSha: "aaaa",
          confirmatoryMarketsSha: "bbbb",
          readinessVerdict: "v2-capture-ready",
        },
        {
          runId: "a",
          configurationHash: FROZEN_HASH,
          freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
          evidenceMode: "confirmatory",
          sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
          analysisVersion: CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION,
          confirmatoryReportSha: "cccc",
          confirmatoryMarketsSha: "dddd",
          readinessVerdict: "v2-capture-ready",
        },
      ],
    });
    expect(hashed.payload.selectedRunIds).toEqual(["a", "b"]);
    expect(hashed.payload.perRun.map((entry) => entry.runId)).toEqual(["a", "b"]);
    expect(JSON.stringify(hashed.payload)).not.toMatch(/mtime|ctime/i);
  });
});

describe("M12.6e.1 settlement snapshot lifecycle", () => {
  const FIVE = [
    "KXBTC15M-26SEP081000-00",
    "KXBTC15M-26SEP081015-15",
    "KXBTC15M-26SEP081030-00",
    "KXBTC15M-26SEP081045-15",
    "KXBTC15M-26SEP081100-00",
  ] as const;

  function seedFiveUnresolved(files: Record<string, string>): void {
    seedAdmittedRun(files, "run-a", [market(FIVE[0]), market(FIVE[1]), market(FIVE[2])]);
    seedAdmittedRun(files, "run-b", [market(FIVE[3]), market(FIVE[4])]);
  }

  function importDirsFor(tickers: readonly string[]): string[] {
    return ["data/imports", "data/imports/KXBTC15M", ...tickers.map((ticker) => `data/imports/KXBTC15M/${ticker}`)];
  }

  it("publishes a new settlement snapshot for zero→partial overlay without overwriting the prior one", () => {
    const files: Record<string, string> = {};
    seedFiveUnresolved(files);
    const initial = analyzePair(files, [], "run-a", "run-b");
    expect(initial.report.evaluatedIndependentCandidateMarketCount).toBe(5);
    expect(initial.report.settlementCoverageShare).toBe(0);
    expect(initial.report.interpretationClassification).toBe("settlement-coverage-incomplete");
    expect(initial.report.outputPath).toContain("/settlement-snapshots/");

    files[initial.report.outputPath] = JSON.stringify(initial.report);

    const settled = [FIVE[0], FIVE[1]] as const;
    for (const ticker of settled) {
      files[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "no");
    }
    const partial = analyzePair(files, importDirsFor(settled), "run-a", "run-b", [
      "--imports-dir",
      "data/imports",
    ]);

    expect(partial.report.runSetHash).toBe(initial.report.runSetHash);
    expect(partial.report.settlementSnapshotHash).not.toBe(initial.report.settlementSnapshotHash);
    expect(partial.report.outputPath).not.toBe(initial.report.outputPath);
    expect(partial.report.settlementCoverageShare).toBe(0.4);
    expect(files[initial.report.outputPath]).toBe(JSON.stringify(initial.report));
    expect(partial.report.outputPath).toContain(
      `/settlement-snapshots/${partial.report.settlementSnapshotHash}/`,
    );
  });

  it("allows partial→sufficient coverage to leave settlement-coverage-incomplete", () => {
    const files: Record<string, string> = {};
    seedFiveUnresolved(files);
    const settled = [FIVE[0], FIVE[1], FIVE[2], FIVE[3]] as const;
    for (const ticker of settled) {
      files[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "no");
    }
    const result = analyzePair(files, importDirsFor(settled), "run-a", "run-b", [
      "--imports-dir",
      "data/imports",
    ]);
    expect(result.report.evaluatedIndependentCandidateMarketCount).toBe(5);
    expect(result.report.settlementCoverageShare).toBe(0.8);
    expect(result.report.interpretationClassification).not.toBe("insufficient-forward-events");
    expect(result.report.interpretationClassification).not.toBe("settlement-coverage-incomplete");
    expect(result.report.evaluatedExecutableCandidateCount).toBe(0);
    expect(result.report.grossReturnCents).toBeNull();
    expect(result.report.feeAdjustedReturnCents).toBeNull();
  });

  it("is idempotent for the same settlement snapshot state", () => {
    const files: Record<string, string> = {};
    seedFiveUnresolved(files);
    files[`data/imports/KXBTC15M/${FIVE[0]}/import-result.json`] = importResult(FIVE[0], "no");
    const dirs = importDirsFor([FIVE[0]]);
    const first = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    files[first.report.outputPath] = JSON.stringify({
      ...first.report,
      generatedAt: "2026-09-08T12:00:00.000Z",
      artifactGeneratedAt: "2026-09-08T12:00:00.000Z",
    });
    const second = analyzePair(files, dirs, "run-b", "run-a", ["--imports-dir", "data/imports"]);
    expect(second.report.runSetHash).toBe(first.report.runSetHash);
    expect(second.report.settlementSnapshotHash).toBe(first.report.settlementSnapshotHash);
    expect(second.report.outputPath).toBe(first.report.outputPath);
    expect(second.report.settlementCoverageShare).toBe(first.report.settlementCoverageShare);
  });

  it("fails closed on same snapshot identity with altered semantic body", () => {
    const files: Record<string, string> = {};
    seedFiveUnresolved(files);
    const first = analyzePair(files, [], "run-a", "run-b");
    files[first.report.outputPath] = JSON.stringify({
      ...first.report,
      interpretationClassification: "forward-supports-calibration-effect",
    });
    expectAnalyzeRejected(files, "run-a", "run-b", /different semantic body/);
  });

  it("keeps settlementSnapshotHash order-invariant for runs and candidate settlement order", () => {
    const filesA: Record<string, string> = {};
    const filesB: Record<string, string> = {};
    seedFiveUnresolved(filesA);
    seedFiveUnresolved(filesB);
    const settled = [FIVE[0], FIVE[1], FIVE[2]] as const;
    for (const ticker of settled) {
      filesA[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "no");
      filesB[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "no");
    }
    const left = analyzePair(filesA, importDirsFor(settled), "run-a", "run-b", [
      "--imports-dir",
      "data/imports",
    ]);
    const right = analyzePair(filesB, importDirsFor([...settled].reverse()), "run-b", "run-a", [
      "--imports-dir",
      "data/imports",
    ]);
    expect(left.report.runSetHash).toBe(right.report.runSetHash);
    expect(left.report.settlementSnapshotHash).toBe(right.report.settlementSnapshotHash);
  });

  it("ignores unrelated imported markets for settlementSnapshotHash", () => {
    const files: Record<string, string> = {};
    seedFiveUnresolved(files);
    files[`data/imports/KXBTC15M/${FIVE[0]}/import-result.json`] = importResult(FIVE[0], "no");
    const unrelated = "KXBTC15M-26SEP081200-00";
    const dirs = importDirsFor([FIVE[0], unrelated]);
    const withoutExtra = analyzePair({ ...files }, dirs, "run-a", "run-b", [
      "--imports-dir",
      "data/imports",
    ]);
    files[`data/imports/KXBTC15M/${unrelated}/import-result.json`] = importResult(unrelated, "yes");
    const withExtra = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    expect(withExtra.report.runSetHash).toBe(withoutExtra.report.runSetHash);
    expect(withExtra.report.settlementSnapshotHash).toBe(withoutExtra.report.settlementSnapshotHash);
    expect(withExtra.marketLines.join("\n")).not.toContain(unrelated);
  });

  it("changes settlementSnapshotHash when a relevant candidate settlement changes", () => {
    const files: Record<string, string> = {};
    seedFiveUnresolved(files);
    files[`data/imports/KXBTC15M/${FIVE[0]}/import-result.json`] = importResult(FIVE[0], "no");
    const dirs = importDirsFor([FIVE[0], FIVE[1]]);
    const first = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    files[`data/imports/KXBTC15M/${FIVE[1]}/import-result.json`] = importResult(FIVE[1], "yes");
    const second = analyzePair(files, dirs, "run-a", "run-b", ["--imports-dir", "data/imports"]);
    expect(second.report.runSetHash).toBe(first.report.runSetHash);
    expect(second.report.settlementSnapshotHash).not.toBe(first.report.settlementSnapshotHash);
  });

  it("preserves a legacy runSet-root artifact while publishing a settlement snapshot", () => {
    const files: Record<string, string> = {};
    seedFiveUnresolved(files);
    const initial = analyzePair(files, [], "run-a", "run-b");
    const legacyRoot =
      `data/research-results/calibration-fade-v2/cross-run/confirmatory/${initial.report.runSetHash}/`
      + "calibration-fade-v2-cross-run-validation.json";
    const legacyBody = JSON.stringify({
      ...initial.report,
      outputPath: legacyRoot,
      settlementSnapshotHash: undefined,
    });
    files[legacyRoot] = legacyBody;

    files[`data/imports/KXBTC15M/${FIVE[0]}/import-result.json`] = importResult(FIVE[0], "no");
    const next = analyzePair(files, importDirsFor([FIVE[0]]), "run-a", "run-b", [
      "--imports-dir",
      "data/imports",
    ]);

    expect(next.report.runSetHash).toBe(initial.report.runSetHash);
    expect(next.report.outputPath).toContain("/settlement-snapshots/");
    expect(next.report.outputPath).not.toBe(legacyRoot);
    expect(files[legacyRoot]).toBe(legacyBody);
  });

  it("rejects custom output paths outside the settlement-snapshot namespace", () => {
    const files: Record<string, string> = {};
    seedFiveUnresolved(files);
    seedFrozenConfigs(files);
    const io = createMemoryCalibrationFadeForwardValidationIo(files);
    expect(() =>
      analyzeCalibrationFadeV2CrossRun({
        config: parseCalibrationFadeV2CrossRunValidationArgv([
          "--capture-run-dir",
          "data/live-capture/forward-quotes/run-a",
          "--capture-run-dir",
          "data/live-capture/forward-quotes/run-b",
          "--evidence-mode",
          "confirmatory",
          "--output",
          "data/research-results/calibration-fade-cross-run-validation.json",
        ]),
        io,
        generatedAt: "2026-09-08T12:00:00.000Z",
      }),
    ).toThrow(/v1 canonical path|content-addressed|settlement-snapshots/);
  });

  it("preserves sealed entry identity fields across settlement overlay", () => {
    const files: Record<string, string> = {};
    const ticker = FIVE[0];
    seedAdmittedRun(files, "run-a", [
      market(ticker, {
        entryTimestamp: "2026-09-08T10:00:05.000Z",
        noAskCents: 48,
        executableAvailable: true,
      }),
      market(FIVE[1]),
      market(FIVE[2]),
    ]);
    seedAdmittedRun(files, "run-b", [market(FIVE[3]), market(FIVE[4])]);
    files[`data/imports/KXBTC15M/${ticker}/import-result.json`] = importResult(ticker, "no");
    const result = analyzePair(files, importDirsFor([ticker]), "run-a", "run-b", [
      "--imports-dir",
      "data/imports",
    ]);
    const canonical = JSON.parse(
      result.marketLines.find((line) => line.includes(ticker)) ?? "{}",
    ) as {
      selectedCanonicalEntry?: {
        entryTimestamp?: string;
        noAskCents?: number | null;
        executableAvailable?: boolean;
        settledOutcome?: string;
        grossReturnCents?: number | null;
        feeAdjustedReturnCents?: number | null;
      };
    };
    expect(canonical.selectedCanonicalEntry?.entryTimestamp).toBe("2026-09-08T10:00:05.000Z");
    expect(canonical.selectedCanonicalEntry?.noAskCents).toBe(48);
    expect(canonical.selectedCanonicalEntry?.executableAvailable).toBe(true);
    expect(canonical.selectedCanonicalEntry?.settledOutcome).toBe("no");
    expect(canonical.selectedCanonicalEntry?.grossReturnCents).toBeNull();
    expect(canonical.selectedCanonicalEntry?.feeAdjustedReturnCents).toBeNull();
  });
});
