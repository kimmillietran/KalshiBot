import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  ResearchArtifactIndex,
  ResearchArtifactIndexEntry,
  ResearchArtifactStatus,
} from "./researchArtifactIndexTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}

function statusColor(status: ResearchArtifactStatus): string {
  if (status === "present") {
    return theme.bullish;
  }
  if (status === "stale") {
    return theme.warning;
  }
  return theme.bearish;
}

function renderSummaryCards(index: ResearchArtifactIndex): string {
  return `
    <section class="summary-grid">
      <div class="summary-card"><div class="summary-label">Total</div><div class="summary-value">${index.summary.totalArtifacts}</div></div>
      <div class="summary-card"><div class="summary-label">Present</div><div class="summary-value" style="color:${theme.bullish}">${index.summary.presentCount}</div></div>
      <div class="summary-card"><div class="summary-label">Stale</div><div class="summary-value" style="color:${theme.warning}">${index.summary.staleCount}</div></div>
      <div class="summary-card"><div class="summary-label">Missing</div><div class="summary-value" style="color:${theme.bearish}">${index.summary.missingCount}</div></div>
    </section>`;
}

function renderArtifactRow(entry: ResearchArtifactIndexEntry): string {
  return `
    <tr>
      <td>${escapeHtml(entry.name)}</td>
      <td><code>${escapeHtml(entry.path)}</code></td>
      <td><span class="status-pill" style="background:${statusColor(entry.status)}">${escapeHtml(entry.status)}</span></td>
      <td>${escapeHtml(entry.generatedTimestamp ?? "—")}</td>
      <td>${escapeHtml(entry.producingPipelineStep)}</td>
      <td>${escapeHtml(entry.upstreamDependencies.join(", ") || "—")}</td>
      <td>${escapeHtml(entry.downstreamConsumers.join(", ") || "—")}</td>
      <td>${escapeHtml(formatBytes(entry.fileSizeBytes))}</td>
      <td>${entry.itemCount ?? "—"}</td>
    </tr>`;
}

/** Serializes the research artifact index as a standalone HTML report. */
export function serializeResearchArtifactIndexHtml(
  index: ResearchArtifactIndex,
): string {
  const rows = index.artifacts.map(renderArtifactRow).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research Artifact Index</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, Segoe UI, sans-serif;
    }
    body {
      margin: 0;
      background: ${theme.pageBg};
      color: ${theme.text};
      padding: 24px;
    }
    h1, h2 { margin: 0 0 12px; }
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
      margin-top: 16px;
    }
    .summary-card {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .summary-label { color: ${theme.textMuted}; font-size: 12px; }
    .summary-value { font-size: 28px; font-weight: 700; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
    code { color: ${theme.info}; }
    .status-pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      color: #0a0a0a;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <header>
    <h1>Research Artifact Index</h1>
    <p class="muted">Generated ${escapeHtml(index.generatedAt)}</p>
    <p class="muted">Single source of truth for research output health, freshness, and dependency relationships.</p>
  </header>
  ${renderSummaryCards(index)}
  <section class="panel">
    <h2>Artifacts</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Path</th>
          <th>Status</th>
          <th>Generated</th>
          <th>Pipeline step</th>
          <th>Upstream</th>
          <th>Downstream</th>
          <th>Size</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
</body>
</html>`;
}
