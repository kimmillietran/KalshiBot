import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { ForwardCaptureReadinessReport } from "./forwardCaptureReadinessTypes";

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

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return `${Math.round(value * 1000) / 10}%`;
}

function renderRunRows(report: ForwardCaptureReadinessReport): string {
  if (report.runs.length === 0) {
    return `<tr><td colspan="8" class="muted">No capture runs found.</td></tr>`;
  }

  return report.runs
    .map(
      (run) => `
      <tr>
        <td><code>${escapeHtml(run.runId)}</code></td>
        <td>${run.durationMinutes.toFixed(1)}m</td>
        <td>${run.topOfBookRecordCount}</td>
        <td>${run.btcSpotRecordCount}</td>
        <td>${formatPercent(run.validBookShare)}</td>
        <td>${run.sequenceGapCount}</td>
        <td>${escapeHtml(run.verdict ?? "—")}</td>
        <td>${run.successful ? "yes" : "—"}</td>
      </tr>`,
    )
    .join("");
}

function renderFamilyReadiness(report: ForwardCaptureReadinessReport): string {
  return report.summary.familyReadiness
    .map(
      (entry) => `
      <div class="family-card">
        <strong>${escapeHtml(entry.familyId)}</strong>
        <div class="verdict">${escapeHtml(entry.verdict)}</div>
        <div class="muted">${escapeHtml(entry.rationale)}</div>
      </div>`,
    )
    .join("");
}

function renderBreakdownRows(
  entries: ForwardCaptureReadinessReport["byDate"],
): string {
  if (entries.length === 0) {
    return `<tr><td colspan="4" class="muted">No breakdown rows.</td></tr>`;
  }

  return entries
    .map(
      (entry) => `
      <tr>
        <td><code>${escapeHtml(entry.key)}</code></td>
        <td>${entry.runCount}</td>
        <td>${entry.totalDurationMinutes.toFixed(1)}m</td>
        <td>${entry.topOfBookRecordCount}</td>
      </tr>`,
    )
    .join("");
}

/** Serializes the forward capture readiness report to standalone HTML. */
export function serializeForwardCaptureReadinessHtml(
  report: ForwardCaptureReadinessReport,
): string {
  const aggregates = report.aggregates;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Forward Capture Research Readiness</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; line-height: 1.5; }
    main { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
    h1, h2 { margin: 0 0 0.75rem; }
    h2 { margin-top: 2rem; font-size: 1.125rem; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 1rem 1.25rem; margin-top: 1rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
    .stat-card { background: ${theme.panelInset}; border-radius: 10px; padding: 0.75rem; }
    .stat-label { color: ${theme.textMuted}; font-size: 0.75rem; text-transform: uppercase; }
    .stat-value { font-size: 1.25rem; font-weight: 600; margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    th, td { text-align: left; padding: 0.5rem 0.625rem; border-bottom: 1px solid ${theme.panelBorder}; vertical-align: top; }
    th { color: ${theme.textMuted}; font-size: 0.6875rem; text-transform: uppercase; }
    code { color: ${theme.info}; font-size: 0.8125rem; }
    .verdict-banner { font-size: 1.5rem; font-weight: 700; color: ${theme.warning}; }
    .disclaimer { border-left: 3px solid ${theme.warning}; padding-left: 0.875rem; color: ${theme.textMuted}; }
    .family-card { background: ${theme.panelInset}; border-radius: 10px; padding: 0.875rem; margin-bottom: 0.75rem; }
    .family-card .verdict { font-weight: 600; margin: 0.25rem 0; }
    .caveat-list { margin: 0; padding-left: 1.25rem; color: ${theme.textMuted}; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Forward Capture Research Readiness</h1>
      <p class="verdict-banner">${escapeHtml(report.summary.overallVerdict)}</p>
      <p class="disclaimer">${escapeHtml(report.disclaimer)}</p>
    </header>

    <section class="panel">
      <h2>Executive verdict</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Overall</div><div class="stat-value">${escapeHtml(report.summary.overallVerdict)}</div></div>
        <div class="stat-card"><div class="stat-label">Next action</div><div class="stat-value">${escapeHtml(report.summary.recommendedNextAction)}</div></div>
        <div class="stat-card"><div class="stat-label">Runs</div><div class="stat-value">${aggregates.runCount}</div></div>
        <div class="stat-card"><div class="stat-label">Duration</div><div class="stat-value">${aggregates.totalDurationMinutes.toFixed(1)}m</div></div>
        <div class="stat-card"><div class="stat-label">TOB records</div><div class="stat-value">${formatNumber(aggregates.topOfBookRecordCount)}</div></div>
        <div class="stat-card"><div class="stat-label">BTC spot records</div><div class="stat-value">${formatNumber(aggregates.btcSpotRecordCount)}</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>Capture inventory</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Valid book share</div><div class="stat-value">${formatPercent(aggregates.validBookShare)}</div></div>
        <div class="stat-card"><div class="stat-label">BTC spot coverage</div><div class="stat-value">${formatPercent(aggregates.btcSpotCoverageShare)}</div></div>
        <div class="stat-card"><div class="stat-label">Non-zero spread</div><div class="stat-value">${formatPercent(aggregates.nonZeroSpreadShare)}</div></div>
        <div class="stat-card"><div class="stat-label">Zero spread</div><div class="stat-value">${formatPercent(aggregates.zeroSpreadShare)}</div></div>
        <div class="stat-card"><div class="stat-label">Median TOB gap</div><div class="stat-value">${formatNumber(aggregates.medianTopOfBookGapMs)}ms</div></div>
        <div class="stat-card"><div class="stat-label">p90 TOB gap</div><div class="stat-value">${formatNumber(aggregates.p90TopOfBookGapMs)}ms</div></div>
        <div class="stat-card"><div class="stat-label">Sequence gaps</div><div class="stat-value">${aggregates.sequenceGapCount}</div></div>
        <div class="stat-card"><div class="stat-label">Days covered</div><div class="stat-value">${aggregates.daysCovered}</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>Run table</h2>
      <table>
        <thead><tr><th>Run</th><th>Duration</th><th>TOB</th><th>BTC</th><th>Valid books</th><th>Gaps</th><th>Verdict</th><th>Success</th></tr></thead>
        <tbody>${renderRunRows(report)}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Coverage by day</h2>
      <table>
        <thead><tr><th>Date</th><th>Runs</th><th>Duration</th><th>TOB records</th></tr></thead>
        <tbody>${renderBreakdownRows(report.byDate)}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Top-of-book continuity</h2>
      <p class="muted">Median gap ${formatNumber(aggregates.medianTopOfBookGapMs)}ms · p90 gap ${formatNumber(aggregates.p90TopOfBookGapMs)}ms · reconnects ${aggregates.reconnectCount}</p>
    </section>

    <section class="panel">
      <h2>BTC spot coverage</h2>
      <p class="muted">BTC spot records ${formatNumber(aggregates.btcSpotRecordCount)} · coverage share ${formatPercent(aggregates.btcSpotCoverageShare)}</p>
    </section>

    <section class="panel">
      <h2>Spread sanity</h2>
      <p class="muted">Non-zero spread ${formatPercent(aggregates.nonZeroSpreadShare)} · zero spread ${formatPercent(aggregates.zeroSpreadShare)}</p>
    </section>

    <section class="panel">
      <h2>Readiness by research family</h2>
      ${renderFamilyReadiness(report)}
    </section>

    <section class="panel">
      <h2>Recommended next action</h2>
      <p><strong>${escapeHtml(report.summary.recommendedNextAction)}</strong></p>
    </section>

    <section class="panel">
      <h2>Caveats</h2>
      <ul class="caveat-list">
        ${report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}
      </ul>
    </section>
  </main>
</body>
</html>`;
}
