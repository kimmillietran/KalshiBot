import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CaptureQualityValidationReport } from "./captureQualityValidationTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatShare(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
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
    .positive { color: ${theme.bullish}; }
    .negative { color: ${theme.bearish}; }
    .warning { color: ${theme.warning}; }
    ul { margin: 0; padding-left: 20px; }
  `;
}

export function serializeCaptureQualityValidationReport(
  report: CaptureQualityValidationReport,
): string {
  return stableStringify(report);
}

export function serializeCaptureQualityValidationHtml(
  report: CaptureQualityValidationReport,
): string {
  const summary = report.summary;
  const runRows = report.runs
    .map(
      (run) => `
        <tr>
          <td>${escapeHtml(run.runId)}</td>
          <td>${escapeHtml(run.formatClassification)}</td>
          <td>${run.recomputed.topOfBookRecordCount}</td>
          <td>${run.recomputed.sequenceValidTopOfBookRecords}</td>
          <td>${run.recomputed.economicallyValidTopOfBookRecords}</td>
          <td>${run.recomputed.parityUsableTopOfBookRecords}</td>
          <td>${run.recomputed.crossedTopOfBookRecords}</td>
          <td>${run.healthMismatches.length}</td>
          <td>${run.economicStateMismatches.length}</td>
          <td>${run.enoughForParityResearch ? "yes" : "no"}</td>
        </tr>
      `,
    )
    .join("");

  const warningItems = report.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");
  const caveatItems = report.caveats
    .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Capture Quality Validation Harness</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Capture Quality Validation Harness (M12.4C)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
      </section>

      <section class="panel">
        <h2>Executive Summary</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Runs Scanned</div><div class="value">${summary.runsScanned}</div></div>
          <div class="stat"><div class="label">Legacy Format</div><div class="value">${summary.legacyFormatRuns}</div></div>
          <div class="stat"><div class="label">Economic-State Format</div><div class="value">${summary.economicStateFormatRuns}</div></div>
          <div class="stat"><div class="label">Health Mismatch Runs</div><div class="value">${summary.healthMismatchRuns}</div></div>
          <div class="stat"><div class="label">Latest Economic Valid Share</div><div class="value">${formatShare(summary.latestRunEconomicallyValidShare)}</div></div>
          <div class="stat"><div class="label">Latest Parity Usable</div><div class="value">${summary.latestRunParityUsableRecords}</div></div>
        </div>
        <p><strong>Recommended next action:</strong> ${escapeHtml(summary.recommendedNextAction)}</p>
      </section>

      <section class="panel">
        <h2>Per-Run Validation</h2>
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Format</th>
              <th>Records</th>
              <th>Seq Valid</th>
              <th>Econ Valid</th>
              <th>Parity Usable</th>
              <th>Crossed</th>
              <th>Health Δ</th>
              <th>State Δ</th>
              <th>Parity Ready</th>
            </tr>
          </thead>
          <tbody>${runRows || "<tr><td colspan='10'>No runs found</td></tr>"}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Caveats</h2>
        <ul>${caveatItems}</ul>
        ${warningItems ? `<h3>Warnings</h3><ul>${warningItems}</ul>` : ""}
      </section>
    </main>
  </body>
</html>`;
}
