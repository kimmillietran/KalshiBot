import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CaptureBaselineComparisonReport } from "./captureBaselineComparisonTypes";
import { formatShare } from "./captureBaselineComparisonUtils";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }

  if (Math.abs(value) < 1 && value !== 0) {
    return formatShare(value);
  }

  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function renderStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; line-height: 1.5; }
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
    ul { margin: 0; padding-left: 20px; }
    .improved { color: #86efac; }
    .regressed { color: #fca5a5; }
  `;
}

export function serializeCaptureBaselineComparisonReport(
  report: CaptureBaselineComparisonReport,
): string {
  return stableStringify(report);
}

export function serializeCaptureBaselineComparisonHtml(
  report: CaptureBaselineComparisonReport,
): string {
  const deltaRows = report.deltas
    .map(
      (delta) => `
        <tr>
          <td>${escapeHtml(delta.metric)}</td>
          <td>${formatNumber(delta.baseline)}</td>
          <td>${formatNumber(delta.comparison)}</td>
          <td>${formatNumber(delta.delta)}</td>
          <td class="${delta.direction === "improved" ? "improved" : delta.direction === "regressed" ? "regressed" : ""}">${escapeHtml(delta.direction)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Capture Baseline Comparison</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Post-Capture Baseline Comparison (M12.13)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
      </section>

      <section class="panel">
        <h2>Executive Summary</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Overall Verdict</div><div class="value">${escapeHtml(report.summary.overallVerdict)}</div></div>
          <div class="stat"><div class="label">Current Bottleneck</div><div class="value">${escapeHtml(report.summary.currentBottleneck)}</div></div>
          <div class="stat"><div class="label">Improvements</div><div class="value">${report.summary.improvements.length}</div></div>
          <div class="stat"><div class="label">Regressions</div><div class="value">${report.summary.regressions.length}</div></div>
        </div>
        <p><strong>Recommended next action:</strong> ${escapeHtml(report.summary.recommendedNextAction)}</p>
      </section>

      <section class="panel">
        <h2>Baseline vs Comparison</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Baseline</div><div class="value">${escapeHtml(report.baseline.label)}</div></div>
          <div class="stat"><div class="label">Comparison</div><div class="value">${escapeHtml(report.comparison.label)}</div></div>
          <div class="stat"><div class="label">Bid Size Coverage</div><div class="value">${formatShare(report.comparison.bidSizeCoverageShare)}</div></div>
          <div class="stat"><div class="label">Capture Health</div><div class="value">${escapeHtml(report.comparison.captureHealthVerdict ?? "—")}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>Metric Deltas</h2>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Baseline</th>
              <th>Comparison</th>
              <th>Delta</th>
              <th>Direction</th>
            </tr>
          </thead>
          <tbody>${deltaRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Improvements</h2>
        <ul>${report.summary.improvements.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>None detected</li>"}</ul>
      </section>

      <section class="panel">
        <h2>Regressions</h2>
        <ul>${report.summary.regressions.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>None detected</li>"}</ul>
      </section>

      <section class="panel">
        <h2>Caveats</h2>
        <ul>${report.caveats.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        ${report.summary.warnings.length > 0 ? `<h3>Warnings</h3><ul>${report.summary.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </section>
    </main>
  </body>
</html>`;
}
