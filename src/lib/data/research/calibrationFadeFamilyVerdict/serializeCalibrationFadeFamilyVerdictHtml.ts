import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { CalibrationFadeFamilyVerdictReport } from "./calibrationFadeFamilyVerdictTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderHypothesisRows(report: CalibrationFadeFamilyVerdictReport): string {
  if (report.hypotheses.length === 0) {
    return `<tr><td colspan="8" class="muted">No calibration-fade hypotheses found.</td></tr>`;
  }

  return report.hypotheses
    .map(
      (entry) => `
      <tr>
        <td><code>${escapeHtml(entry.hypothesisId)}</code></td>
        <td>${escapeHtml(entry.suggestedStrategyFamily)}</td>
        <td><strong>${escapeHtml(entry.verdict)}</strong></td>
        <td>${entry.tradeReplayEvidence.netPnlCents}¢</td>
        <td>${entry.oosCalibrationEvidence.holdoutObservedNetEdge?.toFixed(4) ?? "—"}</td>
        <td>${entry.oosCalibrationEvidence.finalStatisticalVerdict ?? "—"}</td>
        <td>${entry.tradeReplayEvidence.uniqueMarketCount} / ${entry.tradeReplayEvidence.uniqueTradingDayCount}</td>
        <td class="muted">${escapeHtml(entry.primaryFailureReason ?? "—")}</td>
      </tr>`,
    )
    .join("");
}

function renderGateSummary(report: CalibrationFadeFamilyVerdictReport): string {
  return report.hypotheses
    .map(
      (entry) => `
      <div class="gate-card">
        <strong>${escapeHtml(entry.hypothesisId)}</strong>
        <div class="muted">${escapeHtml(entry.evidenceSummary)}</div>
        <ul>
          <li>Cost replay: ${entry.gateResults.costAwareReplayPass ? "pass" : "fail"}</li>
          <li>Fillability: ${entry.gateResults.fillabilityPass ? "pass" : "fail"}</li>
          <li>Holdout calibration: ${entry.gateResults.outOfSamplePass ? "pass" : "fail"}</li>
          <li>Power / MDE: ${entry.gateResults.powerPass ? "pass" : "fail"}</li>
          <li>Correction: ${entry.gateResults.correctionPass ? "pass" : "fail"}</li>
          <li>Derived sensitivity: ${entry.gateResults.derivedSensitivityPass ? "pass" : entry.derivedSensitivityEvidence.status === "unknown" ? "unknown" : "fail"}</li>
        </ul>
      </div>`,
    )
    .join("");
}

/** Serializes the family verdict report to standalone HTML. */
export function serializeCalibrationFadeFamilyVerdictHtml(
  report: CalibrationFadeFamilyVerdictReport,
): string {
  const failureHistogram = Object.entries(report.summary.primaryFailureReasonHistogram)
    .map(([reason, count]) => `<li>${escapeHtml(reason)}: ${count}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Calibration-Fade Family Verdict</title>
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
    .verdict { font-size: 1.5rem; font-weight: 700; color: ${theme.warning}; }
    .disclaimer { border-left: 3px solid ${theme.warning}; padding-left: 0.875rem; color: ${theme.textMuted}; }
    .caveat-list { margin: 0; padding-left: 1.25rem; color: ${theme.textMuted}; }
    .gate-card { background: ${theme.panelInset}; border-radius: 10px; padding: 0.875rem; margin-bottom: 0.75rem; }
    .gate-card ul { margin: 0.5rem 0 0; padding-left: 1.25rem; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Calibration-Fade Family Verdict</h1>
      <p class="verdict">${escapeHtml(report.summary.familyVerdict)}</p>
      <p class="disclaimer">${escapeHtml(report.disclaimer)}</p>
    </header>

    <section class="panel">
      <h2>Family summary</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Hypotheses</div><div class="stat-value">${report.summary.hypothesisCount}</div></div>
        <div class="stat-card"><div class="stat-label">Promoted</div><div class="stat-value">${report.summary.promotedHypothesisCount}</div></div>
        <div class="stat-card"><div class="stat-label">Underpowered</div><div class="stat-value">${report.summary.underpoweredHypothesisCount}</div></div>
        <div class="stat-card"><div class="stat-label">Positive in-sample replay</div><div class="stat-value">${report.summary.positiveInSampleReplayCount}</div></div>
        <div class="stat-card"><div class="stat-label">Positive holdout edge</div><div class="stat-value">${report.summary.positiveHoldoutCount}</div></div>
        <div class="stat-card"><div class="stat-label">Corrected pass</div><div class="stat-value">${report.summary.correctedPassCount}</div></div>
        <div class="stat-card"><div class="stat-label">Recommended next action</div><div class="stat-value">${escapeHtml(report.summary.recommendedNextAction)}</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>Hypothesis verdicts</h2>
      <table>
        <thead>
          <tr>
            <th>Hypothesis</th><th>Family</th><th>Verdict</th><th>Net replay</th><th>Holdout edge</th><th>M11.7 verdict</th><th>Markets / days</th><th>Primary failure</th>
          </tr>
        </thead>
        <tbody>${renderHypothesisRows(report)}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Gate evidence</h2>
      ${renderGateSummary(report)}
    </section>

    <section class="panel">
      <h2>Primary failure histogram</h2>
      ${
        failureHistogram.length === 0
          ? `<p class="muted">No failure reasons recorded.</p>`
          : `<ul>${failureHistogram}</ul>`
      }
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
