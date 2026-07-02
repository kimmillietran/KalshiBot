import type {
  ProbabilityCalibrationReport,
} from "@/lib/data/research/calibration/calibrationTypes";
import type { StrategyLeaderboardEntry } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";

import type {
  ResearchReportChartBar,
  ResearchReportDocument,
  ResearchReportMarketHighlight,
  ResearchReportStrategySection,
} from "./researchReportTypes";
import { researchReportTheme as theme } from "./reportTheme";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatNullablePercent(value: number | null): string {
  return value === null ? "—" : formatPercent(value);
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "—" : String(value);
}

function toneColor(tone: ResearchReportChartBar["tone"]): string {
  if (tone === "up") {
    return theme.chartUp;
  }
  if (tone === "down") {
    return theme.chartDown;
  }
  return theme.info;
}

function renderBarChart(
  title: string,
  bars: readonly ResearchReportChartBar[],
  options?: { valueFormatter?: (value: number) => string; unitSuffix?: string },
): string {
  if (bars.length === 0) {
    return `<section class="panel"><h2>${escapeHtml(title)}</h2><p class="muted">No data available.</p></section>`;
  }

  const maxValue = Math.max(...bars.map((bar) => Math.abs(bar.value)), 1);
  const formatter = options?.valueFormatter ?? ((value: number) => String(value));
  const unitSuffix = options?.unitSuffix ?? "";

  const rows = bars
    .map((bar) => {
      const width = Math.max((Math.abs(bar.value) / maxValue) * 100, bar.value === 0 ? 0 : 4);
      return `
        <div class="chart-row">
          <div class="chart-label">${escapeHtml(bar.label)}</div>
          <div class="chart-track">
            <div class="chart-bar" style="width:${width.toFixed(4)}%;background:${toneColor(bar.tone)}"></div>
          </div>
          <div class="chart-value">${escapeHtml(formatter(bar.value))}${escapeHtml(unitSuffix)}</div>
        </div>`;
    })
    .join("");

  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${rows}</section>`;
}

function renderLeaderboardTable(entries: readonly StrategyLeaderboardEntry[]): string {
  if (entries.length === 0) {
    return `<section class="panel"><h2>Leaderboard</h2><p class="muted">No leaderboard data available.</p></section>`;
  }

  const rows = entries
    .map(
      (entry) => `
      <tr>
        <td>${entry.rank}</td>
        <td>${escapeHtml(entry.strategyId)}</td>
        <td>${formatCents(entry.totalPnlCents)}</td>
        <td>${formatPercent(entry.winRatePct)}</td>
        <td>${formatPercent(entry.maxDrawdownPct)}</td>
        <td>${entry.totalTrades}</td>
        <td>${entry.totalFills}</td>
        <td>${entry.marketsTested}</td>
        <td>${entry.sharpeRatio === null ? "—" : entry.sharpeRatio.toFixed(4)}</td>
      </tr>`,
    )
    .join("");

  return `
    <section class="panel">
      <h2>Leaderboard</h2>
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Strategy</th>
            <th>Total PnL</th>
            <th>Win Rate</th>
            <th>Max Drawdown</th>
            <th>Trades</th>
            <th>Fills</th>
            <th>Markets</th>
            <th>Sharpe</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderMarketTable(
  title: string,
  markets: readonly ResearchReportMarketHighlight[],
): string {
  if (markets.length === 0) {
    return `<section class="panel"><h3>${escapeHtml(title)}</h3><p class="muted">No markets to display.</p></section>`;
  }

  const rows = markets
    .map(
      (market) => `
      <tr>
        <td>${escapeHtml(market.strategyId)}</td>
        <td>${escapeHtml(market.seriesTicker)}</td>
        <td>${escapeHtml(market.marketTicker)}</td>
        <td class="${market.totalPnlCents >= 0 ? "up" : "down"}">${formatCents(market.totalPnlCents)}</td>
        <td>${formatNullablePercent(market.winRatePct)}</td>
        <td>${formatNullableNumber(market.tradeCount)}</td>
        <td>${formatNullableNumber(market.fillCount)}</td>
      </tr>`,
    )
    .join("");

  return `
    <section class="panel">
      <h3>${escapeHtml(title)}</h3>
      <table>
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Series</th>
            <th>Market</th>
            <th>PnL</th>
            <th>Win Rate</th>
            <th>Trades</th>
            <th>Fills</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderStrategySection(section: ResearchReportStrategySection): string {
  return `
    <section class="panel">
      <h2>${escapeHtml(section.strategyId)}</h2>
      <div class="stat-grid">
        <div class="stat"><span class="label">Total PnL</span><span class="value ${section.totalPnlCents >= 0 ? "up" : "down"}">${formatCents(section.totalPnlCents)}</span></div>
        <div class="stat"><span class="label">Win Rate</span><span class="value">${formatPercent(section.winRatePct)}</span></div>
        <div class="stat"><span class="label">Max Drawdown</span><span class="value down">${formatPercent(section.maxDrawdownPct)}</span></div>
        <div class="stat"><span class="label">Trades</span><span class="value">${section.totalTrades}</span></div>
        <div class="stat"><span class="label">Fills</span><span class="value">${section.totalFills}</span></div>
        <div class="stat"><span class="label">Markets</span><span class="value">${section.completedMarkets}/${section.marketsTested}</span></div>
      </div>
      <div class="grid-2">
        ${renderMarketTable("Top Markets", section.topMarkets)}
        ${renderMarketTable("Bottom Markets", section.bottomMarkets)}
        ${renderMarketTable("Largest Wins", section.largestWins)}
        ${renderMarketTable("Largest Losses", section.largestLosses)}
      </div>
    </section>`;
}

function renderReliabilityTable(report: ProbabilityCalibrationReport): string {
  const rows = report.kalshiImplied.reliabilityTable
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.binLabel)}</td>
        <td>${row.sampleCount}</td>
        <td>${row.averagePredictedProbability === null ? "—" : row.averagePredictedProbability.toFixed(4)}</td>
        <td>${row.observedSettlementFrequency === null ? "—" : row.observedSettlementFrequency.toFixed(4)}</td>
        <td>${row.calibrationGap === null ? "—" : row.calibrationGap.toFixed(4)}</td>
      </tr>`,
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Bin</th>
          <th>Samples</th>
          <th>Predicted</th>
          <th>Observed</th>
          <th>Gap</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderCalibrationSection(report: ProbabilityCalibrationReport): string {
  return `
    <section class="panel">
      <h2>Calibration — ${escapeHtml(report.strategyId)} / ${escapeHtml(report.seriesTicker)}</h2>
      <div class="stat-grid">
        <div class="stat"><span class="label">Observations</span><span class="value">${report.sampleCounts.totalObservations}</span></div>
        <div class="stat"><span class="label">Markets</span><span class="value">${report.sampleCounts.marketCount}</span></div>
        <div class="stat"><span class="label">Brier</span><span class="value">${report.kalshiImplied.brierScore === null ? "—" : report.kalshiImplied.brierScore.toFixed(4)}</span></div>
        <div class="stat"><span class="label">ECE</span><span class="value">${report.kalshiImplied.calibrationError === null ? "—" : report.kalshiImplied.calibrationError.toFixed(4)}</span></div>
      </div>
      <h3>Kalshi Implied Reliability</h3>
      ${renderReliabilityTable(report)}
    </section>`;
}

function renderStyles(): string {
  return `
    :root {
      color-scheme: dark;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: ${theme.pageBg};
      color: ${theme.text};
      line-height: 1.5;
    }
    main {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
      display: grid;
      gap: 20px;
    }
    h1, h2, h3 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 4px;
    }
    .label {
      color: ${theme.textMuted};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .value { font-size: 18px; font-weight: 700; }
    .up { color: ${theme.bullish}; }
    .down { color: ${theme.bearish}; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
    .grid-2 {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }
    .chart-row {
      display: grid;
      grid-template-columns: 160px 1fr 120px;
      gap: 12px;
      align-items: center;
      margin-bottom: 10px;
    }
    .chart-label { font-size: 14px; }
    .chart-track {
      height: 16px;
      background: ${theme.chartGrid};
      border-radius: 999px;
      overflow: hidden;
    }
    .chart-bar {
      height: 100%;
      border-radius: 999px;
    }
    .chart-value {
      font-size: 13px;
      color: ${theme.textMuted};
      text-align: right;
    }
  `;
}

/** Serializes a research report document to static HTML. */
export function serializeResearchReportHtml(document: ResearchReportDocument): string {
  const leaderboardEntries = [...(document.leaderboard?.strategies ?? [])].sort(
    (left, right) => left.rank - right.rank,
  );

  const body = document.hasData
    ? `
      ${renderLeaderboardTable(leaderboardEntries)}
      ${renderBarChart("PnL by Strategy", document.pnlChart, { valueFormatter: formatCents })}
      ${renderBarChart("Win Rate by Strategy", document.winRateChart, {
        valueFormatter: (value) => value.toFixed(2),
        unitSuffix: "%",
      })}
      ${renderBarChart("Max Drawdown by Strategy", document.drawdownChart, {
        valueFormatter: (value) => value.toFixed(2),
        unitSuffix: "%",
      })}
      ${renderBarChart("Trade Counts by Strategy", document.tradeCountChart)}
      ${renderBarChart("Fill Counts by Strategy", document.fillCountChart)}
      <section class="panel"><h2>Strategy Comparison</h2><div class="grid-2">${document.strategySections.map(renderStrategySection).join("")}</div></section>
      ${document.calibrationReports.map(renderCalibrationSection).join("")}
    `
    : `<section class="panel"><h2>No Research Data</h2><p class="muted">No leaderboard, aggregate summaries, or calibration reports were found under <code>${escapeHtml(document.inputRoot)}</code>.</p></section>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research Report</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Research Report</h1>
        <p class="muted">Generated at ${escapeHtml(document.generatedAt)}</p>
        <p class="muted">Input root: ${escapeHtml(document.inputRoot)}</p>
        ${document.leaderboardPath ? `<p class="muted">Leaderboard: ${escapeHtml(document.leaderboardPath)}</p>` : ""}
      </header>
      ${body}
    </main>
  </body>
</html>`;
}
