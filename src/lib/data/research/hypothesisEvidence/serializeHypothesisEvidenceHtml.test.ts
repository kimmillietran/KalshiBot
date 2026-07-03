import { describe, expect, it } from "vitest";

import { serializeHypothesisEvidenceHtml } from "./serializeHypothesisEvidenceHtml";
import type { HypothesisEvidenceReport } from "./hypothesisEvidenceTypes";

const GENERATED_AT = "2026-07-02T12:00:00.000Z";

function createReport(
  overrides: Partial<HypothesisEvidenceReport> = {},
): HypothesisEvidenceReport {
  return {
    generatedAt: GENERATED_AT,
    htmlOutputPath: "data/reports/research-hypotheses.html",
    candidatesReportPath: "data/research-results/hypothesis-candidates.json",
    candidateCount: 1,
    noCandidateReasons: [],
    cards: [
      {
        candidateId: "atlas-volatility-vol-high-over",
        title: "High volatility appears overconfident",
        strategyFamily: "calibration-no-fade",
        rationale: "Observed calibration error of 10.0%",
        calibrationError: 0.1,
        impliedProbability: 0.7,
        realizedProbability: 0.6,
        sampleSize: 40,
        confidenceLevel: "medium",
        associatedRegime: "vol-high",
        associatedProbabilityBucket: null,
        associatedTimeBucket: null,
        warnings: ["Treat as exploratory only."],
        sourceArtifact: "mispricing-atlas.json",
        confidenceSummary:
          "This hypothesis is based on 40 historical observations spanning 12 unique trading days.",
        exampleMarkets: [
          {
            ticker: "KXBTC15M-MARKET-A",
            closeTime: "2026-06-01T12:00:00.000Z",
            settlement: "yes",
            impliedProbability: 0.7,
            realizedOutcome: 1,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("serializeHypothesisEvidenceHtml", () => {
  it("renders hypothesis cards with required sections", () => {
    const html = serializeHypothesisEvidenceHtml(createReport());

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Hypothesis Evidence Report");
    expect(html).toContain("atlas-volatility-vol-high-over");
    expect(html).toContain("Example markets");
    expect(html).toContain("KXBTC15M-MARKET-A");
    expect(html).toContain("Confidence summary");
    expect(html).toContain("Treat as exploratory only.");
  });

  it("is deterministic for the same report", () => {
    const report = createReport();
    expect(serializeHypothesisEvidenceHtml(report)).toBe(
      serializeHypothesisEvidenceHtml(report),
    );
  });

  it("renders empty-state reasons when no cards exist", () => {
    const html = serializeHypothesisEvidenceHtml(
      createReport({
        candidateCount: 0,
        cards: [],
        noCandidateReasons: ["No candidate: insufficient atlas observations."],
      }),
    );

    expect(html).toContain("No hypothesis candidates");
    expect(html).toContain("insufficient atlas observations");
  });
});
