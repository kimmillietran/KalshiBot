import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  PortfolioAxisGroupAnalyticsEntry,
  PortfolioDimensionAnalyticsEntry,
  PortfolioRankingEntry,
  ResearchPortfolioAnalyticsReport,
} from "./researchPortfolioAnalyticsTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNullableNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
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
      max-width: 1280px;
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
    .stat .value { font-size: 20px; font-weight: 600; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
    .rank-list {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .rank-card {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 12px;
    }
    .rank-card .rank {
      color: ${theme.textMuted};
      font-size: 12px;
    }
  `;
}

function renderDimensionTableRows(
  entries: readonly PortfolioDimensionAnalyticsEntry[],
): string {
  return entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.dimensionId)}</td>
          <td>${escapeHtml(entry.label)}</td>
          ${renderMetricsCells(entry)}
        </tr>
      `,
    )
    .join("");
}

function renderAxisGroupTableRows(
  entries: readonly PortfolioAxisGroupAnalyticsEntry[],
): string {
  return entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.groupId)}</td>
          <td>${escapeHtml(entry.groupId)}</td>
          ${renderMetricsCells(entry)}
        </tr>
      `,
    )
    .join("");
}

function renderMetricsCells(entry: PortfolioDimensionAnalyticsEntry | PortfolioAxisGroupAnalyticsEntry): string {
  return `
          <td>${entry.candidateCount}</td>
          <td>${entry.validationCount}</td>
          <td>${entry.passCount}</td>
          <td>${formatPercent(entry.passRate)}</td>
          <td>${formatNullableNumber(entry.averageRobustness, 1)}</td>
          <td>${formatNullableNumber(entry.medianRobustness, 1)}</td>
          <td>${formatNullableNumber(entry.averageScoreGap, 1)}</td>
          <td>${entry.nearPromisingCount}</td>
          <td>${entry.likelySpuriousCount}</td>
          <td>${entry.blockedByCoverageCount}</td>
          <td>${formatNullableNumber(entry.averageMonthInstability)}</td>
          <td>${formatNullableNumber(entry.averageRegimeInstability)}</td>
        `;
}

function renderMetricsTableRows(
  entries: readonly (PortfolioDimensionAnalyticsEntry | PortfolioAxisGroupAnalyticsEntry)[],
  idKey: "dimensionId" | "groupId",
): string {
  if (idKey === "dimensionId") {
    return renderDimensionTableRows(entries as readonly PortfolioDimensionAnalyticsEntry[]);
  }

  return renderAxisGroupTableRows(entries as readonly PortfolioAxisGroupAnalyticsEntry[]);
}

function renderMetricsTableHeader(): string {
  return `
    <thead>
      <tr>
        <th>Id</th>
        <th>Label</th>
        <th>Candidates</th>
        <th>Validations</th>
        <th>Passes</th>
        <th>Pass rate</th>
        <th>Avg robustness</th>
        <th>Median robustness</th>
        <th>Avg score gap</th>
        <th>Near-promising</th>
        <th>Likely spurious</th>
        <th>Blocked</th>
        <th>Month instability</th>
        <th>Regime instability</th>
      </tr>
    </thead>
  `;
}

function renderRankingCards(
  title: string,
  entries: readonly PortfolioRankingEntry[],
): string {
  if (entries.length === 0) {
    return `<section class="panel"><h2>${escapeHtml(title)}</h2><p class="muted">No ranked entries.</p></section>`;
  }

  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <div class="rank-list">
        ${entries
          .slice(0, 8)
          .map(
            (entry) => `
              <div class="rank-card">
                <div class="rank">#${entry.rank}</div>
                <strong>${escapeHtml(entry.label)}</strong>
                <div class="muted">${escapeHtml(entry.metric)}: ${entry.value}</div>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

export function serializeResearchPortfolioAnalyticsHtml(
  report: ResearchPortfolioAnalyticsReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research Portfolio Analytics</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Research Portfolio Analytics</h1>
        <p class="muted">Read-only aggregation of hypothesis outcomes by registry dimension and axis group.</p>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
        <div class="stat-grid">
          <div class="stat"><div class="label">Candidates</div><div class="value">${report.summary.totalCandidates}</div></div>
          <div class="stat"><div class="label">Validations</div><div class="value">${report.summary.totalValidations}</div></div>
          <div class="stat"><div class="label">Passes</div><div class="value">${report.summary.totalPasses}</div></div>
          <div class="stat"><div class="label">Pass rate</div><div class="value">${formatPercent(report.summary.overallPassRate)}</div></div>
          <div class="stat"><div class="label">Pass threshold</div><div class="value">${report.summary.passScoreThreshold}</div></div>
        </div>
      </section>

      ${renderRankingCards("Highest yielding dimensions", report.rankings.highestYieldingDimensions)}
      ${renderRankingCards("Strongest robustness (dimensions)", report.rankings.strongestRobustnessDimensions)}
      ${renderRankingCards("Most promising dimensions", report.rankings.mostPromisingDimensions)}
      ${renderRankingCards("Least productive dimensions", report.rankings.leastProductiveDimensions)}

      <section class="panel">
        <h2>Dimensions</h2>
        <table>
          ${renderMetricsTableHeader()}
          <tbody>${renderMetricsTableRows(report.dimensions, "dimensionId")}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Axis groups</h2>
        <table>
          ${renderMetricsTableHeader()}
          <tbody>${renderMetricsTableRows(report.axisGroups, "groupId")}</tbody>
        </table>
        <p class="muted">Robustness distributions are included in JSON output for each entry.</p>
      </section>

      ${renderRankingCards("Highest yielding axis groups", report.rankings.highestYieldingAxisGroups)}
      ${renderRankingCards("Strongest robustness (axis groups)", report.rankings.strongestRobustnessAxisGroups)}
    </main>
  </body>
</html>`;
}
