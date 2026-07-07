import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  HypothesisFailureAnalysisReport,
  HypothesisFailureReasonCategory,
  HypothesisPriorityCategory,
  HypothesisRecommendedNextAction,
} from "./hypothesisFailureAnalysisTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatCategoryLabel(category: HypothesisFailureReasonCategory): string {
  return category.replaceAll("-", " ");
}

function formatPriorityLabel(category: HypothesisPriorityCategory): string {
  return category.replaceAll("-", " ");
}

function formatActionLabel(action: HypothesisRecommendedNextAction): string {
  return action.replaceAll("-", " ");
}

function priorityTone(category: HypothesisPriorityCategory): string {
  switch (category) {
    case "near-promising":
      return theme.bullish;
    case "likely-spurious":
      return theme.bearish;
    case "blocked-by-coverage":
      return theme.warning;
    default:
      return theme.textMuted;
  }
}

function reasonBadgeTone(category: HypothesisFailureReasonCategory): string {
  switch (category) {
    case "below-pass-threshold":
    case "weak-calibration-gap":
      return theme.warning;
    case "sample-concentration":
    case "derived-data-sensitivity":
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
    .badge-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      border: 1px solid ${theme.panelBorder};
      background: ${theme.panelInset};
    }
    .score-bar {
      height: 10px;
      border-radius: 999px;
      background: ${theme.panelInset};
      overflow: hidden;
      margin-top: 6px;
    }
    .score-fill {
      height: 100%;
      background: ${theme.warning};
    }
    .score-threshold {
      height: 100%;
      width: 2px;
      background: ${theme.bullish};
      margin-left: 70%;
    }
    code { font-size: 12px; }
  `;
}

function renderInputPaths(report: HypothesisFailureAnalysisReport): string {
  return Object.entries(report.inputPaths)
    .map(([key, path]) => `<li><code>${escapeHtml(key)}</code>: ${escapeHtml(path)}</li>`)
    .join("");
}

function renderSummaryTable(report: HypothesisFailureAnalysisReport): string {
  const rows = report.analyses
    .map((analysis) => `
      <tr>
        <td>#${analysis.priorityRank}</td>
        <td><code>${escapeHtml(analysis.hypothesisId)}</code></td>
        <td>${analysis.robustnessScore} / ${analysis.passThreshold}</td>
        <td>${analysis.scoreGap}</td>
        <td>${analysis.observationCount}</td>
        <td>${analysis.uniqueTradingDays}</td>
        <td style="color:${priorityTone(analysis.priorityCategory)}">${escapeHtml(formatPriorityLabel(analysis.priorityCategory))}</td>
        <td>${escapeHtml(formatActionLabel(analysis.recommendedNextAction))}</td>
      </tr>
    `)
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Hypothesis</th>
          <th>Robustness</th>
          <th>Gap</th>
          <th>Obs</th>
          <th>Days</th>
          <th>Category</th>
          <th>Next action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderAnalysisCard(
  report: HypothesisFailureAnalysisReport,
  analysis: HypothesisFailureAnalysisReport["analyses"][number],
): string {
  const robustnessPercent = Math.min(
    100,
    Math.round((analysis.robustnessScore / analysis.passThreshold) * 100),
  );
  const failureBadges = analysis.failureReasons
    .map(
      (reason) => `
        <span class="badge" style="color:${reasonBadgeTone(reason.category)}">
          ${escapeHtml(formatCategoryLabel(reason.category))}
        </span>
      `,
    )
    .join("");

  const strongestMonths = analysis.stabilityDiagnostics.strongestMonths
    .map(
      (month) =>
        `${escapeHtml(month.month)} (${month.observations}, ${month.edgeMatchesDirection ? "edge" : "no edge"})`,
    )
    .join(", ");

  const weakestMonths = analysis.stabilityDiagnostics.weakestMonths
    .map(
      (month) =>
        `${escapeHtml(month.month)} (${month.observations}, ${month.edgeMatchesDirection ? "edge" : "no edge"})`,
    )
    .join(", ");

  return `
    <section class="panel" id="${escapeHtml(analysis.hypothesisId)}">
      <h2>#${analysis.priorityRank} ${escapeHtml(analysis.hypothesisId)}</h2>
      <p class="muted">${escapeHtml(analysis.hypothesis)}</p>

      <div class="stat-grid">
        <div class="stat">
          <div class="label">Robustness</div>
          <div class="value">${analysis.robustnessScore}</div>
          <div class="score-bar"><div class="score-fill" style="width:${robustnessPercent}%"></div></div>
          <p class="muted">Threshold ${analysis.passThreshold} (gap ${analysis.scoreGap})</p>
        </div>
        <div class="stat">
          <div class="label">Observations</div>
          <div class="value">${analysis.observationCount}</div>
        </div>
        <div class="stat">
          <div class="label">Trading days</div>
          <div class="value">${analysis.uniqueTradingDays}</div>
        </div>
        <div class="stat">
          <div class="label">Priority</div>
          <div class="value" style="color:${priorityTone(analysis.priorityCategory)}">${escapeHtml(formatPriorityLabel(analysis.priorityCategory))}</div>
        </div>
        <div class="stat">
          <div class="label">Next action</div>
          <div class="value" style="font-size:16px">${escapeHtml(formatActionLabel(analysis.recommendedNextAction))}</div>
        </div>
        <div class="stat">
          <div class="label">Signal breadth</div>
          <div class="value" style="font-size:16px">${escapeHtml(analysis.stabilityDiagnostics.signalBreadth)}</div>
        </div>
      </div>

      ${
        analysis.failureReasons.length > 0
          ? `<h3>Failure reasons</h3><div class="badge-row">${failureBadges}</div><ul>${analysis.failureReasons
            .map(
              (reason) =>
                `<li><strong>${escapeHtml(formatCategoryLabel(reason.category))}:</strong> ${escapeHtml(reason.summary)}${reason.detail ? ` <span class="muted">${escapeHtml(reason.detail)}</span>` : ""}</li>`,
            )
            .join("")}</ul>`
          : `<p><strong>Status:</strong> passes validation threshold.</p>`
      }

      <h3>Stability breakdown</h3>
      <ul>
        <li><strong>Strongest months:</strong> ${strongestMonths || "none"}</li>
        <li><strong>Weakest months:</strong> ${weakestMonths || "none"}</li>
        <li><strong>Missing/thin months:</strong> ${escapeHtml(analysis.stabilityDiagnostics.missingOrThinMonths.join(", ") || "none")}</li>
        <li><strong>Month persistence:</strong> ${Math.round(analysis.stabilityDiagnostics.monthPersistenceRate * 100)}%</li>
        <li><strong>LOO std dev:</strong> ${analysis.stabilityDiagnostics.leaveOnePeriodOutStdDev.toFixed(3)}</li>
        <li><strong>Regimes with edge:</strong> ${analysis.stabilityDiagnostics.regimesWithEdge} / ${analysis.stabilityDiagnostics.regimesWithData}</li>
      </ul>

      ${
        analysis.marginalEvidenceNeeds.length > 0
          ? `<h3>Marginal evidence needs</h3><ul>${analysis.marginalEvidenceNeeds
            .map((need) => `<li>${escapeHtml(need)}</li>`)
            .join("")}</ul>`
          : ""
      }

      ${
        analysis.notes.length > 0
          ? `<h3>Notes</h3><ul>${analysis.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`
          : ""
      }
    </section>
  `;
}

export function serializeHypothesisFailureAnalysisHtml(
  report: HypothesisFailureAnalysisReport,
): string {
  const actionSummary = Object.entries(report.summary.recommendedNextActions)
    .filter(([, count]) => count > 0)
    .map(([action, count]) => `<li>${escapeHtml(formatActionLabel(action as HypothesisRecommendedNextAction))}: ${count}</li>`)
    .join("");

  const detailCards = report.analyses
    .map((analysis) => renderAnalysisCard(report, analysis))
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hypothesis Failure Analysis</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Hypothesis Failure Analysis</h1>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
        <p class="muted">
          Read-only diagnostics explaining why hypotheses fail validation and what evidence would help.
          Does not modify validation scores, imports, or promotion logic.
        </p>
      </header>

      <section class="panel">
        <h2>Summary</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Total</div><div class="value">${report.summary.totalHypotheses}</div></div>
          <div class="stat"><div class="label">Passing</div><div class="value">${report.summary.passingCount}</div></div>
          <div class="stat"><div class="label">Failing</div><div class="value">${report.summary.failingCount}</div></div>
          <div class="stat"><div class="label">Near promising</div><div class="value">${report.summary.nearPromisingCount}</div></div>
          <div class="stat"><div class="label">Highest robustness</div><div class="value">${report.summary.highestRobustnessScore}</div></div>
          <div class="stat"><div class="label">Pass threshold</div><div class="value">${report.passThreshold}</div></div>
        </div>
        ${
          actionSummary
            ? `<h3>Recommended next actions</h3><ul>${actionSummary}</ul>`
            : ""
        }
      </section>

      <section class="panel">
        <h2>Research priority ranking</h2>
        ${renderSummaryTable(report)}
      </section>

      ${detailCards || `<section class="panel"><p class="muted">No hypotheses found in upstream artifacts.</p></section>`}

      <section class="panel">
        <h2>Input artifacts</h2>
        <ul>${renderInputPaths(report)}</ul>
      </section>
    </main>
  </body>
</html>`;
}
