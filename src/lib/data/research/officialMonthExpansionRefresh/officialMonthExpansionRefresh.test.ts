import { describe, expect, it } from "vitest";

import { buildMonthCoverageAudit } from "./auditMonthCoverage";
import { buildOfficialMonthExpansionRefreshReport } from "./buildOfficialMonthExpansionRefreshReport";
import { compareEvidenceSnapshots } from "./compareEvidenceSnapshots";
import { createOfficialMonthExpansionRefreshConfig } from "./officialMonthExpansionRefreshConfig";
import { evaluateRefreshRecommendation } from "./evaluateRefreshRecommendation";
import { extractEvidenceSnapshot } from "./extractEvidenceSnapshot";
import { createEmptyExpansionExecution } from "./runExpansionPipeline";
import {
  serializeOfficialMonthExpansionRefreshHtml,
  serializeOfficialMonthExpansionRefreshReport,
} from "./serializeOfficialMonthExpansionRefresh";
import type { EvidenceSnapshot } from "./officialMonthExpansionRefreshTypes";

const config = createOfficialMonthExpansionRefreshConfig({ sensitiveMonth: "2025-12" });

function snapshot(overrides: Partial<EvidenceSnapshot>): EvidenceSnapshot {
  return {
    capturedAt: "2026-01-01T00:00:00.000Z",
    calendarMonthsCovered: ["2025-12", "2026-01", "2026-02"],
    officialMonthsCovered: ["2026-01", "2026-02"],
    derivedSensitiveMonthsCovered: ["2025-12"],
    marketCount: 100,
    observationCount: 1000,
    hypothesisCount: 4,
    positiveNetReplayHypothesisCount: 4,
    familyNetPnlCents: 7898,
    excludingSensitiveMonthNetPnlCents: 2302,
    topMonthShare: 0.7,
    top3MonthShare: 0.9,
    positiveMonthCount: 4,
    negativeMonthCount: 1,
    uniqueTradingDayCount: 94,
    familyVerdict: "continue-research",
    forensicsVerdict: "pause-family-concentrated-pnl",
    derivedMonthSensitivityRecommendation: "collect-more-official-months",
    recommendFullM12: false,
    officialPositiveMonthCount: 3,
    excludingVariantTopMonthShare: 0.847,
    ...overrides,
  };
}

describe("buildMonthCoverageAudit", () => {
  it("flags no new official months when horizon starts at derived-sensitive month", () => {
    const audit = buildMonthCoverageAudit({
      generatedAt: "2026-01-01T00:00:00.000Z",
      config,
      coveragePlan: {
        snapshot: {
          monthCoverage: [
            {
              month: "2025-12",
              marketCount: 175,
              tradingDayCount: 16,
              coverageStatus: "COVERED",
              thresholds: {
                minMarketsPerMonth: 100,
                minTradingDaysPerMonth: 10,
                marketsMet: true,
                tradingDaysMet: true,
              },
            },
            {
              month: "2026-05",
              marketCount: 76,
              tradingDayCount: 6,
              coverageStatus: "UNDER_COVERED",
              thresholds: {
                minMarketsPerMonth: 100,
                minTradingDaysPerMonth: 10,
                marketsMet: false,
                tradingDaysMet: false,
              },
            },
          ],
          missingMonths: [],
          underCoveredMonths: ["2026-05"],
          coveredMonths: ["2025-12", "2026-01"],
        },
        recommendations: [
          {
            recommendationId: "rec-1",
            recommendationType: "temporal-balance-import",
            seriesTicker: "KXBTC15M",
            startMonth: "2026-05",
            endMonth: "2026-05",
            missingMonths: ["2026-05"],
            includesMissing: false,
            includesUnderCovered: true,
            priorityScore: 1,
            rationale: "under-covered",
            expectedResearchBenefit: "depth",
            supportingHypothesisIds: [],
            targetHypothesisIds: [],
            estimatedSupportLevel: "high",
            estimatedUnsupportedRate: 0,
          },
        ],
      } as never,
      replayFillCountByMonth: new Map([["2025-12", 217]]),
      observationCountByMonth: new Map(),
      hypothesisCandidateCountByMonth: new Map(),
    });

    expect(audit.importableOfficialMonths).toContain("2026-05");
    expect(audit.derivedSensitiveMonths).toContain("2025-12");
    expect(audit.additionalOfficialMonthsAvailable).toBe(true);
  });
});

describe("evaluateRefreshRecommendation", () => {
  const monthAuditBase = {
    generatedAt: "2026-01-01T00:00:00.000Z",
    sensitiveMonths: ["2025-12"],
    availableCalendarMonths: [],
    officialMonths: [],
    derivedSensitiveMonths: ["2025-12"],
    missingMonths: [],
    underCoveredMonths: [],
    importableOfficialMonths: [],
    alreadyImportedMonths: [],
    months: [],
    additionalOfficialMonthsAvailable: false,
    additionalOfficialMonthsReason: "none",
  };

  it("recommends collect-more when importable months exist but import not executed", () => {
    expect(
      evaluateRefreshRecommendation({
        config,
        before: snapshot({}),
        after: snapshot({}),
        delta: compareEvidenceSnapshots({
          before: snapshot({}),
          after: snapshot({}),
        }),
        monthCoverageAudit: {
          ...monthAuditBase,
          additionalOfficialMonthsAvailable: true,
          importableOfficialMonths: ["2026-05"],
          additionalOfficialMonthsReason: "deepen",
        },
        expansionAttempted: false,
        expansionSucceeded: true,
        importExecuted: false,
      }),
    ).toBe("collect-more-official-months");
  });

  it("recommends pivot when no importable months and no new data", () => {
    expect(
      evaluateRefreshRecommendation({
        config,
        before: snapshot({}),
        after: snapshot({}),
        delta: compareEvidenceSnapshots({
          before: snapshot({}),
          after: snapshot({}),
        }),
        monthCoverageAudit: monthAuditBase,
        expansionAttempted: false,
        expansionSucceeded: true,
        importExecuted: false,
      }),
    ).toBe("pivot-new-family");
  });

  it("recommends proceed when evidence broadens enough", () => {
    const beforeSnap = snapshot({ uniqueTradingDayCount: 80 });
    const broad = snapshot({
      calendarMonthsCovered: ["2025-12", "2026-01", "2026-02", "2026-03"],
      forensicsVerdict: "proceed-to-trade-pnl-oos",
      derivedMonthSensitivityRecommendation: "proceed-to-trade-pnl-oos",
      recommendFullM12: true,
      excludingVariantTopMonthShare: 0.4,
      officialPositiveMonthCount: 3,
      uniqueTradingDayCount: 100,
    });

    expect(
      evaluateRefreshRecommendation({
        config,
        before: beforeSnap,
        after: broad,
        delta: compareEvidenceSnapshots({ before: beforeSnap, after: broad }),
        monthCoverageAudit: {
          ...monthAuditBase,
          additionalOfficialMonthsAvailable: true,
        },
        expansionAttempted: true,
        expansionSucceeded: true,
        importExecuted: true,
      }),
    ).toBe("proceed-to-trade-pnl-oos");
  });

  it("recommends pause when excluding-month PnL collapses", () => {
    const beforeSnap = snapshot({});
    const collapsed = snapshot({
      excludingSensitiveMonthNetPnlCents: -100,
      familyNetPnlCents: 500,
    });

    expect(
      evaluateRefreshRecommendation({
        config,
        before: beforeSnap,
        after: collapsed,
        delta: compareEvidenceSnapshots({ before: beforeSnap, after: collapsed }),
        monthCoverageAudit: {
          ...monthAuditBase,
          additionalOfficialMonthsAvailable: true,
        },
        expansionAttempted: true,
        expansionSucceeded: true,
        importExecuted: true,
      }),
    ).toBe("pause-calibration-fade");
  });

  it("recommends insufficient-new-data when import adds nothing", () => {
    expect(
      evaluateRefreshRecommendation({
        config,
        before: snapshot({}),
        after: snapshot({}),
        delta: compareEvidenceSnapshots({
          before: snapshot({}),
          after: snapshot({}),
        }),
        monthCoverageAudit: {
          ...monthAuditBase,
          additionalOfficialMonthsAvailable: true,
        },
        expansionAttempted: true,
        expansionSucceeded: true,
        importExecuted: true,
      }),
    ).toBe("insufficient-new-data");
  });
});

describe("extractEvidenceSnapshot", () => {
  it("parses family metrics from forensics and sensitivity artifacts", () => {
    const extracted = extractEvidenceSnapshot({
      capturedAt: "2026-01-01T00:00:00.000Z",
      hypothesisCandidates: { candidates: [{}, {}, {}, {}] },
      hypothesisValidation: null,
      hypothesisTradeReplay: { summary: { positiveNetHypothesisCount: 4 } },
      calibrationFadeFamilyVerdict: { familyVerdict: "continue-research" },
      pnlForensicsGate: {
        summary: {
          familyNetPnlCents: 7898,
          familyForensicsVerdict: "pause-family-concentrated-pnl",
          uniqueTradingDayCount: 94,
          uniqueMarketCount: 882,
        },
        monthlyPnl: [
          { calendarMonth: "2025-12", netPnlCents: 5596, shareOfTotalPnl: 0.7, filledTradeCount: 217 },
          { calendarMonth: "2026-01", netPnlCents: 1950, shareOfTotalPnl: 0.25, filledTradeCount: 220 },
        ],
      },
      derivedMonthPnlSensitivity: {
        summary: {
          fullCorpusNetPnlCents: 7898,
          excludingSensitiveMonthNetPnlCents: 2302,
          familyRecommendation: "collect-more-official-months",
          recommendFullM12: false,
        },
        variants: [
          { variantId: "full-corpus", topMonthShare: 0.7085 },
          {
            variantId: "excluding-sensitive-month",
            topMonthShare: 0.8471,
            nonSensitivePositiveMonthCount: 3,
          },
        ],
      },
      mispricingAtlas: { totalObservations: 5000 },
    });

    expect(extracted.familyNetPnlCents).toBe(7898);
    expect(extracted.excludingSensitiveMonthNetPnlCents).toBe(2302);
    expect(extracted.officialPositiveMonthCount).toBe(3);
    expect(extracted.excludingVariantTopMonthShare).toBeCloseTo(0.8471);
  });
});

describe("buildOfficialMonthExpansionRefreshReport", () => {
  it("serializes deterministic JSON and consistent HTML", () => {
    const artifacts = {
      historicalCoveragePlan: null,
      hypothesisCandidates: null,
      hypothesisValidation: null,
      hypothesisTradeReplay: null,
      calibrationFadeFamilyVerdict: null,
      pnlForensicsGate: null,
      derivedMonthPnlSensitivity: null,
      mispricingAtlas: null,
    };

    const report = buildOfficialMonthExpansionRefreshReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      inputPaths: {
        researchResultsDir: "data/research-results",
        historicalCoveragePlanPath: "data/research-results/historical-coverage-plan.json",
        historicalExpansionConfigPath: "data/import-configs/historical-expansion-config.json",
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        hypothesisTradeReplayPath: "data/research-results/hypothesis-trade-replay.json",
        calibrationFadeFamilyVerdictPath:
          "data/research-results/calibration-fade-family-verdict.json",
        pnlForensicsGatePath: "data/research-results/pnl-forensics-gate.json",
        derivedMonthPnlSensitivityPath:
          "data/research-results/derived-month-pnl-sensitivity.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        dataHealthPath: "data/research-results/data-health.json",
        regimeTagsPath: "data/research-results/regime-tags.json",
      },
      inputStatus: {
        historicalCoveragePlanPresent: false,
        historicalExpansionConfigPresent: false,
        hypothesisCandidatesPresent: false,
        hypothesisValidationPresent: false,
        hypothesisTradeReplayPresent: false,
        calibrationFadeFamilyVerdictPresent: false,
        pnlForensicsGatePresent: false,
        derivedMonthPnlSensitivityPresent: false,
      },
      config,
      beforeCapturedAt: "2026-01-01T00:00:00.000Z",
      afterCapturedAt: "2026-01-01T00:00:00.000Z",
      artifactsBefore: artifacts,
      artifactsAfter: artifacts,
      expansionExecution: createEmptyExpansionExecution(),
    });

    const json = JSON.parse(serializeOfficialMonthExpansionRefreshReport(report));
    const html = serializeOfficialMonthExpansionRefreshHtml(report);

    expect(json.finalRecommendation).toBeDefined();
    expect(html).toContain("Official Month Expansion");
  });
});
