import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { ExpansionRebuildSummary } from "./expansionRebuildTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "—" : String(value);
}

function formatDelta(before: number, after: number): string {
  const delta = after - before;
  if (delta === 0) {
    return "0";
  }

  return delta > 0 ? `+${delta}` : String(delta);
}

function renderMetricCards(summary: ExpansionRebuildSummary): string {
  const { before, after } = summary;

  return `
    <section class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Fixtures</div>
        <div class="summary-value">${after.fixtureCount}</div>
        <div class="summary-delta">${formatDelta(before.fixtureCount, after.fixtureCount)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Research outputs</div>
        <div class="summary-value">${after.researchOutputCount}</div>
        <div class="summary-delta">${formatDelta(before.researchOutputCount, after.researchOutputCount)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Registry markets</div>
        <div class="summary-value">${after.registryMarketCount}</div>
        <div class="summary-delta">${formatDelta(before.registryMarketCount, after.registryMarketCount)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Trading days</div>
        <div class="summary-value">${formatNullableNumber(after.uniqueTradingDays)}</div>
        <div class="summary-delta">${
          before.uniqueTradingDays === null || after.uniqueTradingDays === null
            ? "—"
            : formatDelta(before.uniqueTradingDays, after.uniqueTradingDays)
        }</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Atlas market count</div>
        <div class="summary-value">${formatNullableNumber(after.atlasMarketCount)}</div>
        <div class="summary-delta">${
          before.atlasMarketCount === null || after.atlasMarketCount === null
            ? "—"
            : formatDelta(before.atlasMarketCount, after.atlasMarketCount)
        }</div>
      </div>
    </section>`;
}

function renderMarketRows(
  rows: ReadonlyArray<{
    seriesTicker: string;
    marketTicker: string;
    status: string;
    errorMessage: string | null;
  }>,
): string {
  if (rows.length === 0) {
    return `<tr><td colspan="4" class="muted">No markets processed.</td></tr>`;
  }

  return rows
    .map(
      (row) => `
      <tr>
        <td><code>${escapeHtml(row.seriesTicker)}</code></td>
        <td><code>${escapeHtml(row.marketTicker)}</code></td>
        <td class="status-${escapeHtml(row.status)}">${escapeHtml(row.status)}</td>
        <td>${row.errorMessage ? escapeHtml(row.errorMessage) : "—"}</td>
      </tr>`,
    )
    .join("");
}

/** Serializes expansion rebuild summary as a standalone HTML report. */
export function serializeExpansionRebuildSummaryHtml(
  summary: ExpansionRebuildSummary,
): string {
  const warnings =
    summary.warnings.length > 0
      ? summary.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")
      : "<li class=\"muted\">No warnings.</li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Expansion Rebuild Summary</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: ${theme.pageBg};
      --panel: ${theme.panelBg};
      --text: ${theme.text};
      --muted: ${theme.textMuted};
      --border: ${theme.panelBorder};
      --accent: ${theme.info};
      --success: ${theme.bullish};
      --warning: ${theme.warning};
      --danger: ${theme.bearish};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    main { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
    h1, h2 { margin: 0 0 1rem; }
    .muted { color: var(--muted); }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0 2rem;
    }
    .summary-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
    }
    .summary-label { color: var(--muted); font-size: 0.85rem; }
    .summary-value { font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem; }
    .summary-delta { color: var(--accent); font-size: 0.9rem; margin-top: 0.25rem; }
    section { margin-bottom: 2rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }
    th, td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--muted); font-size: 0.85rem; font-weight: 600; }
    tr:last-child td { border-bottom: none; }
    .status-success { color: var(--success); }
    .status-skipped { color: var(--warning); }
    .status-failed { color: var(--danger); }
    ul { padding-left: 1.25rem; }
    code { font-size: 0.9em; }
  </style>
</head>
<body>
  <main>
    <h1>Expansion Fixture + Research Rebuild</h1>
    <p class="muted">Generated ${escapeHtml(summary.generatedAt)} · ${summary.fullRebuild ? "full rebuild" : "expansion-only"} · ${summary.targetMarketCount} target market(s)</p>
    ${renderMetricCards(summary)}
    <section>
      <h2>Run summary</h2>
      <table>
        <tbody>
          <tr><th>Fixtures built</th><td>${summary.summary.fixturesBuilt}</td></tr>
          <tr><th>Fixtures skipped</th><td>${summary.summary.fixturesSkipped}</td></tr>
          <tr><th>Fixtures failed</th><td>${summary.summary.fixturesFailed}</td></tr>
          <tr><th>Research succeeded</th><td>${summary.summary.researchRunsSucceeded}</td></tr>
          <tr><th>Research skipped</th><td>${summary.summary.researchRunsSkipped}</td></tr>
          <tr><th>Research failed</th><td>${summary.summary.researchRunsFailed}</td></tr>
          <tr><th>Registry series</th><td>${summary.summary.registrySeriesCount}</td></tr>
          <tr><th>Duration (ms)</th><td>${summary.summary.durationMs}</td></tr>
        </tbody>
      </table>
    </section>
    <section>
      <h2>Fixture results</h2>
      <table>
        <thead>
          <tr><th>Series</th><th>Market</th><th>Status</th><th>Error</th></tr>
        </thead>
        <tbody>
          ${renderMarketRows(summary.fixtureResults)}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Research results</h2>
      <table>
        <thead>
          <tr><th>Series</th><th>Market</th><th>Status</th><th>Error</th></tr>
        </thead>
        <tbody>
          ${renderMarketRows(summary.researchResults)}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Warnings</h2>
      <ul>${warnings}</ul>
    </section>
  </main>
</body>
</html>`;
}
