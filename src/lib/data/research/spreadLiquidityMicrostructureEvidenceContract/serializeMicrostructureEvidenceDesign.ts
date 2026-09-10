import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { MicrostructureEvidenceDesignReport } from "./microstructureEvidenceContractTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeMicrostructureEvidenceDesignJson(
  report: MicrostructureEvidenceDesignReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeMicrostructureEvidenceDesignHtml(
  report: MicrostructureEvidenceDesignReport,
): string {
  const exclusions = report.explicitExclusions
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");
  const adapters = report.microstructureSpecificAdapters
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Microstructure evidence design contract</title>
</head>
<body>
  <h1>M13.0b-prep microstructure evidence design</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <h2>Identity</h2>
  <p>analysisVersion: ${escapeHtml(report.analysisVersion)}</p>
  <p>contractIdentityHash: ${escapeHtml(report.contractIdentityHash)}</p>
  <p>expectedFamilyId: ${escapeHtml(report.expectedFamilyId)}</p>
  <p>expectedSubfamilyId: ${escapeHtml(report.expectedSubfamilyId)}</p>
  <p>familyDefinitionIdentity: ${escapeHtml(String(report.familyDefinitionIdentity))}</p>
  <h2>Statistical unit</h2>
  <p>${escapeHtml(report.statisticalUnit.primaryIndependentUnit)}</p>
  <p>${escapeHtml(report.statisticalUnit.effectiveSampleSizeRule)}</p>
  <h2>Estimands</h2>
  <p>primary: ${escapeHtml(report.estimands.primaryEstimand)}</p>
  <p>midpointAuthorization: ${escapeHtml(report.estimands.midpointAuthorization)}</p>
  <h2>Shortlist / lock / holdout</h2>
  <p>maxK: ${report.shortlistPolicy.maxK}</p>
  <p>lineage: ${escapeHtml(report.multiplicityDesign.lineage)}</p>
  <h2>Power</h2>
  <p>alpha: ${report.powerMethodology.alpha}</p>
  <p>targetPower: ${report.powerMethodology.targetPower}</p>
  <p>materialEffectBound: ${String(report.materialEffectDecisionStatus.materialEffectThresholdCents)}</p>
  <p>recommendedCents: ${report.materialEffectDecisionStatus.recommendedCents}</p>
  <h2>Adapters</h2>
  <ul>${adapters}</ul>
  <h2>Exclusions</h2>
  <ul>${exclusions}</ul>
  <h2>Quarantine</h2>
  <pre>${escapeHtml(stableStringify(report.quarantine))}</pre>
</body>
</html>
`;
}
