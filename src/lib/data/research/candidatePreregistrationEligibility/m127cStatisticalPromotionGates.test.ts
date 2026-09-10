import { describe, expect, it } from "vitest";

import {
  buildCandidatePromotionReport,
  classifyCandidatePromotion,
  resolveCandidatePromotionConfig,
  serializeCandidatePromotionReport,
} from "@/lib/data/research/candidatePromotion";
import { DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS } from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";
import type {
  ParsedHarnessStrategyMetrics,
  ParsedOosPromotionContext,
  ParsedSynthesisStrategy,
  ParsedValidationEntry,
} from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";
import { buildFullResearchSteps } from "@/lib/data/research/fullOrchestrator/buildFullResearchSteps";
import { createDefaultFullResearchOrchestratorConfig } from "@/lib/data/research/fullOrchestrator/runFullResearchOrchestrator";
import { assertNoHoldoutLeakageIntoTrain } from "@/lib/data/research/oosPowerCorrection/computeTemporalResearchSplits";
import type { OosPowerCorrectionEntry } from "@/lib/data/research/oosPowerCorrection/oosPowerCorrectionTypes";
import { computeBenjaminiYekutieliFdr } from "@/lib/data/research/oosPowerCorrection/oosPowerCorrectionMath";

import {
  evaluateCandidateEligibleForPreregistration,
  buildValidProspectiveStatisticalPromotionContract,
  hashArtifactContent,
} from "./index";

const GENERATED_AT = "2026-09-10T00:00:00.000Z";
const PASSING_ID = "eligible-candidate-test";
const FAILING_ID = "calibration-like-test";

function createStrategy(
  overrides: Partial<ParsedSynthesisStrategy> = {},
): ParsedSynthesisStrategy {
  return {
    strategyId: `synth-${overrides.hypothesisId ?? PASSING_ID}`,
    hypothesisId: PASSING_ID,
    strategyFamily: "calibration-fade",
    promotionStatus: "candidate",
    validationSummary: {
      robustnessScore: 82,
      passes: true,
      observationCount: 40,
    },
    riskNotes: [],
    ...overrides,
  };
}

function createValidation(
  overrides: Partial<ParsedValidationEntry> = {},
): ParsedValidationEntry {
  return {
    hypothesisId: PASSING_ID,
    robustnessScore: 82,
    passes: true,
    reasons: [],
    observationCount: 40,
    sampleConcentration: {
      singleDayDominated: false,
      largestDayPercent: 0.12,
    },
    ...overrides,
  };
}

function createHarness(
  overrides: Partial<ParsedHarnessStrategyMetrics> = {},
): ParsedHarnessStrategyMetrics {
  return {
    strategyId: `synth-${PASSING_ID}`,
    hypothesisId: PASSING_ID,
    strategyFamily: "calibration-fade",
    marketRuns: 10,
    successfulRuns: 8,
    failedRuns: 2,
    skippedRuns: 0,
    totalTradeCount: 24,
    netPnlCents: 1800,
    warnings: [],
    ...overrides,
  };
}

function createOosEntry(
  overrides: Partial<OosPowerCorrectionEntry> & { hypothesisId?: string } = {},
): OosPowerCorrectionEntry {
  const hypothesisId = overrides.hypothesisId ?? PASSING_ID;
  return {
    hypothesisId,
    hypothesis: hypothesisId,
    sourceArtifact: "hypothesis-candidates.json",
    candidate: {
      candidateId: hypothesisId,
      confidence: "medium",
      bucketMetadata: {},
    },
    splitMetrics: {
      train: {
        split: "train",
        rawObservationCount: 100,
        independentMarketCount: 20,
        marketDayCount: 40,
        effectiveSampleSizeEstimate: 20,
        observedNetEdge: 0.03,
        standardError: 0.01,
        confidenceInterval95: { lower: 0.01, upper: 0.05 },
        minimumDetectableEffect: 0.02,
        tStatistic: 3,
        uncorrectedPValue: 0.01,
        clearsMde: true,
        isUnderpowered: false,
        underpoweredReason: null,
      },
      validation: {
        split: "validation",
        rawObservationCount: 40,
        independentMarketCount: 10,
        marketDayCount: 15,
        effectiveSampleSizeEstimate: 10,
        observedNetEdge: 0.02,
        standardError: 0.01,
        confidenceInterval95: { lower: 0, upper: 0.04 },
        minimumDetectableEffect: 0.025,
        tStatistic: 2,
        uncorrectedPValue: 0.04,
        clearsMde: false,
        isUnderpowered: true,
        underpoweredReason: "below target power",
      },
      holdout: {
        split: "holdout",
        rawObservationCount: 50,
        independentMarketCount: 12,
        marketDayCount: 20,
        effectiveSampleSizeEstimate: 12,
        observedNetEdge: 0.04,
        standardError: 0.01,
        confidenceInterval95: { lower: 0.02, upper: 0.06 },
        minimumDetectableEffect: 0.025,
        tStatistic: 4,
        uncorrectedPValue: 0.001,
        clearsMde: true,
        isUnderpowered: false,
        underpoweredReason: null,
      },
    },
    uncorrectedPValue: 0.001,
    correctedPValue: 0.01,
    qValue: 0.01,
    correctionMethod: "benjaminiYekutieli",
    passesUncorrected: true,
    passesCorrected: true,
    clearsMde: true,
    isUnderpowered: false,
    finalStatisticalVerdict: "pass",
    dependenceWarnings: [],
    tradeReplayAvailable: false,
    ...overrides,
  };
}

function createOosContext(
  overrides: Partial<ParsedOosPromotionContext> & {
    entry?: OosPowerCorrectionEntry | null;
  } = {},
): ParsedOosPromotionContext {
  const temporalSplit = {
    trainMonths: ["2024-01", "2024-02", "2024-03"],
    validationMonths: ["2024-04"],
    holdoutMonths: ["2024-05"],
  };
  const entry = overrides.entry === undefined ? createOosEntry() : overrides.entry;
  const entriesByHypothesisId = new Map<string, OosPowerCorrectionEntry>();
  if (entry) {
    entriesByHypothesisId.set(entry.hypothesisId, entry);
  }
  const { entry: _ignored, ...rest } = overrides;
  return {
    present: true,
    artifactContentHash: "oos-hash",
    discoveryIsolation: {
      status: "train-only-discovery",
      reason: "fixture: candidates locked before holdout",
    },
    prospectiveDesign: buildValidProspectiveStatisticalPromotionContract(temporalSplit),
    testedHypothesisCount: 3,
    alpha: 0.05,
    targetPower: 0.8,
    holdoutMonthsHash: "holdout-hash",
    entriesByHypothesisId,
    ...rest,
  };
}

function buildArtifacts(input: {
  strategy?: ParsedSynthesisStrategy;
  validation?: ParsedValidationEntry;
  harness?: ParsedHarnessStrategyMetrics;
  oos?: ParsedOosPromotionContext;
}) {
  const strategy = input.strategy ?? createStrategy();
  const validation = input.validation ?? createValidation({ hypothesisId: strategy.hypothesisId });
  const harness = input.harness ?? createHarness({
    strategyId: strategy.strategyId,
    hypothesisId: strategy.hypothesisId,
  });
  const oos = input.oos ?? createOosContext({
    entry: createOosEntry({ hypothesisId: strategy.hypothesisId }),
  });
  const validationDoc = { generatedAt: GENERATED_AT, validations: [validation] };
  const synthesisDoc = { generatedAt: GENERATED_AT, strategies: [strategy] };
  const validationContent = `${JSON.stringify(validationDoc)}\n`;
  const candidateContent = `${JSON.stringify(synthesisDoc)}\n`;
  const report = buildCandidatePromotionReport({
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/candidate-promotions.json",
    htmlOutputPath: "data/reports/research-candidate-promotions.html",
    inputPaths: DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS,
    inputs: {
      validation: validationDoc,
      synthesis: synthesisDoc,
      harnessStrategies: [harness],
      significanceByFamily: new Map(),
      oos,
      inputArtifactContentHashes: {
        hypothesisValidation: hashArtifactContent(validationContent),
        strategySynthesis: hashArtifactContent(candidateContent),
        harnessResults: null,
        statisticalSignificance: null,
        oosPowerCorrection: oos.artifactContentHash,
      },
    },
  });
  return {
    report,
    promotionContent: serializeCandidatePromotionReport(report),
    validationContent,
    candidateContent,
  };
}

describe("M12.7c bind OOS/FDR/power to promotion", () => {
  const config = resolveCandidatePromotionConfig();

  it("1: holdout dates cannot overlap train dates", () => {
    expect(
      assertNoHoldoutLeakageIntoTrain({
        trainMonths: ["2024-01", "2024-02"],
        validationMonths: ["2024-03"],
        holdoutMonths: ["2024-02"],
      }),
    ).toBe(false);
    expect(
      assertNoHoldoutLeakageIntoTrain({
        trainMonths: ["2024-01", "2024-02"],
        validationMonths: ["2024-03"],
        holdoutMonths: ["2024-04"],
      }),
    ).toBe(true);
  });

  it("2: candidate definition contamination is detected/fails", () => {
    const artifacts = buildArtifacts({
      oos: createOosContext({
        discoveryIsolation: {
          status: "discovery-saw-full-corpus",
          reason: "full corpus atlas",
        },
      }),
    });
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(false);
    expect(artifacts.report.promotions[0]?.blockingIssues.join(" ")).toMatch(/isolation|contaminated|full-corpus/i);
  });

  it("3: correction includes the declared testing family", () => {
    const corrected = computeBenjaminiYekutieliFdr(
      [
        { id: "a", rawPValue: 0.001 },
        { id: "b", rawPValue: 0.02 },
        { id: "c", rawPValue: 0.8 },
      ],
      0.05,
    );
    expect(corrected).toHaveLength(3);
    expect(corrected.find((row) => row.id === "a")?.rejected).toBe(true);
  });

  it("4: corrected failure cannot promote", () => {
    const artifacts = buildArtifacts({
      oos: createOosContext({
        entry: createOosEntry({
          passesCorrected: false,
          passesUncorrected: true,
          finalStatisticalVerdict: "fail",
          qValue: 0.2,
        }),
      }),
    });
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(false);
  });

  it("5: uncorrected significance + corrected failure cannot promote", () => {
    const entry = classifyCandidatePromotion({
      strategy: createStrategy(),
      validation: createValidation(),
      harness: createHarness(),
      significance: {
        statisticallySignificant: true,
        pValue: 0.01,
        insufficientSample: false,
      },
      oos: createOosContext({
        entry: createOosEntry({
          passesUncorrected: true,
          passesCorrected: false,
          finalStatisticalVerdict: "fail",
        }),
      }),
      config,
    });
    expect(entry.decision).toBe("candidate");
    expect(entry.evidence.promotionAccepted).toBe(false);
  });

  it("6: underpowered result cannot promote", () => {
    const artifacts = buildArtifacts({
      oos: createOosContext({
        entry: createOosEntry({
          isUnderpowered: true,
          clearsMde: false,
          finalStatisticalVerdict: "underpowered",
        }),
      }),
    });
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(false);
  });

  it("7: sufficient power + corrected pass + clean holdout can promote", () => {
    const artifacts = buildArtifacts({});
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(true);
    const eligibility = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: artifacts.promotionContent,
      candidateArtifactContent: artifacts.candidateContent,
      validationArtifactContent: artifacts.validationContent,
    });
    expect(eligibility.preregistrationEligible).toBe(true);
  });

  it("8: stale OOS artifact hash cannot authorize when promotionAccepted forged without gates", () => {
    const artifacts = buildArtifacts({
      oos: createOosContext({ present: false, artifactContentHash: null, entriesByHypothesisId: new Map() }),
    });
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(false);
  });

  it("9: changed split / missing prospective design invalidates acceptance", () => {
    const artifacts = buildArtifacts({
      oos: createOosContext({ prospectiveDesign: null }),
    });
    expect(artifacts.report.promotions[0]?.evidence.prospectiveDesignValid).toBe(false);
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(false);
  });

  it("10: missing OOS evidence fails closed", () => {
    const artifacts = buildArtifacts({
      oos: {
        present: false,
        artifactContentHash: null,
        discoveryIsolation: null,
        prospectiveDesign: null,
        testedHypothesisCount: null,
        alpha: null,
        targetPower: null,
        holdoutMonthsHash: null,
        entriesByHypothesisId: new Map(),
      },
    });
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(false);
    const eligibility = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: artifacts.promotionContent,
      candidateArtifactContent: artifacts.candidateContent,
      validationArtifactContent: artifacts.validationContent,
    });
    expect(eligibility.preregistrationEligible).toBe(false);
    expect(["missing-oos-artifact", "oos-statistical-gate-failed", "discovery-contamination", "promotion-not-accepted"]).toContain(
      eligibility.reasonCode,
    );
  });

  it("11: missing prospective stopping contract fails closed", () => {
    const eligibility = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      ...(() => {
        const artifacts = buildArtifacts({
          oos: createOosContext({ prospectiveDesign: { analysisVersion: "wrong" } }),
        });
        return {
          promotionArtifactContent: artifacts.promotionContent,
          candidateArtifactContent: artifacts.candidateContent,
          validationArtifactContent: artifacts.validationContent,
        };
      })(),
    });
    expect(eligibility.preregistrationEligible).toBe(false);
    expect(["prospective-design-invalid", "promotion-not-accepted", "oos-statistical-gate-failed"]).toContain(
      eligibility.reasonCode,
    );
  });

  it("historical calibration-fade: passes:true still fails without OOS/power/design", () => {
    const artifacts = buildArtifacts({
      strategy: createStrategy({
        hypothesisId: FAILING_ID,
        strategyId: `synth-${FAILING_ID}`,
        validationSummary: { robustnessScore: 59, passes: true, observationCount: 457 },
      }),
      validation: createValidation({
        hypothesisId: FAILING_ID,
        robustnessScore: 59,
        passes: true,
        observationCount: 457,
      }),
      harness: createHarness({
        strategyId: `synth-${FAILING_ID}`,
        hypothesisId: FAILING_ID,
      }),
      oos: {
        present: false,
        artifactContentHash: null,
        discoveryIsolation: null,
        prospectiveDesign: null,
        testedHypothesisCount: null,
        alpha: null,
        targetPower: null,
        holdoutMonthsHash: null,
        entriesByHypothesisId: new Map(),
      },
    });
    expect(artifacts.report.promotions[0]?.evidence.validationPasses).toBe(true);
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(false);
  });

  it("orchestrator runs oos-power-correction before candidate-promotions", () => {
    const steps = buildFullResearchSteps(createDefaultFullResearchOrchestratorConfig());
    const oosIndex = steps.findIndex((step) => step.id === "oos-power-correction");
    const promoIndex = steps.findIndex((step) => step.id === "candidate-promotions");
    expect(oosIndex).toBeGreaterThanOrEqual(0);
    expect(promoIndex).toBeGreaterThan(oosIndex);
    expect(steps[promoIndex]?.upstreamStepIds).toContain("oos-power-correction");
  });
});
