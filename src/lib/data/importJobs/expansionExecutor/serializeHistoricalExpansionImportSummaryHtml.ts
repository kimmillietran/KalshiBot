import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { HistoricalExpansionImportSummary } from "./expansionExecutorTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

/** Serializes the expansion import summary as a standalone HTML report. */
export function serializeHistoricalExpansionImportSummaryHtml(
  summary: HistoricalExpansionImportSummary,
): string {
  const jobRows = summary.jobs
    .map(
      (job) => `
      <tr>
        <td><code>${escapeHtml(job.jobId)}</code></td>
        <td>${escapeHtml(job.seriesTicker)}</td>
        <td>${escapeHtml(job.status)}</td>
        <td>${job.discoveredMarketCount}</td>
        <td>${job.importedCount}</td>
        <td>${job.skippedCount}</td>
        <td>${job.failedCount}</td>
        <td>${job.plannedCount}</td>
        <td>${job.unsupportedCount}</td>
        <td>${job.durationMs} ms</td>
      </tr>`,
    )
    .join("");

  const marketRows = summary.jobs
    .flatMap((job) =>
      job.markets.map(
        (market) => `
        <tr>
          <td><code>${escapeHtml(job.jobId)}</code></td>
          <td><code>${escapeHtml(market.marketTicker)}</code></td>
          <td>${escapeHtml(market.status)}</td>
          <td><code>${escapeHtml(market.configPath ?? "—")}</code></td>
          <td><code>${escapeHtml(market.importResultPath ?? "—")}</code></td>
          <td>${escapeHtml(market.skipReason ?? market.errorMessage ?? "—")}</td>
        </tr>`,
      ),
    )
    .join("");

  const warningItems = summary.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Historical Expansion Import Summary</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
      overflow-x: auto;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .summary-card {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .summary-label { color: ${theme.textMuted}; font-size: 12px; }
    .summary-value { font-size: 28px; font-weight: 700; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
    code { color: ${theme.info}; }
  </style>
</head>
<body>
  <header>
    <h1>Historical Expansion Import Summary</h1>
    <p class="muted">Generated ${escapeHtml(summary.generatedAt)} · ${summary.execute ? "execute" : "dry-run"}</p>
  </header>

  <section class="summary-grid">
    <div class="summary-card"><div class="summary-label">Jobs</div><div class="summary-value">${summary.summary.jobCount}</div></div>
    <div class="summary-card"><div class="summary-label">Discovered</div><div class="summary-value">${summary.summary.discoveredMarketCount}</div></div>
    <div class="summary-card"><div class="summary-label">Imported</div><div class="summary-value">${summary.summary.importedCount}</div></div>
    <div class="summary-card"><div class="summary-label">Skipped</div><div class="summary-value">${summary.summary.skippedCount}</div></div>
    <div class="summary-card"><div class="summary-label">Failed</div><div class="summary-value">${summary.summary.failedCount}</div></div>
    <div class="summary-card"><div class="summary-label">Planned</div><div class="summary-value">${summary.summary.plannedCount}</div></div>
    <div class="summary-card"><div class="summary-label">Unsupported</div><div class="summary-value">${summary.summary.unsupportedCount}</div></div>
    <div class="summary-card"><div class="summary-label">Skipped unsupported</div><div class="summary-value">${summary.summary.skippedUnsupportedCount}</div></div>
  </section>

  <section class="panel">
    <h2>Job results</h2>
    <table>
      <thead><tr><th>Job</th><th>Series</th><th>Status</th><th>Discovered</th><th>Imported</th><th>Skipped</th><th>Failed</th><th>Planned</th><th>Unsupported</th><th>Duration</th></tr></thead>
      <tbody>${jobRows || "<tr><td colspan=\"10\">No jobs executed</td></tr>"}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Market results</h2>
    <table>
      <thead><tr><th>Job</th><th>Market</th><th>Status</th><th>Config</th><th>Import result</th><th>Notes</th></tr></thead>
      <tbody>${marketRows || "<tr><td colspan=\"6\">No markets processed</td></tr>"}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>Rate-limit diagnostics</h2>
    <ul>
      <li>Rate-limited events: ${summary.rateLimitDiagnostics.rateLimitedCount}</li>
      <li>Backoff waited: ${summary.rateLimitDiagnostics.backoffDurationMs} ms</li>
      <li>Retries: ${summary.rateLimitDiagnostics.retryCount}</li>
      <li>First rate-limited ticker: <code>${escapeHtml(summary.rateLimitDiagnostics.firstRateLimitedTicker ?? "—")}</code></li>
      <li>${escapeHtml(summary.rateLimitDiagnostics.recommendedNextAction)}</li>
    </ul>
  </section>

  <section class="panel">
    <h2>Warnings</h2>
    <ul>${warningItems || "<li class=\"muted\">No warnings</li>"}</ul>
  </section>
</body>
</html>`;
}
