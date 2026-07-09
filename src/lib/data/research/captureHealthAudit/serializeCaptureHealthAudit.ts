import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CaptureHealthAuditReport } from "./captureHealthAuditTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatShare(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${Math.round(value)} ms`;
}

function verdictClass(verdict: string): string {
  if (verdict === "capture-research-ready") {
    return "positive";
  }

  if (verdict === "capture-too-short") {
    return "warning";
  }

  return "negative";
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
    .positive { color: ${theme.bullish}; }
    .negative { color: ${theme.bearish}; }
    .warning { color: ${theme.warning}; }
    ul { margin: 0; padding-left: 20px; }
  `;
}

function renderSegmentRows(
  segments: Record<string, { recordCount: number; validBookShare: number | null; zeroSpreadShare: number | null; medianGapMs: number | null }>,
): string {
  return Object.entries(segments)
    .sort((left, right) => right[1].recordCount - left[1].recordCount)
    .map(
      ([key, metrics]) => `
        <tr>
          <td>${escapeHtml(key)}</td>
          <td>${metrics.recordCount}</td>
          <td>${formatShare(metrics.validBookShare)}</td>
          <td>${formatShare(metrics.zeroSpreadShare)}</td>
          <td>${formatMs(metrics.medianGapMs)}</td>
        </tr>
      `,
    )
    .join("");
}

export function serializeCaptureHealthAuditReport(report: CaptureHealthAuditReport): string {
  return stableStringify(report);
}

export function serializeCaptureHealthAuditHtml(report: CaptureHealthAuditReport): string {
  const summary = report.summary;
  const warningItems = report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  const caveatItems = report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("");

  const artifactRows = [
    ["Raw messages", report.artifacts.rawMessagesPath ?? "missing"],
    ["Top of book", report.artifacts.topOfBookPath ?? "missing"],
    ["BTC spot", report.artifacts.btcSpotPath ?? "missing"],
    ["Market metadata", report.artifacts.marketMetadataPath ?? "missing"],
    ["Capture health", report.artifacts.captureHealthPath ?? "missing"],
  ]
    .map(
      ([label, path]) => `
        <tr>
          <td>${escapeHtml(label)}</td>
          <td>${escapeHtml(path)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Capture Health &amp; Data Quality Audit</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Capture Health &amp; Data Quality Audit (M12.1B-H)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
      </section>

      <section class="panel">
        <h2>Executive Verdict</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Verdict</div>
            <div class="value ${verdictClass(summary.verdict)}">${escapeHtml(summary.verdict)}</div>
          </div>
          <div class="stat">
            <div class="label">Recommended Next Action</div>
            <div class="value">${escapeHtml(summary.recommendedNextAction)}</div>
          </div>
          <div class="stat">
            <div class="label">Run Duration</div>
            <div class="value">${summary.runDurationSeconds ?? "—"}s</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Input Artifacts</h2>
        <p class="muted">Capture run dir: ${escapeHtml(report.captureRunDir)}</p>
        <table>
          <thead><tr><th>Artifact</th><th>Path</th></tr></thead>
          <tbody>${artifactRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Run Duration &amp; Market Coverage</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">First Timestamp</div><div class="value">${escapeHtml(summary.firstTimestamp ?? "—")}</div></div>
          <div class="stat"><div class="label">Last Timestamp</div><div class="value">${escapeHtml(summary.lastTimestamp ?? "—")}</div></div>
          <div class="stat"><div class="label">Markets Covered</div><div class="value">${summary.marketsCovered}</div></div>
          <div class="stat"><div class="label">Event Tickers Covered</div><div class="value">${summary.eventTickersCovered}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>Message Coverage</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Raw Messages</div><div class="value">${summary.rawMessageCount}</div></div>
          <div class="stat"><div class="label">Top-of-Book Records</div><div class="value">${summary.topOfBookCount}</div></div>
          <div class="stat"><div class="label">BTC Spot Records</div><div class="value">${summary.btcSpotCount}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>Top-of-Book Continuity</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Median Gap</div><div class="value">${formatMs(summary.continuity.medianTopOfBookGapMs)}</div></div>
          <div class="stat"><div class="label">P90 Gap</div><div class="value">${formatMs(summary.continuity.p90TopOfBookGapMs)}</div></div>
          <div class="stat"><div class="label">Max Gap</div><div class="value">${formatMs(summary.continuity.maxTopOfBookGapMs)}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>Sequence / Gap Health</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Valid Book Share</div><div class="value">${formatShare(summary.bookState.validBookShare)}</div></div>
          <div class="stat"><div class="label">Gap-Detected Share</div><div class="value">${formatShare(summary.bookState.gapDetectedShare)}</div></div>
          <div class="stat"><div class="label">Sequence Gaps</div><div class="value">${summary.bookState.sequenceGapCount ?? "—"}</div></div>
          <div class="stat"><div class="label">Out-of-Order</div><div class="value">${summary.bookState.outOfOrderCount ?? "—"}</div></div>
          <div class="stat"><div class="label">Reconnects</div><div class="value">${summary.bookState.reconnectCount ?? "—"}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>BTC Spot Join Quality</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">BTC Spot Requested</div><div class="value">${summary.btcJoin.btcSpotRequested ? "yes" : "no"}</div></div>
          <div class="stat"><div class="label">Join Coverage</div><div class="value">${formatShare(summary.btcJoin.joinCoverageShare)}</div></div>
          <div class="stat"><div class="label">Median Kalshi→BTC Distance</div><div class="value">${formatMs(summary.btcJoin.medianKalshiToBtcDistanceMs)}</div></div>
          <div class="stat"><div class="label">P90 Kalshi→BTC Distance</div><div class="value">${formatMs(summary.btcJoin.p90KalshiToBtcDistanceMs)}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>Spread Sanity</h2>
        <div class="stat-grid">
          <div class="stat"><div class="label">Non-Zero Spread Share</div><div class="value">${formatShare(summary.spread.nonZeroSpreadShare)}</div></div>
          <div class="stat"><div class="label">Zero Spread Share</div><div class="value">${formatShare(summary.spread.zeroSpreadShare)}</div></div>
          <div class="stat"><div class="label">Crossed/Inverted Books</div><div class="value">${summary.spread.crossedOrInvertedBookCount}</div></div>
          <div class="stat"><div class="label">Missing Bid/Ask Share</div><div class="value">${formatShare(summary.spread.missingBidOrAskShare)}</div></div>
        </div>
      </section>

      <section class="panel">
        <h2>Per-Market Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Records</th>
              <th>Valid Book</th>
              <th>Zero Spread</th>
              <th>Median Gap</th>
            </tr>
          </thead>
          <tbody>${renderSegmentRows(report.segments.marketTicker)}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Recommended Next Action</h2>
        <p>${escapeHtml(summary.recommendedNextAction)}</p>
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
