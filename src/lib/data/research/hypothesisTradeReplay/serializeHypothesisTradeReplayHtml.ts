import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { HypothesisTradeReplayReport } from "./hypothesisTradeReplayTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatCents(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(2)}¢`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function renderSkipReasons(
  skipReasons: HypothesisTradeReplayReport["entries"][number]["metrics"]["skipReasons"],
): string {
  const rows = Object.entries(skipReasons)
    .filter(([, count]) => count > 0)
    .map(
      ([reason, count]) =>
        `<tr><td>${escapeHtml(reason)}</td><td>${count}</td></tr>`,
    )
    .join("");

  if (!rows) {
    return `<p class="muted">No skipped trades.</p>`;
  }

  return `
    <table>
      <thead><tr><th>Reason</th><th>Count</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderEntryCard(
  entry: HypothesisTradeReplayReport["entries"][number],
): string {
  const metrics = entry.metrics;
  const pnlClass = metrics.netPnlCents > 0 ? "positive" : metrics.netPnlCents < 0 ? "negative" : "muted";

  return `
    <article class="entry-card">
      <header>
        <h3>${escapeHtml(entry.hypothesisId)}</h3>
        <p>${escapeHtml(entry.hypothesis)}</p>
      </header>
      <div class="metric-grid">
        <div><span class="label">Trades</span><span class="value">${metrics.tradeCount}</span></div>
        <div><span class="label">Skipped</span><span class="value">${metrics.skippedCount}</span></div>
        <div><span class="label">Net PnL</span><span class="value ${pnlClass}">${formatCents(metrics.netPnlCents)}</span></div>
        <div><span class="label">Win rate</span><span class="value">${formatPercent(metrics.winRate)}</span></div>
        <div><span class="label">Max drawdown</span><span class="value">${formatCents(metrics.maxDrawdownCents)}</span></div>
        <div><span class="label">Avg spread paid</span><span class="value">${formatCents(metrics.averageSpreadPaidCents)}</span></div>
        <div><span class="label">Unique markets</span><span class="value">${metrics.uniqueMarketCount}</span></div>
        <div><span class="label">Avg trades / market</span><span class="value">${metrics.averageTradesPerMarket ?? "—"}</span></div>
        <div><span class="label">Max trades / market</span><span class="value">${metrics.maxTradesPerMarket}</span></div>
      </div>
      ${
        entry.tradeRule
          ? `<p class="muted">${escapeHtml(entry.tradeRule.rationale)}</p>`
          : `<p class="warning">${escapeHtml(entry.unsupportedReason ?? "Unsupported hypothesis type.")}</p>`
      }
      ${
        entry.warnings.length > 0
          ? `<ul class="warnings">${entry.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
          : ""
      }
      <details>
        <summary>Skip reasons</summary>
        ${renderSkipReasons(metrics.skipReasons)}
      </details>
    </article>
  `;
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
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 24px 16px 48px;
      display: grid;
      gap: 20px;
    }
    .panel, .entry-card {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 12px 0;
    }
    .label { display: block; color: ${theme.textMuted}; font-size: 12px; }
    .value { font-size: 20px; font-weight: 600; }
    .positive { color: ${theme.bullish}; }
    .negative { color: ${theme.bearish}; }
    .muted, .warning { color: ${theme.textMuted}; }
    .warnings { margin: 8px 0 0; padding-left: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid ${theme.panelBorder}; }
  `;
}

export function serializeHypothesisTradeReplayHtml(
  report: HypothesisTradeReplayReport,
): string {
  const positiveEntries = report.entries.filter(
    (entry) => entry.metrics.tradeCount > 0 && entry.metrics.netPnlCents > 0,
  );
  const killedEntries = report.entries.filter(
    (entry) =>
      entry.metrics.fillableObservationCount > 0 && entry.metrics.tradeCount === 0,
  );
  const unprofitableEntries = report.entries.filter(
    (entry) => entry.metrics.tradeCount > 0 && entry.metrics.netPnlCents <= 0,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Hypothesis Trade Replay</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>Hypothesis-to-Trade Replay</h1>
      <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
      <p>${escapeHtml(report.disclaimer)}</p>
      <div class="metric-grid">
        <div><span class="label">Replayed hypotheses</span><span class="value">${report.summary.replayedHypothesisCount}</span></div>
        <div><span class="label">Filled trades</span><span class="value">${report.summary.filledTradeCount}</span></div>
        <div><span class="label">Skipped trades</span><span class="value">${report.summary.skippedTradeCount}</span></div>
        <div><span class="label">Positive net hypotheses</span><span class="value">${report.summary.positiveNetHypothesisCount}</span></div>
        <div><span class="label">Killed by cost/fillability</span><span class="value">${report.summary.killedByCostOrFillabilityCount}</span></div>
      </div>
      <p class="muted">
        Execution: ${escapeHtml(report.config.executionMode)} ·
        max spread ${report.config.maxSpreadCents}¢ ·
        min net edge ${report.config.minNetEdgeCents}¢ ·
        slippage ${report.config.slippageBufferCents}¢
      </p>
    </section>

    <section class="panel">
      <h2>Positive net replay (${positiveEntries.length})</h2>
      ${positiveEntries.length === 0 ? `<p class="muted">No hypotheses produced positive net replay under current assumptions.</p>` : positiveEntries.map(renderEntryCard).join("")}
    </section>

    <section class="panel">
      <h2>Descriptive but unprofitable after cost (${unprofitableEntries.length})</h2>
      ${unprofitableEntries.length === 0 ? `<p class="muted">None.</p>` : unprofitableEntries.map(renderEntryCard).join("")}
    </section>

    <section class="panel">
      <h2>Untradeable / killed by spread or fillability (${killedEntries.length})</h2>
      ${killedEntries.length === 0 ? `<p class="muted">None.</p>` : killedEntries.map(renderEntryCard).join("")}
    </section>

    <section class="panel">
      <h2>All hypotheses</h2>
      ${report.entries.map(renderEntryCard).join("")}
    </section>
  </main>
</body>
</html>`;
}
