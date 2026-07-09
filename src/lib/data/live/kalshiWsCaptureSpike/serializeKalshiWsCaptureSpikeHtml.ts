import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { KalshiWsCaptureHealthReport } from "./kalshiWsCaptureSpikeTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderList(items: readonly string[]): string {
  if (items.length === 0) {
    return `<p class="muted">None.</p>`;
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
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
    main { max-width: 960px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 16px; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; }
    .verdict { font-size: 24px; font-weight: 700; }
    .muted { color: ${theme.textMuted}; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid ${theme.panelBorder}; }
  `;
}

export function serializeKalshiWsCaptureSpikeHtml(
  report: KalshiWsCaptureHealthReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Kalshi WS Capture Spike</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>Kalshi WebSocket Capture Spike</h1>
      <p class="muted">${escapeHtml(report.disclaimer)}</p>
      <p class="verdict">${escapeHtml(report.verdict)}</p>
      <p class="muted">Run ${escapeHtml(report.runId)} · Generated ${escapeHtml(report.generatedAt)}</p>
    </section>

    <section class="panel">
      <h2>Configuration</h2>
      <table>
        <tr><th>Series</th><td>${escapeHtml(report.config.series)}</td></tr>
        <tr><th>Duration (s)</th><td>${report.config.durationSeconds}</td></tr>
        <tr><th>Max markets</th><td>${report.config.maxMarkets}</td></tr>
        <tr><th>Dry run</th><td>${report.config.dryRun ? "yes" : "no"}</td></tr>
      </table>
    </section>

    <section class="panel">
      <h2>Credential status</h2>
      <table>
        <tr><th>Live connection attempted</th><td>${report.connection.liveConnectionAttempted ? "yes" : "no"}</td></tr>
        <tr><th>Connected</th><td>${report.connection.connected ? "yes" : "no"}</td></tr>
        <tr><th>Credential status</th><td>${escapeHtml(report.connection.credentialStatus)}</td></tr>
        <tr><th>WS URL</th><td>${escapeHtml(report.connection.wsUrl ?? "—")}</td></tr>
      </table>
    </section>

    <section class="panel">
      <h2>Market discovery</h2>
      <table>
        <tr><th>Attempted</th><td>${report.marketDiscovery.attempted ? "yes" : "no"}</td></tr>
        <tr><th>Succeeded</th><td>${report.marketDiscovery.succeeded ? "yes" : "no"}</td></tr>
        <tr><th>Discovered count</th><td>${report.marketDiscovery.discoveredMarketCount}</td></tr>
        <tr><th>Selected tickers</th><td>${escapeHtml(report.marketDiscovery.selectedMarketTickers.join(", ") || "—")}</td></tr>
      </table>
    </section>

    <section class="panel">
      <h2>Message counts</h2>
      <table>
        <tr><th>Messages received</th><td>${report.capture.messagesReceived}</td></tr>
        <tr><th>Snapshots</th><td>${report.orderbook.snapshotsReceived}</td></tr>
        <tr><th>Deltas</th><td>${report.orderbook.deltasReceived}</td></tr>
        <tr><th>Top-of-book records</th><td>${report.orderbook.validTopOfBookRecords}</td></tr>
      </table>
    </section>

    <section class="panel">
      <h2>Orderbook reconstruction health</h2>
      <table>
        <tr><th>Markets with valid book</th><td>${report.orderbook.marketsWithValidBook}</td></tr>
        <tr><th>Sequence gaps</th><td>${report.orderbook.sequenceGapCount}</td></tr>
        <tr><th>Out-of-order</th><td>${report.orderbook.outOfOrderCount}</td></tr>
      </table>
    </section>

    <section class="panel">
      <h2>BTC spot capture</h2>
      <table>
        <tr><th>Status</th><td>${escapeHtml(report.btcSpot.status)}</td></tr>
        <tr><th>Records captured</th><td>${report.btcSpot.recordsCaptured}</td></tr>
      </table>
    </section>

    <section class="panel">
      <h2>Output artifacts</h2>
      <table>
        <tr><th>Raw messages</th><td>${escapeHtml(report.capture.rawMessagesPath)}</td></tr>
        <tr><th>Top of book</th><td>${escapeHtml(report.capture.topOfBookPath)}</td></tr>
        <tr><th>BTC spot</th><td>${escapeHtml(report.capture.btcSpotPath ?? "—")}</td></tr>
      </table>
    </section>

    <section class="panel">
      <h2>Recommended next action</h2>
      <p>${escapeHtml(report.recommendedNextAction)}</p>
    </section>

    <section class="panel">
      <h2>Warnings</h2>
      ${renderList(report.warnings)}
    </section>

    <section class="panel">
      <h2>Caveats</h2>
      ${renderList([
        "Cross-spread top-of-book is derived from opposite-side bids; queue position and adverse selection are not modeled.",
        "Sequence gaps mark the book invalid until a fresh snapshot arrives.",
        "This spike writes local JSONL only; no production capture daemon or database migration is included.",
        "Dry-run mode does not prove authenticated live Kalshi WS capture or orderbook_delta subscription.",
        "No orders are placed; this is capture infrastructure for offline research only.",
      ])}
    </section>
  </main>
</body>
</html>`;
}
