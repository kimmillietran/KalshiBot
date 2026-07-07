import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  DerivedSensitivityRecommendation,
  DerivedSettlementSensitivityReport,
} from "./derivedSettlementSensitivityTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatRecommendationLabel(recommendation: DerivedSensitivityRecommendation): string {
  return recommendation.replaceAll("-", " ");
}

function recommendationTone(recommendation: DerivedSensitivityRecommendation): string {
  switch (recommendation) {
    case "robust":
      return theme.bullish;
    case "moderately-sensitive":
      return theme.warning;
    case "highly-sensitive":
    case "dominated-by-derived-data":
      return theme.bearish;
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
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      border: 1px solid ${theme.panelBorder};
      background: ${theme.panelInset};
    }
  `;
}

function renderSummaryTable(report: DerivedSettlementSensitivityReport): string {
  const rows = report.entries
    .map((entry) => `
      <tr>
        <td><code>${escapeHtml(entry.hypothesisId)}</code></td>
        <td>${entry.allObservations.robustnessScore}</td>
        <td>${entry.officialOnlyObservations.robustnessScore}</td>
        <td>${entry.deltaRobustness >= 0 ? "+" : ""}${entry.deltaRobustness}</td>
        <td>${entry.allObservations.observationCount}</td>
        <td>${entry.officialOnlyObservations.observationCount}</td>
        <td>${Math.round(entry.allObservations.derivedObservationShare * 100)}%</td>
        <td style="color:${recommendationTone(entry.recommendation)}">${escapeHtml(formatRecommendationLabel(entry.recommendation))}</td>
      </tr>
    `)
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Hypothesis</th>
          <th>All robustness</th>
          <th>Official-only</th>
          <th>Δ robustness</th>
          <th>All obs</th>
          <th>Official obs</th>
          <th>Derived share</th>
          <th>Recommendation</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export function serializeDerivedSettlementSensitivityHtml(
  report: DerivedSettlementSensitivityReport,
): string {
  const recommendationSummary = Object.entries(report.summary.recommendationCounts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `<li>${escapeHtml(formatRecommendationLabel(key as DerivedSensitivityRecommendation))}: ${count}</li>`)
    .join("");

  const detailCards = report.entries
    .map((entry) => `
      <section class="panel" id="${escapeHtml(entry.hypothesisId)}">
        <h2>${escapeHtml(entry.hypothesisId)}</h2>
        <p class="muted">${escapeHtml(entry.hypothesis)}</p>
        <p>
          <span class="badge" style="color:${recommendationTone(entry.recommendation)}">
            ${escapeHtml(formatRecommendationLabel(entry.recommendation))}
          </span>
        </p>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">All-data robustness</div>
            <div class="value">${entry.allObservations.robustnessScore}</div>
            <p class="muted">passes: ${entry.allObservations.passes ? "yes" : "no"}</p>
          </div>
          <div class="stat">
            <div class="label">Official-only robustness</div>
            <div class="value">${entry.officialOnlyObservations.robustnessScore}</div>
            <p class="muted">passes: ${entry.officialOnlyObservations.passes ? "yes" : "no"}</p>
          </div>
          <div class="stat">
            <div class="label">Δ robustness</div>
            <div class="value">${entry.deltaRobustness >= 0 ? "+" : ""}${entry.deltaRobustness}</div>
          </div>
          <div class="stat">
            <div class="label">Derived share</div>
            <div class="value">${Math.round(entry.allObservations.derivedObservationShare * 100)}%</div>
          </div>
        </div>
        <table>
          <thead>
            <tr><th>Metric</th><th>All observations</th><th>Official only</th></tr>
          </thead>
          <tbody>
            <tr><td>Observations</td><td>${entry.allObservations.observationCount}</td><td>${entry.officialOnlyObservations.observationCount}</td></tr>
            <tr><td>Derived observations</td><td>${entry.allObservations.derivedObservationCount}</td><td>0</td></tr>
            <tr><td>Signed calibration error</td><td>${entry.allObservations.signedCalibrationError ?? "—"}</td><td>${entry.officialOnlyObservations.signedCalibrationError ?? "—"}</td></tr>
            <tr><td>Δ calibration</td><td colspan="2">${entry.deltaCalibration ?? "—"}</td></tr>
          </tbody>
        </table>
        <ul>${entry.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
      </section>
    `)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Derived Settlement Sensitivity</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Derived Settlement Sensitivity Audit</h1>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
        <p class="muted">
          Read-only comparison of hypothesis validation with all observations versus
          official-settlement observations only. Does not modify validation scores or imports.
        </p>
      </header>

      <section class="panel">
        <h2>Summary</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Hypotheses</div><div class="value">${report.summary.totalHypotheses}</div></div>
          <div class="stat"><div class="label">Affected</div><div class="value">${report.summary.hypothesesAffectedCount}</div></div>
          <div class="stat"><div class="label">Derived markets</div><div class="value">${report.derivedMarketCount}</div></div>
          <div class="stat"><div class="label">Largest drop</div><div class="value">${report.summary.largestRobustnessDrop}</div></div>
          <div class="stat"><div class="label">Stronger w/o derived</div><div class="value">${report.summary.hypothesesBecomingStrongerCount}</div></div>
          <div class="stat"><div class="label">Weaker w/o derived</div><div class="value">${report.summary.hypothesesBecomingWeakerCount}</div></div>
        </div>
        ${recommendationSummary ? `<ul>${recommendationSummary}</ul>` : ""}
        ${
          report.summary.largestRobustnessDropHypothesisId
            ? `<p class="muted">Largest robustness drop: <code>${escapeHtml(report.summary.largestRobustnessDropHypothesisId)}</code></p>`
            : ""
        }
      </section>

      <section class="panel">
        <h2>All hypotheses</h2>
        ${renderSummaryTable(report)}
      </section>

      ${detailCards || `<section class="panel"><p class="muted">No hypotheses found.</p></section>`}
    </main>
  </body>
</html>`;
}
