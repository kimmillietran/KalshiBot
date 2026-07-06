import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  ExpansionImportPerformanceAuditReport,
  FailureBreakdownEntry,
  SlowMarketEntry,
  ThroughputBucket,
} from "./expansionImportPerformanceAuditTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function renderBreakdownRows(entries: readonly FailureBreakdownEntry[]): string {
  if (entries.length === 0) {
    return `<tr><td colspan="3" class="muted">No entries recorded.</td></tr>`;
  }

  return entries
    .map(
      (entry) => `
      <tr>
        <td><code>${escapeHtml(entry.category)}</code></td>
        <td>${entry.count}</td>
        <td>${formatPercent(entry.share)}</td>
      </tr>`,
    )
    .join("");
}

function renderThroughputRows(entries: readonly ThroughputBucket[]): string {
  if (entries.length === 0) {
    return `<tr><td colspan="5" class="muted">No throughput buckets available.</td></tr>`;
  }

  return entries
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.bucket)}</td>
        <td>${entry.importedCount}</td>
        <td>${entry.failedCount}</td>
        <td>${entry.attemptedCount}</td>
        <td>${entry.importsPerMinute ?? "—"}</td>
      </tr>`,
    )
    .join("");
}

function renderSlowestRows(entries: readonly SlowMarketEntry[]): string {
  if (entries.length === 0) {
    return `<tr><td colspan="4" class="muted">No timed market imports recorded.</td></tr>`;
  }

  return entries
    .map(
      (entry) => `
      <tr>
        <td><code>${escapeHtml(entry.marketTicker)}</code></td>
        <td>${escapeHtml(entry.status)}</td>
        <td>${formatMs(entry.durationMs)}</td>
        <td>${escapeHtml(entry.errorMessage ?? "—")}</td>
      </tr>`,
    )
    .join("");
}

/** Serializes the expansion import performance audit as standalone HTML. */
export function serializeExpansionImportPerformanceAuditHtml(
  report: ExpansionImportPerformanceAuditReport,
): string {
  const { summaryMetrics, timeEstimates, recommendations } = report;
  const optimizationRows = recommendations.optimizations
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.category)}</td>
        <td>${escapeHtml(entry.title)}</td>
        <td>${escapeHtml(entry.estimatedImpact)}</td>
        <td>${entry.safeToApply ? "Yes" : "No"}</td>
        <td>${escapeHtml(entry.rationale)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Expansion Import Performance Audit</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: ${theme.pageBg};
      --panel: ${theme.panelBg};
      --text: ${theme.text};
      --muted: ${theme.textMuted};
      --border: ${theme.panelBorder};
      --accent: ${theme.info};
      --warn: ${theme.bearish};
      --good: ${theme.bullish};
    }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: var(--bg); color: var(--text); }
    main { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .muted { color: var(--muted); }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0; }
    .summary-card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
    .summary-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .summary-value { font-size: 24px; font-weight: 700; margin-top: 6px; }
    section { margin: 28px 0; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    tr:last-child td { border-bottom: none; }
    .callout { background: var(--panel); border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: 12px; padding: 14px 16px; }
    .callout.warn { border-left-color: var(--warn); }
    .callout.good { border-left-color: var(--good); }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
  </style>
</head>
<body>
  <main>
    <h1>Expansion Import Performance Audit</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} · summary ${escapeHtml(report.inputPaths.expansionImportSummaryPath)}</p>

    <section class="summary-grid">
      <div class="summary-card"><div class="summary-label">Total elapsed</div><div class="summary-value">${formatMs(summaryMetrics.totalElapsedMs)}</div></div>
      <div class="summary-card"><div class="summary-label">Imports / minute</div><div class="summary-value">${summaryMetrics.importsPerMinute ?? "—"}</div></div>
      <div class="summary-card"><div class="summary-label">Avg import duration</div><div class="summary-value">${formatMs(summaryMetrics.averageImportDurationMs)}</div></div>
      <div class="summary-card"><div class="summary-label">Rate-limit events</div><div class="summary-value">${summaryMetrics.rateLimitedCount}</div></div>
      <div class="summary-card"><div class="summary-label">Backoff time</div><div class="summary-value">${formatMs(summaryMetrics.backoffDurationMs)}</div></div>
      <div class="summary-card"><div class="summary-label">Imported</div><div class="summary-value">${summaryMetrics.importedCount}</div></div>
      <div class="summary-card"><div class="summary-label">Failed</div><div class="summary-value">${summaryMetrics.failedCount}</div></div>
      <div class="summary-card"><div class="summary-label">Retries</div><div class="summary-value">${summaryMetrics.retryCount}</div></div>
    </section>

    <section>
      <h2>Duration percentiles</h2>
      <table>
        <thead><tr><th>Metric</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>p50 market import</td><td>${formatMs(summaryMetrics.importDurationPercentiles.p50Ms)}</td></tr>
          <tr><td>p95 market import</td><td>${formatMs(summaryMetrics.importDurationPercentiles.p95Ms)}</td></tr>
          <tr><td>p99 market import</td><td>${formatMs(summaryMetrics.importDurationPercentiles.p99Ms)}</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Time attribution</h2>
      <table>
        <thead><tr><th>Phase</th><th>Estimate</th></tr></thead>
        <tbody>
          <tr><td>Active import API time</td><td>${formatMs(timeEstimates.activeImportTimeMs)}</td></tr>
          <tr><td>Backoff / rate-limit waits</td><td>${formatMs(timeEstimates.backoffTimeMs)} (${formatPercent(summaryMetrics.backoffShareOfElapsed)} of elapsed)</td></tr>
          <tr><td>Discovery time estimate</td><td>${formatMs(timeEstimates.discoveryTimeEstimateMs)}</td></tr>
          <tr><td>Discovery cache savings</td><td>${formatMs(timeEstimates.discoveryCacheEstimatedSavingsMs)} (${timeEstimates.discoveryCacheHitCount} hit${timeEstimates.discoveryCacheHitCount === 1 ? "" : "s"})</td></tr>
          <tr><td>Dedupe time estimate</td><td>${formatMs(timeEstimates.dedupeTimeEstimateMs)}</td></tr>
          <tr><td>Import write time estimate</td><td>${formatMs(timeEstimates.importWriteTimeEstimateMs)}</td></tr>
          <tr><td>Unattributed overhead</td><td>${formatMs(timeEstimates.unattributedOverheadMs)}</td></tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>Recommendations</h2>
      <div class="callout ${recommendations.adaptiveThrottlingWouldHelp ? "warn" : "good"}">
        <strong>Adaptive throttling:</strong> ${recommendations.adaptiveThrottlingWouldHelp ? "Likely helpful" : "Unlikely to help much"} —
        ${escapeHtml(recommendations.adaptiveThrottlingRationale)}
      </div>
      <p class="muted" style="margin-top:12px;">
        Recommended batch size: ${recommendations.recommendedBatchSize ?? "—"} ·
        Recommended backoff: ${recommendations.recommendedBackoffMs ?? "—"} ms
      </p>
      <p>${escapeHtml(recommendations.parallelismSafetyAssessment)}</p>
    </section>

    <section>
      <h2>Optimization suggestions</h2>
      <table>
        <thead><tr><th>Category</th><th>Title</th><th>Impact</th><th>Safe</th><th>Rationale</th></tr></thead>
        <tbody>${optimizationRows}</tbody>
      </table>
    </section>

    <section>
      <h2>Failed market breakdown</h2>
      <table>
        <thead><tr><th>Category</th><th>Count</th><th>Share</th></tr></thead>
        <tbody>${renderBreakdownRows(report.failedMarketBreakdown)}</tbody>
      </table>
    </section>

    <section>
      <h2>Unsupported market breakdown</h2>
      <table>
        <thead><tr><th>Category</th><th>Count</th><th>Share</th></tr></thead>
        <tbody>${renderBreakdownRows(report.unsupportedMarketBreakdown)}</tbody>
      </table>
    </section>

    <section>
      <h2>Slowest tickers</h2>
      <table>
        <thead><tr><th>Ticker</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
        <tbody>${renderSlowestRows(report.slowestMarkets)}</tbody>
      </table>
    </section>

    <section>
      <h2>Throughput by hour</h2>
      <table>
        <thead><tr><th>Hour</th><th>Imported</th><th>Failed</th><th>Attempted</th><th>Imports/min (run)</th></tr></thead>
        <tbody>${renderThroughputRows(report.throughputByHour)}</tbody>
      </table>
    </section>

    <section>
      <h2>Throughput by month</h2>
      <table>
        <thead><tr><th>Month</th><th>Imported</th><th>Failed</th><th>Attempted</th><th>Imports/min (run)</th></tr></thead>
        <tbody>${renderThroughputRows(report.throughputByMonth)}</tbody>
      </table>
    </section>

    <section>
      <h2>Throughput by window</h2>
      <table>
        <thead><tr><th>Window</th><th>Imported</th><th>Failed</th><th>Attempted</th><th>Imports/min (run)</th></tr></thead>
        <tbody>${renderThroughputRows(report.throughputByWindow)}</tbody>
      </table>
    </section>

    <section>
      <h2>Input directories</h2>
      <table>
        <thead><tr><th>Path</th><th>Present</th><th>Files</th><th>Bytes</th><th>Expansion configs</th><th>Import results</th></tr></thead>
        <tbody>
          <tr>
            <td><code>${escapeHtml(report.importConfigsStats.rootPath)}</code></td>
            <td>${report.importConfigsStats.present ? "yes" : "no"}</td>
            <td>${report.importConfigsStats.fileCount}</td>
            <td>${report.importConfigsStats.totalBytes}</td>
            <td>${report.importConfigsStats.expansionConfigCount}</td>
            <td>—</td>
          </tr>
          <tr>
            <td><code>${escapeHtml(report.importsDirStats.rootPath)}</code></td>
            <td>${report.importsDirStats.present ? "yes" : "no"}</td>
            <td>${report.importsDirStats.fileCount}</td>
            <td>${report.importsDirStats.totalBytes}</td>
            <td>—</td>
            <td>${report.importsDirStats.importResultCount}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}
