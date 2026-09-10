import { describe, expect, it } from "vitest";

import type { BtcKalshiLeadLagAnalysisReport, LeadLagEventRecord } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import { createMemoryBtcKalshiLeadLagIo } from "../btcKalshiLeadLagAnalysis/createBtcKalshiLeadLagAnalysisIo";
import { hashCandidateDefinition } from "../btcKalshiLeadLagEvidenceContract/holdoutContract";
import { buildLeadLagStatisticalUnitContract } from "../btcKalshiLeadLagEvidenceContract/statisticalUnit";
import type { LeadLagFrozenCandidateDefinition } from "../btcKalshiLeadLagValidation/leadLagValidationTypes";

import { buildLeadLagHoldoutReport } from "./buildLeadLagHoldoutReport";
import {
  classifyHoldoutVerdict,
  computeHoldoutPowerResult,
} from "./classifyHoldoutVerdict";
import { createHoldoutGatedLeadLagIo } from "./createHoldoutGatedLeadLagIo";
import {
  assertNoCandidateMutation,
  assertOnlyLockedCandidateRequested,
  assertSearchGridNotRerun,
  evaluateLockedCandidateOnHoldoutEvents,
} from "./evaluateLockedHoldoutCandidate";
import {
  LeadLagHoldoutError,
  type LeadLagHoldoutConfig,
} from "./leadLagHoldoutTypes";
import { parseLeadLagHoldoutArgv } from "./parseLeadLagHoldoutArgv";
import { serializeLeadLagHoldoutReport } from "./serializeLeadLagHoldout";

const DISCOVERY_ID = "a4b5fd8a50bd04207f1041846f30a4f7d9f07bf34b03ddf12e293a2278520a24";
const SPLIT_HASH = "c0a38fee02c5bcbc9b6dd7d61ec1d5f3ea5397c965842af6e90cb686ab4d43c6";
const VALIDATION_ID = "d87619c312e0e3e2341d98f68a7742addd623446e6fce11d9f4ea39699488fe0";
const VALIDATION_CONTRACT_HASH =
  "40ad227615588c75888a72b5bca4524bc1a175592674e9a846178f41bd3ead31";
const HOLDOUT_DIR =
  "/Users/builder/Desktop/KalshiBot/data/live-capture/forward-quotes/2026-09-09T20-37-36-719Z";
const TRAIN_DIR =
  "/Users/builder/Desktop/KalshiBot/data/live-capture/forward-quotes/2026-09-08T07-46-44-416Z";
const VALIDATION_DIR =
  "/Users/builder/Desktop/KalshiBot/data/live-capture/forward-quotes/2026-09-09T06-39-04-259Z";

const LOCKED_DEF: LeadLagFrozenCandidateDefinition = {
  candidateId: "30000|60000|5-to-10-bps|5-to-10-minutes|70-to-90-percent|reverse-btc",
  hypothesisId: "30000|60000|5-to-10-bps|5-to-10-minutes|70-to-90-percent|reverse-btc",
  discoveryRank: 2,
  direction: "reverse-btc",
  btcMoveHorizonMs: 30_000,
  responseWindowMs: 60_000,
  btcMagnitudeBin: "5-to-10-bps",
  timeRemainingBin: "5-to-10-minutes",
  impliedProbabilityBin: "70-to-90-percent",
  trainEligibleMarketTriggerCount: 18,
  trainIndependentMarketCount: 10,
  trainIndependentMarketDayCount: 10,
  trainMedianSignedMidResponseCents: 6.75,
  trainExecutableObservabilityShare: 0.94,
  trainUniqueBtcTriggerCount: 18,
};

const OTHER_SURVIVOR =
  "60000|60000|5-to-10-bps|5-to-10-minutes|50-to-70-percent|reverse-btc";

function lockedHash(): string {
  return hashCandidateDefinition({
    hypothesisId: LOCKED_DEF.hypothesisId,
    btcMoveHorizonMs: LOCKED_DEF.btcMoveHorizonMs,
    responseWindowMs: LOCKED_DEF.responseWindowMs,
    btcMagnitudeBin: LOCKED_DEF.btcMagnitudeBin,
    timeRemainingBin: LOCKED_DEF.timeRemainingBin,
    impliedProbabilityBin: LOCKED_DEF.impliedProbabilityBin,
    direction: LOCKED_DEF.direction,
  });
}

function makeDiscoveryReport() {
  return {
    analysisVersion: "m12.8a-btc-kalshi-lead-lag-governed-discovery-v1",
    discoveryIdentityHash: DISCOVERY_ID,
    discoveryIsolationStatus: "train-only-discovery",
    splitManifestHash: SPLIT_HASH,
    searchUniverse: { hypothesisCount: 9600 },
    multiplicityDeclaration: "9600 discovery hypotheses",
    splitManifest: {
      splitVersion: "lead-lag-research-split-v1",
      confirmatoryReuseForbidden: true,
      splitManifestHash: SPLIT_HASH,
      train: {
        runId: "2026-09-08T07-46-44-416Z",
        captureRunDir: TRAIN_DIR,
        durationHours: 8,
        nativeCaptureVerdict: "ok",
        researchAuditVerdict: "ok",
        identityHash: "train-id",
      },
      validation: {
        runId: "2026-09-09T06-39-04-259Z",
        captureRunDir: VALIDATION_DIR,
        durationHours: 8,
        nativeCaptureVerdict: "ok",
        researchAuditVerdict: "ok",
        identityHash: "val-id",
      },
      holdout: {
        runId: "2026-09-09T20-37-36-719Z",
        captureRunDir: HOLDOUT_DIR,
        durationHours: 4,
        nativeCaptureVerdict: "degraded-capture",
        researchAuditVerdict: "ok",
        identityHash: "hold-id",
      },
    },
  };
}

function makeValidationReport(overrides: Record<string, unknown> = {}) {
  return {
    analysisVersion: "btc-kalshi-lead-lag-validation-v1",
    validationIdentityHash: VALIDATION_ID,
    validationContractHash: VALIDATION_CONTRACT_HASH,
    discoveryIdentity: DISCOVERY_ID,
    splitManifestHash: SPLIT_HASH,
    validationOverallStatus: "one-candidate-locked-for-holdout",
    survivingCandidateCount: 3,
    holdoutRunId: "2026-09-09T20-37-36-719Z",
    holdoutOutcomeAccessed: false,
    lockedHoldoutCandidate: {
      candidateId: LOCKED_DEF.candidateId,
      hypothesisId: LOCKED_DEF.hypothesisId,
      exactDefinition: LOCKED_DEF,
      lockReason: ["tie-break"],
      tieBreakScoreComponents: {},
    },
    candidateResults: [
      { hypothesisId: OTHER_SURVIVOR, validationStatus: "validated" },
      { hypothesisId: LOCKED_DEF.hypothesisId, validationStatus: "validated" },
    ],
    ...overrides,
  };
}

function discoveryPath(): string {
  return `data/research-results/btc-kalshi-lead-lag/discovery/${DISCOVERY_ID}/lead-lag-governed-discovery.json`;
}
function validationPath(): string {
  return `data/research-results/btc-kalshi-lead-lag/validation/${VALIDATION_ID}/lead-lag-validation.json`;
}

function baseConfig(overrides: Partial<LeadLagHoldoutConfig> = {}): LeadLagHoldoutConfig {
  return {
    discoveryIdentityHash: DISCOVERY_ID,
    discoveryReportPath: discoveryPath(),
    validationIdentityHash: VALIDATION_ID,
    validationReportPath: validationPath(),
    expectedSplitManifestHash: SPLIT_HASH,
    expectedValidationContractHash: VALIDATION_CONTRACT_HASH,
    holdoutCaptureRunDir: HOLDOUT_DIR,
    outcomeStandardDeviationCents: 10,
    outputPath: "data/research-results/btc-kalshi-lead-lag/holdout/test/lead-lag-holdout.json",
    htmlOutputPath: "data/reports/btc-kalshi-lead-lag/holdout/test/lead-lag-holdout.html",
    ...overrides,
  };
}

function makeEvent(input: {
  marketTicker: string;
  triggerTimestampMs: number;
  mid: number;
  ask: number;
  horizonMs?: number;
  windowMs?: number;
  mag?: string;
  time?: string;
  prob?: string;
}): LeadLagEventRecord {
  return {
    eventId: `${input.marketTicker}-${input.triggerTimestampMs}`,
    selectedRunId: "2026-09-09T20-37-36-719Z",
    marketTicker: input.marketTicker,
    triggerTimestampMs: input.triggerTimestampMs,
    btcMoveHorizonMs: input.horizonMs ?? 30_000,
    btcReturnBps: 7,
    btcMagnitudeBin: input.mag ?? "5-to-10-bps",
    btcDirection: "up",
    thresholdCrossed: false,
    timeRemainingBin: input.time ?? "5-to-10-minutes",
    impliedProbabilityBin: input.prob ?? "70-to-90-percent",
    contractDirectionResolved: true,
    yesMidCentsAtTrigger: 80,
    spreadAtTrigger: 2,
    quoteAgeMsAtTrigger: 100,
    responses: [
      {
        responseWindowMs: input.windowMs ?? 60_000,
        yesMidChangeCents: input.mid,
        signedYesMidResponseCents: input.mid,
        signedYesBidResponseCents: input.mid,
        signedYesAskResponseCents: input.ask,
        directionallyCorrect: input.mid > 0,
        lagResponseState: "responded",
        spreadChangeCents: 0,
        quoteAgeMs: 100,
      },
      {
        responseWindowMs: 5_000,
        yesMidChangeCents: 0.1,
        signedYesMidResponseCents: 0.1,
        signedYesBidResponseCents: 0.1,
        signedYesAskResponseCents: 0.1,
        directionallyCorrect: true,
        lagResponseState: "responded",
        spreadChangeCents: 0,
        quoteAgeMs: 100,
      },
    ],
    dataQualityCaveats: [],
  } as unknown as LeadLagEventRecord;
}

function makeAnalysis(overrides: Partial<BtcKalshiLeadLagAnalysisReport> = {}): BtcKalshiLeadLagAnalysisReport {
  return {
    selectedRunId: "2026-09-09T20-37-36-719Z",
    recordsScanned: 1000,
    btcRecordsScanned: 500,
    triggerCount: 40,
    suppressedOverlappingTriggerCount: 0,
    warnings: [],
    selectedRunQuality: {
      selectedRunId: "2026-09-09T20-37-36-719Z",
      validBookShare: 0.95,
      btcJoinCoverageShare: 0.97,
      bidSizeCoverageShare: 0.9,
      runDurationSeconds: 14_400,
      reconnectCount: 0,
      sequenceGapCount: 0,
      captureVerdict: "ok",
      captureHealthSource: "run-scoped",
    },
    ...overrides,
  } as unknown as BtcKalshiLeadLagAnalysisReport;
}

function makeIo(files: Record<string, string> = {}) {
  return createMemoryBtcKalshiLeadLagIo(
    {
      [discoveryPath()]: JSON.stringify(makeDiscoveryReport()),
      [validationPath()]: JSON.stringify(makeValidationReport()),
      ...files,
    },
    [
      HOLDOUT_DIR,
      "data/research-results/btc-kalshi-lead-lag/holdout/test",
      "data/reports/btc-kalshi-lead-lag/holdout/test",
    ],
  );
}

describe("btcKalshiLeadLagHoldout", () => {
  it("1. exactly one validation-locked candidate required", () => {
    expect(() =>
      assertOnlyLockedCandidateRequested({
        requestedHypothesisIds: [LOCKED_DEF.hypothesisId, OTHER_SURVIVOR],
        lockedHypothesisId: LOCKED_DEF.hypothesisId,
      })
    ).toThrow(/exactly one/i);
  });

  it("2-4. discovery/validation/evidence identity must match", async () => {
    const io = makeIo({
      [validationPath()]: JSON.stringify(
        makeValidationReport({ discoveryIdentity: "wrong" }),
      ),
    });
    await expect(
      buildLeadLagHoldoutReport({
        io,
        config: baseConfig(),
        injectedHoldoutAnalysis: { analysis: makeAnalysis(), events: [] },
      }),
    ).rejects.toThrow(/discoveryIdentity mismatch/i);
  });

  it("5. candidate mutation fails closed", () => {
    expect(() =>
      assertNoCandidateMutation({
        locked: LOCKED_DEF,
        proposed: { ...LOCKED_DEF, btcMagnitudeBin: "10-to-20-bps" },
      })
    ).toThrow(/candidate mutation fails closed/i);
  });

  it("6. horizon mutation fails closed", () => {
    expect(() =>
      assertNoCandidateMutation({
        locked: LOCKED_DEF,
        proposed: { ...LOCKED_DEF, btcMoveHorizonMs: 15_000 },
      })
    ).toThrow(/horizon mutation fails closed/i);
  });

  it("7. direction mutation fails closed", () => {
    expect(() =>
      assertNoCandidateMutation({
        locked: LOCKED_DEF,
        proposed: { ...LOCKED_DEF, direction: "follow-btc" },
      })
    ).toThrow(/direction mutation fails closed/i);
  });

  it("8-9. additional / unselected survivor cannot enter holdout", () => {
    expect(() =>
      assertOnlyLockedCandidateRequested({
        requestedHypothesisIds: [OTHER_SURVIVOR],
        lockedHypothesisId: LOCKED_DEF.hypothesisId,
      })
    ).toThrow(/unselected validation survivor cannot enter holdout/i);
  });

  it("10. search grid cannot rerun in holdout mode", () => {
    expect(() => assertSearchGridNotRerun("full-grid")).toThrow(
      /search grid cannot rerun/i,
    );
  });

  it("11. Run 3 is not read until contract/identity validation succeeds", () => {
    const base = makeIo();
    const gated = createHoldoutGatedLeadLagIo({
      baseIo: base,
      holdoutCaptureRunDir: HOLDOUT_DIR,
    });
    expect(() => gated.io.fileExists(HOLDOUT_DIR)).toThrow(
      /refused until lineage\/contract binding succeeds/i,
    );
    gated.authorizeHoldoutOutcomeAccess();
    expect(gated.io.fileExists(HOLDOUT_DIR)).toBe(true);
  });

  it("12. capture-quality failure blocks inference", () => {
    const metrics = evaluateLockedCandidateOnHoldoutEvents({
      events: [
        makeEvent({
          marketTicker: "M1",
          triggerTimestampMs: 1,
          mid: -5,
          ask: -4,
        }),
      ],
      lockedDefinition: LOCKED_DEF,
    });
    // reverse-btc flips sign: mid -5 → +5
    const power = computeHoldoutPowerResult({
      metrics,
      alpha: 0.05,
      targetPower: 0.8,
      materialEffectThresholdCents: 2,
      outcomeStandardDeviationCents: 10,
    });
    const classified = classifyHoldoutVerdict({
      qualityPassed: false,
      qualityFailureReasons: ["validBookShare too low"],
      metrics,
      power,
    });
    expect(classified.holdoutStatisticalVerdict).toBe("capture-quality-failure");
    expect(classified.recommendedNextAction).toBe("invalid-holdout-evidence");
  });

  it("13. statistical unit follows PR #71", () => {
    expect(buildLeadLagStatisticalUnitContract().primaryIndependentUnit).toBe(
      "market-day-block",
    );
  });

  it("14. raw event count is not automatically ESS", () => {
    const day = Date.parse("2026-09-09T12:00:00.000Z");
    const events = Array.from({ length: 10 }, (_, index) =>
      makeEvent({
        marketTicker: "SAME",
        triggerTimestampMs: day + index,
        mid: -3,
        ask: -3,
      }),
    );
    const metrics = evaluateLockedCandidateOnHoldoutEvents({
      events,
      lockedDefinition: LOCKED_DEF,
    });
    expect(metrics.rawEligibleEventCount).toBe(10);
    expect(metrics.effectiveSampleSize).toBeLessThan(metrics.rawEligibleEventCount);
    expect(metrics.independentMarketDayCount).toBe(1);
  });

  it("15-16. midpoint cannot substitute; inadequate exec obs blocks economic support", () => {
    const metrics = evaluateLockedCandidateOnHoldoutEvents({
      events: [
        makeEvent({
          marketTicker: "M1",
          triggerTimestampMs: 1,
          mid: -8,
          ask: 0,
        }),
      ],
      lockedDefinition: LOCKED_DEF,
    });
    // Force high ESS by faking metrics for classification path.
    const padded = {
      ...metrics,
      rawEligibleEventCount: 200,
      effectiveSampleSize: 200,
      holdoutEffectCents: 8,
      executableObservabilityShare: 0.01,
    };
    const power = computeHoldoutPowerResult({
      metrics: padded,
      alpha: 0.05,
      targetPower: 0.8,
      materialEffectThresholdCents: 2,
      outcomeStandardDeviationCents: 10,
    });
    expect(power.clearsMde).toBe(true);
    const classified = classifyHoldoutVerdict({
      qualityPassed: true,
      qualityFailureReasons: [],
      metrics: padded,
      power,
    });
    expect(classified.holdoutStatisticalVerdict).toBe("reject");
    expect(classified.rationale.some((line) => /Midpoint cannot substitute/i.test(line))).toBe(
      true,
    );
  });

  it("17. underpowered status remains underpowered", () => {
    const metrics = evaluateLockedCandidateOnHoldoutEvents({
      events: [
        makeEvent({ marketTicker: "M1", triggerTimestampMs: 1, mid: -8, ask: -8 }),
        makeEvent({ marketTicker: "M2", triggerTimestampMs: 2, mid: -7, ask: -7 }),
      ],
      lockedDefinition: LOCKED_DEF,
    });
    const power = computeHoldoutPowerResult({
      metrics,
      alpha: 0.05,
      targetPower: 0.8,
      materialEffectThresholdCents: 2,
      outcomeStandardDeviationCents: 10,
    });
    expect(power.isUnderpowered).toBe(true);
    const classified = classifyHoldoutVerdict({
      qualityPassed: true,
      qualityFailureReasons: [],
      metrics,
      power,
    });
    expect(classified.holdoutStatisticalVerdict).toBe("underpowered");
  });

  it("18. MDE failure cannot become support", () => {
    const metrics = {
      ...evaluateLockedCandidateOnHoldoutEvents({
        events: [
          makeEvent({ marketTicker: "M1", triggerTimestampMs: 1, mid: -0.2, ask: -0.2 }),
        ],
        lockedDefinition: LOCKED_DEF,
      }),
      rawEligibleEventCount: 200,
      effectiveSampleSize: 200,
      holdoutEffectCents: 0.2,
      executableObservabilityShare: 0.9,
    };
    const power = computeHoldoutPowerResult({
      metrics,
      alpha: 0.05,
      targetPower: 0.8,
      materialEffectThresholdCents: 2,
      outcomeStandardDeviationCents: 10,
    });
    expect(power.clearsMde).toBe(false);
    expect(power.isUnderpowered).toBe(false);
    const classified = classifyHoldoutVerdict({
      qualityPassed: true,
      qualityFailureReasons: [],
      metrics,
      power,
    });
    expect(classified.holdoutStatisticalVerdict).toBe("reject");
  });

  it("19. multiplicity lineage remains 9600→5→1", async () => {
    const io = makeIo();
    const events = Array.from({ length: 5 }, (_, index) =>
      makeEvent({
        marketTicker: `M${index}`,
        triggerTimestampMs: Date.parse("2026-09-09T12:00:00.000Z") + index * 60_000,
        mid: -1,
        ask: -1,
      }),
    );
    const report = await buildLeadLagHoldoutReport({
      io,
      config: baseConfig(),
      injectedHoldoutAnalysis: { analysis: makeAnalysis(), events },
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.lineage.lineageSummary).toBe("9600 → 5 → 1 → 1");
    expect(report.multiplicityDesign.discoveryHypothesisCount).toBe(9600);
    expect(report.candidatesEvaluatedCount).toBe(1);
  });

  it("20. no latest/mtime selection", () => {
    expect(() => parseLeadLagHoldoutArgv(["--latest"])).toThrow(LeadLagHoldoutError);
    expect(() => parseLeadLagHoldoutArgv(["--mtime"])).toThrow(LeadLagHoldoutError);
  });

  it("21. deterministic artifact identity", async () => {
    const io = makeIo();
    const events = [
      makeEvent({ marketTicker: "M1", triggerTimestampMs: 1, mid: -1, ask: -1 }),
    ];
    const a = await buildLeadLagHoldoutReport({
      io,
      config: baseConfig(),
      injectedHoldoutAnalysis: { analysis: makeAnalysis(), events },
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const b = await buildLeadLagHoldoutReport({
      io,
      config: baseConfig(),
      injectedHoldoutAnalysis: { analysis: makeAnalysis(), events },
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(a.holdoutIdentityHash).toBe(b.holdoutIdentityHash);
    expect(serializeLeadLagHoldoutReport(a)).toBe(serializeLeadLagHoldoutReport(b));
    expect(a.lockedCandidateDefinitionHash).toBe(lockedHash());
  });

  it("22-26. no promotion / preregistration / freeze / capture / live orders", async () => {
    const io = makeIo();
    const report = await buildLeadLagHoldoutReport({
      io,
      config: baseConfig(),
      injectedHoldoutAnalysis: {
        analysis: makeAnalysis(),
        events: [
          makeEvent({ marketTicker: "M1", triggerTimestampMs: 1, mid: -1, ask: -1 }),
        ],
      },
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.quarantine.promotionArtifactCreated).toBe(false);
    expect(report.quarantine.preregistrationArtifactCreated).toBe(false);
    expect(report.quarantine.frozenHypothesisCreated).toBe(false);
    expect(report.quarantine.captureStarted).toBe(false);
    expect(report.quarantine.liveOrdersExecuted).toBe(false);
    expect(report.otherValidationSurvivorsInspectedOnHoldout).toBe(false);
    expect(report.searchGridRerun).toBe(false);
    expect(report.parameterRetuningOccurred).toBe(false);
    expect(report.promotionEligibilityNote).toMatch(/promotion must remain impossible/i);
  });

  it("validation contract hash must match when provided", async () => {
    await expect(
      buildLeadLagHoldoutReport({
        io: makeIo(),
        config: baseConfig({ expectedValidationContractHash: "deadbeef" }),
        injectedHoldoutAnalysis: { analysis: makeAnalysis(), events: [] },
      }),
    ).rejects.toThrow(/Validation contract hash mismatch/i);
  });

  it("alternate response windows do not inflate locked-cell N", () => {
    const metrics = evaluateLockedCandidateOnHoldoutEvents({
      events: [
        makeEvent({ marketTicker: "M1", triggerTimestampMs: 1, mid: -2, ask: -2 }),
      ],
      lockedDefinition: LOCKED_DEF,
    });
    expect(metrics.rawEligibleEventCount).toBe(1);
  });
});
