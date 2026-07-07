import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  HarnessPromotionRecommendation,
  HarnessResultsReport,
  HarnessStrategyResult,
} from "./harnessResultsTypes";

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

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function recommendationLabel(value: HarnessPromotionRecommendation): string {
  if (value === "needs-more-data") {
    return "Needs more data";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function recommendationTone(value: HarnessPromotionRecommendation): string {
  if (value === "candidate") {
    return theme.bullish;
  }
  if (value === "needs-more-data") {
    return theme.warning;
  }
  return theme.bearish;
}

function renderWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) {
    return "";
  }

  const items = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");

  return `<ul class="warnings">${items}</ul>`;
}

function renderStrategyRow(strategy: HarnessStrategyResult): string {
  const calibration = strategy.calibrationContext;
  const bucketLabel = calibration
    ? [
        calibration.atlasGroupId,
        calibration.bucketId,
        calibration.calibrationDirection,
      ]
        .filter(Boolean)
        .join(" / ")
    : "—";

  return `
    <tr>
      <td><code>${escapeHtml(strategy.strategyId)}</code></td>
      <td>${escapeHtml(strategy.strategyFamily)}</td>
      <td>${escapeHtml(strategy.direction)}</td>
      <td>${escapeHtml(strategy.runStatus)}</td>
      <td>${strategy.tradeCount}</td>
      <td>${formatCents(strategy.totalPnlCents)}</td>
      <td>${formatCents(strategy.averagePnlCents)}</td>
      <td>${formatPercent(strategy.winRatePct)}</td>
      <td>${formatPercent(strategy.maxDrawdownPct)}</td>
      <td>${escapeHtml(bucketLabel)}</td>
      <td>${strategy.robustnessScore ?? "—"}</td>
      <td style="color:${recommendationTone(strategy.promotionRecommendation)}">${escapeHtml(recommendationLabel(strategy.promotionRecommendation))}</td>
    </tr>`;
}

function renderStrategyCard(strategy: HarnessStrategyResult): string {
  return `
    <article class="card panel">
      <header class="card-header">
        <p class="eyebrow">${escapeHtml(strategy.hypothesisId)}</p>
        <h2>${escapeHtml(strategy.strategyId)}</h2>
        <p class="badge" style="color:${recommendationTone(strategy.promotionRecommendation)}">${escapeHtml(recommendationLabel(strategy.promotionRecommendation))}</p>
      </header>
      <dl class="metrics">
        <div class="metric"><dt>Family</dt><dd>${escapeHtml(strategy.strategyFamily)}</dd></div>
        <div class="metric"><dt>Direction</dt><dd>${escapeHtml(strategy.direction)}</dd></div>
        <div class="metric"><dt>Run status</dt><dd>${escapeHtml(strategy.runStatus)}</dd></div>
        <div class="metric"><dt>Harness runs</dt><dd>${strategy.harnessRuns.successful}/${strategy.harnessRuns.total} successful</dd></div>
        <div class="metric"><dt>Trade count</dt><dd>${strategy.tradeCount}</dd></div>
        <div class="metric"><dt>Total PnL</dt><dd>${formatCents(strategy.totalPnlCents)}</dd></div>
        <div class="metric"><dt>Average PnL</dt><dd>${formatCents(strategy.averagePnlCents)}</dd></div>
        <div class="metric"><dt>Win rate</dt><dd>${formatPercent(strategy.winRatePct)}</dd></div>
        <div class="metric"><dt>Max drawdown</dt><dd>${formatPercent(strategy.maxDrawdownPct)}</dd></div>
        <div class="metric"><dt>Robustness</dt><dd>${strategy.robustnessScore ?? "—"}</dd></div>
      </dl>
      ${renderWarnings(strategy.warnings)}
    </article>`;
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
    h1, h2, h3 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }
    .summary-card {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 12px;
    }
    .summary-card dt { margin: 0; font-size: 12px; color: ${theme.textMuted}; }
    .summary-card dd { margin: 4px 0 0; font-size: 20px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid ${theme.panelBorder}; }
    th { color: ${theme.textMuted}; font-weight: 500; }
    .card { margin-bottom: 16px; }
    .eyebrow { font-size: 12px; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge { font-weight: 700; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      margin: 12px 0 0;
    }
    .metric { background: ${theme.panelInset}; border-radius: 8px; padding: 10px; }
    .metric dt { margin: 0; font-size: 12px; color: ${theme.textMuted}; }
    .metric dd { margin: 4px 0 0; font-weight: 600; }
    .warnings { margin: 12px 0 0; padding-left: 20px; color: ${theme.warning}; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  `;
}

function renderStrategySelection(
  selection: NonNullable<HarnessResultsReport["summary"]["strategySelection"]>,
): string {
  if (selection.length === 0) {
    return "";
  }

  const rows = selection
    .map(
      (entry) => `
    <tr>
      <td><code>${escapeHtml(entry.strategyId)}</code></td>
      <td>${escapeHtml(entry.promotionStatus)}</td>
      <td>${escapeHtml(entry.decision)}</td>
      <td>${escapeHtml(entry.reason)}</td>
    </tr>`,
    )
    .join("");

  return `
      <section class="panel">
        <h2>Rejected strategy selection</h2>
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Promotion status</th>
              <th>Decision</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
}

/** Serializes harness results to static HTML. */
export function serializeHarnessResultsHtml(report: HarnessResultsReport): string {
  const summary = report.summary;
  const tableRows = report.strategies.map(renderStrategyRow).join("");
  const cards = report.strategies.map(renderStrategyCard).join("");
  const researchOnlyBanner =
    summary.researchOnlyBacktest
      ? `<p class="warnings" style="list-style:none;padding:12px;border-radius:8px;background:${theme.panelInset};">Research-only backtest: results are diagnostic and not promotion-eligible.</p>`
      : "";
  const runModeLabel = summary.runMode === "research-only" ? "Research-only" : "Production";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Harness Results Report</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Harness Results Report</h1>
        <p class="muted">Generated at ${escapeHtml(report.generatedAt)}</p>
        <p class="muted">Synthesis: <code>${escapeHtml(report.inputPaths.synthesisPath)}</code></p>
        <p class="muted">Harness summary: <code>${escapeHtml(report.inputPaths.harnessSummaryPath)}</code></p>
        ${researchOnlyBanner}
      </header>
      <section class="panel">
        <h2>Summary</h2>
        <dl class="summary-grid">
          <div class="summary-card"><dt>Run mode</dt><dd>${escapeHtml(runModeLabel)}</dd></div>
          <div class="summary-card"><dt>Total strategies</dt><dd>${summary.totalStrategies}</dd></div>
          <div class="summary-card"><dt>Evaluated</dt><dd>${summary.evaluatedCount}</dd></div>
          <div class="summary-card"><dt>Skipped rejected</dt><dd>${summary.skippedRejectedStrategyCount ?? 0}</dd></div>
          <div class="summary-card"><dt>Promotion eligible</dt><dd>${summary.promotionEligible === false ? "No" : "Yes"}</dd></div>
          <div class="summary-card"><dt>Candidates</dt><dd>${summary.recommendationCounts.candidate}</dd></div>
          <div class="summary-card"><dt>Needs more data</dt><dd>${summary.recommendationCounts.needsMoreData}</dd></div>
          <div class="summary-card"><dt>Rejected</dt><dd>${summary.recommendationCounts.reject}</dd></div>
        </dl>
      </section>
      ${summary.strategySelection ? renderStrategySelection(summary.strategySelection) : ""}
      <section class="panel">
        <h2>Strategy metrics</h2>
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Family</th>
              <th>Direction</th>
              <th>Status</th>
              <th>Trades</th>
              <th>Total PnL</th>
              <th>Avg PnL</th>
              <th>Win %</th>
              <th>Max DD</th>
              <th>Bucket</th>
              <th>Robustness</th>
              <th>Recommendation</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Strategy cards</h2>
        ${cards}
      </section>
    </main>
  </body>
</html>`;
}
