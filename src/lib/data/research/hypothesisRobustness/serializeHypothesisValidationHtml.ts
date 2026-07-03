import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { HypothesisValidationReport } from "./hypothesisRobustnessTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderStyles(): string {
  return `
    body {
      margin: 0;
      font-family: Inter, Segoe UI, sans-serif;
      background: ${theme.pageBg};
      color: ${theme.text};
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      gap: 16px;
    }
    h1, h2, h3 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .stat {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 4px;
    }
    .label {
      color: ${theme.textMuted};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .value { font-size: 18px; font-weight: 700; }
    .pass { color: ${theme.bullish}; }
    .fail { color: ${theme.bearish}; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
    ul { margin: 8px 0 0; padding-left: 18px; }
  `;
}

function renderValidationCard(
  entry: HypothesisValidationReport["validations"][number],
): string {
  const passClass = entry.passes ? "pass" : "fail";

  return `
    <section class="panel">
      <h2>${escapeHtml(entry.hypothesisId)}</h2>
      <p class="muted">${escapeHtml(entry.hypothesis)}</p>
      <div class="stat-grid">
        <div class="stat">
          <div class="label">Robustness score</div>
          <div class="value ${passClass}">${entry.robustnessScore}</div>
        </div>
        <div class="stat">
          <div class="label">Pass / fail</div>
          <div class="value ${passClass}">${entry.passes ? "PASS" : "FAIL"}</div>
        </div>
        <div class="stat">
          <div class="label">Observations</div>
          <div class="value">${entry.observationCount}</div>
        </div>
        <div class="stat">
          <div class="label">Unique days</div>
          <div class="value">${entry.sampleConcentration.uniqueTradingDays}</div>
        </div>
      </div>
      <h3>Reasons</h3>
      <ul>${entry.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
      <h3>Stability metrics</h3>
      <table>
        <tbody>
          <tr><th>Month persistence</th><td>${(entry.timeStability.monthPersistenceRate * 100).toFixed(1)}%</td></tr>
          <tr><th>Quarter persistence</th><td>${(entry.timeStability.quarterPersistenceRate * 100).toFixed(1)}%</td></tr>
          <tr><th>Regimes with edge</th><td>${entry.regimeStability.regimesWithEdge} / ${entry.regimeStability.regimesWithData}</td></tr>
          <tr><th>Largest day share</th><td>${entry.sampleConcentration.largestDayPercent.toFixed(1)}%</td></tr>
          <tr><th>LOPO std dev</th><td>${entry.leaveOnePeriodOut.errorStdDev.toFixed(4)}</td></tr>
        </tbody>
      </table>
    </section>`;
}

/** Serializes hypothesis validation results to static HTML. */
export function serializeHypothesisValidationHtml(
  report: HypothesisValidationReport,
): string {
  const cards = report.validations.map(renderValidationCard).join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hypothesis Validation Report</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Hypothesis Robustness Validation</h1>
        <p class="muted">Generated at ${escapeHtml(report.generatedAt)}</p>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Total hypotheses</div>
            <div class="value">${report.summary.totalHypotheses}</div>
          </div>
          <div class="stat">
            <div class="label">Passing</div>
            <div class="value pass">${report.summary.passingCount}</div>
          </div>
          <div class="stat">
            <div class="label">Failing</div>
            <div class="value fail">${report.summary.failingCount}</div>
          </div>
          <div class="stat">
            <div class="label">Average score</div>
            <div class="value">${report.summary.averageRobustnessScore}</div>
          </div>
        </div>
      </header>
      ${cards}
    </main>
  </body>
</html>`;
}
