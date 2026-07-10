import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { StrategyEvaluationReadinessReport } from "./strategyEvaluationReadinessTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatPercent(value: number | string | boolean | null): string {
  if (typeof value !== "number") {
    return value === null ? "—" : String(value);
  }

  if (value >= 0 && value <= 1) {
    return `${Math.round(value * 1000) / 10}%`;
  }

  return value.toLocaleString("en-US");
}

function renderDimensionRows(report: StrategyEvaluationReadinessReport): string {
  return report.dimensions
    .map(
      (dimension) => `
      <tr>
        <td><code>${escapeHtml(dimension.id)}</code></td>
        <td>${escapeHtml(dimension.status)}</td>
        <td>${escapeHtml(formatPercent(dimension.value))}</td>
        <td>${escapeHtml(dimension.threshold ?? "—")}</td>
        <td class="muted">${escapeHtml(dimension.rationale)}</td>
      </tr>`,
    )
    .join("");
}

function renderFamilyCards(report: StrategyEvaluationReadinessReport): string {
  return report.summary.families
    .map(
      (family) => `
      <div class="family-card">
        <strong>${escapeHtml(family.familyId)}</strong>
        <div class="verdict">${escapeHtml(family.verdict)}</div>
        <div class="muted">${escapeHtml(family.rationale)}</div>
        ${
          family.blockingReasons.length > 0
            ? `<ul>${family.blockingReasons
              .map((reason) => `<li>${escapeHtml(reason)}</li>`)
              .join("")}</ul>`
            : ""
        }
      </div>`,
    )
    .join("");
}

function renderList(items: readonly string[], emptyLabel: string): string {
  if (items.length === 0) {
    return `<p class="muted">${escapeHtml(emptyLabel)}</p>`;
  }

  return `<ul>${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join("")}</ul>`;
}

export function serializeStrategyEvaluationReadinessHtml(
  report: StrategyEvaluationReadinessReport,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Strategy Evaluation Readiness</title>
  <style>
    body { background: ${theme.pageBg}; color: ${theme.text}; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1, h2 { margin: 0 0 12px; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .verdict { color: ${theme.info}; font-size: 1.1rem; font-weight: 600; margin: 8px 0; }
    .muted { color: ${theme.textMuted}; }
    .family-card { border-top: 1px solid ${theme.panelBorder}; padding-top: 12px; margin-top: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid ${theme.panelBorder}; vertical-align: top; }
    code { color: ${theme.warning}; font-size: 0.92rem; }
    .callout { border-left: 4px solid ${theme.info}; padding-left: 12px; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Strategy Evaluation Readiness Gate</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>

    <div class="panel">
      <h2>Scope</h2>
      <div class="callout">
        <p><strong>Descriptive analysis ≠ strategy evaluation.</strong></p>
        <p><strong>Strategy evaluation ≠ executable strategy.</strong></p>
        <p><strong>Executable confirmation is required before actionability.</strong></p>
      </div>
      <p>${escapeHtml(report.disclaimer)}</p>
    </div>

    <div class="panel">
      <h2>Overall Verdict</h2>
      <div class="verdict">${escapeHtml(report.summary.overallVerdict)}</div>
      <p>Recommended next action: <code>${escapeHtml(report.summary.recommendedNextAction)}</code></p>
      ${
        report.summary.blockingReasons.length > 0
          ? `<h3>Blocking reasons</h3><ul>${report.summary.blockingReasons
            .map((reason) => `<li>${escapeHtml(reason)}</li>`)
            .join("")}</ul>`
          : ""
      }
    </div>

    <div class="panel">
      <h2>Strategy Families</h2>
      ${renderFamilyCards(report)}
    </div>

    <div class="panel">
      <h2>Readiness Dimensions</h2>
      <table>
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Status</th>
            <th>Value</th>
            <th>Threshold</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          ${renderDimensionRows(report)}
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h2>Artifacts</h2>
      <h3>Used</h3>
      ${renderList(report.summary.inputArtifactsUsed, "No artifacts loaded.")}
      <h3>Missing</h3>
      ${renderList(report.summary.missingArtifacts, "All expected artifact paths were present or optional.")}
    </div>

    <div class="panel">
      <h2>Warnings</h2>
      ${
        report.summary.warnings.length > 0
          ? `<ul>${report.summary.warnings
            .map((warning) => `<li>${escapeHtml(warning)}</li>`)
            .join("")}</ul>`
          : `<p class="muted">No warnings.</p>`
      }
      <h3>Caveats</h3>
      <ul>${report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul>
    </div>
  </div>
</body>
</html>`;
}
