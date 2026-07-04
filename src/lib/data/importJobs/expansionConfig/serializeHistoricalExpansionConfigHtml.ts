import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { HistoricalExpansionImportConfig } from "./expansionConfigTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderJobRows(config: HistoricalExpansionImportConfig): string {
  return config.jobs
    .map((job) => {
      const statusTone =
        job.status === "scheduled" ? theme.bullish : theme.textMuted;
      return `
        <tr>
          <td>${job.priority}</td>
          <td><code>${escapeHtml(job.jobId)}</code></td>
          <td style="color:${statusTone}">${escapeHtml(job.status)}</td>
          <td>${escapeHtml(job.seriesTicker)}</td>
          <td>${escapeHtml(job.windowStart)}</td>
          <td>${escapeHtml(job.windowEnd)}</td>
          <td>${job.estimatedMarketCount ?? "—"}</td>
          <td>${escapeHtml(job.reason ?? "—")}</td>
          <td>${escapeHtml(job.skipReason ?? "—")}</td>
          <td><code>${escapeHtml(job.importDefaults.btc.provider)}</code></td>
        </tr>`;
    })
    .join("");
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
    main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 48px; }
    h1, h2 { margin: 0 0 8px; }
    .meta { color: ${theme.textMuted}; margin-bottom: 24px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 8px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; }
    th, td { padding: 10px 12px; border-bottom: 1px solid ${theme.panelBorder}; text-align: left; vertical-align: top; }
    th { color: ${theme.textMuted}; font-weight: 600; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
  `;
}

/** Serializes expansion import config as a researcher-facing HTML report. */
export function serializeHistoricalExpansionConfigHtml(
  config: HistoricalExpansionImportConfig,
): string {
  const dryRunLabel = config.dryRun ? "Dry run (no files written)" : "Write mode";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Historical Expansion Import Config</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <main>
  <h1>Historical Expansion Import Config</h1>
  <p class="meta">${escapeHtml(dryRunLabel)} · Generated ${escapeHtml(config.generatedAt)} · Input ${escapeHtml(config.inputPath)}</p>
  <div class="stats">
    <div class="stat"><strong>${config.summary.recommendationCount}</strong><br />Recommendations</div>
    <div class="stat"><strong>${config.summary.scheduledJobCount}</strong><br />Scheduled jobs</div>
    <div class="stat"><strong>${config.summary.skippedJobCount}</strong><br />Skipped (deduped)</div>
  </div>
  <h2>Import jobs</h2>
  <table>
    <thead>
      <tr>
        <th>Priority</th>
        <th>Job ID</th>
        <th>Status</th>
        <th>Series</th>
        <th>Window start</th>
        <th>Window end</th>
        <th>Est. markets</th>
        <th>Reason</th>
        <th>Skip reason</th>
        <th>BTC provider</th>
      </tr>
    </thead>
    <tbody>
      ${renderJobRows(config)}
    </tbody>
  </table>
  </main>
</body>
</html>`;
}
