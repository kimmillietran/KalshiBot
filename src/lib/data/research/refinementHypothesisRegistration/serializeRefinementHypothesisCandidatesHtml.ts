import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  RefinementHypothesisCandidatesReport,
  RegisteredRefinementHypothesisCandidate,
} from "./refinementHypothesisRegistrationTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderCandidateCard(candidate: RegisteredRefinementHypothesisCandidate): string {
  const registration = candidate.refinementRegistration;

  return `
    <article class="candidate-card" id="${escapeHtml(candidate.candidateId)}">
      <h3>#${registration.refinementRank} ${escapeHtml(candidate.candidateId)}</h3>
      <p>
        <span class="badge">${escapeHtml(registration.refinementType.replaceAll("-", " "))}</span>
        <span class="badge">${escapeHtml(registration.status)}</span>
      </p>
      <p><strong>Parent:</strong> <a class="parent-link" href="#parent-${escapeHtml(registration.parentHypothesisId)}">${escapeHtml(registration.parentHypothesisId)}</a></p>
      <p><strong>Hypothesis:</strong> ${escapeHtml(candidate.hypothesis)}</p>
      <p><strong>Generation reason:</strong> ${escapeHtml(registration.generationReason)}</p>
      <p class="muted"><strong>Suggested filters:</strong> ${escapeHtml(JSON.stringify(registration.suggestedFilters))}</p>
    </article>
  `;
}

export function serializeRefinementHypothesisCandidatesHtml(
  report: RefinementHypothesisCandidatesReport,
): string {
  const grouped = new Map<string, RegisteredRefinementHypothesisCandidate[]>();

  for (const candidate of report.candidates) {
    const parentId = candidate.refinementRegistration.parentHypothesisId;
    const existing = grouped.get(parentId) ?? [];
    existing.push(candidate);
    grouped.set(parentId, existing);
  }

  const parentSections = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([parentId, candidates]) => `
      <section class="panel" id="parent-${escapeHtml(parentId)}">
        <h2>Parent: ${escapeHtml(parentId)}</h2>
        <h3>Registered child hypotheses (${candidates.length})</h3>
        ${candidates.map((candidate) => renderCandidateCard(candidate)).join("")}
      </section>
    `)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Refinement Hypothesis Candidates</title>
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; }
      main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 20px; }
      .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 20px; }
      .candidate-card { border-left: 3px solid ${theme.info}; padding-left: 14px; margin-top: 16px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; border: 1px solid ${theme.panelBorder}; margin-right: 6px; }
      .parent-link { color: ${theme.info}; text-decoration: none; }
      .muted { color: ${theme.textMuted}; }
      .disclaimer { border: 1px solid ${theme.warning}; border-radius: 8px; padding: 12px 16px; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Refinement Hypothesis Candidates</h1>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
      </header>
      <section class="disclaimer">${escapeHtml(report.disclaimer)}</section>
      <section class="panel">
        <h2>Summary</h2>
        <p>Registered: ${report.summary.registeredCount} · Duplicates suppressed: ${report.summary.duplicateSuppressedCount} · Skipped malformed: ${report.summary.skippedMalformedCount}</p>
      </section>
      ${parentSections || "<section class=\"panel\"><p>No refinement hypotheses were registered.</p></section>"}
    </main>
  </body>
</html>`;
}
