import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { LeadLagReplicationReadinessReport } from "./leadLagReplicationReadinessTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeLeadLagReplicationReadinessJson(
  report: LeadLagReplicationReadinessReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeLeadLagReplicationReadinessHtml(
  report: LeadLagReplicationReadinessReport,
): string {
  const rows = report.historicalIncidenceByRun
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.runLabel)}</td><td>${escapeHtml(row.runId)}</td>`
        + `<td>${row.captureHours}</td><td>${row.eligibleCandidateEvents}</td>`
        + `<td>${row.uniqueMarkets}</td><td>${row.effectiveSampleSize}</td>`
        + `<td>${row.essPerHour.toFixed(4)}</td>`
        + `<td>${row.countsTowardFreshProspectiveN}</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Lead-lag replication readiness</title>
</head>
<body>
  <h1>M12.8d Lead-lag prospective replication readiness</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <p><strong>readinessIdentityHash:</strong> ${escapeHtml(report.readinessIdentityHash)}</p>
  <p><strong>currentStatus:</strong> ${escapeHtml(report.currentStatus)}</p>
  <p><strong>requiredFreshEffectiveN:</strong> ${report.requiredFreshEffectiveN}</p>
  <p><strong>replicationReadiness:</strong> ${escapeHtml(report.replicationReadiness)}</p>
  <p><strong>decisionRequired:</strong> ${escapeHtml(report.decisionRequired)}</p>
  <p><strong>recommendedNextAction:</strong> ${escapeHtml(report.recommendedNextAction)}</p>
  <p><strong>recommendedStoppingRule:</strong> ${escapeHtml(JSON.stringify(report.recommendedStoppingRule))}</p>
  <h2>Lineage</h2>
  <ul>
    <li>discovery: ${escapeHtml(report.lineage.discoveryIdentity)}</li>
    <li>validation: ${escapeHtml(report.lineage.validationIdentity)}</li>
    <li>holdout: ${escapeHtml(report.lineage.holdoutIdentity)}</li>
    <li>evidence: ${escapeHtml(report.lineage.evidenceContractIdentity)}</li>
    <li>candidate: ${escapeHtml(report.lineage.candidateId)}</li>
  </ul>
  <h2>Historical incidence (design only; fresh N starts at 0)</h2>
  <table border="1" cellpadding="4">
    <thead>
      <tr>
        <th>run</th><th>runId</th><th>hours</th><th>events</th>
        <th>markets</th><th>ESS</th><th>ESS/hour</th><th>countsTowardFreshN</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <h2>Projected hours to ESS=${report.requiredFreshEffectiveN}</h2>
  <ul>
    <li>low: ${report.projectedHoursToRequiredN.lowRate.projectedCaptureHours ?? "unavailable"}</li>
    <li>pooled: ${report.projectedHoursToRequiredN.pooledRate.projectedCaptureHours ?? "unavailable"}</li>
    <li>high: ${report.projectedHoursToRequiredN.highRate.projectedCaptureHours ?? "unavailable"}</li>
  </ul>
  <h2>Prior holdout context</h2>
  <p>verdict=${escapeHtml(report.priorHoldoutContext.holdoutStatisticalVerdict)};
     effect=${report.priorHoldoutContext.observedPrimaryEffectCents}¢;
     ESS=${report.priorHoldoutContext.effectiveSampleSize};
     interpretation=${escapeHtml(report.priorHoldoutContext.interpretation)}</p>
</body>
</html>
`;
}
