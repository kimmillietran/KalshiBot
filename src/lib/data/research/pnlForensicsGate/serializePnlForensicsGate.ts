import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { PnlForensicsGateReport } from "./pnlForensicsGateTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNullableNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function formatShare(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
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
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px 16px 48px;
      display: grid;
      gap: 20px;
    }
    h1, h2, h3 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 20px;
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
    }
    .stat .label {
      color: ${theme.textMuted};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat .value { font-size: 20px; font-weight: 600; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    .positive { color: ${theme.bullish}; }
    .negative { color: ${theme.bearish}; }
    .warning { color: ${theme.warning}; }
  `;
}

export function serializePnlForensicsGateReport(report: PnlForensicsGateReport): string {
  return stableStringify(report);
}

export function serializePnlForensicsGateHtml(report: PnlForensicsGateReport): string {
  const summary = report.summary;
  const verdictClass =
    summary.familyForensicsVerdict === "proceed-to-trade-pnl-oos"
      ? "positive"
      : summary.familyForensicsVerdict === "insufficient-data"
        ? "warning"
        : "negative";

  const sideRows = report.sideBreakdown
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.sideBucket)}</td>
          <td>${formatNullableNumber(entry.netPnlCents)}</td>
          <td>${entry.filledTradeCount}</td>
          <td>${entry.uniqueMarketCount}</td>
          <td>${formatShare(entry.shareOfFamilyPnl)}</td>
        </tr>
      `,
    )
    .join("");

  const dailyRows = report.dailyPnl
    .slice(0, 40)
    .map(
      (day) => `
        <tr>
          <td>${escapeHtml(day.date)}</td>
          <td>${formatNullableNumber(day.netPnlCents)}</td>
          <td>${day.filledTradeCount}</td>
          <td>${day.uniqueMarketCount}</td>
          <td>${formatNullableNumber(day.cumulativeNetPnlCents)}</td>
        </tr>
      `,
    )
    .join("");

  const monthRows = report.monthlyPnl
    .map(
      (month) => `
        <tr>
          <td>${escapeHtml(month.calendarMonth)}</td>
          <td>${formatNullableNumber(month.netPnlCents)}</td>
          <td>${month.filledTradeCount}</td>
          <td>${formatShare(month.shareOfTotalPnl)}</td>
        </tr>
      `,
    )
    .join("");

  const marketRows = report.marketConcentration
    .slice(0, 20)
    .map(
      (market) => `
        <tr>
          <td>${escapeHtml(market.marketTicker)}</td>
          <td>${formatNullableNumber(market.netPnlCents)}</td>
          <td>${market.filledTradeCount}</td>
          <td>${formatShare(market.shareOfTotalPnl)}</td>
        </tr>
      `,
    )
    .join("");

  const hypothesisRows = report.hypotheses
    .map(
      (hypothesis) => `
        <tr>
          <td>${escapeHtml(hypothesis.hypothesisId)}</td>
          <td>${formatNullableNumber(hypothesis.netPnlCents)}</td>
          <td>${hypothesis.filledTradeCount}</td>
          <td>${formatShare(hypothesis.topDayShare)}</td>
          <td>${formatShare(hypothesis.topMarketShare)}</td>
          <td>${escapeHtml(hypothesis.forensicsVerdict)}</td>
        </tr>
      `,
    )
    .join("");

  const caveatItems = report.caveats
    .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
    .join("");
  const warningItems = report.warnings
    .map((warning) => `<li class="warning">${escapeHtml(warning)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>In-Sample PnL Forensics Gate</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>In-Sample PnL Forensics Gate</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
        <p>
          M11.6 showed positive net in-sample PnL. This report decomposes that PnL to check whether it is broad or concentrated.
          This is not out-of-sample evidence and does not validate a strategy.
        </p>
      </header>

      <section class="panel">
        <h2>Family verdict</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Verdict</div>
            <div class="value ${verdictClass}">${escapeHtml(summary.familyForensicsVerdict)}</div>
          </div>
          <div class="stat">
            <div class="label">Recommend full M12</div>
            <div class="value">${summary.recommendFullM12 ? "Yes" : "No"}</div>
          </div>
          <div class="stat">
            <div class="label">Next action</div>
            <div class="value">${escapeHtml(summary.recommendedNextAction)}</div>
          </div>
          <div class="stat">
            <div class="label">Family net PnL (¢)</div>
            <div class="value">${formatNullableNumber(summary.familyNetPnlCents)}</div>
          </div>
          <div class="stat">
            <div class="label">Step-level trades</div>
            <div class="value">${summary.stepLevelFilledTradeCount}</div>
          </div>
          <div class="stat">
            <div class="label">Unique markets</div>
            <div class="value">${summary.uniqueMarketCount}</div>
          </div>
          <div class="stat">
            <div class="label">Unique trading days</div>
            <div class="value">${summary.uniqueTradingDayCount}</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Concentration diagnostics</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Top day share of positive PnL</div>
            <div class="value">${formatShare(report.dailyConcentration.topDayShareOfTotalPositivePnl)}</div>
          </div>
          <div class="stat">
            <div class="label">Top 3 day share</div>
            <div class="value">${formatShare(report.dailyConcentration.top3DayShareOfTotalPositivePnl)}</div>
          </div>
          <div class="stat">
            <div class="label">Top market share</div>
            <div class="value">${formatShare(report.marketConcentrationSummary.topMarketShareOfTotalPnl)}</div>
          </div>
          <div class="stat">
            <div class="label">Max trades / market</div>
            <div class="value">${report.marketConcentrationSummary.maxTradesPerMarket}</div>
          </div>
        </div>
        ${warningItems ? `<ul>${warningItems}</ul>` : "<p class='muted'>No concentration warnings.</p>"}
      </section>

      <section class="panel">
        <h2>Side decomposition</h2>
        <table>
          <thead>
            <tr><th>Side</th><th>Net PnL (¢)</th><th>Trades</th><th>Markets</th><th>Share</th></tr>
          </thead>
          <tbody>${sideRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Daily equity curve</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Net PnL (¢)</th><th>Trades</th><th>Markets</th><th>Cumulative (¢)</th></tr>
          </thead>
          <tbody>${dailyRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Monthly PnL</h2>
        <table>
          <thead>
            <tr><th>Month</th><th>Net PnL (¢)</th><th>Trades</th><th>Share</th></tr>
          </thead>
          <tbody>${monthRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Market concentration</h2>
        <table>
          <thead>
            <tr><th>Market</th><th>Net PnL (¢)</th><th>Trades</th><th>Share</th></tr>
          </thead>
          <tbody>${marketRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Hypothesis verdicts</h2>
        <table>
          <thead>
            <tr><th>Hypothesis</th><th>Net PnL</th><th>Trades</th><th>Top day</th><th>Top market</th><th>Verdict</th></tr>
          </thead>
          <tbody>${hypothesisRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Caveats</h2>
        <ul>${caveatItems}</ul>
      </section>
    </main>
  </body>
</html>`;
}
