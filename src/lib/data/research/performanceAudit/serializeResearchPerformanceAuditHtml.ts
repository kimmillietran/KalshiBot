import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { PerformanceAuditReport } from "./performanceAuditTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatMs(ms: number): string {
  if (ms >= 60_000) {
    return `${(ms / 60_000).toFixed(1)}m`;
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${ms}ms`;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "—";
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function renderSummaryCards(report: PerformanceAuditReport): string {
  const { summary } = report;
  const parallelSavings = Math.max(0, summary.totalRuntimeMs - summary.estimatedParallelRuntimeMs);

  return `
    <section class="summary-grid">
      <div class="summary-card"><div class="summary-label">Total runtime</div><div class="summary-value">${formatMs(summary.totalRuntimeMs)}</div></div>
      <div class="summary-card"><div class="summary-label">Parallel minimum</div><div class="summary-value">${formatMs(summary.estimatedParallelRuntimeMs)}</div></div>
      <div class="summary-card"><div class="summary-label">Parallel savings</div><div class="summary-value" style="color:${theme.bullish}">${formatMs(parallelSavings)}</div></div>
      <div class="summary-card"><div class="summary-label">Cache savings</div><div class="summary-value">${formatMs(summary.estimatedCacheSavingsMs)}</div></div>
      <div class="summary-card"><div class="summary-label">Incremental rebuild</div><div class="summary-value">${formatMs(summary.estimatedIncrementalRebuildSavingsMs)}</div></div>
      <div class="summary-card"><div class="summary-label">Steps analyzed</div><div class="summary-value">${summary.stepCount}</div></div>
    </section>`;
}

/** Serializes the performance audit as a standalone HTML report. */
export function serializeResearchPerformanceAuditHtml(report: PerformanceAuditReport): string {
  const stepRows = report.steps
    .map(
      (step) => `
      <tr>
        <td><code>${escapeHtml(step.stepId)}</code></td>
        <td>${escapeHtml(step.label)}</td>
        <td>${escapeHtml(step.status)}</td>
        <td>${formatMs(step.durationMs)}</td>
        <td>${step.percentOfTotalRuntime}%</td>
        <td>${step.filesRead.length}</td>
        <td>${step.filesWritten.length}</td>
        <td>${formatBytes(step.primaryArtifactSizeBytes)}</td>
        <td>${formatMs(step.cpuBoundEstimateMs)}</td>
        <td>${formatMs(step.ioBoundEstimateMs)}</td>
        <td>${formatMs(step.networkEstimateMs)}</td>
      </tr>`,
    )
    .join("");

  const opportunityRows = report.optimizationOpportunities
    .map(
      (entry) => `
      <tr>
        <td>${entry.rank}</td>
        <td>${escapeHtml(entry.category)}</td>
        <td>${escapeHtml(entry.title)}</td>
        <td>${formatMs(entry.estimatedSavingsMs)}</td>
        <td><code>${escapeHtml(entry.affectedStepIds.join(", "))}</code></td>
      </tr>`,
    )
    .join("");

  const criticalPath = report.criticalPath.stepIds.map(escapeHtml).join(" → ") || "—";

  const parallelGroups = report.parallelExecutionGroups
    .map(
      (group) => `
      <li><code>${escapeHtml(group.stepIds.join(", "))}</code> — combined ${formatMs(group.combinedDurationMs)}, est. savings ${formatMs(group.estimatedSavingsMs)}</li>`,
    )
    .join("");

  const duplicateLoads = report.duplicateArtifactLoads
    .slice(0, 10)
    .map(
      (entry) => `
      <li><code>${escapeHtml(entry.artifactPath)}</code> read by ${escapeHtml(entry.readingStepIds.join(", "))} (est. waste ${formatMs(entry.estimatedWastedMs)})</li>`,
    )
    .join("");

  const duplicateScans = report.duplicateFilesystemScans
    .slice(0, 10)
    .map(
      (entry) => `
      <li><code>${escapeHtml(entry.rootPath)}</code> scanned by ${escapeHtml(entry.scanningStepIds.join(", "))} (est. waste ${formatMs(entry.estimatedWastedMs)})</li>`,
    )
    .join("");

  const notes = report.auditNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research Pipeline Performance Audit</title>
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
    h1, h2 { margin: 0 0 1rem; }
    h2 { margin-top: 2rem; font-size: 1.1rem; color: ${theme.info}; }
    p, ul { color: ${theme.textMuted}; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0;
    }
    .summary-card {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 1rem;
    }
    .summary-label { font-size: 0.8rem; color: ${theme.textMuted}; }
    .summary-value { font-size: 1.4rem; font-weight: 600; margin-top: 0.25rem; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0.75rem;
      font-size: 0.9rem;
    }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 0.55rem 0.5rem;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 500; }
    code { color: ${theme.info}; font-size: 0.85em; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <main>
    <h1>Research Pipeline Performance Audit</h1>
    <p>Generated ${escapeHtml(report.generatedAt)} · diagnostic only (no pipeline changes)</p>
    ${renderSummaryCards(report)}
    <div class="panel">
      <strong>Critical path:</strong> ${criticalPath}
      <br />
      <span style="color:${theme.textMuted}">Theoretical minimum with perfect scheduling: ${formatMs(report.criticalPath.totalDurationMs)}</span>
    </div>
    <h2>Per-step breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Step</th><th>Label</th><th>Status</th><th>Duration</th><th>%</th>
          <th>Reads</th><th>Writes</th><th>Artifact</th>
          <th>CPU est.</th><th>I/O est.</th><th>Network est.</th>
        </tr>
      </thead>
      <tbody>${stepRows}</tbody>
    </table>
    <h2>Top optimization opportunities</h2>
    <table>
      <thead><tr><th>#</th><th>Category</th><th>Opportunity</th><th>Savings</th><th>Steps</th></tr></thead>
      <tbody>${opportunityRows}</tbody>
    </table>
    <h2>Parallel execution groups</h2>
    <ul>${parallelGroups || "<li>None identified</li>"}</ul>
    <h2>Duplicate artifact loading</h2>
    <ul>${duplicateLoads || "<li>None identified</li>"}</ul>
    <h2>Duplicate filesystem scans</h2>
    <ul>${duplicateScans || "<li>None identified</li>"}</ul>
    <h2>Audit notes</h2>
    <ul>${notes}</ul>
  </main>
</body>
</html>`;
}
