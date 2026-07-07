import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { DimensionInteractionAnalysisReport } from "./dimensionInteractionAnalyticsTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function renderSummary(report: DimensionInteractionAnalysisReport): string {
  return `
    <section class="panel">
      <h2>Interaction summary</h2>
      <div class="summary-grid">
        <div class="summary-card"><div class="summary-label">Composite groups</div><div class="summary-value">${report.summary.compositeGroupCount}</div></div>
        <div class="summary-card"><div class="summary-label">Candidates</div><div class="summary-value">${report.summary.totalCandidates}</div></div>
        <div class="summary-card"><div class="summary-label">Validated</div><div class="summary-value">${report.summary.totalValidated}</div></div>
        <div class="summary-card"><div class="summary-label">Avg score</div><div class="summary-value">${report.summary.averageInteractionScore.toFixed(2)}</div></div>
      </div>
    </section>`;
}

function renderRanking(
  report: DimensionInteractionAnalysisReport,
  title: string,
  groupIds: readonly string[],
): string {
  const items = groupIds
    .map((groupId) => {
      const entry = reportInteraction(report, groupId);
      if (!entry) {
        return `<li><code>${escapeHtml(groupId)}</code></li>`;
      }

      return `<li><strong>${escapeHtml(entry.interactionLabel)}</strong> <span class="muted">(${escapeHtml(groupId)})</span> — score ${entry.interactionScore.toFixed(2)}, pass ${formatPercent(entry.passRate)}</li>`;
    })
    .join("");

  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <ol>${items || "<li>No interactions ranked</li>"}</ol>
    </section>`;
}

function reportInteraction(
  report: DimensionInteractionAnalysisReport,
  groupId: string,
) {
  return report.interactions.find((entry) => entry.groupId === groupId);
}

function renderTable(report: DimensionInteractionAnalysisReport): string {
  const rows = report.interactions
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.interactionLabel)}</td>
        <td><code>${escapeHtml(entry.groupId)}</code></td>
        <td>${entry.candidateCount}</td>
        <td>${formatPercent(entry.passRate)}</td>
        <td>${entry.averageRobustness.toFixed(1)}</td>
        <td>${formatPercent(entry.nearPromisingFrequency)}</td>
        <td>${formatPercent(entry.averageCalibrationError)}</td>
        <td>${entry.coverageQuality.toFixed(2)}</td>
        <td>${entry.bucketSparsity.toFixed(2)}</td>
        <td>${entry.entropy.toFixed(2)}</td>
        <td>${entry.interactionScore.toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  return `
    <section class="panel">
      <h2>Composite interaction metrics</h2>
      <table>
        <thead>
          <tr>
            <th>Interaction</th>
            <th>Group</th>
            <th>Candidates</th>
            <th>Pass rate</th>
            <th>Avg robustness</th>
            <th>Near-promising</th>
            <th>Avg cal error</th>
            <th>Coverage</th>
            <th>Sparsity</th>
            <th>Entropy</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>${rows || "<tr><td colspan=\"11\">No composite interactions</td></tr>"}</tbody>
      </table>
    </section>`;
}

/** Serializes interaction analytics as standalone HTML. */
export function serializeDimensionInteractionAnalyticsHtml(
  report: DimensionInteractionAnalysisReport,
): string {
  const notes = report.investigatorNotes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dimension Interaction Analytics</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-top: 16px; overflow-x: auto; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .summary-card { background: ${theme.panelInset}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 14px; }
    .summary-label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; }
    .summary-value { font-size: 24px; font-weight: 700; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: left; vertical-align: top; }
    th { color: ${theme.textMuted}; font-weight: 600; }
    code { color: ${theme.info}; }
    ol { line-height: 1.6; }
  </style>
</head>
<body>
  <header>
    <h1>Dimension interaction analytics</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} · interaction quality (not feature importance)</p>
  </header>

  ${renderSummary(report)}
  ${renderRanking(report, "Best interactions", report.rankings.bestInteractions.slice(0, 5))}
  ${renderRanking(report, "Weakest interactions", report.rankings.weakestInteractions.slice(0, 5))}
  ${renderRanking(report, "High-potential interactions", report.rankings.highPotentialInteractions.slice(0, 5))}
  ${renderRanking(report, "High-noise interactions", report.rankings.highNoiseInteractions.slice(0, 5))}
  ${renderTable(report)}

  <section class="panel">
    <h2>Investigator notes</h2>
    <ul>${notes}</ul>
  </section>
</body>
</html>`;
}
