import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import type { EstimatedSupportLevel } from "@/lib/data/research/coveragePlanner/importability/importabilityTypes";

import type { ExpansionBatchPlan } from "./expansionBatchPlannerTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function supportLevelBadge(level: EstimatedSupportLevel): string {
  const styles: Record<EstimatedSupportLevel, { label: string; color: string }> = {
    high: { label: "Likely importable", color: theme.bullish },
    medium: { label: "Partially supported", color: theme.warning },
    low: { label: "Mostly unsupported", color: theme.bearish },
  };
  const entry = styles[level];
  return `<span class="status-badge" style="background:${entry.color}22;color:${entry.color};border:1px solid ${entry.color}55">${entry.label}</span>`;
}

function renderSummaryCards(plan: ExpansionBatchPlan): string {
  return `
    <section class="summary-grid">
      <div class="summary-card"><div class="summary-label">Budget</div><div class="summary-value">${plan.maxMarkets}</div></div>
      <div class="summary-card"><div class="summary-label">Allocated</div><div class="summary-value">${plan.summary.totalAllocatedMarkets}</div></div>
      <div class="summary-card"><div class="summary-label">Allocations</div><div class="summary-value">${plan.summary.allocationCount}</div></div>
      <div class="summary-card"><div class="summary-label">Candidate months</div><div class="summary-value">${plan.summary.candidateMonthCount}</div></div>
      <div class="summary-card"><div class="summary-label">Scheduled jobs</div><div class="summary-value">${plan.summary.scheduledJobCount}</div></div>
      <div class="summary-card"><div class="summary-label">Rejected unsupported-heavy</div><div class="summary-value" style="color:${theme.warning}">${plan.summary.rejectedUnsupportedHeavyAllocationCount}</div></div>
      <div class="summary-card"><div class="summary-label">Rejected zero priority</div><div class="summary-value">${plan.summary.rejectedZeroPriorityAllocationCount}</div></div>
      <div class="summary-card"><div class="summary-label">Rejected already covered</div><div class="summary-value">${plan.summary.rejectedAlreadyCoveredAllocationCount}</div></div>
      <div class="summary-card"><div class="summary-label">Strategy</div><div class="summary-value">${escapeHtml(plan.selectionStrategy)}</div></div>
      <div class="summary-card"><div class="summary-label">Known candidates</div><div class="summary-value">${plan.discoveryUniverse.knownCandidateMonths.length}</div></div>
      <div class="summary-card"><div class="summary-label">Expanded candidates</div><div class="summary-value">${plan.discoveryUniverse.expandedCandidateMonths.length}</div></div>
      <div class="summary-card"><div class="summary-label">Undiscovered</div><div class="summary-value" style="color:${plan.discoveryUniverse.undiscoveredCandidateMonths.length > 0 ? theme.warning : theme.text}">${plan.discoveryUniverse.undiscoveredCandidateMonths.length}</div></div>
      <div class="summary-card"><div class="summary-label">Universe complete</div><div class="summary-value">${plan.discoveryUniverse.universeComplete ? "yes" : "no"}</div></div>
      <div class="summary-card"><div class="summary-label">Exhaustion</div><div class="summary-value">${escapeHtml(plan.discoveryUniverse.exhaustionReason)}</div></div>
    </section>`;
}

function renderRejectedRows(plan: ExpansionBatchPlan): string {
  return plan.rejectedCandidates
    .map(
      (candidate) => `
      <tr>
        <td><strong>${escapeHtml(candidate.month)}</strong></td>
        <td>${escapeHtml(candidate.rejectionReason)}</td>
        <td>${candidate.priorityScore.toFixed(1)}</td>
        <td>${supportLevelBadge(candidate.expectedImportability)}</td>
        <td>${Math.round(candidate.estimatedUnsupportedRate * 100)}%</td>
        <td>${candidate.estimatedImportableMarketCount}</td>
        <td>${candidate.currentMarketCount}</td>
        <td>${candidate.discoveryAvailableCount ?? "—"}</td>
        <td>${escapeHtml(candidate.rationale)}</td>
      </tr>`,
    )
    .join("");
}

function renderAllocationRows(plan: ExpansionBatchPlan): string {
  return plan.allocations
    .map(
      (allocation) => `
      <tr>
        <td><strong>${escapeHtml(allocation.month)}</strong></td>
        <td>${allocation.marketCount}</td>
        <td>${escapeHtml(allocation.seriesTicker)}</td>
        <td>${supportLevelBadge(allocation.expectedImportability)}</td>
        <td>${Math.round(allocation.estimatedUnsupportedRate * 100)}%</td>
        <td>${allocation.currentObservations} / ${allocation.desiredObservations}</td>
        <td>${allocation.currentMarketCount}</td>
        <td>${allocation.discoveryAvailableCount ?? "—"}</td>
        <td>${allocation.priorityScore.toFixed(1)}</td>
        <td>${escapeHtml(allocation.targetHypothesisIds.join(", ") || "—")}</td>
        <td>${escapeHtml(allocation.expectedValidationBenefit)}</td>
        <td>${escapeHtml(allocation.rationale)}</td>
        <td>${allocation.riskNotes.map((note) => escapeHtml(note)).join("<br/>") || "—"}</td>
      </tr>`,
    )
    .join("");
}

function renderNotes(plan: ExpansionBatchPlan): string {
  return plan.plannerNotes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");
}

/** Serializes the expansion batch plan as a standalone HTML report. */
export function serializeExpansionBatchPlanHtml(plan: ExpansionBatchPlan): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Expansion Batch Plan</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .meta { color: ${theme.textMuted}; margin-bottom: 24px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
    }
    .summary-label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .summary-value { font-size: 24px; font-weight: 700; margin-top: 8px; }
    section { margin-bottom: 28px; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      overflow: hidden;
      font-size: 13px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid ${theme.panelBorder};
      vertical-align: top;
      text-align: left;
    }
    th { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    tr:last-child td { border-bottom: none; }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      white-space: nowrap;
    }
    ul { padding-left: 20px; color: ${theme.textMuted}; }
  </style>
</head>
<body>
  <main>
    <h1>Expansion Batch Plan</h1>
    <p class="meta">Generated ${escapeHtml(plan.generatedAt)} · Budget ${plan.maxMarkets} markets · Allocated ${plan.summary.totalAllocatedMarkets}</p>
    ${renderSummaryCards(plan)}
    <section>
      <h2>Month allocations</h2>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Markets</th>
            <th>Series</th>
            <th>Importability</th>
            <th>Unsupported</th>
            <th>Observations</th>
            <th>Markets in bucket</th>
            <th>Discovery</th>
            <th>Priority</th>
            <th>Hypotheses</th>
            <th>Validation benefit</th>
            <th>Rationale</th>
            <th>Risk notes</th>
          </tr>
        </thead>
        <tbody>
          ${renderAllocationRows(plan)}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Rejected candidate months</h2>
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th>Reason</th>
            <th>Priority</th>
            <th>Importability</th>
            <th>Unsupported</th>
            <th>Importable est.</th>
            <th>Covered</th>
            <th>Discovery</th>
            <th>Rationale</th>
          </tr>
        </thead>
        <tbody>
          ${renderRejectedRows(plan)}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Discovery universe</h2>
      <table>
        <tbody>
          <tr><th>Known candidate months</th><td>${escapeHtml(plan.discoveryUniverse.knownCandidateMonths.join(", ") || "—")}</td></tr>
          <tr><th>Expanded candidate months</th><td>${escapeHtml(plan.discoveryUniverse.expandedCandidateMonths.join(", ") || "—")}</td></tr>
          <tr><th>Discovered months</th><td>${escapeHtml(plan.discoveryUniverse.discoveredMonths.join(", ") || "—")}</td></tr>
          <tr><th>Undiscovered candidate months</th><td>${escapeHtml(plan.discoveryUniverse.undiscoveredCandidateMonths.join(", ") || "—")}</td></tr>
          <tr><th>Discovery frontier months</th><td>${escapeHtml(plan.discoveryUniverse.discoveryFrontierMonths.join(", ") || "—")}</td></tr>
          <tr><th>Stale discovery months</th><td>${escapeHtml(plan.discoveryUniverse.staleDiscoveryMonths.join(", ") || "—")}</td></tr>
          <tr><th>Planner exhausted</th><td>${plan.discoveryUniverse.plannerExhausted ? "yes" : "no"}</td></tr>
          <tr><th>Universe complete</th><td>${plan.discoveryUniverse.universeComplete ? "yes" : "no"}</td></tr>
          <tr><th>Universe incomplete</th><td>${plan.discoveryUniverse.universeIncomplete ? "yes" : "no"}</td></tr>
          <tr><th>Exhaustion reason</th><td>${escapeHtml(plan.discoveryUniverse.exhaustionReason)}</td></tr>
        </tbody>
      </table>
    </section>
    <section>
      <h2>Planner notes</h2>
      <ul>${renderNotes(plan)}</ul>
    </section>
  </main>
</body>
</html>`;
}
