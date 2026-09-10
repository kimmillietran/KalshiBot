import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { LeadLagEvidenceDesignReport } from "./leadLagEvidenceContractTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeLeadLagEvidenceDesignJson(
  report: LeadLagEvidenceDesignReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeLeadLagEvidenceDesignHtml(
  report: LeadLagEvidenceDesignReport,
): string {
  const powerRows = report.powerSensitivity
    .slice(0, 24)
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.assumptionId)}</td><td>${row.requiredEffectiveN ?? "null"}</td></tr>`,
    )
    .join("\n");
  const notes = report.promotionIntegrationNotes
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Lead-lag evidence design contract</title>
</head>
<body>
  <h1>M12.8c-prep lead-lag evidence design</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <h2>Identity</h2>
  <p>analysisVersion: ${escapeHtml(report.analysisVersion)}</p>
  <p>designIdentityHash: ${escapeHtml(report.designIdentityHash)}</p>
  <p>discoveryIdentity: ${escapeHtml(report.discoveryIdentity)}</p>
  <p>splitManifestHash: ${escapeHtml(report.splitManifestHash)}</p>
  <p>validationOutcomeAccessed: ${String(report.validationOutcomeAccessed)}</p>
  <p>holdoutOutcomeAccessed: ${String(report.holdoutOutcomeAccessed)}</p>
  <p>candidateWinnerSelected: ${String(report.candidateWinnerSelected)}</p>
  <h2>Statistical unit</h2>
  <p>primaryIndependentUnit: ${escapeHtml(report.statisticalUnit.primaryIndependentUnit)}</p>
  <p>${escapeHtml(report.dependenceModel)}</p>
  <h2>Estimands</h2>
  <p>primary: ${escapeHtml(report.primaryEstimand.primaryEstimand)}</p>
  <p>midpointDistinctFromExecutablePnl: ${String(report.primaryEstimand.midpointDistinctFromExecutablePnl)}</p>
  <h2>Execution</h2>
  <p>fillModel: ${escapeHtml(report.executionSemantics.fillModel)}</p>
  <p>liveOrdersImplemented: ${String(report.executionSemantics.liveOrdersImplemented)}</p>
  <h2>Power sensitivity (truncated)</h2>
  <table>
    <thead><tr><th>assumptionId</th><th>requiredEffectiveN</th></tr></thead>
    <tbody>
${powerRows}
    </tbody>
  </table>
  <h2>Stopping</h2>
  <p>allowed: ${escapeHtml(report.allowedStoppingRules.join(", "))}</p>
  <p>policy: ${escapeHtml(report.stoppingRuleValidationPolicy)}</p>
  <h2>Promotion integration</h2>
  <p>status: ${escapeHtml(report.promotionIntegrationStatus)}</p>
  <ul>
${notes}
  </ul>
</body>
</html>
`;
}
