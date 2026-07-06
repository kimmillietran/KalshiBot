import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  ExpansionRunHistoryReport,
  ExpansionRunHistoryRun,
  ExpansionRunTrendSeries,
} from "./expansionRunHistoryTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return escapeHtml(value);
  }

  return new Date(parsed).toISOString().replace("T", " ").slice(0, 19);
}

function formatMs(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  if (ms >= 3_600_000) {
    return `${(ms / 3_600_000).toFixed(2)}h`;
  }
  if (ms >= 60_000) {
    return `${(ms / 60_000).toFixed(1)}m`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

function formatRate(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return value.toLocaleString("en-US");
}

function trendTone(direction: ExpansionRunTrendSeries["direction"]): string {
  switch (direction) {
    case "improving":
      return theme.bullish;
    case "declining":
      return theme.bearish;
    case "stable":
      return theme.textMuted;
    default:
      return theme.textMuted;
  }
}

function renderTrendCard(label: string, series: ExpansionRunTrendSeries): string {
  return `
    <div class="stat-card">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value" style="color:${trendTone(series.direction)}">${escapeHtml(series.direction)}</div>
      <div class="stat-meta">${series.values.length} runs tracked</div>
    </div>`;
}

function renderRunRows(runs: readonly ExpansionRunHistoryRun[]): string {
  if (runs.length === 0) {
    return `<tr><td colspan="11" class="muted">No runs recorded yet.</td></tr>`;
  }

  return [...runs]
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
    .map(
      (run) => `
      <tr>
        <td>${formatTimestamp(run.generatedAt)}</td>
        <td>${escapeHtml(run.runStatus)}</td>
        <td>${formatNumber(run.maxMarkets)}</td>
        <td>${run.importedCount}</td>
        <td>${run.failedCount}</td>
        <td>${run.unsupportedCount}</td>
        <td>${run.rateLimitedCount}</td>
        <td>${formatRate(run.importSuccessRate)}</td>
        <td>${run.importsPerMinute ?? "—"}</td>
        <td>${formatRate(run.discoveryOverheadShare)}</td>
        <td>${run.researchYieldPerImportedMarket ?? "—"}</td>
      </tr>`,
    )
    .join("");
}

/** Serializes the expansion run history report to static HTML. */
export function serializeExpansionRunHistoryHtml(report: ExpansionRunHistoryReport): string {
  const { highlights, trends } = report;
  const efficiencyLabel =
    highlights.efficiencyImproving === null
      ? "insufficient data"
      : highlights.efficiencyImproving
        ? "improving"
        : "declining";
  const efficiencyTone =
    highlights.efficiencyImproving === true
      ? theme.bullish
      : highlights.efficiencyImproving === false
        ? theme.bearish
        : theme.textMuted;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Expansion Run History</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: ${theme.pageBg};
        color: ${theme.text};
        line-height: 1.5;
      }
      main { max-width: 1180px; margin: 0 auto; padding: 24px; }
      .panel {
        background: ${theme.panelBg};
        border: 1px solid ${theme.panelBorder};
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
      }
      .hero { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
      .muted { color: ${theme.textMuted}; }
      .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
      .stat-card {
        border: 1px solid ${theme.panelBorder};
        border-radius: 10px;
        padding: 12px;
        background: ${theme.panelInset};
      }
      .stat-label { font-size: 12px; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.04em; }
      .stat-value { font-size: 22px; font-weight: 700; margin-top: 4px; }
      .stat-meta { font-size: 12px; color: ${theme.textMuted}; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { padding: 10px 8px; border-bottom: 1px solid ${theme.panelBorder}; text-align: left; }
      th { color: ${theme.textMuted}; font-weight: 600; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <header class="panel hero">
        <div>
          <h1>Expansion Run History</h1>
          <p class="muted">Longitudinal expansion import comparison · generated ${formatTimestamp(report.generatedAt)}</p>
          <p class="muted">History artifact <code>${escapeHtml(report.historyPath)}</code></p>
        </div>
        <div class="stat-card">
          <div class="stat-label">Efficiency trend</div>
          <div class="stat-value" style="color:${efficiencyTone}">${escapeHtml(efficiencyLabel)}</div>
          <div class="stat-meta">${report.summary.runCount} runs retained</div>
        </div>
      </header>

      <section class="panel">
        <h2>Highlights</h2>
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">Latest run</div>
            <div class="stat-value">${formatTimestamp(highlights.latestRun?.generatedAt ?? null)}</div>
            <div class="stat-meta">${highlights.latestRun?.importedCount ?? 0} imported · ${highlights.latestRun?.importsPerMinute ?? "—"} / min</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Best throughput</div>
            <div class="stat-value">${highlights.bestThroughputRun?.importsPerMinute ?? "—"}</div>
            <div class="stat-meta">${formatTimestamp(highlights.bestThroughputRun?.generatedAt ?? null)} · ${highlights.bestThroughputRun?.importedCount ?? 0} imported</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Worst bottleneck</div>
            <div class="stat-value">${formatRate(highlights.worstBottleneckRun?.discoveryOverheadShare ?? null)}</div>
            <div class="stat-meta">${formatTimestamp(highlights.worstBottleneckRun?.generatedAt ?? null)} · discovery ${formatMs(highlights.worstBottleneckRun?.discoveryTimeEstimateMs ?? null)}</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Trends</h2>
        <div class="stat-grid">
          ${renderTrendCard("Import success rate", trends.importSuccessRate)}
          ${renderTrendCard("Unsupported rate", trends.unsupportedRate)}
          ${renderTrendCard("Rate-limit rate", trends.rateLimitRate)}
          ${renderTrendCard("Discovery overhead", trends.discoveryOverheadShare)}
          ${renderTrendCard("Imports / minute", trends.importsPerMinute)}
          ${renderTrendCard("Research yield / import", trends.researchYieldPerImportedMarket)}
        </div>
      </section>

      <section class="panel">
        <h2>Run log</h2>
        <table>
          <thead>
            <tr>
              <th>Generated</th>
              <th>Status</th>
              <th>Max markets</th>
              <th>Imported</th>
              <th>Failed</th>
              <th>Unsupported</th>
              <th>429s</th>
              <th>Success rate</th>
              <th>Imports/min</th>
              <th>Discovery share</th>
              <th>Yield/import</th>
            </tr>
          </thead>
          <tbody>
            ${renderRunRows(report.runs)}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}
