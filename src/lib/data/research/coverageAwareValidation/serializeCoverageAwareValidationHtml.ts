import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  CoverageAwareValidationClassification,
  CoverageAwareValidationReport,
} from "./coverageAwareValidationTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatClassificationLabel(
  classification: CoverageAwareValidationClassification,
): string {
  switch (classification) {
    case "rejected":
      return "Rejected (weak edge)";
    case "inconclusive-insufficient-coverage":
      return "Inconclusive — insufficient coverage";
    case "inconclusive-regime-sparse":
      return "Inconclusive — regime sparse";
    case "promising-needs-more-history":
      return "Promising — needs more history";
    case "robust-enough-to-test":
      return "Robust enough to test";
  }
}

function classificationTone(classification: CoverageAwareValidationClassification): string {
  switch (classification) {
    case "robust-enough-to-test":
      return theme.bullish;
    case "promising-needs-more-history":
      return theme.warning;
    case "rejected":
      return theme.bearish;
    default:
      return theme.textMuted;
  }
}

function renderStyles(): string {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: ${theme.pageBg};
      color: ${theme.text};
      line-height: 1.5;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px 16px 48px;
      display: grid;
      gap: 20px;
    }
    h1, h2, h3 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 20px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 12px;
    }
    .stat .label {
      color: ${theme.textMuted};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat .value {
      font-size: 20px;
      font-weight: 700;
      margin-top: 4px;
    }
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

export function serializeCoverageAwareValidationHtml(
  report: CoverageAwareValidationReport,
): string {
  const entryCards = report.entries
    .map((entry) => {
      const tone = classificationTone(entry.classification);
      const importRows = entry.recommendedImportWindows
        .map(
          (window) => `
            <tr>
              <td>${escapeHtml(window.label)}</td>
              <td>${escapeHtml(window.startDate)} → ${escapeHtml(window.endDate)}</td>
              <td>${escapeHtml(window.priority)}</td>
              <td>${escapeHtml(window.rationale)}</td>
            </tr>
          `,
        )
        .join("");

      return `
        <section class="panel">
          <h2>${escapeHtml(entry.hypothesisId)}</h2>
          <p class="muted">${escapeHtml(entry.hypothesis)}</p>
          <div class="stat-grid">
            <div class="stat">
              <div class="label">Classification</div>
              <div class="value" style="color:${tone}">${escapeHtml(formatClassificationLabel(entry.classification))}</div>
            </div>
            <div class="stat">
              <div class="label">Robustness</div>
              <div class="value">${entry.metrics.robustnessScore}</div>
            </div>
            <div class="stat">
              <div class="label">Observations</div>
              <div class="value">${entry.metrics.observationCount}</div>
            </div>
            <div class="stat">
              <div class="label">Trading days</div>
              <div class="value">${entry.metrics.uniqueTradingDays}</div>
            </div>
            <div class="stat">
              <div class="label">Months</div>
              <div class="value">${entry.metrics.monthCount}</div>
            </div>
            <div class="stat">
              <div class="label">Regimes w/ data</div>
              <div class="value">${entry.metrics.regimeCoverage.regimesWithData}</div>
            </div>
          </div>
          <p><strong>Coverage explanation:</strong> ${escapeHtml(entry.missingCoverageExplanation)}</p>
          ${
            importRows
              ? `
            <h3>Recommended import windows</h3>
            <table>
              <thead>
                <tr><th>Window</th><th>Range</th><th>Priority</th><th>Rationale</th></tr>
              </thead>
              <tbody>${importRows}</tbody>
            </table>`
              : ""
          }
          <ul>${entry.advisoryNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
        </section>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Coverage-Aware Validation</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Coverage-Aware Validation</h1>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
        <p class="muted">
          Advisory report separating weak-edge rejections from hypotheses that cannot yet be judged due to insufficient historical coverage.
        </p>
      </header>

      <section class="panel">
        <h2>Summary</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Total</div><div class="value">${report.summary.totalHypotheses}</div></div>
          <div class="stat"><div class="label">Robust enough</div><div class="value">${report.summary.robustEnoughToTestCount}</div></div>
          <div class="stat"><div class="label">Promising</div><div class="value">${report.summary.promisingNeedsMoreHistoryCount}</div></div>
          <div class="stat"><div class="label">Insufficient coverage</div><div class="value">${report.summary.inconclusiveInsufficientCoverageCount}</div></div>
          <div class="stat"><div class="label">Regime sparse</div><div class="value">${report.summary.inconclusiveRegimeSparseCount}</div></div>
          <div class="stat"><div class="label">Rejected</div><div class="value">${report.summary.rejectedCount}</div></div>
        </div>
      </section>

      ${entryCards || `<section class="panel"><p class="muted">No hypotheses found in upstream artifacts.</p></section>`}
    </main>
  </body>
</html>`;
}
