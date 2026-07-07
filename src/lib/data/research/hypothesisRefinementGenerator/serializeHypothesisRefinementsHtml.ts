import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  HypothesisRefinementCandidate,
  HypothesisRefinementReport,
  HypothesisRefinementType,
  OverfittingRiskLevel,
} from "./hypothesisRefinementTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatTypeLabel(type: HypothesisRefinementType): string {
  return type.replaceAll("-", " ");
}

function overfittingTone(level: OverfittingRiskLevel): string {
  switch (level) {
    case "low":
      return theme.bullish;
    case "medium":
      return theme.warning;
    case "high":
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
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin: 16px 0;
    }
    .stat .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: ${theme.textMuted};
    }
    .stat .value {
      font-size: 24px;
      font-weight: 700;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      border: 1px solid ${theme.panelBorder};
      margin-right: 6px;
      margin-bottom: 6px;
    }
    .child-card {
      border-left: 3px solid ${theme.info};
      padding-left: 14px;
      margin-top: 16px;
    }
    .parent-link {
      color: ${theme.info};
      text-decoration: none;
    }
    .parent-link:hover { text-decoration: underline; }
    .disclaimer {
      border: 1px solid ${theme.warning};
      background: ${theme.panelBg};
      border-radius: 8px;
      padding: 12px 16px;
    }
  `;
}

function renderRefinementCard(refinement: HypothesisRefinementCandidate): string {
  const filters = [
    refinement.suggestedFilters.probabilityRangeLabel
      ? `probability: ${refinement.suggestedFilters.probabilityRangeLabel}`
      : null,
    refinement.suggestedFilters.timeBucketId
      ? `time: ${refinement.suggestedFilters.timeBucketId}`
      : null,
    refinement.suggestedFilters.volatilityBucketId
      ? `volatility: ${refinement.suggestedFilters.volatilityBucketId}`
      : null,
    refinement.suggestedFilters.excludedMonths?.length
      ? `exclude months: ${refinement.suggestedFilters.excludedMonths.join(", ")}`
      : null,
    refinement.suggestedFilters.includedMonths?.length
      ? `include months: ${refinement.suggestedFilters.includedMonths.join(", ")}`
      : null,
    refinement.suggestedFilters.settlementMode
      ? `settlement: ${refinement.suggestedFilters.settlementMode}`
      : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join(" · ");

  return `
    <article class="child-card" id="${escapeHtml(refinement.refinementId)}">
      <h3>#${refinement.priorityRank} ${escapeHtml(refinement.refinementId)}</h3>
      <p>
        <span class="badge">${escapeHtml(formatTypeLabel(refinement.refinementType))}</span>
        <span class="badge" style="color:${overfittingTone(refinement.overfittingRisk)}">
          overfitting: ${escapeHtml(refinement.overfittingRisk)}
        </span>
        <span class="badge">${escapeHtml(refinement.status)}</span>
      </p>
      <p>
        <strong>Parent:</strong>
        <a class="parent-link" href="#parent-${escapeHtml(refinement.parentHypothesisId)}">
          ${escapeHtml(refinement.parentHypothesisId)}
        </a>
      </p>
      <p><strong>Refined hypothesis:</strong> ${escapeHtml(refinement.refinedHypothesis)}</p>
      <p><strong>Rationale:</strong> ${escapeHtml(refinement.rationale)}</p>
      <p><strong>Expected benefit:</strong> ${escapeHtml(refinement.expectedBenefit)}</p>
      <p><strong>Expected risk:</strong> ${escapeHtml(refinement.expectedRisk)}</p>
      ${filters ? `<p class="muted"><strong>Suggested filters:</strong> ${escapeHtml(filters)}</p>` : ""}
      ${
        refinement.atlasSupportObservations !== null
          ? `<p class="muted"><strong>Atlas support:</strong> ${refinement.atlasSupportObservations} observations</p>`
          : ""
      }
    </article>
  `;
}

function renderParentSection(
  parentId: string,
  refinements: readonly HypothesisRefinementCandidate[],
): string {
  const first = refinements[0];
  if (!first) {
    return "";
  }

  return `
    <section class="panel" id="parent-${escapeHtml(parentId)}">
      <h2>Parent: ${escapeHtml(parentId)}</h2>
      <p class="muted">${escapeHtml(first.parentHypothesis)}</p>
      <p class="muted">
        Parent robustness ${first.parentRobustnessScore}
        (gap ${first.parentScoreGap}) · ${escapeHtml(first.parentPriorityCategory)}
      </p>
      <h3>Child refinements (${refinements.length})</h3>
      ${refinements.map((refinement) => renderRefinementCard(refinement)).join("")}
    </section>
  `;
}

export function serializeHypothesisRefinementsHtml(
  report: HypothesisRefinementReport,
): string {
  const refinementsByParent = new Map<string, HypothesisRefinementCandidate[]>();

  for (const refinement of report.refinements) {
    const existing = refinementsByParent.get(refinement.parentHypothesisId) ?? [];
    existing.push(refinement);
    refinementsByParent.set(refinement.parentHypothesisId, existing);
  }

  const parentSections = [...refinementsByParent.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([parentId, refinements]) => renderParentSection(parentId, refinements))
    .join("");

  const typeSummary = Object.entries(report.summary.refinementsByType)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `<li>${escapeHtml(formatTypeLabel(type as HypothesisRefinementType))}: ${count}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hypothesis Refinements</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header>
        <h1>Hypothesis Refinement Generator</h1>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
      </header>

      <section class="disclaimer">
        <strong>Read-only candidates.</strong> ${escapeHtml(report.disclaimer)}
      </section>

      <section class="panel">
        <h2>Summary</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Refinements</div>
            <div class="value">${report.summary.totalRefinements}</div>
          </div>
          <div class="stat">
            <div class="label">Parents with refinements</div>
            <div class="value">${report.summary.parentsWithRefinements}</div>
          </div>
          <div class="stat">
            <div class="label">Near-promising parents</div>
            <div class="value">${report.summary.nearPromisingParents}</div>
          </div>
          <div class="stat">
            <div class="label">Skipped (coverage)</div>
            <div class="value">${report.summary.skippedCoverageBlocked}</div>
          </div>
        </div>
        <ul>${typeSummary || "<li>No refinements generated.</li>"}</ul>
      </section>

      ${parentSections || `<section class="panel"><p>No refinement candidates were generated.</p></section>`}
    </main>
  </body>
</html>`;
}
