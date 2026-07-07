import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { ResearchDimensionExplorerReport } from "./researchDimensionExplorerTypes";

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

  return `${Math.round(value * 1000) / 10}%`;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return value.toLocaleString("en-US");
}

function renderDimensionRows(report: ResearchDimensionExplorerReport): string {
  if (report.dimensions.length === 0) {
    return `<tr><td colspan="8" class="muted">No dimensions registered.</td></tr>`;
  }

  return report.dimensions
    .map(
      (dimension) => `
      <tr>
        <td><code>${escapeHtml(dimension.dimensionId)}</code></td>
        <td>${escapeHtml(dimension.label)}</td>
        <td>${dimension.bucketCount}</td>
        <td>${formatPercent(dimension.coverage)}</td>
        <td>${formatNumber(dimension.observationCount)}</td>
        <td>${formatPercent(dimension.sparsity)}</td>
        <td>${dimension.entropy?.toFixed(2) ?? "—"}</td>
        <td>${formatPercent(dimension.missingRate)}</td>
      </tr>`,
    )
    .join("");
}

function renderAxisGroupRows(report: ResearchDimensionExplorerReport): string {
  return report.axisGroups
    .map(
      (group) => `
      <tr>
        <td><code>${escapeHtml(group.groupId)}</code></td>
        <td>${group.combinationCount}</td>
        <td>${group.populatedCombinations}</td>
        <td>${group.emptyCombinations}</td>
        <td>${formatPercent(group.populationRate)}</td>
        <td>${group.candidateYield}</td>
        <td>${group.validationYield}</td>
      </tr>`,
    )
    .join("");
}

function renderRecommendations(report: ResearchDimensionExplorerReport): string {
  if (report.recommendations.length === 0) {
    return `<p class="muted">No recommendations yet — add atlas and hypothesis artifacts for richer guidance.</p>`;
  }

  return `
    <ol class="recommendation-list">
      ${report.recommendations
        .map(
          (item) => `
        <li>
          <strong>${escapeHtml(item.label)}</strong>
          <span class="chip">${escapeHtml(item.kind)}</span>
          <div class="muted">${escapeHtml(item.rationale)}</div>
        </li>`,
        )
        .join("")}
    </ol>`;
}

function renderHeatmap(report: ResearchDimensionExplorerReport): string {
  const rows = report.visualization.coverageHeatmap.slice(0, 40);
  if (rows.length === 0) {
    return `<p class="muted">No atlas coverage heatmap available.</p>`;
  }

  const maxObservations = Math.max(...rows.map((row) => row.observations), 1);

  return `
    <div class="heatmap-grid">
      ${rows
        .map((row) => {
          const intensity = row.observations / maxObservations;
          const alpha = 0.15 + intensity * 0.75;
          return `
          <div class="heatmap-cell" style="background: rgb(56 189 248 / ${alpha.toFixed(2)})" title="${escapeHtml(row.bucketId)}">
            <div class="heatmap-label">${escapeHtml(row.dimensionId)}</div>
            <div class="heatmap-value">${row.observations}</div>
          </div>`;
        })
        .join("")}
    </div>`;
}

/** Serializes the dimension explorer report to standalone HTML. */
export function serializeResearchDimensionExplorerHtml(
  report: ResearchDimensionExplorerReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research Dimension Explorer</title>
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
    .stat-value { font-size: 1.4rem; font-weight: 600; margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { text-align: left; padding: 0.5rem 0.625rem; border-bottom: 1px solid ${theme.panelBorder}; vertical-align: top; }
    th { color: ${theme.textMuted}; font-size: 0.75rem; text-transform: uppercase; }
    code { color: ${theme.info}; font-size: 0.8125rem; }
    .graph-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
    .graph-node { background: ${theme.panelInset}; border-radius: 10px; padding: 0.75rem; }
    .heatmap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.5rem; }
    .heatmap-cell { border-radius: 8px; padding: 0.625rem; min-height: 72px; }
    .heatmap-label { font-size: 0.6875rem; color: ${theme.textMuted}; }
    .heatmap-value { font-size: 1.125rem; font-weight: 600; margin-top: 0.25rem; }
    .recommendation-list { margin: 0; padding-left: 1.25rem; }
    .recommendation-list li { margin-bottom: 0.875rem; }
    .chip { display: inline-block; margin-left: 0.5rem; padding: 0.125rem 0.5rem; border-radius: 999px; border: 1px solid ${theme.panelBorder}; font-size: 0.6875rem; color: ${theme.warning}; }
    .warning-list { margin: 0; padding-left: 1.25rem; color: ${theme.warning}; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Research Dimension Explorer</h1>
      <p class="muted">Read-only search-space diagnostics · ${report.summary.dimensionCount} dimensions · ${report.summary.axisGroupCount} axis groups</p>
    </header>

    <section class="panel">
      <h2>Summary</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Registry buckets</div><div class="stat-value">${report.summary.totalRegistryBuckets}</div></div>
        <div class="stat-card"><div class="stat-label">Populated buckets</div><div class="stat-value">${formatNumber(report.summary.totalPopulatedBuckets)}</div></div>
        <div class="stat-card"><div class="stat-label">Observations</div><div class="stat-value">${formatNumber(report.summary.totalObservations)}</div></div>
        <div class="stat-card"><div class="stat-label">Candidates</div><div class="stat-value">${report.summary.totalCandidates}</div></div>
        <div class="stat-card"><div class="stat-label">Validations</div><div class="stat-value">${report.summary.totalValidations}</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>Dimension graph</h2>
      <div class="graph-grid">
        ${report.visualization.dimensionGraph
          .map(
            (node) => `
          <div class="graph-node">
            <strong>${escapeHtml(node.label)}</strong>
            <div class="muted">${node.bucketCount} buckets</div>
            <div><code>${escapeHtml(node.dimensionId)}</code></div>
            <div class="muted">${node.axisGroupIds.length} axis groups</div>
          </div>`,
          )
          .join("")}
      </div>
    </section>

    <section class="panel">
      <h2>Dimensions</h2>
      <table>
        <thead><tr><th>Id</th><th>Label</th><th>Buckets</th><th>Coverage</th><th>Observations</th><th>Sparsity</th><th>Entropy</th><th>Missing</th></tr></thead>
        <tbody>${renderDimensionRows(report)}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Axis groups</h2>
      <table>
        <thead><tr><th>Group</th><th>Combinations</th><th>Populated</th><th>Empty</th><th>Population rate</th><th>Candidate yield</th><th>Validation yield</th></tr></thead>
        <tbody>${renderAxisGroupRows(report)}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Coverage heatmap</h2>
      ${renderHeatmap(report)}
    </section>

    <section class="panel">
      <h2>Sparsity warnings</h2>
      ${
        report.visualization.sparsityWarnings.length === 0
          ? `<p class="muted">No sparsity warnings.</p>`
          : `<ul class="warning-list">${report.visualization.sparsityWarnings
              .map((warning) => `<li>${escapeHtml(warning.message)}</li>`)
              .join("")}</ul>`
      }
    </section>

    <section class="panel">
      <h2>Recommendations</h2>
      ${renderRecommendations(report)}
    </section>
  </main>
</body>
</html>`;
}
