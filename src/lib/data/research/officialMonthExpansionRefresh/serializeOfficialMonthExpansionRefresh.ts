import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  MonthCoverageAudit,
  OfficialMonthExpansionRefreshReport,
} from "./officialMonthExpansionRefreshTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNullableNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function formatShare(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function recommendationClass(recommendation: string): string {
  if (recommendation === "proceed-to-trade-pnl-oos") {
    return "positive";
  }

  if (
    recommendation === "collect-more-official-months"
    || recommendation === "insufficient-new-data"
  ) {
    return "warning";
  }

  return "negative";
}

function renderMonthAuditRows(audit: MonthCoverageAudit): string {
  return audit.months
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.calendarMonth)}</td>
          <td>${escapeHtml(entry.settlementStatus)}</td>
          <td>${escapeHtml(entry.coverageStatus)}</td>
          <td>${entry.marketCount}</td>
          <td>${entry.tradingDayCount}</td>
          <td>${entry.replayFillCount ?? "—"}</td>
          <td>${entry.importable ? "yes" : "no"}</td>
        </tr>
      `,
    )
    .join("");
}

function renderStyles(): string {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: ${theme.pageBg};
      color: ${theme.text};
      line-height: 1.5;
    }
    main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 20px; }
    h1, h2, h3 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 20px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .stat { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
    .stat .label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; }
    .stat .value { font-size: 20px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px 10px; text-align: left; }
    .positive { color: ${theme.bullish}; }
    .negative { color: ${theme.bearish}; }
    .warning { color: ${theme.warning}; }
    ul { margin: 0; padding-left: 20px; }
  `;
}

export function serializeOfficialMonthExpansionRefreshReport(
  report: OfficialMonthExpansionRefreshReport,
): string {
  return stableStringify(report);
}

export function serializeMonthCoverageAuditReport(audit: MonthCoverageAudit): string {
  return stableStringify(audit);
}

export function serializeOfficialMonthExpansionRefreshHtml(
  report: OfficialMonthExpansionRefreshReport,
): string {
  const { before, after, delta, monthCoverageAudit: audit } = report;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Official Month Expansion Refresh</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Official Month Expansion / Calibration-Fade Evidence Refresh (M11.11)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
      </section>
      <section class="panel">
        <h2>Final Recommendation</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Recommendation</div>
            <div class="value ${recommendationClass(report.finalRecommendation)}">${escapeHtml(report.finalRecommendation)}</div>
          </div>
          <div class="stat">
            <div class="label">Recommend Full M12</div>
            <div class="value">${report.recommendFullM12 ? "yes" : "no"}</div>
          </div>
        </div>
        <p class="muted">${escapeHtml(audit.additionalOfficialMonthsReason)}</p>
        ${
          report.warnings.length > 0
            ? `<h3>Warnings</h3><ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
            : ""
        }
      </section>
      <section class="panel">
        <h2>Before vs After</h2>
        <table>
          <thead>
            <tr><th>Metric</th><th>Before</th><th>After</th><th>Delta</th></tr>
          </thead>
          <tbody>
            <tr><td>Family net PnL (¢)</td><td>${formatNullableNumber(before.familyNetPnlCents)}</td><td>${formatNullableNumber(after.familyNetPnlCents)}</td><td>${formatNullableNumber(delta.familyNetPnlCentsDelta)}</td></tr>
            <tr><td>Excl. sensitive month PnL (¢)</td><td>${formatNullableNumber(before.excludingSensitiveMonthNetPnlCents)}</td><td>${formatNullableNumber(after.excludingSensitiveMonthNetPnlCents)}</td><td>${formatNullableNumber(delta.excludingSensitiveMonthNetPnlCentsDelta)}</td></tr>
            <tr><td>Top month share</td><td>${formatShare(before.topMonthShare)}</td><td>${formatShare(after.topMonthShare)}</td><td>${formatShare(delta.topMonthShareDelta)}</td></tr>
            <tr><td>Excl.-month top share</td><td>${formatShare(before.excludingVariantTopMonthShare)}</td><td>${formatShare(after.excludingVariantTopMonthShare)}</td><td>—</td></tr>
            <tr><td>Markets</td><td>${before.marketCount ?? "—"}</td><td>${after.marketCount ?? "—"}</td><td>${delta.marketCountDelta ?? "—"}</td></tr>
            <tr><td>Positive months</td><td>${before.positiveMonthCount ?? "—"}</td><td>${after.positiveMonthCount ?? "—"}</td><td>${delta.positiveMonthCountDelta ?? "—"}</td></tr>
            <tr><td>Trading days</td><td>${before.uniqueTradingDayCount ?? "—"}</td><td>${after.uniqueTradingDayCount ?? "—"}</td><td>${delta.uniqueTradingDayCountDelta ?? "—"}</td></tr>
            <tr><td>Forensics verdict</td><td>${escapeHtml(before.forensicsVerdict ?? "—")}</td><td>${escapeHtml(after.forensicsVerdict ?? "—")}</td><td>—</td></tr>
            <tr><td>M11.10 recommendation</td><td>${escapeHtml(before.derivedMonthSensitivityRecommendation ?? "—")}</td><td>${escapeHtml(after.derivedMonthSensitivityRecommendation ?? "—")}</td><td>—</td></tr>
          </tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Month Coverage Audit</h2>
        <table>
          <thead>
            <tr><th>Month</th><th>Settlement</th><th>Coverage</th><th>Markets</th><th>Days</th><th>Replay fills</th><th>Importable</th></tr>
          </thead>
          <tbody>${renderMonthAuditRows(audit)}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Expansion Execution</h2>
        <p>Import executed: ${report.expansionExecution.importExecuted ? "yes" : "no"}</p>
        <p>Evidence chain executed: ${report.expansionExecution.evidenceChainExecuted ? "yes" : "no"}</p>
        <p>Months added: ${escapeHtml(report.expansionExecution.monthsAdded.join(", ") || "none")}</p>
        <p>Months deepened: ${escapeHtml(report.expansionExecution.monthsDeepened.join(", ") || "none")}</p>
      </section>
    </main>
  </body>
</html>`;
}

export function serializeMonthCoverageAuditHtml(audit: MonthCoverageAudit): string {
  return serializeOfficialMonthExpansionRefreshHtml({
    generatedAt: audit.generatedAt,
    outputPath: "",
    htmlOutputPath: "",
    disclaimer: "Month coverage audit for official month expansion refresh.",
    caveats: [],
    config: {
      sensitiveMonth: audit.sensitiveMonths[0] ?? "2025-12",
      minOfficialPositiveMonths: 3,
      topMonthMaxShare: 0.6,
      minUniqueTradingDayIncrease: 0,
    },
    inputPaths: buildPlaceholderPaths(),
    inputStatus: {
      historicalCoveragePlanPresent: true,
      historicalExpansionConfigPresent: false,
      hypothesisCandidatesPresent: false,
      hypothesisValidationPresent: false,
      hypothesisTradeReplayPresent: false,
      calibrationFadeFamilyVerdictPresent: false,
      pnlForensicsGatePresent: false,
      derivedMonthPnlSensitivityPresent: false,
    },
    monthCoverageAudit: audit,
    before: emptySnapshot(audit.generatedAt),
    after: emptySnapshot(audit.generatedAt),
    delta: {
      calendarMonthsAdded: [],
      officialMonthsAdded: [],
      marketCountDelta: null,
      observationCountDelta: null,
      hypothesisCountDelta: null,
      positiveNetReplayHypothesisCountDelta: null,
      familyNetPnlCentsDelta: null,
      excludingSensitiveMonthNetPnlCentsDelta: null,
      topMonthShareDelta: null,
      top3MonthShareDelta: null,
      positiveMonthCountDelta: null,
      negativeMonthCountDelta: null,
      uniqueTradingDayCountDelta: null,
    },
    expansionExecution: {
      attempted: false,
      succeeded: true,
      importExecuted: false,
      rebuildExecuted: false,
      evidenceChainExecuted: false,
      monthsAdded: [],
      monthsDeepened: [],
      commandsRun: [],
      errors: [],
    },
    finalRecommendation: "collect-more-official-months",
    recommendFullM12: false,
    warnings: [],
  });
}

function buildPlaceholderPaths() {
  return {
    researchResultsDir: "data/research-results",
    historicalCoveragePlanPath: "data/research-results/historical-coverage-plan.json",
    historicalExpansionConfigPath: "data/import-configs/historical-expansion-config.json",
    hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
    hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
    hypothesisTradeReplayPath: "data/research-results/hypothesis-trade-replay.json",
    calibrationFadeFamilyVerdictPath: "data/research-results/calibration-fade-family-verdict.json",
    pnlForensicsGatePath: "data/research-results/pnl-forensics-gate.json",
    derivedMonthPnlSensitivityPath: "data/research-results/derived-month-pnl-sensitivity.json",
    mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
    dataHealthPath: "data/research-results/data-health.json",
    regimeTagsPath: "data/research-results/regime-tags.json",
  };
}

function emptySnapshot(capturedAt: string) {
  return {
    capturedAt,
    calendarMonthsCovered: [],
    officialMonthsCovered: [],
    derivedSensitiveMonthsCovered: [],
    marketCount: null,
    observationCount: null,
    hypothesisCount: null,
    positiveNetReplayHypothesisCount: null,
    familyNetPnlCents: null,
    excludingSensitiveMonthNetPnlCents: null,
    topMonthShare: null,
    top3MonthShare: null,
    positiveMonthCount: null,
    negativeMonthCount: null,
    uniqueTradingDayCount: null,
    familyVerdict: null,
    forensicsVerdict: null,
    derivedMonthSensitivityRecommendation: null,
    recommendFullM12: null,
    officialPositiveMonthCount: null,
    excludingVariantTopMonthShare: null,
  };
}
