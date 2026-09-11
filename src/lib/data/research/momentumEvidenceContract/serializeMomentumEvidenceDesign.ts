import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { MomentumEvidenceDesignReport } from "./momentumEvidenceContractTypes";

export function serializeMomentumEvidenceDesignJson(
  report: MomentumEvidenceDesignReport,
): string {
  return `${stableStringify(report)}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeMomentumEvidenceDesignHtml(
  report: MomentumEvidenceDesignReport,
): string {
  const inventory = report.captureInventory.rows
    .map(
      (row) =>
        `<li><code>${escapeHtml(row.runId)}</code> — ${escapeHtml(row.contaminationClassification)} `
        + `(roles: ${escapeHtml(row.eligibleRoles.join(",") || "none")})</li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Momentum evidence contract</title></head>
<body>
  <h1>Momentum evidence + data-isolation contract</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <h2>Identity</h2>
  <p>analysisVersion: ${escapeHtml(report.analysisVersion)}</p>
  <p>contractIdentityHash: ${escapeHtml(report.contractIdentityHash)}</p>
  <p>familyDefinitionIdentity: ${escapeHtml(report.familyDefinitionIdentity ?? "null")}</p>
  <p>familyBindingStatus: ${escapeHtml(report.familyBindingStatus)}</p>
  <h2>Estimands / fee</h2>
  <p>primary: ${escapeHtml(report.estimands.primaryEstimand)}</p>
  <p>diagnostic: ${escapeHtml(report.estimands.diagnosticEstimand)}</p>
  <p>feeContractStatus: ${escapeHtml(report.feeContract.feeContractStatus)}</p>
  <p>netEdgePromotionAuthorized: ${String(report.feeContract.netEdgePromotionAuthorized)}</p>
  <h2>Power</h2>
  <p>alpha=${report.powerMethodology.alpha} power=${report.powerMethodology.targetPower}
     MDE=${report.powerMethodology.materialEffectBound ?? "unbound"}
     SD=${report.powerMethodology.outcomeSdDefaultCents}
     requiredN=${report.powerMethodology.requiredEffectiveNWhenBound ?? "n/a"}</p>
  <h2>Direction consistency</h2>
  <p>${escapeHtml(report.directionConsistency.rule)}</p>
  <h2>Capture inventory (metadata-only)</h2>
  <p>freshCaptureRequiredBeforeValidation:
    ${String(report.captureInventory.freshCaptureRequiredBeforeValidation)}</p>
  <p>freshCaptureRequiredBeforeUntouchedHoldout:
    ${String(report.captureInventory.freshCaptureRequiredBeforeUntouchedHoldout)}</p>
  <ul>
${inventory}
  </ul>
  <h2>Quarantine</h2>
  <pre>${escapeHtml(JSON.stringify(report.quarantine, null, 2))}</pre>
</body>
</html>
`;
}
