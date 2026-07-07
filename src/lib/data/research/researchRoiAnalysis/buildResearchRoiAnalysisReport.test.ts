import { describe, expect, it } from "vitest";

import {
  buildResearchRoiAnalysisReport,
  serializeResearchRoiAnalysisReport,
} from "./buildResearchRoiAnalysisReport";
import { serializeResearchRoiAnalysisHtml } from "./serializeResearchRoiAnalysisHtml";

const GENERATED_AT = "2026-07-07T23:00:00.000Z";

describe("buildResearchRoiAnalysisReport", () => {
  it("builds a deterministic read-only ROI report", () => {
    const report = buildResearchRoiAnalysisReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/research-roi-analysis.json",
      htmlOutputPath: "data/reports/research-roi-analysis.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        hypothesisFailureAnalysisPath: "data/research-results/hypothesis-failure-analysis.json",
        hypothesisRefinementsPath: "data/research-results/hypothesis-refinements.json",
        refinementHypothesisCandidatesPath:
          "data/research-results/refinement-hypothesis-candidates.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
      },
      inputStatus: {
        hypothesisCandidatesPresent: true,
        hypothesisValidationPresent: true,
        hypothesisFailureAnalysisPresent: false,
        hypothesisRefinementsPresent: false,
        refinementHypothesisCandidatesPresent: false,
        mispricingAtlasPresent: true,
      },
      candidates: [
        {
          candidateId: "atlas-volatility-vol-high-over",
          sourceArtifact: "mispricing-atlas.json",
          hypothesis: "High vol overconfidence",
          rationale: "Calibration gap",
          marketCondition: "High vol",
          suggestedStrategyFamily: "calibration-fade",
          requiredData: ["research-output.json"],
          proposedEntryCondition: "Fade overpriced yes",
          proposedExitSettlementAssumption: "Hold to settlement",
          expectedFailureMode: "Regime shift",
          killCriterion: "Edge disappears",
          confidence: "medium",
          warnings: [],
        },
      ],
      validations: [
        {
          hypothesisId: "atlas-volatility-vol-high-over",
          hypothesis: "High vol overconfidence",
          sourceArtifact: "mispricing-atlas.json",
          robustnessScore: 78,
          passes: true,
          reasons: [],
          observationCount: 50,
          timeStability: {
            monthPeriods: [],
            quarterPeriods: [],
            monthPersistenceRate: 0.8,
            quarterPersistenceRate: 0.8,
            scoreComponent: 20,
          },
          regimeStability: {
            regimes: [],
            regimesWithEdge: 2,
            regimesWithData: 3,
            scoreComponent: 20,
          },
          sampleConcentration: {
            uniqueTradingDays: 10,
            largestContributingDay: "2023-10-01",
            largestDayObservations: 5,
            largestDayPercent: 0.1,
            singleDayDominated: false,
            scoreComponent: 20,
          },
          leaveOnePeriodOut: {
            errorStdDev: 0.02,
            folds: [],
            scoreComponent: 18,
          },
        },
      ],
      failureAnalyses: [],
      refinements: [],
      mispricingAtlas: {
        generatedAt: GENERATED_AT,
        inputRoot: "data/research-results",
        outputPath: "data/research-results/mispricing-atlas.json",
        sampleCounts: {
          totalObservations: 50,
          marketCount: 3,
          skippedMissingSettlement: 0,
          skippedMissingProbability: 0,
          skippedMissingContext: 0,
        },
        overallCalibration: {
          bucketId: "overall",
          bucketLabel: "Overall",
          observations: 50,
          averageImpliedProbability: 0.5,
          realizedFrequency: 0.5,
          calibrationError: 0,
          brierScore: 0.1,
          averageAbsoluteError: 0.1,
        },
        probabilityBuckets: [],
        timeRemainingBuckets: [],
        moneynessBuckets: [],
        volatilityBuckets: [
          {
            bucketId: "vol-high",
            bucketLabel: "High vol",
            observations: 50,
            averageImpliedProbability: 0.6,
            realizedFrequency: 0.5,
            calibrationError: 0.1,
            brierScore: 0.1,
            averageAbsoluteError: 0.1,
          },
        ],
        warnings: [],
      },
    });

    expect(report.summary.overall.totalCandidates).toBe(1);
    expect(report.summary.overall.validatedCandidates).toBe(1);
    expect(report.summary.emptyInputReasons.some((reason) => reason.includes("failure-analysis"))).toBe(
      true,
    );
    expect(serializeResearchRoiAnalysisReport(report)).toBe(
      serializeResearchRoiAnalysisReport(report),
    );

    const html = serializeResearchRoiAnalysisHtml(report);
    expect(html).toContain("Research ROI Analysis");
    expect(html).toContain("Highest ROI dimensions");
    expect(html).toContain("Most efficient research areas");
  });
});
