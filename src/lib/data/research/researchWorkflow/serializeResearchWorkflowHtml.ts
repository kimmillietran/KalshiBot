import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import { RESEARCH_WORKFLOW_ACTION_LABELS } from "./computeResearchWorkflowAction";
import type {
  ResearchWorkflowHypothesisPipeline,
  ResearchWorkflowQueueItem,
  ResearchWorkflowReport,
} from "./researchWorkflowTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return escapeHtml(value);
  }

  return new Date(parsed).toISOString().replace("T", " ").slice(0, 19);
}

function statusTone(status: ResearchWorkflowHypothesisPipeline["workflowStatus"]): string {
  switch (status) {
    case "active":
      return theme.bullish;
    case "blocked":
      return theme.warning;
    case "deprioritized":
      return theme.bearish;
    default:
      return theme.textMuted;
  }
}

function renderFunnel(report: ResearchWorkflowReport): string {
  const { funnel } = report;

  return `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-label">Hypothesis candidates</div><div class="stat-value">${funnel.hypothesisCandidates}</div></div>
      <div class="stat-card"><div class="stat-label">Validated</div><div class="stat-value">${funnel.validatedHypotheses}</div></div>
      <div class="stat-card"><div class="stat-label">Near-promising</div><div class="stat-value">${funnel.nearPromisingHypotheses}</div></div>
      <div class="stat-card"><div class="stat-label">Refinement candidates</div><div class="stat-value">${funnel.refinementCandidates}</div></div>
      <div class="stat-card"><div class="stat-label">Registered children</div><div class="stat-value">${funnel.registeredRefinementChildren}</div></div>
      <div class="stat-card"><div class="stat-label">Synthesis candidates</div><div class="stat-value">${funnel.synthesisCandidates}</div></div>
      <div class="stat-card"><div class="stat-label">Harness eligible</div><div class="stat-value">${funnel.harnessEligible}</div></div>
      <div class="stat-card"><div class="stat-label">Harness evaluated</div><div class="stat-value">${funnel.harnessEvaluated}</div></div>
    </div>`;
}

function renderQueueItems(queue: readonly ResearchWorkflowQueueItem[]): string {
  if (queue.length === 0) {
    return `<p class="muted">No research queue items — run diagnostics to populate workflow inputs.</p>`;
  }

  return `
    <ol class="queue-list">
      ${queue
        .map(
          (item) => `
        <li>
          <strong>${escapeHtml(item.label)}</strong>
          <span class="muted">(${item.hypothesisIds.length} hypotheses)</span>
          <div class="muted">${escapeHtml(item.rationale)}</div>
          <div class="chip-row">${item.hypothesisIds.map((id) => `<code>${escapeHtml(id)}</code>`).join("")}</div>
        </li>`,
        )
        .join("")}
    </ol>`;
}

function renderPipelineStage(label: string, value: string | null): string {
  return `
    <div class="pipeline-stage">
      <div class="stage-label">${escapeHtml(label)}</div>
      <div class="stage-value">${value ? escapeHtml(value) : "—"}</div>
    </div>`;
}

function renderPipeline(pipeline: ResearchWorkflowHypothesisPipeline): string {
  const actionLabel = RESEARCH_WORKFLOW_ACTION_LABELS[pipeline.recommendedNextAction];

  return `
    <article class="pipeline-card">
      <header class="pipeline-header">
        <div>
          <h3>${escapeHtml(pipeline.hypothesis)}</h3>
          <code>${escapeHtml(pipeline.hypothesisId)}</code>
        </div>
        <span class="status-badge" style="color:${statusTone(pipeline.workflowStatus)}">${escapeHtml(pipeline.workflowStatus)}</span>
      </header>
      <div class="pipeline-flow">
        ${renderPipelineStage("Hypothesis", pipeline.hypothesis)}
        ${renderPipelineStage("Validation", pipeline.validation.summary)}
        ${renderPipelineStage("Failure reason", pipeline.failure.summary)}
        ${renderPipelineStage("Derived sensitivity", pipeline.derivedSensitivity.summary)}
        ${renderPipelineStage("Refinements available", String(pipeline.refinementsAvailable))}
        ${renderPipelineStage("Registered children", String(pipeline.registeredChildren))}
        ${renderPipelineStage("Harness status", pipeline.harness.summary)}
        ${renderPipelineStage("Recommended next action", actionLabel)}
      </div>
    </article>`;
}

function renderInputStatus(report: ResearchWorkflowReport): string {
  const entries = Object.entries(report.inputStatus) as Array<[string, boolean]>;

  return `
    <div class="chip-row">
      ${entries
        .map(
          ([key, present]) =>
            `<span class="chip ${present ? "present" : "missing"}">${escapeHtml(key)}: ${present ? "present" : "missing"}</span>`,
        )
        .join("")}
    </div>`;
}

/** Serializes the research workflow report to a standalone HTML dashboard. */
export function serializeResearchWorkflowHtml(report: ResearchWorkflowReport): string {
  const { summary } = report;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research Workflow</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: ${theme.pageBg};
      color: ${theme.text};
      line-height: 1.5;
    }
    main { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem 3rem; }
    h1, h2, h3 { margin: 0 0 0.75rem; font-weight: 600; }
    h2 { margin-top: 2rem; font-size: 1.125rem; }
    p, .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-top: 1rem;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
    }
    .stat-card {
      background: ${theme.panelInset};
      border-radius: 10px;
      padding: 0.75rem;
    }
    .stat-label { color: ${theme.textMuted}; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .stat-value { font-size: 1.5rem; font-weight: 600; margin-top: 0.25rem; }
    .queue-list { margin: 0; padding-left: 1.25rem; }
    .queue-list li { margin-bottom: 1rem; }
    .chip-row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
    .chip {
      border-radius: 999px;
      padding: 0.25rem 0.625rem;
      font-size: 0.75rem;
      border: 1px solid ${theme.panelBorder};
    }
    .chip.present { color: ${theme.bullish}; }
    .chip.missing { color: ${theme.textMuted}; }
    .pipeline-card {
      border-top: 1px solid ${theme.panelBorder};
      padding: 1rem 0;
    }
    .pipeline-header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
    }
    .pipeline-flow {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      margin-top: 0.75rem;
    }
    .pipeline-stage {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 0.625rem 0.75rem;
    }
    .stage-label { font-size: 0.6875rem; color: ${theme.textMuted}; text-transform: uppercase; }
    .stage-value { margin-top: 0.25rem; font-size: 0.875rem; }
    code { font-size: 0.8125rem; color: ${theme.info}; }
    .hero-meta { margin-top: 0.5rem; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Research Workflow</h1>
      <p class="hero-meta">Generated ${formatTimestamp(report.generatedAt)} · ${summary.artifactsAvailable}/${summary.artifactsTotal} input artifacts available</p>
      <p>Unified view answering: <strong>What should I work on next?</strong></p>
    </header>

    <section class="panel">
      <h2>Overall funnel</h2>
      ${renderFunnel(report)}
    </section>

    <section class="panel">
      <h2>Summary</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Active hypotheses</div><div class="stat-value" style="color:${theme.bullish}">${summary.activeHypothesisCount}</div></div>
        <div class="stat-card"><div class="stat-label">Blocked hypotheses</div><div class="stat-value" style="color:${theme.warning}">${summary.blockedHypothesisCount}</div></div>
        <div class="stat-card"><div class="stat-label">Deprioritized</div><div class="stat-value" style="color:${theme.bearish}">${summary.deprioritizedHypothesisCount}</div></div>
        <div class="stat-card"><div class="stat-label">Next milestone</div><div class="stat-value" style="font-size:1rem">${summary.nextRecommendedMilestone ? escapeHtml(summary.nextRecommendedMilestone) : "—"}</div></div>
      </div>
      ${summary.highestValueTask ? `<p style="margin-top:1rem">${escapeHtml(summary.highestValueTask)}</p>` : ""}
    </section>

    <section class="panel">
      <h2>Research queue</h2>
      ${renderQueueItems(report.queue)}
    </section>

    <section class="panel">
      <h2>Input artifacts</h2>
      ${renderInputStatus(report)}
    </section>

    <section class="panel">
      <h2>Hypothesis pipelines</h2>
      ${report.pipelines.length === 0 ? `<p class="muted">No hypothesis pipelines available.</p>` : report.pipelines.map(renderPipeline).join("")}
    </section>
  </main>
</body>
</html>`;
}
