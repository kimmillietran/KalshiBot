import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  ResearchCandidateRegistryEntry,
  ResearchCandidateRegistryReport,
} from "./researchCandidateRegistryTypes";

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

function statusTone(status: ResearchCandidateRegistryEntry["currentStatus"]): string {
  switch (status) {
    case "candidate":
    case "backtested":
    case "validated":
    case "synthesized":
      return theme.bullish;
    case "rejected":
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
    th { color: ${theme.textMuted}; font-weight: 600; }
    .status-pill {
      display: inline-flex;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    ul { margin: 0; padding-left: 20px; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }
  `;
}

function renderPromotionHistory(
  history: ResearchCandidateRegistryEntry["promotionHistory"],
): string {
  if (history.length === 0) {
    return `<p class="muted">No promotion events recorded.</p>`;
  }

  const items = history
    .map(
      (event) =>
        `<li>${formatTimestamp(event.timestamp)}: ${escapeHtml(event.previousStatus ?? "none")} → ${escapeHtml(event.nextStatus)} — ${escapeHtml(event.reason)}</li>`,
    )
    .join("");

  return `<ul>${items}</ul>`;
}

function renderCandidateRow(entry: ResearchCandidateRegistryEntry): string {
  const harness = entry.harnessMetrics;

  return `
    <tr>
      <td><code>${escapeHtml(entry.candidateId)}</code></td>
      <td>${escapeHtml(entry.strategyFamily)}</td>
      <td><span class="status-pill" style="color:${statusTone(entry.currentStatus)}; border:1px solid ${statusTone(entry.currentStatus)}">${escapeHtml(entry.currentStatus)}</span></td>
      <td>${entry.validationScore ?? "—"}</td>
      <td>${escapeHtml(entry.strategyId ?? "—")}</td>
      <td>${harness ? `${harness.successfulRuns}/${harness.evaluatedRuns}` : "—"}</td>
      <td>${formatTimestamp(entry.creationTimestamp)}</td>
    </tr>`;
}

function renderCandidateDetails(entry: ResearchCandidateRegistryEntry): string {
  return `
    <section class="panel">
      <h3><code>${escapeHtml(entry.candidateId)}</code></h3>
      <p class="muted">Hypothesis: ${escapeHtml(entry.hypothesisId)} · Strategy: ${escapeHtml(entry.strategyId ?? "—")}</p>
      <p>Status: <span style="color:${statusTone(entry.currentStatus)}">${escapeHtml(entry.currentStatus)}</span></p>
      ${
        entry.rejectionReasons.length > 0
          ? `<h4>Rejection reasons</h4><ul>${entry.rejectionReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`
          : ""
      }
      <h4>Promotion history</h4>
      ${renderPromotionHistory(entry.promotionHistory)}
    </section>`;
}

/** Serializes the research candidate registry to static HTML. */
export function serializeResearchCandidateRegistryHtml(
  report: ResearchCandidateRegistryReport,
): string {
  const rows = report.candidates.map(renderCandidateRow).join("");
  const details = report.candidates.map(renderCandidateDetails).join("");
  const summary = report.summary;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research Candidate Registry</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Research Candidate Registry</h1>
        <p class="muted">Generated at ${formatTimestamp(report.generatedAt)}</p>
        <p class="muted">JSON source: <code>${escapeHtml(report.outputPath)}</code></p>
        <div class="stat-grid">
          <div class="stat"><div class="label">Total</div><div class="value">${summary.totalCandidates}</div></div>
          <div class="stat"><div class="label">Validated</div><div class="value" style="color:${theme.bullish}">${summary.validatedCount}</div></div>
          <div class="stat"><div class="label">Candidates</div><div class="value" style="color:${theme.info}">${summary.candidateCount}</div></div>
          <div class="stat"><div class="label">Rejected</div><div class="value" style="color:${theme.bearish}">${summary.rejectedCount}</div></div>
        </div>
      </header>
      <section class="panel">
        <h2>Registry overview</h2>
        ${
          report.candidates.length > 0
            ? `<table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Family</th>
                    <th>Status</th>
                    <th>Validation</th>
                    <th>Strategy</th>
                    <th>Harness</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`
            : `<p class="muted">No candidates registered yet.</p>`
        }
      </section>
      ${details}
    </main>
  </body>
</html>`;
}
