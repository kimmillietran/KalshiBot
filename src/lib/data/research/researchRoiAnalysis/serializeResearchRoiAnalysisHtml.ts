import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  ResearchRoiAnalysisReport,
  ResearchRoiSliceMetrics,
} from "./researchRoiAnalysisTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return value.toFixed(1);
}

function renderSliceTable(title: string, slices: readonly ResearchRoiSliceMetrics[]): string {
  if (slices.length === 0) {
    return `
      <section class="panel">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">No data for this ranking.</p>
      </section>
    `;
  }

  const rows = slices
    .map(
      (slice) => `
        <tr>
          <td>${escapeHtml(slice.label)}</td>
          <td>${slice.candidateCount}</td>
          <td>${slice.validatedCount}</td>
          <td>${slice.nearPromisingCount}</td>
          <td>${formatPercent(slice.validationRate)}</td>
          <td>${formatPercent(slice.nearPromisingRate)}</td>
          <td>${formatScore(slice.averageRobustnessScore)}</td>
          <td>${formatScore(slice.roiScore)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Area</th>
              <th>Candidates</th>
              <th>Validated</th>
              <th>Near-promising</th>
              <th>Validation rate</th>
              <th>Near-promising rate</th>
              <th>Avg robustness</th>
              <th>ROI score</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
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
    h1, h2 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 20px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .metric {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 12px;
    }
    .metric-label {
      color: ${theme.textMuted};
      font-size: 0.85rem;
    }
    .metric-value {
      font-size: 1.35rem;
      font-weight: 600;
    }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
    ul { margin: 0; padding-left: 20px; }
  `;
}

/** Serializes the research ROI analysis report as HTML. */
export function serializeResearchRoiAnalysisHtml(
  report: ResearchRoiAnalysisReport,
): string {
  const { overall, rankings, emptyInputReasons } = report.summary;

  const notes = emptyInputReasons.length
    ? `<ul>${emptyInputReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`
    : `<p class="muted">All primary input artifacts were available.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research ROI Analysis</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Research ROI Analysis</h1>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
        <p>${escapeHtml(report.disclaimer)}</p>
      </section>

      <section class="panel">
        <h2>Overall efficiency</h2>
        <div class="metrics">
          <div class="metric">
            <div class="metric-label">Overall ROI score</div>
            <div class="metric-value">${formatScore(overall.overallRoiScore)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Candidates</div>
            <div class="metric-value">${overall.totalCandidates}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Validated / candidates</div>
            <div class="metric-value">${formatPercent(overall.validationRate)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Near-promising / candidates</div>
            <div class="metric-value">${formatPercent(overall.nearPromisingRate)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Candidate generation efficiency</div>
            <div class="metric-value">${formatPercent(overall.candidateGenerationEfficiency)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Bucket utilization</div>
            <div class="metric-value">${formatPercent(overall.bucketUtilizationRate)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Validation efficiency</div>
            <div class="metric-value">${formatPercent(overall.validationEfficiency)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Avg robustness</div>
            <div class="metric-value">${formatScore(overall.averageRobustnessScore)}</div>
          </div>
          <div class="metric">
            <div class="metric-label">Avg refinement improvement</div>
            <div class="metric-value">${formatScore(overall.averageRobustnessImprovementAfterRefinement)}</div>
          </div>
        </div>
      </section>

      ${renderSliceTable("Highest ROI dimensions", rankings.highestRoiDimensions)}
      ${renderSliceTable("Lowest ROI dimensions", rankings.lowestRoiDimensions)}
      ${renderSliceTable("Highest ROI axis groups", rankings.highestRoiAxisGroups)}
      ${renderSliceTable("Most expensive research areas", rankings.mostExpensiveResearchAreas)}
      ${renderSliceTable("Most efficient research areas", rankings.mostEfficientResearchAreas)}

      <section class="panel">
        <h2>Input notes</h2>
        ${notes}
      </section>
    </main>
  </body>
</html>`;
}
