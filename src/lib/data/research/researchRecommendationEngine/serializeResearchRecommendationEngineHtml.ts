import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { ResearchRecommendationEngineReport } from "./researchRecommendationEngineTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function confidenceTone(confidence: string): string {
  switch (confidence) {
    case "high":
      return theme.bullish;
    case "medium":
      return theme.warning;
    default:
      return theme.textMuted;
  }
}

function renderRecommendations(report: ResearchRecommendationEngineReport): string {
  if (report.recommendations.length === 0) {
    return `<p class="muted">No recommendations yet — run portfolio, ROI, interaction, dimension explorer, failure, or month-regime diagnostics first.</p>`;
  }

  return `
    <ol class="recommendation-list">
      ${report.recommendations
        .map(
          (entry) => `
        <li>
          <div class="recommendation-header">
            <strong>${escapeHtml(entry.title)}</strong>
            <span class="chip" style="color:${confidenceTone(entry.confidence)}">${escapeHtml(entry.confidence)}</span>
            <span class="chip">${escapeHtml(entry.kind)}</span>
          </div>
          <p>${escapeHtml(entry.rationale)}</p>
          <p class="muted">${escapeHtml(entry.explanation)}</p>
          <div class="artifact-row">${entry.sourceArtifacts.map((artifact) => `<code>${escapeHtml(artifact)}</code>`).join("")}</div>
        </li>`,
        )
        .join("")}
    </ol>`;
}

function renderInputStatus(report: ResearchRecommendationEngineReport): string {
  return `
    <div class="chip-row">
      ${Object.entries(report.inputStatus)
        .map(
          ([key, present]) =>
            `<span class="chip ${present ? "present" : "missing"}">${escapeHtml(key)}: ${present ? "present" : "missing"}</span>`,
        )
        .join("")}
    </div>`;
}

/** Serializes the recommendation engine report to standalone HTML. */
export function serializeResearchRecommendationEngineHtml(
  report: ResearchRecommendationEngineReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research Recommendations</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; line-height: 1.5; }
    main { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
    h1, h2 { margin: 0 0 0.75rem; }
    h2 { margin-top: 2rem; font-size: 1.125rem; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 1rem 1.25rem; margin-top: 1rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
    .stat-card { background: ${theme.panelInset}; border-radius: 10px; padding: 0.75rem; }
    .stat-label { color: ${theme.textMuted}; font-size: 0.75rem; text-transform: uppercase; }
    .stat-value { font-size: 1.4rem; font-weight: 600; margin-top: 0.25rem; }
    .recommendation-list { margin: 0; padding-left: 1.25rem; }
    .recommendation-list li { margin-bottom: 1.25rem; }
    .recommendation-header { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.35rem; }
    .chip-row, .artifact-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .chip { border-radius: 999px; padding: 0.125rem 0.5rem; font-size: 0.6875rem; border: 1px solid ${theme.panelBorder}; }
    .chip.present { color: ${theme.bullish}; }
    .chip.missing { color: ${theme.textMuted}; }
    code { color: ${theme.info}; font-size: 0.8125rem; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Research Recommendations</h1>
      <p class="muted">Heuristic, read-only guidance for the next research cycle</p>
    </header>

    <section class="panel">
      <h2>Summary</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Recommendations</div><div class="stat-value">${report.summary.recommendationCount}</div></div>
        <div class="stat-card"><div class="stat-label">High confidence</div><div class="stat-value">${report.summary.highConfidenceCount}</div></div>
        <div class="stat-card"><div class="stat-label">Inputs available</div><div class="stat-value">${report.summary.artifactsAvailable}/${report.summary.artifactsTotal}</div></div>
        <div class="stat-card"><div class="stat-label">Top recommendation</div><div class="stat-value" style="font-size:1rem">${report.summary.topRecommendation ? escapeHtml(report.summary.topRecommendation) : "—"}</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>Input artifacts</h2>
      ${renderInputStatus(report)}
    </section>

    <section class="panel">
      <h2>Recommendations</h2>
      ${renderRecommendations(report)}
    </section>
  </main>
</body>
</html>`;
}
