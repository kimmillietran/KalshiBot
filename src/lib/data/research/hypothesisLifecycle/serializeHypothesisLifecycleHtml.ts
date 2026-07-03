import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  HypothesisLifecycleEntry,
  HypothesisLifecycleReport,
  HypothesisLifecycleStageState,
} from "./hypothesisLifecycleTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return escapeHtml(value);
  }

  return new Date(parsed).toISOString().replace("T", " ").slice(0, 19);
}

function statusTone(status: HypothesisLifecycleEntry["status"]): string {
  switch (status) {
    case "promoted":
    case "backtested":
    case "synthesized":
    case "validated":
    case "evidence_ready":
      return theme.bullish;
    case "rejected":
      return theme.bearish;
    case "stalled":
      return theme.warning;
    default:
      return theme.textMuted;
  }
}

function stageTone(status: HypothesisLifecycleStageState["status"]): string {
  switch (status) {
    case "completed":
      return theme.bullish;
    case "partial":
      return theme.warning;
    case "failed":
      return theme.bearish;
    default:
      return theme.textMuted;
  }
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
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .summary-stat {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 12px;
    }
    .summary-stat .label {
      color: ${theme.textMuted};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .summary-stat .value {
      font-size: 22px;
      font-weight: 700;
      margin-top: 4px;
    }
    .pipeline-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      margin-top: 12px;
      font-size: 13px;
      color: ${theme.textMuted};
    }
    .card {
      margin-bottom: 24px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .eyebrow {
      margin: 0 0 4px;
      font-size: 12px;
      color: ${theme.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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
    .pipeline {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
      margin: 16px 0;
    }
    @media (max-width: 960px) {
      .pipeline {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .stage {
      background: ${theme.panelInset};
      border: 1px solid ${theme.panelBorder};
      border-radius: 10px;
      padding: 10px;
      min-height: 96px;
    }
    .stage-label {
      font-size: 11px;
      color: ${theme.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    .stage-status {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 6px;
    }
    .stage-detail,
    .stage-time {
      font-size: 12px;
      color: ${theme.textMuted};
      word-break: break-word;
    }
    .warnings {
      margin-top: 12px;
      color: ${theme.warning};
    }
    .warnings ul {
      margin: 0;
      padding-left: 20px;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }
  `;
}

function renderMetric(label: string, value: string): string {
  return `
    <div class="metric">
      <dt>${escapeHtml(label)}</dt>
      <dd>${value}</dd>
    </div>`;
}

function renderStage(stage: HypothesisLifecycleStageState): string {
  return `
    <div class="stage">
      <div class="stage-label">${escapeHtml(stage.label)}</div>
      <div class="stage-status" style="color:${stageTone(stage.status)}">${escapeHtml(stage.status)}</div>
      <div class="stage-detail">${escapeHtml(stage.detail ?? "—")}</div>
      <div class="stage-time">${formatTimestamp(stage.timestamp)}</div>
    </div>`;
}

function renderWarnings(warnings: readonly string[]): string {
  if (warnings.length === 0) {
    return "";
  }

  const items = warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  return `
    <section class="warnings">
      <h3>Warnings</h3>
      <ul>${items}</ul>
    </section>`;
}

function renderEntry(entry: HypothesisLifecycleEntry): string {
  const metrics = [
    renderMetric("Robustness score", escapeHtml(entry.robustnessScore?.toString() ?? "—")),
    renderMetric("Linked strategy", escapeHtml(entry.linkedStrategyId ?? "—")),
    renderMetric("Validation outcome", escapeHtml(entry.validationOutcome)),
    renderMetric("Promotion decision", escapeHtml(entry.promotionDecision)),
    renderMetric("Generated", formatTimestamp(entry.timestamps.generatedAt)),
    renderMetric("Evidence report", formatTimestamp(entry.timestamps.evidenceReportAt)),
    renderMetric("Validation", formatTimestamp(entry.timestamps.validationAt)),
    renderMetric("Synthesis", formatTimestamp(entry.timestamps.synthesisAt)),
    renderMetric("Backtest", formatTimestamp(entry.timestamps.backtestAt)),
  ].join("");

  return `
    <article class="card panel" id="${escapeHtml(entry.hypothesisId)}">
      <header class="card-header">
        <div>
          <p class="eyebrow">${escapeHtml(entry.hypothesisId)}</p>
          <h2>${escapeHtml(entry.title)}</h2>
        </div>
        <span class="status-pill" style="color:${statusTone(entry.status)}; border:1px solid ${statusTone(entry.status)}">
          ${escapeHtml(entry.status.replaceAll("_", " "))}
        </span>
      </header>
      <dl class="metrics">${metrics}</dl>
      <section>
        <h3>Pipeline progress</h3>
        <div class="pipeline">
          ${entry.stages.map(renderStage).join("")}
        </div>
      </section>
      ${renderWarnings(entry.warnings)}
    </article>`;
}

function renderEmptyState(): string {
  return `
    <section class="panel">
      <h2>No hypotheses found</h2>
      <p class="muted">Run <code>npm run research:hypotheses</code> to generate hypothesis candidates.</p>
    </section>`;
}

/** Serializes the hypothesis lifecycle dashboard to static HTML. */
export function serializeHypothesisLifecycleHtml(
  report: HypothesisLifecycleReport,
): string {
  const summary = report.summary;
  const body =
    report.entries.length > 0
      ? report.entries.map(renderEntry).join("")
      : renderEmptyState();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hypothesis Lifecycle Dashboard</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Hypothesis Lifecycle Dashboard</h1>
        <p class="muted">Generated at ${escapeHtml(report.generatedAt)}</p>
        <p class="muted">Output: <code>${escapeHtml(report.outputPath)}</code></p>
        <div class="summary-grid">
          <div class="summary-stat">
            <div class="label">Total</div>
            <div class="value">${summary.totalHypotheses}</div>
          </div>
          <div class="summary-stat">
            <div class="label">Promoted</div>
            <div class="value" style="color:${theme.bullish}">${summary.promotedCount}</div>
          </div>
          <div class="summary-stat">
            <div class="label">Rejected</div>
            <div class="value" style="color:${theme.bearish}">${summary.rejectedCount}</div>
          </div>
          <div class="summary-stat">
            <div class="label">Backtested</div>
            <div class="value">${summary.backtestedCount}</div>
          </div>
          <div class="summary-stat">
            <div class="label">Pending</div>
            <div class="value" style="color:${theme.warning}">${summary.pendingCount}</div>
          </div>
          <div class="summary-stat">
            <div class="label">Missing validation</div>
            <div class="value">${summary.missingValidationCount}</div>
          </div>
        </div>
        <div class="pipeline-legend">
          <span>Generated → Evidence Report → Robustness Validation → Strategy Synthesized → Backtested → Promoted / Rejected</span>
        </div>
      </header>
      ${body}
    </main>
  </body>
</html>`;
}
