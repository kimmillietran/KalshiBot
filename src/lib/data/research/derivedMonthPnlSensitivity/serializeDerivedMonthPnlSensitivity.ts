import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { DerivedMonthPnlSensitivityReport } from "./derivedMonthPnlSensitivityTypes";

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

function recommendationClass(recommendation: string): string {
  if (recommendation === "proceed-to-trade-pnl-oos") {
    return "positive";
  }

  if (
    recommendation === "insufficient-data"
    || recommendation === "collect-more-official-months"
  ) {
    return "warning";
  }

  return "negative";
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
    ul { margin: 0; padding-left: 20px; }
  `;
}

export function serializeDerivedMonthPnlSensitivityReport(
  report: DerivedMonthPnlSensitivityReport,
): string {
  return stableStringify(report);
}

export function serializeDerivedMonthPnlSensitivityHtml(
  report: DerivedMonthPnlSensitivityReport,
): string {
  const summary = report.summary;
  const variantRows = report.variants
    .map((variant) => {
      const delta = variant.deltaVsFullCorpus;
      return `
        <tr>
          <td>${escapeHtml(variant.label)}</td>
          <td>${formatNullableNumber(variant.netPnlCents)}</td>
          <td>${variant.filledTradeCount}</td>
          <td>${variant.uniqueMarketCount}</td>
          <td>${variant.uniqueTradingDayCount}</td>
          <td>${formatShare(variant.topMonthShare)}</td>
          <td>${escapeHtml(variant.forensicsVerdict)}</td>
          <td>${delta ? formatShare(delta.netPnlRetentionShare) : "—"}</td>
          <td>${delta?.hypothesisSignFlips ?? "—"}</td>
        </tr>
      `;
    })
    .join("");

  const warningItems = report.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");

  const caveatItems = report.caveats
    .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Derived-Month PnL Sensitivity</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Derived-Month PnL Sensitivity (M11.10)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
      </section>

      <section class="panel">
        <h2>Family Recommendation</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Recommendation</div>
            <div class="value ${recommendationClass(summary.familyRecommendation)}">${escapeHtml(summary.familyRecommendation)}</div>
          </div>
          <div class="stat">
            <div class="label">Recommend Full M12</div>
            <div class="value">${summary.recommendFullM12 ? "yes" : "no"}</div>
          </div>
          <div class="stat">
            <div class="label">Sensitive Month</div>
            <div class="value">${escapeHtml(summary.sensitiveMonth)}</div>
          </div>
          <div class="stat">
            <div class="label">Retention (excl. month)</div>
            <div class="value">${formatShare(summary.netPnlRetentionShare)}</div>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Full Corpus PnL</div>
            <div class="value">${formatNullableNumber(summary.fullCorpusNetPnlCents)}¢</div>
          </div>
          <div class="stat">
            <div class="label">Excluding Month PnL</div>
            <div class="value">${formatNullableNumber(summary.excludingSensitiveMonthNetPnlCents)}¢</div>
          </div>
          <div class="stat">
            <div class="label">Sensitive Month Only</div>
            <div class="value">${formatNullableNumber(summary.sensitiveMonthOnlyNetPnlCents)}¢</div>
          </div>
          <div class="stat">
            <div class="label">Hypothesis Sign Flips</div>
            <div class="value">${summary.hypothesisSignFlips}</div>
          </div>
          <div class="stat">
            <div class="label">Top Month After Exclusion</div>
            <div class="value">${formatShare(summary.topMonthShareAfterExclusion)}</div>
          </div>
          <div class="stat">
            <div class="label">Side Sign Flips</div>
            <div class="value">${summary.sideSignFlips}</div>
          </div>
        </div>
        ${
          summary.flippedHypothesisIds.length > 0
            ? `<p class="muted">Flipped hypotheses: ${escapeHtml(summary.flippedHypothesisIds.join(", "))}</p>`
            : ""
        }
        ${
          report.warnings.length > 0
            ? `<h3>Warnings</h3><ul>${warningItems}</ul>`
            : ""
        }
      </section>

      <section class="panel">
        <h2>Variant Comparison</h2>
        <table>
          <thead>
            <tr>
              <th>Variant</th>
              <th>Net PnL (¢)</th>
              <th>Trades</th>
              <th>Markets</th>
              <th>Days</th>
              <th>Top Month Share</th>
              <th>Forensics</th>
              <th>PnL Retention</th>
              <th>Hyp. Flips</th>
            </tr>
          </thead>
          <tbody>${variantRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>M11.9 Context</h2>
        <p class="muted">M11 forensics verdict: ${escapeHtml(summary.m11ForensicsVerdict ?? "—")}</p>
        <p class="muted">M11 recommended next action: ${escapeHtml(summary.m11RecommendedNextAction ?? "—")}</p>
        <p class="muted">Uses sensitive-month heuristic: ${summary.usesSensitiveMonthHeuristic ? "yes" : "no"}</p>
        <p class="muted">Derived market keys: ${summary.derivedMarketKeysCount}</p>
      </section>

      <section class="panel">
        <h2>Caveats</h2>
        <ul>${caveatItems}</ul>
      </section>
    </main>
  </body>
</html>`;
}
