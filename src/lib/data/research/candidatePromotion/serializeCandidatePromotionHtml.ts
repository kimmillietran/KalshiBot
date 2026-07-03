import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  CandidatePromotionDecision,
  CandidatePromotionEntry,
  CandidatePromotionReport,
} from "./candidatePromotionTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function decisionColor(decision: CandidatePromotionDecision): string {
  switch (decision) {
    case "production-watchlist":
      return theme.bullish;
    case "candidate":
      return theme.bullish;
    case "exploratory":
      return theme.warning;
    case "needs-more-data":
      return theme.warning;
    case "rejected":
      return theme.bearish;
  }
}

function renderSummary(report: CandidatePromotionReport): string {
  const counts = report.summary.decisionCounts;
  return `
    <section class="summary-grid">
      <div class="summary-card"><div class="label">Total</div><div class="value">${report.summary.totalStrategies}</div></div>
      <div class="summary-card"><div class="label">Watchlist</div><div class="value" style="color:${theme.bullish}">${counts["production-watchlist"]}</div></div>
      <div class="summary-card"><div class="label">Candidate</div><div class="value">${counts.candidate}</div></div>
      <div class="summary-card"><div class="label">Exploratory</div><div class="value">${counts.exploratory}</div></div>
      <div class="summary-card"><div class="label">Needs data</div><div class="value">${counts["needs-more-data"]}</div></div>
      <div class="summary-card"><div class="label">Rejected</div><div class="value" style="color:${theme.bearish}">${counts.rejected}</div></div>
    </section>`;
}

function renderMetrics(entry: CandidatePromotionEntry): string {
  const metrics = entry.supportingMetrics;
  return `
    <div class="metric-grid">
      <div><span class="label">Robustness</span><div>${metrics.robustnessScore ?? "—"}</div></div>
      <div><span class="label">Validation</span><div>${metrics.validationPasses === null ? "—" : metrics.validationPasses ? "pass" : "fail"}</div></div>
      <div><span class="label">Harness trades</span><div>${metrics.totalTradeCount}</div></div>
      <div><span class="label">Harness runs</span><div>${metrics.harnessSuccessfulRuns}/${metrics.harnessMarketRuns}</div></div>
      <div><span class="label">Net PnL (¢)</span><div>${metrics.netPnlCents ?? "—"}</div></div>
      <div><span class="label">Significant</span><div>${metrics.statisticallySignificant === null ? "—" : metrics.statisticallySignificant ? "yes" : "no"}</div></div>
    </div>`;
}

function renderList(title: string, items: readonly string[]): string {
  if (items.length === 0) {
    return "";
  }

  return `
    <div>
      <h4>${escapeHtml(title)}</h4>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>`;
}

function renderPromotionCard(entry: CandidatePromotionEntry): string {
  return `
    <article class="promotion-card">
      <header class="card-header">
        <div>
          <h3>${escapeHtml(entry.strategyId)}</h3>
          <p class="muted">${escapeHtml(entry.strategyFamily)} · ${escapeHtml(entry.hypothesisId)}</p>
        </div>
        <span class="decision-pill" style="background:${decisionColor(entry.decision)}">${escapeHtml(entry.decision)}</span>
      </header>
      <p>${escapeHtml(entry.explanation)}</p>
      ${renderMetrics(entry)}
      <p><strong>Next action:</strong> ${escapeHtml(entry.recommendedNextAction)}</p>
      ${renderList("Blocking issues", entry.blockingIssues)}
      ${renderList("Warnings", entry.warnings)}
    </article>`;
}

/** Serializes the candidate promotion report as standalone HTML. */
export function serializeCandidatePromotionHtml(
  report: CandidatePromotionReport,
): string {
  const cards = report.promotions.map(renderPromotionCard).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research Candidate Promotions</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; }
    main { max-width: 1100px; margin: 0 auto; padding: 24px; display: grid; gap: 16px; }
    h1, h2, h3, h4 { margin: 0 0 8px; }
    .muted { color: ${theme.textMuted}; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
    }
    .summary-card, .promotion-card {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .label {
      color: ${theme.textMuted};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .value { font-size: 24px; font-weight: 700; }
    .card-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      margin-bottom: 12px;
    }
    .decision-pill {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #081018;
      white-space: nowrap;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
      margin: 12px 0;
    }
    ul { margin: 0; padding-left: 18px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Research Candidate Promotions</h1>
      <p class="muted">Advisory classification only · generated ${escapeHtml(report.generatedAt)}</p>
    </header>
    ${renderSummary(report)}
    <section>${cards}</section>
  </main>
</body>
</html>`;
}
