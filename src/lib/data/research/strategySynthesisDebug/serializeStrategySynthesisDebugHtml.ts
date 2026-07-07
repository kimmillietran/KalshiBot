import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { StrategySynthesisDebugReport } from "./strategySynthesisDebugTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderFunnel(report: StrategySynthesisDebugReport): string {
  const { funnel } = report.summary;
  return `
    <section class="panel">
      <h2>Pipeline funnel</h2>
      <div class="funnel-grid">
        <div class="funnel-step"><div class="funnel-label">Hypotheses</div><div class="funnel-value">${funnel.hypothesisCandidates}</div></div>
        <div class="funnel-arrow">→</div>
        <div class="funnel-step"><div class="funnel-label">Synthesis candidates</div><div class="funnel-value">${funnel.synthesisCandidates}</div></div>
        <div class="funnel-arrow">→</div>
        <div class="funnel-step"><div class="funnel-label">Harness eligible</div><div class="funnel-value" style="color:${funnel.harnessEligible > 0 ? theme.bullish : theme.bearish}">${funnel.harnessEligible}</div></div>
        <div class="funnel-arrow">→</div>
        <div class="funnel-step"><div class="funnel-label">Harness evaluated</div><div class="funnel-value" style="color:${funnel.harnessEvaluated > 0 ? theme.bullish : theme.bearish}">${funnel.harnessEvaluated}</div></div>
      </div>
      <p class="muted">Harness summary evaluated strategies: ${funnel.evaluatedStrategies}</p>
    </section>`;
}

function renderDiagnosis(report: StrategySynthesisDebugReport): string {
  const diagnosisColor =
    report.summary.diagnosis === "healthy"
      ? theme.bullish
      : report.summary.diagnosis === "expected-validation-failure"
        ? theme.warning
        : theme.bearish;

  return `
    <section class="panel">
      <h2>Diagnosis</h2>
      <p><span class="status-badge" style="background:${diagnosisColor}22;color:${diagnosisColor};border:1px solid ${diagnosisColor}55">${escapeHtml(report.summary.diagnosis)}</span></p>
      <p>${escapeHtml(report.summary.diagnosisRationale)}</p>
      <p><strong>Recommended next task:</strong> ${escapeHtml(report.summary.recommendedNextTask)}</p>
      <p class="muted">Near-promising hypotheses (failed validation, score ≥ 45): ${report.summary.nearPromisingCount}</p>
    </section>`;
}

function renderTraceRows(report: StrategySynthesisDebugReport): string {
  return report.traces
    .map(
      (trace) => `
      <tr>
        <td><code>${escapeHtml(trace.hypothesisId)}</code></td>
        <td>${trace.hypothesisCandidatePresent ? "yes" : "no"}</td>
        <td>${trace.synthesisCandidatePresent ? "yes" : "no"}</td>
        <td>${escapeHtml(trace.promotionStatus ?? "—")}</td>
        <td>${trace.validationPasses === null ? "—" : trace.validationPasses ? "pass" : "fail"}</td>
        <td>${trace.robustnessScore ?? "—"}</td>
        <td>${trace.harnessEligible ? "yes" : "no"}</td>
        <td>${trace.harnessEvaluated ? "yes" : "no"}</td>
        <td>${escapeHtml(trace.funnelStageReached)}</td>
        <td>${escapeHtml(trace.rejectionCategories.join(", ") || "—")}</td>
        <td>${trace.rejectionReasons.map((reason) => escapeHtml(reason)).join("<br/>") || "—"}</td>
      </tr>`,
    )
    .join("");
}

/** Serializes the strategy synthesis debug report as standalone HTML. */
export function serializeStrategySynthesisDebugHtml(
  report: StrategySynthesisDebugReport,
): string {
  const notes = report.investigatorNotes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Strategy Synthesis Debug Report</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
      overflow-x: auto;
    }
    .funnel-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      margin-top: 12px;
    }
    .funnel-step {
      background: ${theme.panelInset};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
      min-width: 140px;
    }
    .funnel-label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; }
    .funnel-value { font-size: 28px; font-weight: 700; margin-top: 8px; }
    .funnel-arrow { color: ${theme.textMuted}; font-size: 24px; }
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
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    ul { color: ${theme.textMuted}; }
  </style>
</head>
<body>
  <header>
    <h1>Strategy Synthesis Debug Report</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} · read-only bridge diagnostics</p>
  </header>

  ${renderFunnel(report)}
  ${renderDiagnosis(report)}

  <section class="panel">
    <h2>Per-hypothesis traces</h2>
    <table>
      <thead>
        <tr>
          <th>Hypothesis</th>
          <th>Candidate</th>
          <th>Synthesized</th>
          <th>Promotion</th>
          <th>Validation</th>
          <th>Score</th>
          <th>Harness eligible</th>
          <th>Evaluated</th>
          <th>Stage</th>
          <th>Categories</th>
          <th>Rejection reasons</th>
        </tr>
      </thead>
      <tbody>
        ${renderTraceRows(report) || "<tr><td colspan=\"11\">No hypothesis traces available</td></tr>"}
      </tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Investigator notes</h2>
    <ul>${notes}</ul>
  </section>
</body>
</html>`;
}
