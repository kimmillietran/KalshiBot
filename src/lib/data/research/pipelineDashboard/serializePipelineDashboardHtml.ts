import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { PipelineDashboardReport } from "./pipelineDashboardTypes";

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

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "—";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

function formatPnlCents(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `$${(value / 100).toFixed(2)}`;
}

function pipelineStatusTone(status: PipelineDashboardReport["pipelineStatus"]["pipelineStatus"]): string {
  switch (status) {
    case "succeeded":
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
    .hero {
      display: grid;
      gap: 16px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
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
    .stat .value {
      font-size: 22px;
      font-weight: 700;
      margin-top: 4px;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      font-size: 14px;
    }
    .links a {
      color: ${theme.info};
      text-decoration: none;
    }
    .links a:hover { text-decoration: underline; }
    ul.compact {
      margin: 0;
      padding-left: 20px;
    }
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
    th {
      color: ${theme.textMuted};
      font-weight: 600;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }
  `;
}

function renderStat(label: string, value: string, valueColor?: string): string {
  return `
    <div class="stat">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value"${valueColor ? ` style="color:${valueColor}"` : ""}>${value}</div>
    </div>`;
}

function renderPipelineStatus(report: PipelineDashboardReport): string {
  const section = report.pipelineStatus;

  return `
    <section class="panel">
      <h2>Pipeline status</h2>
      <div class="stat-grid">
        ${renderStat("Status", `<span style="color:${pipelineStatusTone(section.pipelineStatus)}">${escapeHtml(section.pipelineStatus)}</span>`)}
        ${renderStat("Completed steps", escapeHtml(String(section.completedSteps.length)))}
        ${renderStat("Failed steps", escapeHtml(String(section.failedSteps.length)), section.failedSteps.length > 0 ? theme.bearish : undefined)}
        ${renderStat("Duration", escapeHtml(formatDuration(section.durationMs)))}
        ${renderStat("Generated", formatTimestamp(section.generatedAt))}
        ${renderStat("Total steps", escapeHtml(String(section.totalSteps)))}
      </div>
      ${
        section.failedSteps.length > 0
          ? `<h3>Failed steps</h3><ul class="compact">${section.failedSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>`
          : ""
      }
    </section>`;
}

function renderArtifactHealth(report: PipelineDashboardReport): string {
  const section = report.artifactHealth;
  const rows = section.entries
    .slice(0, 12)
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.label)}</td>
        <td><code>${escapeHtml(entry.path)}</code></td>
        <td>${escapeHtml(entry.status)}</td>
        <td>${formatTimestamp(entry.lastModified)}</td>
      </tr>`,
    )
    .join("");

  return `
    <section class="panel">
      <h2>Artifact health</h2>
      <div class="stat-grid">
        ${renderStat("Present", escapeHtml(String(section.present)), theme.bullish)}
        ${renderStat("Stale", escapeHtml(String(section.stale)), section.stale > 0 ? theme.warning : undefined)}
        ${renderStat("Missing", escapeHtml(String(section.missing)), section.missing > 0 ? theme.bearish : undefined)}
      </div>
      <p class="muted">
        Artifact index:
        <code>${escapeHtml(section.artifactIndexPath)}</code>
        (${section.artifactIndexPresent ? "present" : "not generated — derived from data health"})
      </p>
      ${
        rows
          ? `<table>
              <thead>
                <tr><th>Artifact</th><th>Path</th><th>Status</th><th>Updated</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
          : `<p class="muted">No artifact health data available.</p>`
      }
    </section>`;
}

function renderHypothesisSummary(report: PipelineDashboardReport): string {
  const section = report.hypothesisSummary;

  return `
    <section class="panel">
      <h2>Hypothesis summary</h2>
      <div class="stat-grid">
        ${renderStat("Hypotheses", escapeHtml(String(section.hypothesisCount)))}
        ${renderStat("Validated", escapeHtml(String(section.validatedCount)), theme.bullish)}
        ${renderStat("Promoted", escapeHtml(String(section.promotedCount)), theme.info)}
        ${renderStat("Rejected", escapeHtml(String(section.rejectedCount)), section.rejectedCount > 0 ? theme.bearish : undefined)}
      </div>
    </section>`;
}

function renderStrategySummary(report: PipelineDashboardReport): string {
  const section = report.strategySummary;

  return `
    <section class="panel">
      <h2>Strategy summary</h2>
      <div class="stat-grid">
        ${renderStat("Synthesized", escapeHtml(String(section.synthesizedStrategies)))}
        ${renderStat("Executed", escapeHtml(String(section.executedStrategies)))}
        ${renderStat("Top candidate", escapeHtml(section.topCandidateStrategyId ?? "—"), theme.bullish)}
        ${renderStat("Top rank", escapeHtml(section.topCandidateRank?.toString() ?? "—"))}
        ${renderStat("Top PnL", formatPnlCents(section.topCandidateTotalPnlCents))}
      </div>
    </section>`;
}

function renderResearchHealth(report: PipelineDashboardReport): string {
  const section = report.researchHealth;

  return `
    <section class="panel">
      <h2>Research health</h2>
      <div class="stat-grid">
        ${renderStat("Calibration coverage", formatPercent(section.calibrationCoveragePct))}
        ${renderStat("Atlas observations", escapeHtml(section.atlasObservations?.toString() ?? "—"))}
        ${renderStat("Warnings", escapeHtml(String(section.warningCount)), section.warningCount > 0 ? theme.warning : undefined)}
        ${renderStat("Data health updated", formatTimestamp(section.dataHealthGeneratedAt))}
      </div>
      <p class="muted">${escapeHtml(section.dataHealthSummary ?? "Data health report not available.")}</p>
      <p class="muted">Data health source: <code>${escapeHtml(section.dataHealthPath)}</code></p>
    </section>`;
}

function renderQuickLinks(report: PipelineDashboardReport): string {
  const links = [
    report.inputPaths.pipelineSummaryPath,
    report.artifactHealth.artifactIndexPath,
    report.inputPaths.hypothesisCandidatesPath,
    report.inputPaths.hypothesisValidationPath,
    report.inputPaths.strategySynthesisPath,
    report.inputPaths.harnessResultsPath,
    report.inputPaths.strategyLeaderboardPath,
    report.researchHealth.dataHealthPath,
    "data/reports/research-hypothesis-lifecycle.html",
    "data/reports/research-report.html",
  ];

  return `
    <section class="panel">
      <h2>Research artifacts</h2>
      <div class="links">
        ${links.map((path) => `<a href="../${escapeHtml(path.replace(/^data\//, ""))}"><code>${escapeHtml(path)}</code></a>`).join("")}
      </div>
    </section>`;
}

/** Serializes the research pipeline dashboard to static HTML. */
export function serializePipelineDashboardHtml(
  report: PipelineDashboardReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research Pipeline Dashboard</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel hero">
        <div>
          <h1>Research Pipeline Dashboard</h1>
          <p class="muted">Landing page for research results · generated ${formatTimestamp(report.generatedAt)}</p>
        </div>
        <span class="status-pill" style="color:${pipelineStatusTone(report.pipelineStatus.pipelineStatus)}; border:1px solid ${pipelineStatusTone(report.pipelineStatus.pipelineStatus)}">
          Pipeline ${escapeHtml(report.pipelineStatus.pipelineStatus)}
        </span>
      </header>
      ${renderPipelineStatus(report)}
      <div class="grid-2">
        ${renderArtifactHealth(report)}
        ${renderHypothesisSummary(report)}
      </div>
      <div class="grid-2">
        ${renderStrategySummary(report)}
        ${renderResearchHealth(report)}
      </div>
      ${renderQuickLinks(report)}
    </main>
  </body>
</html>`;
}
