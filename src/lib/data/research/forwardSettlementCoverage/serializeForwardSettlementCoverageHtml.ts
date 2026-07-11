import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { ForwardSettlementCoverageReport } from "./forwardSettlementCoverageTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${Math.round(value * 1000) / 10}%`;
}

function renderMarketRows(report: ForwardSettlementCoverageReport): string {
  if (report.markets.length === 0) {
    return `<tr><td colspan="5" class="muted">No captured markets.</td></tr>`;
  }

  return report.markets
    .map(
      (market) => `
      <tr>
        <td><code>${escapeHtml(market.marketTicker)}</code></td>
        <td>${escapeHtml(market.classification)}</td>
        <td>${escapeHtml(market.settledOutcome)}</td>
        <td>${escapeHtml(market.settlementTime ?? "—")}</td>
        <td class="muted">${escapeHtml(market.exclusionReason ?? market.conflictReason ?? "—")}</td>
      </tr>`,
    )
    .join("");
}

export function serializeForwardSettlementCoverageHtml(
  report: ForwardSettlementCoverageReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Forward Settlement Coverage</title>
  <style>
    body { background: ${theme.pageBg}; color: ${theme.text}; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .verdict { color: ${theme.info}; font-size: 1.2rem; font-weight: 600; }
    .muted { color: ${theme.textMuted}; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: left; vertical-align: top; }
    code { color: ${theme.warning}; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
  </style>
</head>
<body>
  <h1>Forward Settlement Coverage</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>
  <p class="muted">Scope: <code>${escapeHtml(report.summary.analysisScope)}</code> · Run <code>${escapeHtml(report.summary.selectedRunId)}</code></p>

  <div class="panel">
    <div class="verdict">Coverage ${formatPercent(report.summary.coverageShare)}</div>
    <p class="muted">Recommended next action: ${escapeHtml(report.summary.recommendedNextAction)}</p>
    <div class="grid">
      <div class="metric"><strong>Captured</strong><div>${report.summary.capturedMarketCount}</div></div>
      <div class="metric"><strong>Settled</strong><div>${report.summary.settledMarketCount}</div></div>
      <div class="metric"><strong>Joined</strong><div>${report.summary.joinedMarketCount}</div></div>
      <div class="metric"><strong>Unresolved</strong><div>${report.summary.unresolvedMarketCount}</div></div>
    </div>
  </div>

  <div class="panel">
    <h2>Join Integration</h2>
    <p class="muted">Verdict: <code>${escapeHtml(report.joinIntegration.overallVerdict)}</code></p>
    <p class="muted">Join coverage: ${formatPercent(report.joinIntegration.settlementCoverageShare)}</p>
    ${
      report.joinIntegration.marketsExcludedFromJoin.length > 0
        ? `<ul>${report.joinIntegration.marketsExcludedFromJoin
          .map(
            (entry) =>
              `<li><code>${escapeHtml(entry.marketTicker)}</code> — ${escapeHtml(entry.reason)}</li>`,
          )
          .join("")}</ul>`
        : `<p class="muted">All captured markets joined or excluded with explicit reasons above.</p>`
    }
  </div>

  <div class="panel">
    <h2>Per-Market Coverage</h2>
    <table>
      <thead>
        <tr>
          <th>Market</th>
          <th>Classification</th>
          <th>Outcome</th>
          <th>Settlement time</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${renderMarketRows(report)}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Warnings</h2>
    ${
      report.summary.warnings.length > 0
        ? `<ul>${report.summary.warnings
          .map((warning) => `<li>${escapeHtml(warning)}</li>`)
          .join("")}</ul>`
        : `<p class="muted">No warnings.</p>`
    }
  </div>
</body>
</html>`;
}
