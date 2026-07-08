import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { QuoteFidelityGateReport } from "./quoteFidelityGateTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatShare(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function verdictClass(verdict: string): string {
  if (verdict.startsWith("proceed")) {
    return "positive";
  }

  if (verdict === "blocked-insufficient-data") {
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

export function serializeQuoteFidelityGateReport(report: QuoteFidelityGateReport): string {
  return stableStringify(report);
}

export function serializeQuoteFidelityGateHtml(report: QuoteFidelityGateReport): string {
  const summary = report.summary;
  const ladderRows = report.ladderFeasibility.ladderHistogram
    .map(
      (entry) => `
        <tr>
          <td>${entry.strikesPerEvent}</td>
          <td>${entry.eventCount}</td>
        </tr>
      `,
    )
    .join("");

  const fieldRows = report.fieldAvailability
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.field)}</td>
          <td>${entry.present ? "yes" : "no"}</td>
          <td>${escapeHtml(entry.source ?? "—")}</td>
          <td>${escapeHtml(entry.notes)}</td>
        </tr>
      `,
    )
    .join("");

  const warningItems = report.warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");
  const caveatItems = report.caveats
    .map((caveat) => `<li>${escapeHtml(caveat)}</li>`)
    .join("");

  const blockedBanner =
    summary.verdict.startsWith("blocked")
      ? `<p class="negative"><strong>No historical cross-strike ladder exists. Historical quotes are close-only / zero-spread. Cross-spread executable arb cannot be measured on this corpus.</strong></p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Quote Fidelity &amp; Ladder Feasibility Gate</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Quote Fidelity &amp; Ladder Feasibility Gate (M12.0)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
        ${blockedBanner}
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
        </div>
      </section>
      <section class="panel">
        <h2>Market Universe</h2>
        <p>Markets: ${report.marketUniverse.marketCount} (canonical: ${escapeHtml(report.marketUniverse.canonicalMarketCountSource)})</p>
        <p>Months: ${escapeHtml(report.marketUniverse.monthsCovered.join(", "))}</p>
        <p>Trading days: ${report.marketUniverse.tradingDaysCovered}</p>
      </section>
      <section class="panel">
        <h2>Quote Fidelity</h2>
        <p>Live-close-only share: ${formatShare(summary.liveCloseOnlyQuoteShare)}</p>
        <p>Zero-spread share: ${formatShare(summary.zeroSpreadMarketShare)}</p>
        <p>Executable parity feasible: ${summary.executableParityResearchFeasible ? "yes" : "no"}</p>
        <p class="muted">${escapeHtml(report.quoteFidelity.reason)}</p>
      </section>
      <section class="panel">
        <h2>Ladder Feasibility</h2>
        <p>Events: ${summary.eventCount} | ≥2 strikes: ${summary.eventsWith2PlusStrikes} | ≥3 strikes: ${summary.eventsWith3PlusStrikes}</p>
        <table>
          <thead><tr><th>Strikes / Event</th><th>Event Count</th></tr></thead>
          <tbody>${ladderRows}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Field Availability</h2>
        <table>
          <thead><tr><th>Field</th><th>Present</th><th>Source</th><th>Notes</th></tr></thead>
          <tbody>${fieldRows}</tbody>
        </table>
      </section>
      <section class="panel">
        <h2>Fee Smoke Check</h2>
        <p>yesAsk + noAsk = ${report.feeSmokeCheck.sampleYesAskCents + report.feeSmokeCheck.sampleNoAskCents}¢</p>
        <p>Net edge after fees: ${report.feeSmokeCheck.zeroSpreadParityNetEdgeCents}¢</p>
        <p>Buy-both profitable: ${report.feeSmokeCheck.buyBothParityProfitableAfterFees ? "yes" : "no"}</p>
      </section>
      <section class="panel">
        <h2>Warnings</h2>
        <ul>${warningItems}</ul>
      </section>
      <section class="panel">
        <h2>Do Not Claim</h2>
        <ul>${caveatItems}</ul>
      </section>
    </main>
  </body>
</html>`;
}
