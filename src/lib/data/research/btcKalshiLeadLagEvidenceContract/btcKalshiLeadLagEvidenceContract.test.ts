import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import * as leadLagAnalyzer from "../btcKalshiLeadLagAnalysis/analyzeBtcKalshiLeadLagForRun";

import {
  assertAnalyzerNotInvokedOnValidationOrHoldout,
  assertHoldoutCandidateMatchesValidationLock,
  assertLeadLagOutcomePathAllowed,
  assertNoHardcodedSampleSizeAuthority,
  assertParameterBindingUnchanged,
  assessExecutableObservability,
  buildDefaultLeadLagEvidenceContractConfig,
  buildLeadLagEvidenceDesignReport,
  buildLeadLagMaterialEffectPolicy,
  buildLeadLagStatisticalUnitContract,
  computeLeadLagEffectiveSampleSize,
  countIndependentLockedWindowObservations,
  createOutcomeQuarantinedEvidenceIo,
  deriveRequiredEffectiveEvidence,
  hashCandidateDefinition,
  KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
  KNOWN_LEAD_LAG_VALIDATION_RUN_ID,
  KNOWN_M128A_DISCOVERY_IDENTITY,
  LeadLagEvidenceContractError,
  parseLeadLagEvidenceContractArgv,
  rejectOptionalStoppingWithoutSequentialDesign,
  serializeLeadLagEvidenceDesignJson,
  validateLeadLagStoppingRule,
} from "./index";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

describe("btcKalshiLeadLagEvidenceContract", () => {
  it("1. Run 2 outcome access forbidden", () => {
    const path =
      `data/research-results/btc-kalshi-lead-lag/${KNOWN_LEAD_LAG_VALIDATION_RUN_ID}/lead-lag-analysis.json`;
    expect(() => assertLeadLagOutcomePathAllowed(path)).toThrow(LeadLagEvidenceContractError);
    const io = createOutcomeQuarantinedEvidenceIo({
      readFile: () => "{}",
      fileExists: () => true,
    });
    expect(() => io.readFile(path)).toThrow(/validation\/holdout lead-lag outcomes/i);
  });

  it("2. Run 3 outcome access forbidden", () => {
    const path =
      `data/live-capture/forward-quotes/${KNOWN_LEAD_LAG_HOLDOUT_RUN_ID}/lead-lag-events.jsonl`;
    expect(() => assertLeadLagOutcomePathAllowed(path)).toThrow(LeadLagEvidenceContractError);
    expect(() =>
      assertAnalyzerNotInvokedOnValidationOrHoldout(
        `data/live-capture/forward-quotes/${KNOWN_LEAD_LAG_HOLDOUT_RUN_ID}`,
      )
    ).toThrow(/holdout Run 3/i);
  });

  it("3. no candidate winner is selected", () => {
    const report = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig(),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.candidateWinnerSelected).toBe(false);
    expect(report.holdoutContractRequirements.candidateDefinitionHash).toBeNull();
    expect(report.prospectiveContractRequirements.candidateSpecificParametersBound).toBe(false);
  });

  it("4. primary independent unit is not raw quote count", () => {
    const unit = buildLeadLagStatisticalUnitContract();
    expect(unit.primaryIndependentUnit).toBe("market-day-block");
    expect(unit.notIndependent).toContain("raw quote records");
  });

  it("5. repeated windows from same trigger are not independent", () => {
    const counted = countIndependentLockedWindowObservations({
      lockedResponseWindowMs: 5_000,
      observations: [
        {
          marketTicker: "M1",
          tradingDayUtc: "2026-09-08",
          btcTriggerId: "t1",
          responseWindowMs: 5_000,
        },
        {
          marketTicker: "M1",
          tradingDayUtc: "2026-09-08",
          btcTriggerId: "t1",
          responseWindowMs: 15_000,
        },
        {
          marketTicker: "M1",
          tradingDayUtc: "2026-09-08",
          btcTriggerId: "t1",
          responseWindowMs: 30_000,
        },
      ],
    });
    expect(counted.rawLockedWindowCount).toBe(1);
    expect(counted.rejectedAlternateWindowCount).toBe(2);
    expect(
      computeLeadLagEffectiveSampleSize({
        rawObservationCount: counted.rawLockedWindowCount,
        independentMarketCount: counted.independentMarketCount,
        marketDayCount: counted.marketDayCount,
        uniqueBtcTriggerCount: counted.uniqueBtcTriggerCount,
      }),
    ).toBe(1);
  });

  it("6. midpoint response != executable P&L", () => {
    const report = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig(),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.primaryEstimand.primaryEstimand).toBe("signed-yes-mid-response-cents");
    expect(report.primaryEstimand.midpointDistinctFromExecutablePnl).toBe(true);
    expect(report.primaryEstimand.executablePnlStatus).toBe("not-yet-faithful-primary");
  });

  it("7. stale executable quote cannot satisfy observability", () => {
    const result = assessExecutableObservability({
      bestBidCents: 48,
      bestAskCents: 52,
      executableBuyYesCents: 52,
      executableSellYesCents: 48,
      quoteAgeMs: 10_000,
      stalenessBoundMs: 5_000,
    });
    expect(result.satisfies).toBe(false);
    expect(result.reasons.some((line) => /stale/i.test(line))).toBe(true);
  });

  it("8. missing bid/ask fails executable evidence requirement", () => {
    const result = assessExecutableObservability({
      bestBidCents: null,
      bestAskCents: 52,
      executableBuyYesCents: 52,
      executableSellYesCents: null,
      quoteAgeMs: 100,
      stalenessBoundMs: 5_000,
    });
    expect(result.satisfies).toBe(false);
    expect(result.reasons.some((line) => /missing bid\/ask/i.test(line))).toBe(true);
  });

  it("9. power requirement derives from model inputs", () => {
    const required = deriveRequiredEffectiveEvidence({
      alpha: 0.05,
      targetPower: 0.8,
      materialEffectCents: 2,
      outcomeStandardDeviationCents: 10,
    });
    expect(required.reusedFunction).toBe("powerAnalysis.computeRequiredSampleSize");
    expect(required.requiredEffectiveN).toBe(155);
  });

  it("10. changing alpha changes required evidence", () => {
    const base = {
      targetPower: 0.8,
      materialEffectCents: 2,
      outcomeStandardDeviationCents: 10,
    };
    const a = deriveRequiredEffectiveEvidence({ ...base, alpha: 0.05 });
    const b = deriveRequiredEffectiveEvidence({ ...base, alpha: 0.01 });
    expect(b.requiredEffectiveN!).toBeGreaterThan(a.requiredEffectiveN!);
  });

  it("11. changing target power changes required evidence", () => {
    const base = {
      alpha: 0.05,
      materialEffectCents: 2,
      outcomeStandardDeviationCents: 10,
    };
    const a = deriveRequiredEffectiveEvidence({ ...base, targetPower: 0.8 });
    const b = deriveRequiredEffectiveEvidence({ ...base, targetPower: 0.9 });
    expect(b.requiredEffectiveN!).toBeGreaterThan(a.requiredEffectiveN!);
  });

  it("12. no hardcoded n=50/100 authority", () => {
    const holdoutSource = readFileSync(join(MODULE_DIR, "holdoutContract.ts"), "utf8");
    const prospectiveSource = readFileSync(join(MODULE_DIR, "prospectiveContract.ts"), "utf8");
    expect(() => assertNoHardcodedSampleSizeAuthority(holdoutSource)).not.toThrow();
    expect(() => assertNoHardcodedSampleSizeAuthority(prospectiveSource)).not.toThrow();
    const report = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig(),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.holdoutContractRequirements.minimumEvidenceRequirement.kind).toBe(
      "model-derived-effective-n",
    );
    expect(report.holdoutContractRequirements.minimumEvidenceRequirement.requiredEffectiveN).not.toBe(
      50,
    );
    expect(report.holdoutContractRequirements.minimumEvidenceRequirement.requiredEffectiveN).not.toBe(
      100,
    );
  });

  it("13. missing stopping rule fails closed", () => {
    const result = validateLeadLagStoppingRule(null);
    expect(result.valid).toBe(false);
    expect(result.reasons[0]).toMatch(/missing stopping rule fails closed/i);
  });

  it("14. optional stopping without sequential design fails closed", () => {
    const result = rejectOptionalStoppingWithoutSequentialDesign({
      kind: "optional-stopping",
    });
    expect(result.valid).toBe(false);
    expect(
      validateLeadLagStoppingRule({
        kind: "explicit-sequential",
        ruleId: "x",
        description: "y",
        sequentialDesignImplemented: true,
      }).valid,
    ).toBe(true);
  });

  it("15. holdout candidate definition must exactly match validation lock", () => {
    expect(() =>
      assertHoldoutCandidateMatchesValidationLock({
        validationLockedCandidateDefinitionHash: "aaa",
        holdoutCandidateDefinitionHash: "bbb",
      })
    ).toThrow(/exactly match validation lock/i);
    expect(() =>
      assertHoldoutCandidateMatchesValidationLock({
        validationLockedCandidateDefinitionHash: "aaa",
        holdoutCandidateDefinitionHash: "aaa",
      })
    ).not.toThrow();
  });

  it("16. altered parameter after validation invalidates identity", () => {
    const locked = {
      hypothesisId: "h1",
      btcMoveHorizonMs: 15_000,
      responseWindowMs: 5_000,
      btcMagnitudeBin: "med",
      timeRemainingBin: "mid",
      impliedProbabilityBin: "p50",
      direction: "follow-btc" as const,
    };
    expect(() =>
      assertParameterBindingUnchanged({
        validationLockedDefinition: locked,
        proposedDefinition: { ...locked, responseWindowMs: 10_000 },
      })
    ).toThrow(/altered parameter after validation invalidates identity/i);
  });

  it("17. discovery lineage remains recorded", () => {
    const report = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig(),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.discoveryIdentity).toBe(KNOWN_M128A_DISCOVERY_IDENTITY);
    expect(report.discoveryIsolationStatus).toBe("train-only-discovery");
    expect(report.holdoutContractRequirements.discoveryIdentity).toBe(
      KNOWN_M128A_DISCOVERY_IDENTITY,
    );
  });

  it("18. multiplicity history cannot be erased", () => {
    const report = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig(),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.multiplicityDesign.multiplicityHistoryErasable).toBe(false);
    expect(report.multiplicityDesign.discoveryHypothesisCount).toBe(9600);
    expect(report.multiplicityDesign.validationShortlistSize).toBe(5);
  });

  it("19. candidate-specific TRAIN effect cannot automatically set MDE", () => {
    const policy = buildLeadLagMaterialEffectPolicy();
    expect(policy.selectionForbiddenFromTrainWinnerEstimates).toBe(true);
    const trainWinnerEffect = 8.25;
    const report = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig({
        materialEffectCents: policy.defaultMaterialEffectCents,
      }),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.holdoutContractRequirements.materialEffectThresholdCents).not.toBe(
      trainWinnerEffect,
    );
    expect(report.holdoutContractRequirements.materialEffectThresholdCents).toBe(
      policy.defaultMaterialEffectCents,
    );
  });

  it("20-24. no promotion / preregistration / freeze / capture / live trading", () => {
    const report = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig(),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.promotionCreated).toBe(false);
    expect(report.preregistrationCreated).toBe(false);
    expect(report.freezeCreated).toBe(false);
    expect(report.captureStarted).toBe(false);
    expect(report.liveTradingImplemented).toBe(false);
    expect(report.promotionIntegrationStatus).toBe("schema-ready-awaiting-holdout-and-lock");
    expect(report.executionSemantics.liveOrdersImplemented).toBe(false);
  });

  it("25. deterministic serialization / identity", () => {
    const config = buildDefaultLeadLagEvidenceContractConfig();
    const a = buildLeadLagEvidenceDesignReport({
      config,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const b = buildLeadLagEvidenceDesignReport({
      config,
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(a.designIdentityHash).toBe(b.designIdentityHash);
    expect(serializeLeadLagEvidenceDesignJson(a)).toBe(serializeLeadLagEvidenceDesignJson(b));
  });

  it("26. no latest/mtime selection", () => {
    expect(() => parseLeadLagEvidenceContractArgv(["--latest"])).toThrow(
      LeadLagEvidenceContractError,
    );
    expect(() => parseLeadLagEvidenceContractArgv(["--mtime"])).toThrow(
      LeadLagEvidenceContractError,
    );
  });

  it("candidate A vs B binds identity without altering scientific constants", () => {
    const scientific = {
      alpha: 0.05,
      targetPower: 0.8,
      materialEffectCents: 2,
      outcomeStandardDeviationCents: 10,
    };
    const defA = hashCandidateDefinition({
      hypothesisId: "A",
      btcMoveHorizonMs: 5_000,
      responseWindowMs: 5_000,
      btcMagnitudeBin: "small",
      timeRemainingBin: "early",
      impliedProbabilityBin: "p40",
      direction: "follow-btc",
    });
    const defB = hashCandidateDefinition({
      hypothesisId: "B",
      btcMoveHorizonMs: 30_000,
      responseWindowMs: 15_000,
      btcMagnitudeBin: "large",
      timeRemainingBin: "late",
      impliedProbabilityBin: "p60",
      direction: "reverse-btc",
    });
    const reportA = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig({
        ...scientific,
        candidateDefinitionHash: defA,
        direction: "follow-btc",
        signalHorizonMs: 5_000,
        kalshiResponseHorizonMs: 5_000,
      }),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const reportB = buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig({
        ...scientific,
        candidateDefinitionHash: defB,
        direction: "reverse-btc",
        signalHorizonMs: 30_000,
        kalshiResponseHorizonMs: 15_000,
      }),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(reportA.designIdentityHash).not.toBe(reportB.designIdentityHash);
    expect(reportA.powerModel.defaultInputs.alpha).toBe(reportB.powerModel.defaultInputs.alpha);
    expect(reportA.powerModel.defaultInputs.targetPower).toBe(
      reportB.powerModel.defaultInputs.targetPower,
    );
    expect(reportA.statisticalUnit.primaryIndependentUnit).toBe(
      reportB.statisticalUnit.primaryIndependentUnit,
    );
    expect(reportA.executionSemantics.fillModel).toBe(reportB.executionSemantics.fillModel);
    expect(reportA.stoppingRuleValidationPolicy).toBe(reportB.stoppingRuleValidationPolicy);
    expect(reportA.holdoutContractRequirements.materialEffectThresholdCents).toBe(
      reportB.holdoutContractRequirements.materialEffectThresholdCents,
    );
  });

  it("does not invoke per-run analyzer on validation/holdout", async () => {
    const spy = vi.spyOn(leadLagAnalyzer, "analyzeBtcKalshiLeadLagForRun");
    buildLeadLagEvidenceDesignReport({
      config: buildDefaultLeadLagEvidenceContractConfig(),
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
