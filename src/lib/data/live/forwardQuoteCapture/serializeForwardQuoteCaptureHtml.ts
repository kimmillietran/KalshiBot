import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { ForwardCaptureHealthReport } from "./forwardQuoteCaptureTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function verdictClass(verdict: string): string {
  if (verdict === "capture-mvp-success" || verdict === "dry-run-ok") {
    return "positive";
  }

  if (verdict === "degraded-capture") {
    return "warning";
  }

  return "negative";
}

function renderStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; line-height: 1.5; }
    main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 20px; }
    h1, h2 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 20px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .stat { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
    .stat .label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; }
    .stat .value { font-size: 20px; font-weight: 600; }
    .positive { color: ${theme.bullish}; }
    .negative { color: ${theme.bearish}; }
    .warning { color: ${theme.warning}; }
    ul { margin: 0; padding-left: 20px; }
  `;
}

export function serializeForwardQuoteCaptureHtml(
  report: ForwardCaptureHealthReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Forward Quote Capture (M12.1B)</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Forward Quote Capture (M12.1B)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
        <p class="negative"><strong>Capture infrastructure only. No trading decisions are made. No orders are placed. Captured data is for offline research only.</strong></p>
      </section>

      <section class="panel">
        <h2>Executive Verdict</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Verdict</div>
            <div class="value ${verdictClass(report.verdict)}">${escapeHtml(report.verdict)}</div>
          </div>
          <div class="stat">
            <div class="label">Recommended Next Action</div>
            <div class="value">${escapeHtml(report.recommendedNextAction)}</div>
          </div>
          <div class="stat">
            <div class="label">Run ID</div>
            <div class="value" style="font-size:14px">${escapeHtml(report.runId)}</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Run Config</h2>
        <p>Series: ${escapeHtml(report.config.series)} | Duration: ${report.config.durationMinutes} min | Max markets: ${report.config.maxMarkets}</p>
        <p>Rollover check: ${report.config.rolloverCheckSeconds}s | Health flush: ${report.config.healthFlushSeconds}s</p>
      </section>

      <section class="panel">
        <h2>Credential Status</h2>
        <p>Status: ${escapeHtml(report.credentialStatus)} | Auth headers: ${report.connection.authHeadersGenerated ? "yes" : "no"}</p>
      </section>

      <section class="panel">
        <h2>Market Discovery / Rollover</h2>
        <p>Subscribed: ${report.marketDiscovery.marketsSubscribed} | Closed: ${report.marketDiscovery.marketsClosed} | Rollover checks: ${report.marketDiscovery.rolloverChecks}</p>
        <p>Tickers: ${escapeHtml(report.marketDiscovery.selectedMarketTickers.join(", ") || "—")}</p>
      </section>

      <section class="panel">
        <h2>WS Connection</h2>
        <p>Current at report: ${report.connection.connected ? "connected" : "disconnected"} | Ever connected: ${report.connection.everConnected ? "yes" : "no"} | Completed normally: ${report.connection.completedNormally ? "yes" : "no"}</p>
        <p>Connects: ${report.connection.wsConnectCount} | Disconnects: ${report.connection.wsDisconnectCount} | Reconnects: ${report.connection.reconnectCount}</p>
      </section>

      <section class="panel">
        <h2>Message Counts</h2>
        <p>Raw: ${report.capture.rawMessageCount} | Top-of-book: ${report.capture.topOfBookRecordCount} | BTC spot: ${report.capture.btcSpotRecordCount} | Metadata: ${report.capture.marketMetadataRecordCount}</p>
      </section>

      <section class="panel">
        <h2>Orderbook Validity</h2>
        <p>Snapshots: ${report.orderbook.snapshotsReceived} | Deltas: ${report.orderbook.deltasReceived} | Valid books: ${report.orderbook.marketsWithValidBook}</p>
        <p>Gaps: ${report.orderbook.sequenceGapCount} | Resync attempts: ${report.orderbook.resyncAttemptCount} | Resync successes: ${report.orderbook.resyncSuccessCount}</p>
      </section>

      <section class="panel">
        <h2>BTC Spot Health</h2>
        <p>Status: ${escapeHtml(report.btcSpot.status)} | Provider: ${escapeHtml(report.btcSpot.provider ?? "—")} | Records: ${report.btcSpot.recordsCaptured}</p>
      </section>

      <section class="panel">
        <h2>Artifacts Written</h2>
        <ul>
          <li>${escapeHtml(report.capture.rawKalshiWsPath)}</li>
          <li>${escapeHtml(report.capture.topOfBookPath)}</li>
          <li>${escapeHtml(report.capture.marketMetadataPath)}</li>
          ${report.capture.btcSpotPath ? `<li>${escapeHtml(report.capture.btcSpotPath)}</li>` : ""}
          <li>${escapeHtml(report.capture.captureHealthPath)}</li>
        </ul>
      </section>

      <section class="panel">
        <h2>Warnings / Errors</h2>
        <ul>${[...report.warnings, ...report.errors].map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </section>

      <section class="panel">
        <h2>Caveats</h2>
        <p>${escapeHtml(report.disclaimer)}</p>
      </section>
    </main>
  </body>
</html>`;
}
