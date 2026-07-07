import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import { formatMonthLabel } from "./monthRegimeAnalysisMath";
import type {
  MonthRegimeAnalysisReport,
  MonthRegimeHypothesisAnalysis,
} from "./monthRegimeAnalysisTypes";

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

function formatSigned(value: number | null): string {
  if (value === null) {
    return "—";
  }

  const sign = value >= 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function edgeColor(direction: string): string {
  if (direction === "supports") {
    return theme.bullish;
  }

  if (direction === "reverses") {
    return theme.bearish;
  }

  if (direction === "neutral") {
    return theme.warning;
  }

  return theme.textMuted;
}

function renderSummary(report: MonthRegimeAnalysisReport): string {
  return `
    <section class="panel">
      <h2>Stability summary</h2>
      <div class="summary-grid">
        <div class="summary-card"><div class="summary-label">Hypotheses</div><div class="summary-value">${report.summary.totalHypotheses}</div></div>
        <div class="summary-card"><div class="summary-label">Stable</div><div class="summary-value" style="color:${theme.bullish}">${report.summary.stableCount}</div></div>
        <div class="summary-card"><div class="summary-label">Unstable</div><div class="summary-value" style="color:${theme.bearish}">${report.summary.unstableCount}</div></div>
        <div class="summary-card"><div class="summary-label">Avg instability</div><div class="summary-value">${report.summary.averageInstabilityIndex.toFixed(2)}</div></div>
      </div>
    </section>`;
}

function renderTimeline(analysis: MonthRegimeHypothesisAnalysis): string {
  const maxObs = Math.max(...analysis.months.map((month) => month.observations), 1);
  const bars = analysis.months
    .map((month) => {
      const height = Math.max(8, Math.round((month.observations / maxObs) * 72));
      const color = edgeColor(month.edgeDirection);
      return `
        <div class="timeline-bar" title="${escapeHtml(month.monthLabel)} · ${month.observations} obs · ${month.edgeDirection}">
          <div class="timeline-fill" style="height:${height}px;background:${color}"></div>
          <div class="timeline-label">${escapeHtml(month.month.slice(5))}</div>
        </div>`;
    })
    .join("");

  return `
    <div class="timeline">
      <h3>Month timeline</h3>
      <div class="timeline-row">${bars || "<p class=\"muted\">No month data</p>"}</div>
    </div>`;
}

function renderHeatmap(analysis: MonthRegimeHypothesisAnalysis): string {
  const months = [...new Set(analysis.heatmap.map((cell) => cell.month))].sort();
  const regimes = ["low", "medium", "high"];
  const cellByKey = new Map(
    analysis.heatmap.map((cell) => [`${cell.month}::${cell.regime}`, cell]),
  );

  const header = months
    .map((month) => `<th>${escapeHtml(month.slice(5))}</th>`)
    .join("");

  const rows = regimes
    .map((regime) => {
      const cells = months
        .map((month) => {
          const cell = cellByKey.get(`${month}::${regime}`);
          if (!cell || cell.observations === 0) {
            return `<td class="heatmap-cell empty">—</td>`;
          }

          const color = edgeColor(cell.edgeDirection);
          return `<td class="heatmap-cell" style="background:${color}22;color:${color};border-color:${color}55" title="${escapeHtml(formatMonthLabel(month))} · ${regime} · ${cell.observations} obs">${formatSigned(cell.signedCalibrationError)}</td>`;
        })
        .join("");

      return `<tr><th>${escapeHtml(regime)}</th>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="heatmap">
      <h3>Month × regime heatmap</h3>
      <table class="heatmap-table">
        <thead><tr><th>Regime</th>${header}</tr></thead>
        <tbody>${rows || "<tr><td colspan=\"99\">No heatmap data</td></tr>"}</tbody>
      </table>
    </div>`;
}

function renderMonthTable(analysis: MonthRegimeHypothesisAnalysis): string {
  const rows = analysis.months
    .map(
      (month) => `
      <tr>
        <td>${escapeHtml(month.monthLabel)}</td>
        <td>${month.observations}</td>
        <td>${formatPercent(month.averageImpliedProbability)}</td>
        <td>${formatPercent(month.realizedProbability)}</td>
        <td>${formatSigned(month.signedCalibrationError)}</td>
        <td style="color:${edgeColor(month.edgeDirection)}">${escapeHtml(month.edgeDirection)}</td>
        <td>${month.confidenceInterval ? `${formatPercent(month.confidenceInterval.lower)} – ${formatPercent(month.confidenceInterval.upper)}` : "—"}</td>
      </tr>`,
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Month</th>
          <th>Obs</th>
          <th>Implied</th>
          <th>Realized</th>
          <th>Cal error</th>
          <th>Edge</th>
          <th>95% CI</th>
        </tr>
      </thead>
      <tbody>${rows || "<tr><td colspan=\"7\">No months</td></tr>"}</tbody>
    </table>`;
}

function renderRegimeTable(analysis: MonthRegimeHypothesisAnalysis): string {
  const rows = analysis.regimes
    .map(
      (regime) => `
      <tr>
        <td>${escapeHtml(regime.regime)}</td>
        <td>${regime.observations}</td>
        <td>${formatPercent(regime.averageImpliedProbability)}</td>
        <td>${formatPercent(regime.realizedProbability)}</td>
        <td>${formatSigned(regime.signedCalibrationError)}</td>
        <td style="color:${edgeColor(regime.edgeDirection)}">${escapeHtml(regime.edgeDirection)}</td>
        <td>${regime.robustnessContribution.toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Regime</th>
          <th>Obs</th>
          <th>Implied</th>
          <th>Realized</th>
          <th>Cal error</th>
          <th>Edge</th>
          <th>Robustness pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderContributors(analysis: MonthRegimeHypothesisAnalysis): string {
  const strongest = analysis.summary.strongestMonth
    ? formatMonthLabel(analysis.summary.strongestMonth)
    : "—";
  const weakest = analysis.summary.weakestMonth
    ? formatMonthLabel(analysis.summary.weakestMonth)
    : "—";
  const persistent = analysis.summary.persistentMonths
    .map((month) => formatMonthLabel(month))
    .join(", ") || "—";
  const reversing = analysis.summary.reversingMonths
    .map((month) => formatMonthLabel(month))
    .join(", ") || "—";

  return `
    <div class="contributors">
      <div><strong>Strongest month:</strong> ${escapeHtml(strongest)}</div>
      <div><strong>Weakest month:</strong> ${escapeHtml(weakest)}</div>
      <div><strong>Persistent months:</strong> ${escapeHtml(persistent)}</div>
      <div><strong>Reversing months:</strong> ${escapeHtml(reversing)}</div>
      <div><strong>Month agreement:</strong> ${analysis.summary.monthAgreementScore.toFixed(2)}</div>
      <div><strong>Regime agreement:</strong> ${analysis.summary.regimeAgreementScore.toFixed(2)}</div>
      <div><strong>Instability index:</strong> ${analysis.summary.instabilityIndex.toFixed(2)}</div>
    </div>`;
}

function renderHypothesisSection(analysis: MonthRegimeHypothesisAnalysis): string {
  const passColor = analysis.passes ? theme.bullish : theme.bearish;

  return `
    <section class="panel hypothesis-panel">
      <header class="hypothesis-header">
        <div>
          <h2>${escapeHtml(analysis.hypothesis)}</h2>
          <p class="muted"><code>${escapeHtml(analysis.hypothesisId)}</code> · ${escapeHtml(analysis.direction)} · score ${analysis.robustnessScore}</p>
        </div>
        <span class="status-badge" style="background:${passColor}22;color:${passColor};border:1px solid ${passColor}55">${analysis.passes ? "pass" : "fail"}</span>
      </header>

      <p>${escapeHtml(analysis.combinedDiagnostic)}</p>
      <p class="muted">${escapeHtml(analysis.monthExplanation)}</p>
      <p class="muted">${escapeHtml(analysis.regimeExplanation)}</p>

      ${renderContributors(analysis)}
      ${renderTimeline(analysis)}
      ${renderHeatmap(analysis)}

      <div class="split-tables">
        <div>
          <h3>Month metrics</h3>
          ${renderMonthTable(analysis)}
        </div>
        <div>
          <h3>Regime comparison</h3>
          ${renderRegimeTable(analysis)}
        </div>
      </div>
    </section>`;
}

/** Serializes the month/regime analysis report as standalone HTML. */
export function serializeMonthRegimeAnalysisHtml(report: MonthRegimeAnalysisReport): string {
  const notes = report.investigatorNotes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");
  const hypotheses = report.analyses.map(renderHypothesisSection).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Month &amp; Regime Stability Analysis</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2, h3 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
      overflow-x: auto;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .summary-card {
      background: ${theme.panelInset};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 14px;
    }
    .summary-label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; }
    .summary-value { font-size: 24px; font-weight: 700; margin-top: 8px; }
    .hypothesis-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .status-badge {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .contributors {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      margin: 12px 0;
      font-size: 13px;
    }
    .timeline-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      min-height: 96px;
      overflow-x: auto;
      padding-bottom: 8px;
    }
    .timeline-bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 36px;
    }
    .timeline-fill {
      width: 24px;
      border-radius: 6px 6px 2px 2px;
    }
    .timeline-label {
      font-size: 11px;
      color: ${theme.textMuted};
      margin-top: 6px;
    }
    .split-tables {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 8px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
    .heatmap-table td, .heatmap-table th { text-align: center; }
    .heatmap-cell {
      border: 1px solid ${theme.panelBorder};
      font-size: 12px;
      min-width: 56px;
    }
    .heatmap-cell.empty { color: ${theme.textMuted}; }
    code { color: ${theme.info}; }
    ul { color: ${theme.textMuted}; }
  </style>
</head>
<body>
  <header>
    <h1>Month &amp; Regime Stability Analysis</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} · read-only month/regime diagnostics</p>
  </header>

  ${renderSummary(report)}
  ${hypotheses || "<section class=\"panel\"><p>No hypothesis analyses available.</p></section>"}

  <section class="panel">
    <h2>Investigator notes</h2>
    <ul>${notes}</ul>
  </section>
</body>
</html>`;
}
