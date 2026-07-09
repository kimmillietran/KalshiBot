import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { StaticParityScanReport } from "./staticParityScanTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return value.toLocaleString("en-US");
}

function renderCandidateRows(report: StaticParityScanReport): string {
  if (report.candidateSamples.length === 0) {
    return `<tr><td colspan="8" class="muted">No candidate samples captured.</td></tr>`;
  }

  return report.candidateSamples
    .map(
      (sample) => `
      <tr>
        <td><code>${escapeHtml(sample.timestamp)}</code></td>
        <td><code>${escapeHtml(sample.marketTicker)}</code></td>
        <td>${sample.yesAskCents ?? "—"} / ${sample.noAskCents ?? "—"}</td>
        <td>${sample.yesBidCents ?? "—"} / ${sample.noBidCents ?? "—"}</td>
        <td>${sample.yesAskPlusNoAskCents ?? "—"}</td>
        <td>${sample.grossEdgeCents ?? "—"}</td>
        <td>${sample.estimatedNetEdgeCents ?? "—"}</td>
        <td>${escapeHtml(sample.classification)}</td>
      </tr>`,
    )
    .join("");
}

function renderRunRows(report: StaticParityScanReport): string {
  if (report.runs.length === 0) {
    return `<tr><td colspan="5" class="muted">No runs scanned.</td></tr>`;
  }

  return report.runs
    .map(
      (run) => `
      <tr>
        <td><code>${escapeHtml(run.runId)}</code></td>
        <td>${run.scanned ? "yes" : "no"}</td>
        <td>${escapeHtml(run.skipReason ?? "—")}</td>
        <td>${formatNumber(run.topOfBookRecordCount)}</td>
        <td>${run.grossCandidateCount} / ${run.bufferAdjustedCandidateCount}</td>
      </tr>`,
    )
    .join("");
}

export function serializeStaticParityScanHtml(
  report: StaticParityScanReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Static Same-Market Parity Scan</title>
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
  <h1>Static Same-Market Parity Scan</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>

  <div class="panel">
    <div class="verdict">${escapeHtml(report.summary.overallClassification)}</div>
    <p class="muted">Recommended next action: ${escapeHtml(report.summary.recommendedNextAction)}</p>
    <div class="grid">
      <div class="metric"><strong>Runs scanned</strong><div>${report.metrics.runCountScanned}</div></div>
      <div class="metric"><strong>Runs skipped</strong><div>${report.metrics.runsSkipped}</div></div>
      <div class="metric"><strong>Records scanned</strong><div>${formatNumber(report.metrics.topOfBookRecordsScanned)}</div></div>
      <div class="metric"><strong>Gross candidates</strong><div>${formatNumber(report.metrics.grossParityCandidateCount)}</div></div>
      <div class="metric"><strong>Buffer-adjusted</strong><div>${formatNumber(report.metrics.bufferAdjustedCandidateCount)}</div></div>
      <div class="metric"><strong>Max gross edge</strong><div>${report.metrics.maxGrossEdgeCents ?? "—"}¢</div></div>
    </div>
  </div>

  <div class="panel">
    <h2>Friction model</h2>
    <p class="muted">feeBuffer=${report.friction.feeBufferCents}¢, minGrossEdge=${report.friction.minGrossEdgeCents}¢, minSize=${report.friction.minSizeContracts}</p>
  </div>

  <div class="panel">
    <h2>Candidate samples</h2>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th><th>Market</th><th>YES/NO ask</th><th>YES/NO bid</th>
          <th>YES ask + NO ask</th><th>Gross edge</th><th>Net edge</th><th>Class</th>
        </tr>
      </thead>
      <tbody>${renderCandidateRows(report)}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Runs</h2>
    <table>
      <thead>
        <tr><th>Run</th><th>Scanned</th><th>Skip reason</th><th>Records</th><th>Gross / buffered</th></tr>
      </thead>
      <tbody>${renderRunRows(report)}</tbody>
    </table>
  </div>
</body>
</html>`;
}
