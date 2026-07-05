import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  CoverageDepthStatus,
  EstimatedSupportLevel,
  HistoricalCoveragePlanReport,
  MonthCoverageEntry,
} from "./coveragePlannerTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function supportLevelBadge(level: EstimatedSupportLevel): string {
  const styles: Record<EstimatedSupportLevel, { label: string; color: string }> = {
    high: { label: "Likely importable", color: theme.bullish },
    medium: { label: "Partially supported", color: theme.warning },
    low: { label: "Mostly unsupported", color: theme.bearish },
  };
  const entry = styles[level];
  return `<span class="status-badge" style="background:${entry.color}22;color:${entry.color};border:1px solid ${entry.color}55">${entry.label}</span>`;
}

function statusBadge(status: CoverageDepthStatus): string {
  const styles: Record<CoverageDepthStatus, { label: string; color: string }> = {
    MISSING: { label: "Missing", color: theme.bearish },
    UNDER_COVERED: { label: "Under-covered", color: theme.warning },
    COVERED: { label: "Covered", color: theme.bullish },
  };
  const entry = styles[status];
  return `<span class="status-badge" style="background:${entry.color}22;color:${entry.color};border:1px solid ${entry.color}55">${entry.label}</span>`;
}

function renderThresholdCell(entry: MonthCoverageEntry): string {
  return `${entry.marketCount} / ${entry.thresholds.minMarketsPerMonth}`;
}

function renderTradingDayCell(entry: MonthCoverageEntry): string {
  return `${entry.tradingDayCount} / ${entry.thresholds.minTradingDaysPerMonth}`;
}

function renderSummaryCards(report: HistoricalCoveragePlanReport): string {
  const { snapshot } = report;
  return `
    <section class="summary-grid">
      <div class="summary-card"><div class="summary-label">Markets</div><div class="summary-value">${snapshot.marketCount}</div></div>
      <div class="summary-card"><div class="summary-label">Trading days</div><div class="summary-value">${snapshot.uniqueTradingDays}</div></div>
      <div class="summary-card"><div class="summary-label">Covered months</div><div class="summary-value" style="color:${theme.bullish}">${snapshot.coveredMonths.length}</div></div>
      <div class="summary-card"><div class="summary-label">Under-covered</div><div class="summary-value" style="color:${theme.warning}">${snapshot.underCoveredMonths.length}</div></div>
      <div class="summary-card"><div class="summary-label">Missing months</div><div class="summary-value" style="color:${theme.bearish}">${snapshot.missingMonths.length}</div></div>
      <div class="summary-card"><div class="summary-label">Recommendations</div><div class="summary-value">${report.recommendations.length}</div></div>
      <div class="summary-card"><div class="summary-label">Historical success rate</div><div class="summary-value">${report.importability.historicalSuccessRate === null ? "—" : `${Math.round(report.importability.historicalSuccessRate * 100)}%`}</div></div>
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
        <td>${renderThresholdCell(entry)}</td>
        <td>${renderTradingDayCell(entry)}</td>
        <td>${statusBadge(entry.coverageStatus)}</td>
      </tr>`,
    )
    .join("");

  const missingMonths =
    report.snapshot.missingMonths.length > 0
      ? report.snapshot.missingMonths.map(escapeHtml).join(", ")
      : "—";
  const underCoveredMonths =
    report.snapshot.underCoveredMonths.length > 0
      ? report.snapshot.underCoveredMonths.map(escapeHtml).join(", ")
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
          <div class="recommendation-badges">
            ${supportLevelBadge(entry.estimatedSupportLevel)}
            <span class="priority-pill">Priority ${entry.priorityScore}</span>
          </div>
        </div>
        <p>${escapeHtml(entry.rationale)}</p>
        <p class="muted">${escapeHtml(entry.expectedResearchBenefit)}</p>
        <p class="muted">Target months: ${escapeHtml(entry.missingMonths.join(", ") || "—")} · Estimated unsupported rate: ${Math.round(entry.estimatedUnsupportedRate * 100)}%</p>
      </article>`,
    )
    .join("");

  const notes = report.plannerNotes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");

  const { depthThresholds } = report.snapshot;

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
    .status-badge {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }
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
    .recommendation-badges {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
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
    <p class="muted">Depth thresholds: ${depthThresholds.minMarketsPerMonth} markets/month · ${depthThresholds.minTradingDaysPerMonth} trading days/month</p>
  </header>

  ${renderSummaryCards(report)}

  <section class="panel">
    <h2>Coverage horizon</h2>
    <p>Earliest month: <strong>${escapeHtml(report.snapshot.coverageHorizon.earliestMonth ?? "—")}</strong></p>
    <p>Latest month: <strong>${escapeHtml(report.snapshot.coverageHorizon.latestMonth ?? "—")}</strong></p>
    <p>Missing months in horizon: <strong>${escapeHtml(missingMonths)}</strong></p>
    <p>Under-covered months in horizon: <strong>${escapeHtml(underCoveredMonths)}</strong></p>
    <p class="muted">Import configs: ${report.snapshot.importConfigCount} · Fixtures: ${report.snapshot.fixtureCount} · Research outputs: ${report.snapshot.researchOutputCount}</p>
  </section>

  <section class="panel">
    <h2>Month coverage</h2>
    <table>
      <thead><tr><th>Month</th><th>Markets</th><th>Trading days</th><th>Status</th></tr></thead>
      <tbody>${monthRows || "<tr><td colspan=\"4\">No month coverage detected</td></tr>"}</tbody>
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
    <h2>Historical importability</h2>
    <p class="muted">Source: <code>${escapeHtml(report.importability.summaryPath ?? "—")}</code> · ${report.importability.summaryPresent ? "loaded" : "not found"}</p>
    <div class="summary-grid">
      <div class="summary-card"><div class="summary-label">Prior attempts</div><div class="summary-value">${report.importability.totalAttempts}</div></div>
      <div class="summary-card"><div class="summary-label">Successful imports</div><div class="summary-value" style="color:${theme.bullish}">${report.importability.successfulImports}</div></div>
      <div class="summary-card"><div class="summary-label">Unsupported markets</div><div class="summary-value" style="color:${theme.bearish}">${report.importability.unsupportedMarkets}</div></div>
      <div class="summary-card"><div class="summary-label">Compatibility failures</div><div class="summary-value">${report.importability.compatibilityFailures}</div></div>
    </div>
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
