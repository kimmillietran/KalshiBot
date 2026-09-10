import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  LeadLagCollectionProgressArtifact,
  LeadLagProspectiveCohortReport,
} from "./leadLagProspectiveCohortTypes";

export function serializeLeadLagProspectiveCohortJson(
  report: LeadLagProspectiveCohortReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeLeadLagCollectionProgressJson(
  progress: LeadLagCollectionProgressArtifact,
): string {
  return `${stableStringify(progress)}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeLeadLagProspectiveCohortHtml(
  report: LeadLagProspectiveCohortReport,
): string {
  const progress = report.collectionProgress;
  const members = report.admittedRuns
    .map(
      (run) =>
        `<li><code>${escapeHtml(run.runId)}</code> ess=${run.essContribution} `
        + `hash=${escapeHtml(run.artifactContentHash.slice(0, 12))}…</li>`,
    )
    .join("\n");
  const rejected = report.rejectedAdmissions
    .map(
      (row) =>
        `<li>${escapeHtml(row.runId ?? "unknown")}: ${escapeHtml(row.reason)}</li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Lead-lag prospective cohort (prep)</title>
</head>
<body>
  <h1>M12.8e-prep prospective cohort</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <p>cohortIdentityHash: <code>${escapeHtml(report.cohortIdentityHash)}</code></p>
  <p>rawPerRunEssSum=${report.dedup.rawPerRunEssSum}
  deduplicatedCohortEss=${report.dedup.deduplicatedCohortEss}
  removed=${report.dedup.duplicateOrDependentUnitsRemoved}</p>
  <h2>Collection progress (blind to effect)</h2>
  <p>requiredN=${progress.fixedNProgress.requiredEffectiveN}
  currentN=${progress.fixedNProgress.currentEffectiveN}
  remainingN=${progress.fixedNProgress.remainingEffectiveN}
  fraction=${progress.fixedNProgress.fractionComplete}
  completed=${String(progress.fixedNProgress.completed)}</p>
  <p>effectFieldsPresent=${String(progress.effectFieldsPresent)}
  pValueFieldsPresent=${String(progress.pValueFieldsPresent)}</p>
  <h2>Admitted members</h2>
  <ul>${members || "<li>none</li>"}</ul>
  <h2>Rejected admissions</h2>
  <ul>${rejected || "<li>none</li>"}</ul>
  <h2>Final evaluation</h2>
  <p>${escapeHtml(report.finalEvaluationBoundary.status)} — ${escapeHtml(report.finalEvaluationBoundary.note)}</p>
</body>
</html>
`;
}
