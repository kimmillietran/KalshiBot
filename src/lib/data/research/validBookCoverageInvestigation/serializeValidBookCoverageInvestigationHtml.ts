import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { ValidBookCoverageInvestigationReport } from "./validBookCoverageInvestigationTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return `${Math.round(value * 1000) / 10}%`;
}

function renderMarketRows(report: ValidBookCoverageInvestigationReport): string {
  const markets = report.runs.flatMap((run) => run.markets);
  if (markets.length === 0) {
    return `<tr><td colspan="6" class="muted">No market breakdown rows.</td></tr>`;
  }

  return markets
    .map(
      (market) => `
      <tr>
        <td><code>${escapeHtml(market.marketTicker)}</code></td>
        <td>${market.recordsSeen}</td>
        <td>${market.captureValidRecords}</td>
        <td>${market.economicallyValidRecords}</td>
        <td>${market.parityUsableRecords}</td>
        <td>${escapeHtml(market.dominantInvalidReason ?? "—")}</td>
      </tr>`,
    )
    .join("");
}

function renderInvalidSamples(report: ValidBookCoverageInvestigationReport): string {
  if (report.invalidSamples.length === 0) {
    return `<tr><td colspan="6" class="muted">No invalid samples captured.</td></tr>`;
  }

  return report.invalidSamples
    .map(
      (sample) => `
      <tr>
        <td><code>${escapeHtml(sample.timestamp)}</code></td>
        <td><code>${escapeHtml(sample.marketTicker)}</code></td>
        <td>${escapeHtml(sample.validityClass)}</td>
        <td>${sample.yesBidCents ?? "—"} / ${sample.yesAskCents ?? "—"}</td>
        <td>${sample.noBidCents ?? "—"} / ${sample.noAskCents ?? "—"}</td>
        <td class="muted">${escapeHtml(sample.reason)}</td>
      </tr>`,
    )
    .join("");
}

export function serializeValidBookCoverageInvestigationHtml(
  report: ValidBookCoverageInvestigationReport,
): string {
  const breakdown = report.aggregateValidityBreakdown;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Valid Book Coverage Investigation</title>
  <style>
    body { background: ${theme.pageBg}; color: ${theme.text}; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .muted { color: ${theme.textMuted}; }
    .verdict { color: ${theme.info}; font-size: 1.25rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: left; vertical-align: top; }
    code { color: ${theme.warning}; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
  </style>
</head>
<body>
  <h1>Valid Book Coverage Investigation</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>

  <div class="panel">
    <div class="verdict">${escapeHtml(report.summary.rootCauseClassification)}</div>
    <p>${escapeHtml(report.summary.whyOnlyFewParityUsable)}</p>
    <p class="muted">Recommended next fix: ${escapeHtml(report.summary.recommendedNextFix)}</p>
    <div class="grid">
      <div class="metric"><strong>Capture valid</strong><div>${breakdown.captureValidRecords}</div></div>
      <div class="metric"><strong>Economically valid</strong><div>${breakdown.economicallyValidRecords}</div></div>
      <div class="metric"><strong>Parity usable</strong><div>${breakdown.parityUsableRecords}</div></div>
      <div class="metric"><strong>Crossed implied</strong><div>${report.summary.crossedImpliedBookRecords}</div></div>
      <div class="metric"><strong>Scanner mapping OK</strong><div>${report.summary.scannerFieldMappingOk ? "yes" : "no"}</div></div>
      <div class="metric"><strong>Capture valid share</strong><div>${formatPercent(breakdown.captureValidShare)}</div></div>
      <div class="metric"><strong>Economic valid share</strong><div>${formatPercent(breakdown.economicValidShare)}</div></div>
      <div class="metric"><strong>Parity usable share</strong><div>${formatPercent(breakdown.parityUsableShare)}</div></div>
    </div>
  </div>

  <div class="panel">
    <h2>Market breakdown</h2>
    <table>
      <thead>
        <tr><th>Market</th><th>Records</th><th>Capture valid</th><th>Economic valid</th><th>Parity usable</th><th>Dominant invalid reason</th></tr>
      </thead>
      <tbody>${renderMarketRows(report)}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Invalid samples</h2>
    <table>
      <thead>
        <tr><th>Timestamp</th><th>Market</th><th>Class</th><th>YES bid/ask</th><th>NO bid/ask</th><th>Reason</th></tr>
      </thead>
      <tbody>${renderInvalidSamples(report)}</tbody>
    </table>
  </div>
</body>
</html>`;
}
