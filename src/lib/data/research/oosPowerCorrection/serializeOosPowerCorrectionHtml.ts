import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { OosPowerCorrectionReport } from "./oosPowerCorrectionTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderSummary(report: OosPowerCorrectionReport): string {
  const { summary, splitSummary } = report;

  return `
    <section class="panel">
      <h2>Split summary</h2>
      <div class="summary-grid">
        <div class="summary-card"><div class="summary-label">Mode</div><div class="summary-value">${escapeHtml(splitSummary.splitMode)}</div></div>
        <div class="summary-card"><div class="summary-label">Candidates</div><div class="summary-value">${summary.candidateCount}</div></div>
        <div class="summary-card"><div class="summary-label">Pass (corrected)</div><div class="summary-value">${summary.passesCorrectedCount}</div></div>
        <div class="summary-card"><div class="summary-label">Underpowered</div><div class="summary-value">${summary.underpoweredCount}</div></div>
      </div>
      <p class="muted">Train: ${escapeHtml(splitSummary.trainMonths.join(", ") || "none")}</p>
      <p class="muted">Validation: ${escapeHtml(splitSummary.validationMonths.join(", ") || "none")}</p>
      <p class="muted">Holdout: ${escapeHtml(splitSummary.holdoutMonths.join(", ") || "none")}</p>
      <p class="muted">Correction: ${escapeHtml(summary.correctionMethod)} · uncorrected pass ${summary.passesUncorrectedCount} · final pass ${summary.finalPassCount}</p>
    </section>`;
}

function renderTable(report: OosPowerCorrectionReport): string {
  const rows = report.entries
    .map(
      (entry) => `
      <tr>
        <td><code>${escapeHtml(entry.hypothesisId)}</code></td>
        <td>${entry.splitMetrics.holdout.rawObservationCount}</td>
        <td>${entry.splitMetrics.holdout.effectiveSampleSizeEstimate}</td>
        <td>${entry.uncorrectedPValue?.toFixed(4) ?? "—"}</td>
        <td>${entry.qValue?.toFixed(4) ?? "—"}</td>
        <td>${entry.passesCorrected ? "yes" : "no"}</td>
        <td>${entry.isUnderpowered ? "yes" : "no"}</td>
        <td>${escapeHtml(entry.finalStatisticalVerdict)}</td>
      </tr>`,
    )
    .join("");

  return `
    <section class="panel">
      <h2>Candidate verdicts (holdout)</h2>
      <table>
        <thead>
          <tr>
            <th>Hypothesis</th>
            <th>Holdout n</th>
            <th>Eff. n</th>
            <th>p</th>
            <th>q</th>
            <th>Pass corr.</th>
            <th>Underpow.</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>${rows || "<tr><td colspan=\"8\">No candidates</td></tr>"}</tbody>
      </table>
    </section>`;
}

/** Serializes OOS power correction report as standalone HTML. */
export function serializeOosPowerCorrectionHtml(report: OosPowerCorrectionReport): string {
  const notes = report.investigatorNotes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");
  const limits = report.limitations
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OOS Power &amp; Dependence Correction</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; line-height: 1.5; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-top: 16px; overflow-x: auto; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 12px; }
    .summary-card { background: ${theme.panelInset}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 14px; }
    .summary-label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; }
    .summary-value { font-size: 22px; font-weight: 700; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: left; }
    th { color: ${theme.textMuted}; }
    code { color: ${theme.info}; }
    ol, ul { line-height: 1.6; }
  </style>
</head>
<body>
  <header>
    <h1>OOS power &amp; dependence correction</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} · research-only statistical overlay</p>
    <p class="muted">Tests whether atlas hypothesis candidates survive temporal holdout, power/MDE gates, and Benjamini–Yekutieli correction. Does not validate deployable strategies or replace M11.6 trade replay.</p>
  </header>
  ${renderSummary(report)}
  ${renderTable(report)}
  <section class="panel">
    <h2>Investigator notes</h2>
    <ul>${notes}</ul>
  </section>
  <section class="panel">
    <h2>Limitations</h2>
    <ul>${limits}</ul>
  </section>
</body>
</html>`;
}
