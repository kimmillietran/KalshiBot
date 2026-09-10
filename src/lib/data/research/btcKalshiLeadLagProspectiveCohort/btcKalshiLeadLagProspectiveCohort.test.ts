import { describe, expect, it } from "vitest";

import {
  KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
  KNOWN_LEAD_LAG_TRAIN_RUN_ID,
  KNOWN_LEAD_LAG_VALIDATION_RUN_ID,
} from "../btcKalshiLeadLagEvidenceContract/leadLagEvidenceContractTypes";

import {
  assertNoEffectDrivenEarlyStopping,
  assertRunEligibleForProspectiveCohort,
  buildCollectionProgressArtifact,
  buildLeadLagProspectiveCohortReport,
  buildLeadLagProspectiveRunEvidence,
  computeFixedNProgress,
  computeProspectiveCohortIdentityHash,
  deduplicateProspectiveCohortUnits,
  LeadLagProspectiveCohortError,
  parseLeadLagProspectiveCohortArgv,
  serializeLeadLagProspectiveCohortJson,
} from "./index";
import type { LeadLagProspectiveRunEvidence } from "./leadLagProspectiveCohortTypes";

const CANDIDATE = "candidate-hash-abc";
const CONTRACT = "contract-hash-xyz";
const DESIGN = "replication-design-v1";
const FREEZE_ID = "synthetic-freeze-identity";
const FREEZE_TS = "2026-09-15T00:00:00.000Z";

function makeRun(input: {
  runId: string;
  marketDays: readonly string[];
  triggers: readonly string[];
  eligibleEvents?: number;
  captureStartMs?: number;
  captureEndMs?: number;
  qualityPassed?: boolean;
  candidateHash?: string;
  contractHash?: string;
  captureIdentity?: string;
  midpoint?: number | null;
}): LeadLagProspectiveRunEvidence {
  const start = input.captureStartMs ?? Date.parse("2026-09-16T00:00:00.000Z");
  const end = input.captureEndMs ?? start + 3_600_000;
  return buildLeadLagProspectiveRunEvidence({
    runId: input.runId,
    captureArtifactIdentity: input.captureIdentity ?? `capture-${input.runId}`,
    candidateDefinitionHash: input.candidateHash ?? CANDIDATE,
    prospectiveContractIdentity: input.contractHash ?? CONTRACT,
    replicationDesignIdentity: DESIGN,
    captureDurationHours: 1,
    captureQuality: {
      passed: input.qualityPassed ?? true,
      verdict: "ok",
      validBookShare: 0.99,
      btcJoinCoverageShare: 0.99,
      failureReasons: input.qualityPassed === false ? ["degraded"] : [],
    },
    btcTriggerCount: input.triggers.length,
    eligibleLockedCandidateEvents: input.eligibleEvents ?? input.marketDays.length,
    marketDayUnitIds: input.marketDays,
    btcTriggerUnitIds: input.triggers,
    midpointDiagnosticCents: input.midpoint ?? 1.5,
    executableEvidenceCents: 1.2,
    executionObservabilityShare: 0.9,
    captureWindowStartMs: start,
    captureWindowEndMs: end,
  });
}

function memoryIo(files: Record<string, string> = {}) {
  const store = { ...files };
  return {
    fileExists: (path: string) => path in store,
    readFile: (path: string) => store[path] ?? "",
    writeFile: (path: string, data: string) => {
      store[path] = data;
    },
    mkdirSync: () => {},
  };
}

const baseConfig = {
  candidateDefinitionHash: CANDIDATE,
  prospectiveContractIdentity: CONTRACT,
  replicationDesignIdentity: DESIGN,
  stoppingRuleIdentity: "fixed-n",
  requiredEffectiveN: 155,
  prospectiveFreezeIdentity: FREEZE_ID,
  prospectiveFreezeTimestampIso: FREEZE_TS,
  memberEvidencePaths: [] as string[],
  outputPath: "data/research-results/btc-kalshi-lead-lag/prospective-cohorts/test/cohort.json",
  htmlOutputPath: "data/reports/btc-kalshi-lead-lag/prospective-cohorts/test/cohort.html",
  progressOutputPath:
    "data/research-results/btc-kalshi-lead-lag/prospective-cohorts/test/progress.json",
};

describe("btcKalshiLeadLagProspectiveCohort", () => {
  it("1. historical discovery run rejected", () => {
    expect(() =>
      assertRunEligibleForProspectiveCohort({ runId: KNOWN_LEAD_LAG_TRAIN_RUN_ID })
    ).toThrow(/historical discovery run rejected/i);
  });

  it("2. historical validation run rejected", () => {
    expect(() =>
      assertRunEligibleForProspectiveCohort({ runId: KNOWN_LEAD_LAG_VALIDATION_RUN_ID })
    ).toThrow(/historical validation run rejected/i);
  });

  it("3. historical holdout run rejected", () => {
    expect(() =>
      assertRunEligibleForProspectiveCohort({ runId: KNOWN_LEAD_LAG_HOLDOUT_RUN_ID })
    ).toThrow(/historical holdout run rejected/i);
  });

  it("4. pre-freeze run rejected", () => {
    const run = makeRun({
      runId: "fresh-a",
      marketDays: ["M1:2026-09-10"],
      triggers: ["t1"],
      captureStartMs: Date.parse("2026-09-10T00:00:00.000Z"),
    });
    const report = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: {
        ...baseConfig,
        prospectiveFreezeIdentity: FREEZE_ID,
        prospectiveFreezeTimestampIso: FREEZE_TS,
      },
      injectedEvidence: [run],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(report.admittedRuns).toHaveLength(0);
    expect(report.rejectedAdmissions[0]?.reason).toMatch(/pre-freeze run rejected/i);
  });

  it("5-6. exact candidate and contract identity required", () => {
    const badCandidate = makeRun({
      runId: "fresh-b",
      marketDays: ["M1:2026-09-16"],
      triggers: ["t1"],
      candidateHash: "wrong",
    });
    const badContract = makeRun({
      runId: "fresh-c",
      marketDays: ["M2:2026-09-16"],
      triggers: ["t2"],
      contractHash: "wrong",
    });
    const report = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: baseConfig,
      injectedEvidence: [badCandidate, badContract],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(report.rejectedAdmissions.some((row) => /exact candidate identity required/i.test(row.reason)))
      .toBe(true);
    expect(report.rejectedAdmissions.some((row) => /exact contract identity required/i.test(row.reason)))
      .toBe(true);
  });

  it("7-8. duplicate run and duplicate artifact identity rejected", () => {
    const run = makeRun({
      runId: "fresh-d",
      marketDays: ["M1:2026-09-16"],
      triggers: ["t1"],
    });
    const dupRun = makeRun({
      runId: "fresh-d",
      marketDays: ["M2:2026-09-16"],
      triggers: ["t2"],
      captureIdentity: "other-capture",
    });
    const dupArtifact = {
      ...makeRun({
        runId: "fresh-e",
        marketDays: ["M3:2026-09-16"],
        triggers: ["t3"],
      }),
      artifactContentHash: run.artifactContentHash,
    };
    const report = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: baseConfig,
      injectedEvidence: [run, dupRun, dupArtifact],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(report.admittedRuns).toHaveLength(1);
    expect(report.rejectedAdmissions.some((row) => /duplicate run rejected/i.test(row.reason))).toBe(
      true,
    );
    expect(
      report.rejectedAdmissions.some((row) => /duplicate artifact identity rejected/i.test(row.reason)),
    ).toBe(true);
  });

  it("9-11. overlap dedupe; raw vs deduplicated ESS (smoke 10+12-2=20)", () => {
    // Construct unit sets so per-run ESS contributions are 10 and 12 with 2 shared market-days.
    const shared = ["SX:2026-09-16", "SY:2026-09-16"];
    const runADays = [
      ...shared,
      ...Array.from({ length: 8 }, (_, i) => `A${i}:2026-09-16`),
    ];
    const runBDays = [
      ...shared,
      ...Array.from({ length: 10 }, (_, i) => `B${i}:2026-09-16`),
    ];
    const runATriggers = Array.from({ length: 10 }, (_, i) => `ta${i}`);
    const runBTriggers = Array.from({ length: 12 }, (_, i) => `tb${i}`);

    const runA = makeRun({
      runId: "fresh-a",
      marketDays: runADays,
      triggers: runATriggers,
      eligibleEvents: 10,
      captureStartMs: Date.parse("2026-09-16T00:00:00.000Z"),
      captureEndMs: Date.parse("2026-09-16T04:00:00.000Z"),
    });
    const runB = makeRun({
      runId: "fresh-b",
      marketDays: runBDays,
      triggers: runBTriggers,
      eligibleEvents: 12,
      captureStartMs: Date.parse("2026-09-16T02:00:00.000Z"),
      captureEndMs: Date.parse("2026-09-16T06:00:00.000Z"),
    });

    expect(runA.essContribution).toBe(10);
    expect(runB.essContribution).toBe(12);

    const dedup = deduplicateProspectiveCohortUnits([runA, runB]);
    expect(dedup.rawPerRunEssSum).toBe(22);
    expect(dedup.duplicateOrDependentUnitsRemoved).toBeGreaterThanOrEqual(2);
    expect(dedup.deduplicatedCohortEss).toBe(20);
    expect(dedup.overlappingTimeRangePairs.length).toBe(1);

    const report = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: baseConfig,
      injectedEvidence: [runB, runA], // reverse FS order
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(report.dedup.rawPerRunEssSum).toBe(22);
    expect(report.dedup.deduplicatedCohortEss).toBe(20);
  });

  it("12-15. cohort identity changes with add/remove/modified evidence; order-invariant", () => {
    const a = makeRun({
      runId: "fresh-a",
      marketDays: ["M1:2026-09-16"],
      triggers: ["t1"],
    });
    const b = makeRun({
      runId: "fresh-b",
      marketDays: ["M2:2026-09-16"],
      triggers: ["t2"],
    });
    const idAB = computeProspectiveCohortIdentityHash({
      replicationDesignIdentity: DESIGN,
      candidateDefinitionHash: CANDIDATE,
      prospectiveContractIdentity: CONTRACT,
      memberEvidence: [a, b],
    });
    const idBA = computeProspectiveCohortIdentityHash({
      replicationDesignIdentity: DESIGN,
      candidateDefinitionHash: CANDIDATE,
      prospectiveContractIdentity: CONTRACT,
      memberEvidence: [b, a],
    });
    expect(idAB).toBe(idBA);

    const idA = computeProspectiveCohortIdentityHash({
      replicationDesignIdentity: DESIGN,
      candidateDefinitionHash: CANDIDATE,
      prospectiveContractIdentity: CONTRACT,
      memberEvidence: [a],
    });
    expect(idA).not.toBe(idAB);

    const modified = makeRun({
      runId: "fresh-b",
      marketDays: ["M2:2026-09-16", "M9:2026-09-16"],
      triggers: ["t2", "t9"],
      eligibleEvents: 2,
    });
    const idModified = computeProspectiveCohortIdentityHash({
      replicationDesignIdentity: DESIGN,
      candidateDefinitionHash: CANDIDATE,
      prospectiveContractIdentity: CONTRACT,
      memberEvidence: [a, modified],
    });
    expect(idModified).not.toBe(idAB);
  });

  it("16. poor capture quality prevents admission", () => {
    const bad = makeRun({
      runId: "fresh-bad",
      marketDays: ["M1:2026-09-16"],
      triggers: ["t1"],
      qualityPassed: false,
    });
    const report = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: baseConfig,
      injectedEvidence: [bad],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(report.admittedRuns).toHaveLength(0);
    expect(report.rejectedAdmissions[0]?.reason).toMatch(/poor capture quality prevents admission/i);
  });

  it("17-18. compact auditable evidence + streaming mode", () => {
    const run = makeRun({
      runId: "fresh-g",
      marketDays: ["M1:2026-09-16"],
      triggers: ["t1"],
    });
    expect(run.processingMode).toBe("streaming-bounded-memory");
    expect(run.artifactContentHash.length).toBe(64);
    expect(run.independentUnitRecords.length).toBeGreaterThan(0);
    expect(run.midpointDiagnosticCents).not.toBeNull();
  });

  it("19-20. collection progress without effect; fixed-N depends only on ESS", () => {
    const progress = buildCollectionProgressArtifact({
      cohortIdentityHash: "cohort",
      memberRunIds: ["fresh-a", "fresh-b"],
      captureHoursCollected: 8,
      eligibleIncidenceTotal: 40,
      rawPerRunEssSum: 22,
      deduplicatedCohortEss: 20,
      duplicateOrDependentUnitsRemoved: 2,
      requiredEffectiveN: 155,
    });
    expect(progress.effectFieldsPresent).toBe(false);
    expect(progress.pValueFieldsPresent).toBe(false);
    expect(progress.fixedNProgress.currentEffectiveN).toBe(20);
    expect(progress.fixedNProgress.remainingEffectiveN).toBe(135);
    expect(progress.fixedNProgress.completed).toBe(false);

    const done = computeFixedNProgress({
      requiredEffectiveN: 20,
      currentEffectiveN: 20,
    });
    expect(done.completed).toBe(true);
  });

  it("21. p-value/effect cannot trigger early stopping", () => {
    expect(() =>
      assertNoEffectDrivenEarlyStopping({ proposedStopReason: "p-value-threshold" })
    ).toThrow(LeadLagProspectiveCohortError);
    expect(() =>
      assertNoEffectDrivenEarlyStopping({ effectCents: 5, pValue: 0.01 })
    ).toThrow(/cannot trigger early stopping/i);
  });

  it("22-26. quarantine: no promotion/preregistration/freeze/capture/live orders", () => {
    const run = makeRun({
      runId: "fresh-h",
      marketDays: ["M1:2026-09-16"],
      triggers: ["t1"],
    });
    const report = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: baseConfig,
      injectedEvidence: [run],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(report.quarantine).toEqual({
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      prospectiveFreezeCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
      historicalRunsAdmittedAsProspective: false,
      thresholdsRetuned: false,
      candidateChanged: false,
    });
    expect(report.finalEvaluationBoundary.status).toBe("not-evaluated");
  });

  it("27. no latest/mtime semantics", () => {
    expect(() => parseLeadLagProspectiveCohortArgv(["--latest"])).toThrow(
      LeadLagProspectiveCohortError,
    );
    expect(() => parseLeadLagProspectiveCohortArgv(["--mtime"])).toThrow(
      LeadLagProspectiveCohortError,
    );
  });

  it("historical lineage runs never admitted even if evidence fabricated", () => {
    const historical = makeRun({
      runId: KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
      marketDays: ["M1:2026-09-16"],
      triggers: ["t1"],
    });
    const report = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: baseConfig,
      injectedEvidence: [historical],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(report.admittedRuns).toHaveLength(0);
    expect(report.quarantine.historicalRunsAdmittedAsProspective).toBe(false);
  });

  it("deterministic serialization", () => {
    const run = makeRun({
      runId: "fresh-i",
      marketDays: ["M1:2026-09-16"],
      triggers: ["t1"],
    });
    const a = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: baseConfig,
      injectedEvidence: [run],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    const b = buildLeadLagProspectiveCohortReport({
      io: memoryIo(),
      config: baseConfig,
      injectedEvidence: [run],
      generatedAt: "2026-09-20T00:00:00.000Z",
    });
    expect(a.cohortIdentityHash).toBe(b.cohortIdentityHash);
    expect(serializeLeadLagProspectiveCohortJson(a)).toBe(
      serializeLeadLagProspectiveCohortJson(b),
    );
  });
});
