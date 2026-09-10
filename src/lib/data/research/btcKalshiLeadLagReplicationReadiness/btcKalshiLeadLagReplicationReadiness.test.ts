import { describe, expect, it } from "vitest";

import { rejectOptionalStoppingWithoutSequentialDesign } from "../btcKalshiLeadLagEvidenceContract/stoppingRules";
import { hashCandidateDefinition } from "../btcKalshiLeadLagEvidenceContract/holdoutContract";
import { createMemoryBtcKalshiLeadLagIo } from "../btcKalshiLeadLagAnalysis/createBtcKalshiLeadLagAnalysisIo";

import {
  buildCaptureHourScenarios,
  buildIncidenceRateScenarios,
  buildIncidenceRow,
  buildLeadLagReplicationReadinessReport,
  buildProjectedHoursToRequiredN,
  computeCandidateEss,
  loadReplicationLineageArtifacts,
  projectHoursToRequiredN,
  recommendFixedNStoppingRule,
  rejectRawQuoteCountAsStatisticalN,
} from "./index";
import type { LoadedReplicationLineage } from "./loadReplicationLineageArtifacts";

const DISCOVERY_ID = "a4b5fd8a50bd04207f1041846f30a4f7d9f07bf34b03ddf12e293a2278520a24";
const VALIDATION_ID = "d87619c312e0e3e2341d98f68a7742addd623446e6fce11d9f4ea39699488fe0";
const HOLDOUT_ID = "6d8df318342d2e8c274f43ee9c5b9259bf620266ab6c2d9716ce85d1ca288756";
const EVIDENCE_ID = "ed60f336af8517abe536d5642b9875e8dd26dddb0eaf6db9302368f75203ae38";
const SPLIT_HASH = "c0a38fee02c5bcbc9b6dd7d61ec1d5f3ea5397c965842af6e90cb686ab4d43c6";
const CANDIDATE_ID =
  "30000|60000|5-to-10-bps|5-to-10-minutes|70-to-90-percent|reverse-btc";

const LOCKED_DEF = {
  candidateId: CANDIDATE_ID,
  hypothesisId: CANDIDATE_ID,
  discoveryRank: 2 as const,
  direction: "reverse-btc" as const,
  btcMoveHorizonMs: 30_000,
  responseWindowMs: 60_000,
  btcMagnitudeBin: "5-to-10-bps" as const,
  timeRemainingBin: "5-to-10-minutes" as const,
  impliedProbabilityBin: "70-to-90-percent" as const,
  trainEligibleMarketTriggerCount: 18,
  trainIndependentMarketCount: 10,
  trainIndependentMarketDayCount: 10,
  trainMedianSignedMidResponseCents: 6.75,
  trainExecutableObservabilityShare: 0.9444444444444444,
  trainUniqueBtcTriggerCount: 18,
};

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

function makeLineage(): LoadedReplicationLineage {
  const lockedCandidateDefinitionHash = lockedHash();
  return {
    lockedCandidateDefinitionHash,
    discovery: {
      discoveryIdentityHash: DISCOVERY_ID,
      splitManifestHash: SPLIT_HASH,
      incidence: { trainCaptureHours: 8 },
      candidates: [
        {
          hypothesisId: CANDIDATE_ID,
          cellId: "30000|60000|5-to-10-bps|5-to-10-minutes|70-to-90-percent",
          eligibleMarketTriggerCount: 18,
          independentMarketCount: 10,
          independentMarketDayCount: 10,
          uniqueBtcTriggerCount: 18,
        },
      ],
      splitManifest: {
        train: { runId: "2026-09-08T07-46-44-416Z", durationHours: 8 },
        validation: { runId: "2026-09-09T06-39-04-259Z", durationHours: 8 },
      },
    } as never,
    validation: {
      validationIdentityHash: VALIDATION_ID,
      discoveryIdentity: DISCOVERY_ID,
      validationRunId: "2026-09-09T06-39-04-259Z",
      incidence: { validationCaptureHours: 8 },
      lockedHoldoutCandidate: {
        candidateId: CANDIDATE_ID,
        hypothesisId: CANDIDATE_ID,
        exactDefinition: LOCKED_DEF,
        lockReason: ["fixture"],
        tieBreakScoreComponents: {},
      },
      candidateResults: [
        {
          candidateId: CANDIDATE_ID,
          hypothesisId: CANDIDATE_ID,
          validationEventCount: 29,
          independentMarketCount: 14,
          independentMarketDayCount: 14,
          uniqueBtcTriggerCount: 29,
          validationStatus: "validated",
        },
        {
          candidateId: "other|survivor",
          hypothesisId: "other|survivor",
          validationEventCount: 99,
          independentMarketCount: 50,
          independentMarketDayCount: 50,
          uniqueBtcTriggerCount: 99,
          validationStatus: "validated",
        },
      ],
      splitManifest: {
        validation: { durationHours: 8 },
      },
    } as never,
    holdout: {
      holdoutIdentityHash: HOLDOUT_ID,
      discoveryIdentity: DISCOVERY_ID,
      validationIdentity: VALIDATION_ID,
      evidenceContractIdentity: EVIDENCE_ID,
      lockedCandidateId: CANDIDATE_ID,
      lockedCandidateDefinitionHash,
      holdoutRunId: "2026-09-09T20-37-36-719Z",
      holdoutStatisticalVerdict: "underpowered",
      holdoutOverallStatus: "holdout-underpowered",
      recommendedNextAction: "insufficient-holdout-evidence",
      captureQuality: { durationHours: 4, qualityPassed: true },
      candidateMetrics: {
        lockedCandidateId: CANDIDATE_ID,
        lockedCandidateDefinitionHash,
        exactDefinition: LOCKED_DEF,
        rawEligibleEventCount: 4,
        uniqueBtcTriggerCount: 4,
        independentMarketCount: 3,
        independentMarketDayCount: 3,
        effectiveSampleSize: 3,
        holdoutEffectCents: -4.5,
        executableAskEffectCents: -4.5,
      },
      power: {
        alpha: 0.05,
        targetPower: 0.8,
        materialEffectThresholdCents: 2,
        outcomeStandardDeviationCents: 10,
        requiredEvidence: 155,
        effectiveSampleSize: 3,
        minimumDetectableEffect: 14.355669,
        clearsMde: false,
        isUnderpowered: true,
        observedPrimaryEffectCents: -4.5,
      },
      warnings: [],
    } as never,
  };
}

describe("btcKalshiLeadLagReplicationReadiness", () => {
  it("1. historical Runs 1–3 cannot count as fresh prospective N", () => {
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.freshProspectiveEffectiveNStartsAt).toBe(0);
    expect(report.confirmatoryReuseForbiddenForHistoricalRuns).toBe(true);
    expect(report.quarantine.historicalNCountedAsFreshEvidence).toBe(false);
    for (const row of report.historicalIncidenceByRun) {
      expect(row.countsTowardFreshProspectiveN).toBe(false);
    }
  });

  it("2-5. required N/alpha/power/MDE remain unchanged", () => {
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.requiredFreshEffectiveN).toBe(155);
    expect(report.powerContract.requiredEffectiveN).toBe(155);
    expect(report.powerContract.alpha).toBe(0.05);
    expect(report.powerContract.targetPower).toBe(0.8);
    expect(report.powerContract.materialEffectThresholdCents).toBe(2);
    expect(report.powerContract.mdeRelaxed).toBe(false);
    expect(report.powerContract.alphaRelaxed).toBe(false);
    expect(report.powerContract.powerTargetRelaxed).toBe(false);
  });

  it("6-7. no candidate mutation / no alternate candidate evaluation", () => {
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.lineage.candidateId).toBe(CANDIDATE_ID);
    expect(report.lockedCandidate.hypothesisId).toBe(CANDIDATE_ID);
    expect(report.quarantine.alternateCandidateEvaluated).toBe(false);
    expect(report.historicalIncidenceByRun).toHaveLength(3);
  });

  it("8. ESS/hour uses ESS, not event count", () => {
    const row = buildIncidenceRow({
      runLabel: "run-2-validation",
      runId: "r2",
      role: "validation-narrowing-design",
      captureHours: 8,
      eligibleCandidateEvents: 29,
      uniqueMarkets: 14,
      uniqueMarketDays: 14,
      uniqueBtcTriggers: 29,
    });
    expect(row.effectiveSampleSize).toBe(14);
    expect(row.essPerHour).toBe(14 / 8);
    expect(row.essPerHour).not.toBe(29 / 8);
  });

  it("9. raw quote count cannot be statistical N", () => {
    expect(() => rejectRawQuoteCountAsStatisticalN(11_000_000)).toThrow(/cannot be statistical N/i);
  });

  it("10-11. per-run incidence retained; heterogeneity surfaced", () => {
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.historicalIncidenceByRun.map((row) => row.effectiveSampleSize)).toEqual([
      10, 14, 3,
    ]);
    expect(report.incidenceVariability.heterogeneous).toBe(true);
    expect(report.incidenceVariability.rangeEssPerHour).toBeGreaterThan(0);
    expect(report.incidenceVariability.assessment).toMatch(/varied materially/i);
  });

  it("12. projected hours change deterministically with ESS/hour", () => {
    const low = projectHoursToRequiredN({ requiredFreshEffectiveN: 155, essPerHour: 0.75 });
    const high = projectHoursToRequiredN({ requiredFreshEffectiveN: 155, essPerHour: 1.75 });
    expect(low.projectedCaptureHours).toBeCloseTo(155 / 0.75);
    expect(high.projectedCaptureHours).toBeCloseTo(155 / 1.75);
    expect(low.projectedCaptureHours!).toBeGreaterThan(high.projectedCaptureHours!);
  });

  it("13. zero incidence produces unavailable projected duration safely", () => {
    const detail = projectHoursToRequiredN({ requiredFreshEffectiveN: 155, essPerHour: 0 });
    expect(detail.projectedCaptureHours).toBeNull();
    expect(detail.unavailableReason).toMatch(/zero incidence/i);
  });

  it("14-15. fixed-N recommendation deterministic; optional stopping rejected", () => {
    expect(recommendFixedNStoppingRule(155)).toEqual({
      kind: "fixed-n",
      minimumEffectiveSampleSize: 155,
      interpretationIfNotReached: "inconclusive-underpowered",
    });
    const optional = rejectOptionalStoppingWithoutSequentialDesign({ kind: "optional-stopping" });
    expect(optional.valid).toBe(false);
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.recommendedStoppingRule.kind).toBe("fixed-n");
    expect(report.optionalStoppingRejected).toBe(true);
  });

  it("16-17. prior unfavorable holdout preserved; not relabeled reject/support", () => {
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.priorHoldoutContext.observedPrimaryEffectCents).toBe(-4.5);
    expect(report.priorHoldoutContext.holdoutStatisticalVerdict).toBe("underpowered");
    expect(report.currentStatus).toBe("holdout-underpowered");
    expect(report.priorHoldoutContext.relabeledAsReject).toBe(false);
    expect(report.priorHoldoutContext.relabeledAsSupport).toBe(false);
  });

  it("18-22. quarantine: no promotion/preregistration/freeze/capture/trading", () => {
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.quarantine).toEqual({
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
      alternateCandidateEvaluated: false,
      historicalVerdictAltered: false,
      historicalNCountedAsFreshEvidence: false,
    });
  });

  it("23. no latest/mtime selection — identity-addressed cohort pattern", () => {
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.technicalCaptureReadiness.runAggregationPattern).toBe(
      "identity-addressed-cohort-hash-required-at-freeze",
    );
    expect(report.operationalBurden.processingNote).toMatch(/never latest\/mtime/i);
  });

  it("24-25. artifact identity deterministic; methodology change changes identity", () => {
    const a = buildLeadLagReplicationReadinessReport({
      lineage: makeLineage(),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const b = buildLeadLagReplicationReadinessReport({
      lineage: makeLineage(),
      generatedAt: "2026-09-11T00:00:00.000Z",
    });
    expect(a.readinessIdentityHash).toBe(b.readinessIdentityHash);

    const c = buildLeadLagReplicationReadinessReport({
      lineage: makeLineage(),
      planningMethodologyVersion: "lead-lag-ess-arrival-rate-v1-alt",
    });
    expect(c.readinessIdentityHash).not.toBe(a.readinessIdentityHash);
  });

  it("computeCandidateEss matches contract unit semantics", () => {
    expect(
      computeCandidateEss({
        eligibleCandidateEvents: 29,
        uniqueMarkets: 14,
        uniqueMarketDays: 14,
        uniqueBtcTriggers: 29,
      }),
    ).toBe(14);
  });

  it("capture hour scenarios scale with ESS/hour", () => {
    const rows = [
      buildIncidenceRow({
        runLabel: "run-1-train",
        runId: "r1",
        role: "train-discovery-design",
        captureHours: 8,
        eligibleCandidateEvents: 18,
        uniqueMarkets: 10,
        uniqueMarketDays: 10,
        uniqueBtcTriggers: 18,
      }),
    ];
    const scenarios = buildIncidenceRateScenarios(rows);
    const hours = buildCaptureHourScenarios({ scenarios, hours: [24, 48] });
    expect(hours[0]!.expectedEssPooled).toBeCloseTo(24 * (10 / 8));
    expect(hours[1]!.expectedEssPooled).toBeCloseTo(48 * (10 / 8));
  });

  it("pooled projection uses ESS not events", () => {
    const lineage = makeLineage();
    const report = buildLeadLagReplicationReadinessReport({ lineage });
    const pooledEssPerHour = (10 + 14 + 3) / (8 + 8 + 4);
    expect(report.pooledIncidence.pooledEssPerHour).toBeCloseTo(pooledEssPerHour);
    expect(report.projectedHoursToRequiredN.pooledRate.projectedCaptureHours).toBeCloseTo(
      155 / pooledEssPerHour,
    );
    const scenarios = buildIncidenceRateScenarios(report.historicalIncidenceByRun);
    const projected = buildProjectedHoursToRequiredN({
      requiredFreshEffectiveN: 155,
      scenarios,
    });
    expect(projected.pooledRate.projectedEightHourRuns).toBeCloseTo(
      (155 / pooledEssPerHour) / 8,
    );
  });

  it("decisionRequired is capture-budget-approval when technically ready", () => {
    const report = buildLeadLagReplicationReadinessReport({ lineage: makeLineage() });
    expect(report.replicationReadiness).toBe("technically-ready-but-operationally-costly");
    expect(report.decisionRequired).toBe("capture-budget-approval");
    expect(report.technicalCaptureReadiness.settlementRequiredForPrimaryEstimand).toBe(false);
  });

  it("loadReplicationLineageArtifacts binds exact identities from files", () => {
    const lineage = makeLineage();
    const discoveryPath = "fixture/discovery.json";
    const validationPath = "fixture/validation.json";
    const holdoutPath = "fixture/holdout.json";
    const io = createMemoryBtcKalshiLeadLagIo({
      [discoveryPath]: JSON.stringify({
        ...lineage.discovery,
        discoveryIsolationStatus: "train-only-discovery",
      }),
      [validationPath]: JSON.stringify(lineage.validation),
      [holdoutPath]: JSON.stringify(lineage.holdout),
    });

    const loaded = loadReplicationLineageArtifacts({
      io,
      discoveryIdentityHash: DISCOVERY_ID,
      discoveryReportPath: discoveryPath,
      validationIdentityHash: VALIDATION_ID,
      validationReportPath: validationPath,
      holdoutIdentityHash: HOLDOUT_ID,
      holdoutReportPath: holdoutPath,
      expectedEvidenceContractIdentity: EVIDENCE_ID,
    });
    expect(loaded.holdout.holdoutIdentityHash).toBe(HOLDOUT_ID);
    expect(loaded.lockedCandidateDefinitionHash).toBe(lockedHash());
  });
});
