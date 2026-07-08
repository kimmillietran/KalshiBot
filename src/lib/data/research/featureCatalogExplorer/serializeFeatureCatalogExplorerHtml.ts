import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { FeatureCatalogExplorerReport } from "./featureCatalogExplorerTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return value.toLocaleString("en-US");
}

function renderFeatureRows(report: FeatureCatalogExplorerReport): string {
  if (report.features.length === 0) {
    return `<tr><td colspan="11" class="muted">No catalog entries.</td></tr>`;
  }

  return report.features
    .map(
      (feature) => `
      <tr>
        <td><code>${escapeHtml(feature.featureId)}</code></td>
        <td>${escapeHtml(feature.label)}</td>
        <td>${escapeHtml(feature.sourceLayer)}</td>
        <td>${feature.onMispricingObservation ? "yes" : "—"}</td>
        <td>${feature.registeredAsResearchDimension ? "yes" : "—"}</td>
        <td>${feature.participatesInAxisGroups.length > 0 ? escapeHtml(feature.participatesInAxisGroups.join(", ")) : "—"}</td>
        <td>${formatNumber(feature.bucketCount)}</td>
        <td>${formatNumber(feature.candidateYield)}</td>
        <td>${feature.averageRobustness?.toFixed(2) ?? "—"}</td>
        <td>${feature.usedInResearch ? "yes" : "—"}</td>
        <td class="muted">${escapeHtml(feature.duplicationStatus ?? feature.coverageNotes ?? "—")}</td>
      </tr>`,
    )
    .join("");
}

function renderIdList(ids: readonly string[], emptyMessage: string): string {
  if (ids.length === 0) {
    return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  }

  return `<ul class="id-list">${ids
    .map((id) => `<li><code>${escapeHtml(id)}</code></li>`)
    .join("")}</ul>`;
}

function renderRecommendations(report: FeatureCatalogExplorerReport): string {
  if (report.recommendedNextFeatureDimensions.length === 0) {
    return `<p class="muted">No eligible future dimensions identified.</p>`;
  }

  return `
    <ol class="recommendation-list">
      ${report.recommendedNextFeatureDimensions
        .map(
          (item) => `
        <li>
          <strong>${escapeHtml(item.label)}</strong>
          <div><code>${escapeHtml(item.featureId)}</code></div>
          <div class="muted">${escapeHtml(item.rationale)}</div>
        </li>`,
        )
        .join("")}
    </ol>`;
}

/** Serializes the feature catalog explorer report to standalone HTML. */
export function serializeFeatureCatalogExplorerHtml(
  report: FeatureCatalogExplorerReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Feature Catalog Explorer</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; line-height: 1.5; }
    main { max-width: 1280px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
    h1, h2 { margin: 0 0 0.75rem; }
    h2 { margin-top: 2rem; font-size: 1.125rem; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 1rem 1.25rem; margin-top: 1rem; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
    .stat-card { background: ${theme.panelInset}; border-radius: 10px; padding: 0.75rem; }
    .stat-label { color: ${theme.textMuted}; font-size: 0.75rem; text-transform: uppercase; }
    .stat-value { font-size: 1.4rem; font-weight: 600; margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    th, td { text-align: left; padding: 0.5rem 0.625rem; border-bottom: 1px solid ${theme.panelBorder}; vertical-align: top; }
    th { color: ${theme.textMuted}; font-size: 0.6875rem; text-transform: uppercase; }
    code { color: ${theme.info}; font-size: 0.8125rem; }
    .id-list { margin: 0; padding-left: 1.25rem; columns: 2; }
    .recommendation-list { margin: 0; padding-left: 1.25rem; }
    .recommendation-list li { margin-bottom: 0.875rem; }
    .warning-list { margin: 0; padding-left: 1.25rem; color: ${theme.warning}; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Feature Catalog Explorer</h1>
      <p class="muted">Read-only unified feature catalog · ${report.summary.totalFeatures} features · ${report.summary.usedInResearchCount} used in research</p>
    </header>

    <section class="panel">
      <h2>Summary</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Total features</div><div class="stat-value">${report.summary.totalFeatures}</div></div>
        <div class="stat-card"><div class="stat-label">Implemented</div><div class="stat-value">${report.summary.implementedFeatures}</div></div>
        <div class="stat-card"><div class="stat-label">Used in research</div><div class="stat-value">${report.summary.usedInResearchCount}</div></div>
        <div class="stat-card"><div class="stat-label">Computed unused</div><div class="stat-value">${report.summary.computedButUnusedCount}</div></div>
        <div class="stat-card"><div class="stat-label">Registry dimensions</div><div class="stat-value">${report.summary.registryDimensionCount}</div></div>
        <div class="stat-card"><div class="stat-label">Missing indicators</div><div class="stat-value">${report.summary.missingIndicators}</div></div>
        <div class="stat-card"><div class="stat-label">Optional artifacts</div><div class="stat-value">${report.summary.optionalArtifactsAvailable}/${report.summary.optionalArtifactsTotal}</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>Feature catalog</h2>
      <table>
        <thead>
          <tr>
            <th>Feature</th><th>Label</th><th>Layer</th><th>Mispricing obs</th><th>Dimension</th><th>Axis groups</th>
            <th>Buckets</th><th>Candidate yield</th><th>Robustness</th><th>Research</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>${renderFeatureRows(report)}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Computed but unused in research</h2>
      ${renderIdList(report.computedButUnused, "All implemented features are wired into research.")}
    </section>

    <section class="panel">
      <h2>Dimensions without catalog metadata</h2>
      ${renderIdList(report.dimensionsWithoutCatalogMetadata, "Every registry dimension has catalog metadata.")}
    </section>

    <section class="panel">
      <h2>Eligible for future dimensions</h2>
      ${renderIdList(report.eligibleForFutureDimensions, "No additional features eligible for dimension registration.")}
    </section>

    <section class="panel">
      <h2>Genuinely missing indicators</h2>
      ${
        report.genuinelyMissingIndicators.length === 0
          ? `<p class="muted">All tracked indicators are implemented.</p>`
          : `<ul class="warning-list">${report.genuinelyMissingIndicators
              .map((id) => `<li><code>${escapeHtml(id)}</code></li>`)
              .join("")}</ul>`
      }
    </section>

    <section class="panel">
      <h2>Recommended next feature dimensions</h2>
      ${renderRecommendations(report)}
    </section>
  </main>
</body>
</html>`;
}
