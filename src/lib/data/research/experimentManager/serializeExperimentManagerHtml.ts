import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  ExperimentPairComparison,
  ResearchExperimentIndex,
  ResearchExperimentRecord,
} from "./experimentManagerTypes";
import {
  compareExperimentPair,
  parseExperimentRecord,
} from "./compareExperiments";
import type { ResearchExperimentManagerIo } from "./experimentManagerTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatDelta(value: number | null, suffix = ""): string {
  if (value === null) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${suffix}`;
}

function deltaColor(value: number | null): string {
  if (value === null || value === 0) {
    return theme.textMuted;
  }

  return value > 0 ? theme.bullish : theme.bearish;
}

function renderComparison(comparison: ExperimentPairComparison): string {
  return `
    <section class="panel">
      <h2>Latest comparison</h2>
      <p class="muted">${escapeHtml(comparison.baselineExperimentId)} → ${escapeHtml(comparison.compareExperimentId)}</p>
      ${
        !comparison.baselinePresent
          ? `<p class="warning">Baseline experiment record is missing from disk.</p>`
          : ""
      }
      <div class="metric-grid">
        <div><span class="label">Hypothesis Δ</span><div style="color:${deltaColor(comparison.hypothesisCountDelta)}">${formatDelta(comparison.hypothesisCountDelta)}</div></div>
        <div><span class="label">Robustness Δ</span><div style="color:${deltaColor(comparison.averageRobustnessDelta)}">${formatDelta(comparison.averageRobustnessDelta)}</div></div>
        <div><span class="label">Pipeline duration Δ</span><div>${formatDelta(comparison.pipelineDurationDeltaMs, " ms")}</div></div>
        <div><span class="label">Full research Δ</span><div>${formatDelta(comparison.fullResearchDurationDeltaMs, " ms")}</div></div>
      </div>
      ${
        comparison.promotionChanges.length > 0
          ? `<h3>Promotion changes</h3><ul>${comparison.promotionChanges
              .map(
                (change) =>
                  `<li><code>${escapeHtml(change.strategyId)}</code>: ${escapeHtml(change.previousDecision ?? "—")} → ${escapeHtml(change.currentDecision ?? "—")}</li>`,
              )
              .join("")}</ul>`
          : "<p class=\"muted\">No promotion decision changes.</p>"
      }
      <h3>Candidate changes</h3>
      <div class="change-grid">
        <div><span class="label">Added</span><div>${comparison.candidateChanges.added.length === 0 ? "—" : comparison.candidateChanges.added.map((id) => `<code>${escapeHtml(id)}</code>`).join(", ")}</div></div>
        <div><span class="label">Removed</span><div>${comparison.candidateChanges.removed.length === 0 ? "—" : comparison.candidateChanges.removed.map((id) => `<code>${escapeHtml(id)}</code>`).join(", ")}</div></div>
      </div>
      ${
        comparison.artifactChanges.length > 0
          ? `<h3>Artifact status changes</h3><ul>${comparison.artifactChanges
              .map(
                (change) =>
                  `<li><code>${escapeHtml(change.artifactId)}</code>: ${escapeHtml(change.previousStatus ?? "—")} → ${escapeHtml(change.currentStatus ?? "—")}</li>`,
              )
              .join("")}</ul>`
          : "<p class=\"muted\">No artifact status changes.</p>"
      }
    </section>`;
}

function renderExperimentCard(record: ResearchExperimentRecord, isLatest: boolean): string {
  const top = record.topCandidate;

  return `
    <article class="experiment-card${isLatest ? " latest" : ""}">
      <header class="card-header">
        <div>
          <h3>${escapeHtml(record.experimentId)}</h3>
          <p class="muted">${escapeHtml(record.timestamp)}${record.gitCommit ? ` · ${escapeHtml(record.gitCommit.slice(0, 8))}` : ""}</p>
        </div>
        ${isLatest ? `<span class="pill">Latest</span>` : ""}
      </header>
      <div class="metric-grid">
        <div><span class="label">Hypotheses</span><div>${record.hypothesisCount ?? "—"}</div></div>
        <div><span class="label">Avg robustness</span><div>${record.validationSummary?.averageRobustnessScore ?? "—"}</div></div>
        <div><span class="label">Synthesized</span><div>${record.synthesizedStrategyCount ?? "—"}</div></div>
        <div><span class="label">Runtime</span><div>${record.runtime.totalDurationMs ?? "—"} ms</div></div>
      </div>
      ${
        top
          ? `<p><strong>Top candidate:</strong> <code>${escapeHtml(top.strategyId)}</code> (${escapeHtml(top.decision)}, robustness ${top.robustnessScore ?? "—"})</p>`
          : "<p class=\"muted\">No promotion candidates recorded.</p>"
      }
      ${
        record.warnings.length > 0
          ? `<details><summary>${record.warnings.length} warning(s)</summary><ul>${record.warnings
              .slice(0, 10)
              .map((warning) => `<li>${escapeHtml(warning)}</li>`)
              .join("")}</ul></details>`
          : ""
      }
    </article>`;
}

function loadRecordsForIndex(
  index: ResearchExperimentIndex,
  io: ResearchExperimentManagerIo,
): ResearchExperimentRecord[] {
  const records: ResearchExperimentRecord[] = [];

  for (const entry of index.experiments) {
    if (!entry.present || !io.fileExists(entry.recordPath)) {
      continue;
    }

    try {
      records.push(parseExperimentRecord(io.readFile(entry.recordPath)));
    } catch {
      // Gracefully skip unreadable historical records.
    }
  }

  return records;
}

/** Serializes experiment index and records as standalone HTML. */
export function serializeExperimentManagerHtml(
  index: ResearchExperimentIndex,
  io: ResearchExperimentManagerIo,
): string {
  const records = loadRecordsForIndex(index, io);
  const recordById = new Map(records.map((record) => [record.experimentId, record]));
  const cards = [...index.experiments]
    .reverse()
    .map((entry) => {
      const record = recordById.get(entry.experimentId);
      if (!record) {
        return `
          <article class="experiment-card missing">
            <h3>${escapeHtml(entry.experimentId)}</h3>
            <p class="warning">Historical experiment record missing: ${escapeHtml(entry.recordPath)}</p>
          </article>`;
      }

      return renderExperimentCard(record, entry.experimentId === index.latestExperimentId);
    })
    .join("");

  const comparisonSection = index.latestComparison
    ? renderComparison(index.latestComparison)
    : `<section class="panel"><p class="muted">No prior experiment to compare against.</p></section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research Experiments</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; }
    main { max-width: 1100px; margin: 0 auto; padding: 24px; display: grid; gap: 16px; }
    h1, h2, h3 { margin: 0 0 8px; }
    .muted { color: ${theme.textMuted}; }
    .warning { color: ${theme.warning}; }
    .panel, .experiment-card {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .experiment-card.latest { border-color: ${theme.bullish}; }
    .experiment-card.missing { border-color: ${theme.warning}; }
    .label {
      color: ${theme.textMuted};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .metric-grid, .change-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 12px 0;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      margin-bottom: 12px;
    }
    .pill {
      background: ${theme.bullish};
      color: ${theme.pageBg};
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
    }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    ul { margin: 8px 0 0; padding-left: 20px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Research Experiment Manager</h1>
      <p class="muted">Generated ${escapeHtml(index.generatedAt)} · ${index.experiments.length} experiment(s)</p>
    </header>
    ${comparisonSection}
    <section>
      <h2>Experiment history</h2>
      <div class="history-grid">${cards}</div>
    </section>
  </main>
</body>
</html>`;
}

export { compareExperimentPair };
