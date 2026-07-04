import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { HistoricalCoveragePlanReport } from "./coveragePlannerTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderSummaryCards(report: HistoricalCoveragePlanReport): string {
  const { snapshot } = report;
  return `
    <section class="summary-grid">
      <div class="summary-card"><div class="summary-label">Markets</div><div class="summary-value">${snapshot.marketCount}</div></div>
      <div class="summary-card"><div class="summary-label">Trading days</div><div class="summary-value">${snapshot.uniqueTradingDays}</div></div>
      <div class="summary-card"><div class="summary-label">Months covered</div><div class="summary-value">${snapshot.monthCoverage.length}</div></div>
      <div class="summary-card"><div class="summary-label">Missing months</div><div class="summary-value" style="color:${theme.warning}">${snapshot.missingMonths.length}</div></div>
      <div class="summary-card"><div class="summary-label">Recommendations</div><div class="summary-value">${report.recommendations.length}</div></div>
    </section>`;
}

/** Serializes the historical coverage plan as a standalone HTML report. */
export function serializeHistoricalCoveragePlanHtml(
  report: HistoricalCoveragePlanReport,
): string {
  const monthRows = report.snapshot.monthCoverage
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.month)}</td>
        <td>${entry.marketCount}</td>
        <td>${entry.tradingDayCount}</td>
      </tr>`,
    )
    .join("");

  const missingMonths =
    report.snapshot.missingMonths.length > 0
      ? report.snapshot.missingMonths.map(escapeHtml).join(", ")
      : "—";

  const regimeRows = report.snapshot.volatilityRegimeCoverage
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.regime)}</td>
        <td>${entry.marketCount}</td>
      </tr>`,
    )
    .join("");

  const marketTypeRows = report.snapshot.marketTypeCoverage
    .map(
      (entry) => `
      <tr>
        <td><code>${escapeHtml(entry.seriesTicker)}</code></td>
        <td>${entry.marketCount}</td>
        <td>${entry.monthCount}</td>
        <td><code>${escapeHtml(entry.tickerPattern)}</code></td>
      </tr>`,
    )
    .join("");

  const recommendationCards = report.recommendations
    .map(
      (entry) => `
      <article class="recommendation-card">
        <div class="recommendation-header">
          <h3>${escapeHtml(entry.seriesTicker)} · ${escapeHtml(entry.startMonth)} → ${escapeHtml(entry.endMonth)}</h3>
          <span class="priority-pill">Priority ${entry.priorityScore}</span>
        </div>
        <p>${escapeHtml(entry.rationale)}</p>
        <p class="muted">${escapeHtml(entry.expectedResearchBenefit)}</p>
        <p class="muted">Missing months: ${escapeHtml(entry.missingMonths.join(", ") || "—")}</p>
      </article>`,
    )
    .join("");

  const notes = report.plannerNotes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Historical Coverage Expansion Plan</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2, h3 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
      overflow-x: auto;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .summary-card {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .summary-label { color: ${theme.textMuted}; font-size: 12px; }
    .summary-value { font-size: 28px; font-weight: 700; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
    code { color: ${theme.info}; }
    .recommendation-card {
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
      margin-top: 12px;
      background: ${theme.panelBg};
    }
    .recommendation-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 8px;
    }
    .priority-pill {
      background: ${theme.info};
      color: ${theme.pageBg};
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <header>
    <h1>Historical Coverage Expansion Plan</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} · read-only planner</p>
  </header>

  ${renderSummaryCards(report)}

  <section class="panel">
    <h2>Coverage horizon</h2>
    <p>Earliest month: <strong>${escapeHtml(report.snapshot.coverageHorizon.earliestMonth ?? "—")}</strong></p>
    <p>Latest month: <strong>${escapeHtml(report.snapshot.coverageHorizon.latestMonth ?? "—")}</strong></p>
    <p>Missing months in horizon: <strong>${escapeHtml(missingMonths)}</strong></p>
    <p class="muted">Import configs: ${report.snapshot.importConfigCount} · Fixtures: ${report.snapshot.fixtureCount} · Research outputs: ${report.snapshot.researchOutputCount}</p>
  </section>

  <section class="panel">
    <h2>Month coverage</h2>
    <table>
      <thead><tr><th>Month</th><th>Markets</th><th>Trading days</th></tr></thead>
      <tbody>${monthRows || "<tr><td colspan=\"3\">No month coverage detected</td></tr>"}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Volatility regime coverage</h2>
    <table>
      <thead><tr><th>Regime</th><th>Markets</th></tr></thead>
      <tbody>${regimeRows}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Market type / ticker pattern</h2>
    <table>
      <thead><tr><th>Series</th><th>Markets</th><th>Months</th><th>Pattern</th></tr></thead>
      <tbody>${marketTypeRows || "<tr><td colspan=\"4\">No market types detected</td></tr>"}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Recommended import windows</h2>
    ${recommendationCards || "<p class=\"muted\">No import windows recommended.</p>"}
  </section>

  <section class="panel">
    <h2>Planner notes</h2>
    <ul>${notes}</ul>
  </section>
</body>
</html>`;
}
