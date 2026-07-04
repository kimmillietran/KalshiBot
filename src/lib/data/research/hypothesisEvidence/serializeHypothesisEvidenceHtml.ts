import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  HypothesisEvidenceCard,
  HypothesisEvidenceReport,
} from "./hypothesisEvidenceTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatCalibrationError(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${(Math.abs(value) * 100).toFixed(1)} pp`;
}

function formatCloseTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return escapeHtml(value);
  }

  return new Date(parsed).toISOString().replace("T", " ").slice(0, 19);
}

function formatSettlement(value: "yes" | "no" | null): string {
  if (!value) {
    return "—";
  }

  return value.toUpperCase();
}

function confidenceTone(level: HypothesisEvidenceCard["confidenceLevel"]): string {
  if (level === "high") {
    return theme.bullish;
  }
  if (level === "medium") {
    return theme.warning;
  }
  return theme.textMuted;
}

function renderMetric(label: string, value: string): string {
  return `
    <div class="metric">
      <dt>${escapeHtml(label)}</dt>
      <dd>${value}</dd>
    </div>`;
}

function renderExampleMarkets(card: HypothesisEvidenceCard): string {
  if (card.exampleMarkets.length === 0) {
    return `<p class="muted">No example markets available for this hypothesis.</p>`;
  }

  const rows = card.exampleMarkets
    .map(
      (market) => `
      <tr>
        <td><code>${escapeHtml(market.ticker)}</code></td>
        <td>${formatCloseTime(market.closeTime)}</td>
        <td>${formatSettlement(market.settlement)}</td>
        <td>${formatPercent(market.impliedProbability)}</td>
        <td>${market.realizedOutcome === 1 ? "YES" : "NO"}</td>
      </tr>`,
    )
    .join("");

  return `
    <table class="example-markets">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Close Time</th>
          <th>Settlement</th>
          <th>Implied Prob.</th>
          <th>Realized</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) {
    return "";
  }

  const items = warnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("");

  return `
    <div class="warnings">
      <h3>Warnings</h3>
      <ul>${items}</ul>
    </div>`;
}

function renderCard(card: HypothesisEvidenceCard): string {
  const metrics = [
    renderMetric("Strategy family", escapeHtml(card.strategyFamily)),
    renderMetric("Calibration error", formatCalibrationError(card.calibrationError)),
    renderMetric("Implied probability", formatPercent(card.impliedProbability)),
    renderMetric("Realized probability", formatPercent(card.realizedProbability)),
    renderMetric("Sample size", escapeHtml(String(card.sampleSize))),
    renderMetric(
      "Confidence",
      `<span style="color:${confidenceTone(card.confidenceLevel)}">${escapeHtml(card.confidenceLevel)}</span>`,
    ),
    renderMetric(
      "Associated regime",
      escapeHtml(card.associatedRegime ?? "—"),
    ),
    renderMetric(
      "Probability bucket",
      escapeHtml(card.associatedProbabilityBucket ?? "—"),
    ),
    renderMetric(
      "Time bucket",
      escapeHtml(card.associatedTimeBucket ?? "—"),
    ),
    renderMetric(
      "Moneyness bucket",
      escapeHtml(card.associatedMoneynessBucket ?? "—"),
    ),
    renderMetric(
      "Volatility bucket",
      escapeHtml(card.associatedVolatilityBucket ?? "—"),
    ),
    renderMetric("Bucket group", escapeHtml(card.bucketGroup ?? "—")),
    renderMetric("Source artifact", `<code>${escapeHtml(card.sourceArtifact)}</code>`),
  ].join("");

  return `
    <article class="card panel" id="${escapeHtml(card.candidateId)}">
      <header class="card-header">
        <p class="eyebrow">${escapeHtml(card.candidateId)}</p>
        <h2>${escapeHtml(card.title)}</h2>
      </header>
      <p class="rationale">${escapeHtml(card.rationale)}</p>
      <dl class="metrics">${metrics}</dl>
      <section class="confidence-summary">
        <h3>Confidence summary</h3>
        <p>${escapeHtml(card.confidenceSummary)}</p>
      </section>
      ${renderWarnings(card.warnings)}
      <section class="example-markets-section">
        <h3>Example markets</h3>
        ${renderExampleMarkets(card)}
      </section>
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
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }
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
    .card { margin-bottom: 24px; }
    .card-header { margin-bottom: 12px; }
    .eyebrow {
      margin: 0 0 4px;
      font-size: 12px;
      color: ${theme.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .rationale {
      color: ${theme.textMuted};
      margin-bottom: 16px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
      margin: 0 0 16px;
    }
    .metric {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 10px 12px;
    }
    .metric dt {
      margin: 0;
      font-size: 12px;
      color: ${theme.textMuted};
    }
    .metric dd {
      margin: 4px 0 0;
      font-size: 15px;
      font-weight: 600;
    }
    .confidence-summary,
    .example-markets-section,
    .warnings {
      margin-top: 16px;
    }
    .warnings ul {
      margin: 0;
      padding-left: 20px;
      color: ${theme.warning};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 8px 10px;
      border-bottom: 1px solid ${theme.panelBorder};
    }
    th {
      color: ${theme.textMuted};
      font-weight: 500;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }
  `;
}

function renderEmptyState(reasons: readonly string[]): string {
  if (reasons.length === 0) {
    return `<section class="panel"><p class="muted">No hypothesis candidates were generated.</p></section>`;
  }

  const items = reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");

  return `
    <section class="panel">
      <h2>No hypothesis candidates</h2>
      <ul>${items}</ul>
    </section>`;
}

/** Serializes a hypothesis evidence report to static HTML. */
export function serializeHypothesisEvidenceHtml(
  report: HypothesisEvidenceReport,
): string {
  const body =
    report.cards.length > 0
      ? report.cards.map(renderCard).join("")
      : renderEmptyState(report.noCandidateReasons);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hypothesis Evidence Report</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Hypothesis Evidence Report</h1>
        <p class="muted">Generated at ${escapeHtml(report.generatedAt)}</p>
        <p class="muted">Candidates source: <code>${escapeHtml(report.candidatesReportPath)}</code></p>
        <p class="muted">${report.candidateCount} hypothesis candidate${report.candidateCount === 1 ? "" : "s"}</p>
      </header>
      ${body}
    </main>
  </body>
</html>`;
}
