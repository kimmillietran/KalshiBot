import { describe, expect, it } from "vitest";

import { serializeHypothesisLifecycleHtml } from "./serializeHypothesisLifecycleHtml";
import type { HypothesisLifecycleReport } from "./hypothesisLifecycleTypes";

const REPORT: HypothesisLifecycleReport = {
  generatedAt: "2026-07-03T20:00:00.000Z",
  outputPath: "data/reports/research-hypothesis-lifecycle.html",
  inputPaths: {
    hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
    evidenceHtmlPath: "data/reports/research-hypotheses.html",
    hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
    strategySynthesisPath: "data/research-results/strategy-synthesis-candidates.json",
    strategyHarnessSummaryPath: "data/research-results/harness/strategy-harness-summary.json",
    strategyHarnessOutputDir: "data/research-results/harness",
  },
  summary: {
    totalHypotheses: 1,
    promotedCount: 0,
    rejectedCount: 0,
    pendingCount: 1,
    backtestedCount: 0,
    missingValidationCount: 0,
  },
  entries: [
    {
      hypothesisId: "hyp-a",
      title: "Sample hypothesis",
      status: "validated",
      robustnessScore: 72,
      linkedStrategyId: null,
      validationOutcome: "passed",
      promotionDecision: "pending",
      timestamps: {
        generatedAt: "2026-07-03T18:00:00.000Z",
        evidenceReportAt: "2026-07-03T18:10:00.000Z",
        validationAt: "2026-07-03T18:30:00.000Z",
        synthesisAt: null,
        backtestAt: null,
        promotionAt: null,
      },
      warnings: [],
      stages: [
        {
          stageId: "generated",
          label: "Generated",
          status: "completed",
          timestamp: "2026-07-03T18:00:00.000Z",
          detail: "calibration-no-fade",
        },
      ],
    },
  ],
};

describe("serializeHypothesisLifecycleHtml", () => {
  it("escapes user-facing strings and renders a complete HTML document", () => {
    const html = serializeHypothesisLifecycleHtml({
      ...REPORT,
      entries: [
        {
          ...REPORT.entries[0]!,
          title: "Use <script>alert('x')</script> safely",
        },
      ],
    });

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("&lt;script&gt;alert('x')&lt;/script&gt;");
    expect(html).not.toContain("<script>alert('x')</script>");
  });
});
