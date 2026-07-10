import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { BidOnlyCandidateLifecycleReport } from "./bidOnlyCandidateLifecycleTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatMs(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${Math.round(value)} ms`;
}

function renderStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; line-height: 1.5; }
    main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 20px; }
    h1, h2, h3 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 20px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .stat { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
    .stat .label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; }
    .stat .value { font-size: 20px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px 10px; text-align: left; }
    ul { margin: 0; padding-left: 20px; }
  `;
}

export function serializeBidOnlyCandidateLifecycleReport(
  report: BidOnlyCandidateLifecycleReport,
): string {
  return stableStringify(report);
}

export function serializeBidOnlyCandidateLifecycleHtml(
  report: BidOnlyCandidateLifecycleReport,
): string {
  const metrics = report.metrics;
  const episodeRows = report.episodes
    .slice(0, 100)
    .map(
      (episode) => `
        <tr>
          <td>${escapeHtml(episode.episodeId)}</td>
          <td>${escapeHtml(episode.marketTicker)}</td>
          <td>${escapeHtml(episode.episodeClassification)}</td>
          <td>${formatMs(episode.durationMs)}</td>
          <td>${episode.recordCount}</td>
          <td>${episode.maxBidOnlyEdgeCents ?? "—"}</td>
          <td>${episode.minBidSizeContracts ?? "—"}</td>
          <td>${escapeHtml(episode.timeToCloseBucket)}</td>
        </tr>
      `,
    )
    .join("");

  const warningItems = metrics.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");
  const caveatItems = report.caveats
    .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bid-Only Candidate Lifecycle</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Bid-Only Candidate Lifecycle (M12.9)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
      </section>

      <section class="panel">
        <h2>Executive Summary</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Runs Scanned</div><div class="value">${metrics.runsScanned}</div></div>
          <div class="stat"><div class="label">Records Scanned</div><div class="value">${metrics.recordsScanned}</div></div>
          <div class="stat"><div class="label">Candidate Records</div><div class="value">${metrics.bidOnlyCandidateRecords}</div></div>
          <div class="stat"><div class="label">Episodes Built</div><div class="value">${metrics.episodesBuilt}</div></div>
          <div class="stat"><div class="label">Persistent Episodes</div><div class="value">${metrics.persistentCandidateEpisodes}</div></div>
          <div class="stat"><div class="label">Median Duration</div><div class="value">${formatMs(metrics.medianEpisodeDurationMs)}</div></div>
        </div>
        <p><strong>Recommended next action:</strong> ${escapeHtml(report.summary.recommendedNextAction)}</p>
      </section>

      <section class="panel">
        <h2>Episode Classifications</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Gross</div><div class="value">${metrics.grossCandidateEpisodes}</div></div>
          <div class="stat"><div class="label">Buffer-Adjusted</div><div class="value">${metrics.bufferAdjustedCandidateEpisodes}</div></div>
          <div class="stat"><div class="label">Needs Executable Confirmation</div><div class="value">${metrics.episodesByClassification["needs-executable-confirmation"]}</div></div>
          <div class="stat"><div class="label">Too Brief</div><div class="value">${metrics.episodesByClassification["too-brief"]}</div></div>
          <div class="stat"><div class="label">Insufficient Depth</div><div class="value">${metrics.episodesByClassification["insufficient-depth"]}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>Edge &amp; Duration</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Max Edge</div><div class="value">${metrics.maxEdgeCents ?? "—"}¢</div></div>
          <div class="stat"><div class="label">Median Edge</div><div class="value">${metrics.medianEdgeCents ?? "—"}¢</div></div>
          <div class="stat"><div class="label">P95 Edge</div><div class="value">${metrics.p95EdgeCents ?? "—"}¢</div></div>
          <div class="stat"><div class="label">P95 Duration</div><div class="value">${formatMs(metrics.p95EpisodeDurationMs)}</div></div>
          <div class="stat"><div class="label">Total Candidate Time</div><div class="value">${formatMs(metrics.totalCandidateTimeMs)}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>Episodes (first 100)</h2>
        <table>
          <thead>
            <tr>
              <th>Episode</th>
              <th>Market</th>
              <th>Classification</th>
              <th>Duration</th>
              <th>Records</th>
              <th>Max Edge</th>
              <th>Min Size</th>
              <th>TTC Bucket</th>
            </tr>
          </thead>
          <tbody>${episodeRows || "<tr><td colspan='8'>No episodes</td></tr>"}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Caveats</h2>
        <ul>${caveatItems}</ul>
        ${warningItems ? `<h3>Warnings</h3><ul>${warningItems}</ul>` : ""}
      </section>
    </main>
  </body>
</html>`;
}
