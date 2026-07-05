import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { HypothesisEvolutionEntry, HypothesisEvolutionReport } from "./hypothesisEvolutionTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function trendArrow(trend: HypothesisEvolutionEntry["trend"]): string {
  switch (trend) {
    case "strengthening":
      return "↑ strengthening";
    case "weakening":
      return "↓ weakening";
    case "newly-discovered":
      return "★ newly discovered";
    case "disappeared":
      return "✕ disappeared";
    default:
      return "→ stable";
  }
}

function renderEntry(entry: HypothesisEvolutionEntry): string {
  const timelineRows = entry.timeline
    .map(
      (snapshot, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(snapshot.timestamp.slice(0, 19).replace("T", " "))}</td>
        <td>${snapshot.observationCount}</td>
        <td>${snapshot.robustnessScore}</td>
        <td>${snapshot.marketCount}</td>
        <td>${escapeHtml(snapshot.classification ?? "—")}</td>
      </tr>`,
    )
    .join("");

  const classificationRows = entry.classificationChanges
    .map(
      (change) => `
      <li>${escapeHtml(change.timestamp.slice(0, 19).replace("T", " "))}: ${escapeHtml(change.classification ?? "unknown")}</li>`,
    )
    .join("");

  return `
  <section class="panel hypothesis-card">
    <h2>${escapeHtml(entry.hypothesis)}</h2>
    <p class="muted"><code>${escapeHtml(entry.hypothesisId)}</code></p>
    <div class="summary-grid">
      <div><span class="label">Trend</span><strong>${escapeHtml(trendArrow(entry.trend))}</strong></div>
      <div><span class="label">Robustness Δ</span><strong>${entry.trendMetrics.robustnessDelta ?? "—"}</strong></div>
      <div><span class="label">Observation growth</span><strong>${entry.trendMetrics.observationGrowth ?? "—"}</strong></div>
      <div><span class="label">Coverage growth</span><strong>${entry.trendMetrics.coverageGrowth ?? "—"}</strong></div>
      <div><span class="label">Promotion trajectory</span><strong>${escapeHtml(entry.trendMetrics.promotionTrajectory ?? "—")}</strong></div>
      <div><span class="label">Promotion eligible</span><strong>${entry.currentStatus?.promotionEligible ? "yes" : "no"}</strong></div>
    </div>
    <h3>Timeline</h3>
    <table>
      <thead><tr><th>Run</th><th>Timestamp</th><th>Obs</th><th>Robustness</th><th>Markets</th><th>Classification</th></tr></thead>
      <tbody>${timelineRows || "<tr><td colspan=\"6\">No timeline</td></tr>"}</tbody>
    </table>
    <h3>Classification changes</h3>
    <ul>${classificationRows || "<li class=\"muted\">No classification changes</li>"}</ul>
  </section>`;
}

/** Serializes the hypothesis evolution report as standalone HTML. */
export function serializeHypothesisEvolutionHtml(report: HypothesisEvolutionReport): string {
  const entrySections = report.entries.map((entry) => renderEntry(entry)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Hypothesis Evolution</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2, h3 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-top: 16px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 12px 0; }
    .label { display: block; color: ${theme.textMuted}; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: left; }
    code { color: ${theme.info}; }
  </style>
</head>
<body>
  <header>
    <h1>Hypothesis Evolution</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} · ${report.summary.runCount} runs tracked</p>
  </header>

  <section class="panel">
    <h2>Summary</h2>
    <div class="summary-grid">
      <div><span class="label">Strengthening</span><strong>${report.summary.strengtheningCount}</strong></div>
      <div><span class="label">Weakening</span><strong>${report.summary.weakeningCount}</strong></div>
      <div><span class="label">Stable</span><strong>${report.summary.stableCount}</strong></div>
      <div><span class="label">Newly discovered</span><strong>${report.summary.newlyDiscoveredCount}</strong></div>
      <div><span class="label">Disappeared</span><strong>${report.summary.disappearedCount}</strong></div>
    </div>
    <p><strong>Strongest improving:</strong> ${escapeHtml(report.highlights.strongestImprovingHypothesis ?? "—")}</p>
    <p><strong>Largest robustness gain:</strong> ${report.highlights.largestRobustnessGain ?? "—"}</p>
    <p><strong>Largest observation growth:</strong> ${report.highlights.largestObservationGrowth ?? "—"}</p>
  </section>

  ${entrySections}
</body>
</html>`;
}
