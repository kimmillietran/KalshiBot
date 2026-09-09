import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CalibrationFadeV2EvidenceStrengthReport } from "./calibrationFadeV2EvidenceStrengthTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeCalibrationFadeV2EvidenceStrengthJson(
  report: CalibrationFadeV2EvidenceStrengthReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeCalibrationFadeV2EvidenceStrengthHtml(
  report: CalibrationFadeV2EvidenceStrengthReport,
): string {
  const nullDist = report.exactCalibratedNullDistribution;
  const warnings = report.methodologyWarnings
    .map((warning) => `<li>${escapeHtml(warning)}</li>`)
    .join("\n");
  const powerRows = report.powerAnalysis.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.assumptionId)}</td><td>${row.requiredN ?? "null"}</td>`
        + `<td>${row.targetDetectableCalibrationGap}</td><td>${row.targetPower}</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Calibration-fade v2 evidence-strength audit</title>
</head>
<body>
  <h1>Prospective evidence-strength and power audit</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <h2>Identity</h2>
  <p>analysisVersion: ${escapeHtml(report.analysisVersion)}</p>
  <p>sourceRunSetHash: ${escapeHtml(report.sourceRunSetHash)}</p>
  <p>sourceSettlementSnapshotHash: ${escapeHtml(report.sourceSettlementSnapshotHash)}</p>
  <p>sourceEvidenceMode: ${escapeHtml(report.sourceEvidenceMode)}</p>
  <p>governedInterpretationClassification: ${escapeHtml(report.governedInterpretationClassification)}</p>
  <p>candidateMarketCount: ${report.candidateMarketCount}</p>
  <p>observedSignedCalibrationGap: ${String(report.observedSignedCalibrationGap)}</p>
  <h2>Exact calibrated-null distribution</h2>
  <p>P(reject): ${nullDist.probabilityOfReject}</p>
  <p>P(support-calibration): ${nullDist.probabilityOfSupportCalibration}</p>
  <p>P(inconclusive): ${nullDist.probabilityOfInconclusive}</p>
  <p>P(support-executable): null (not modeled under calibration-only null)</p>
  <p>inconclusiveBandReachable: ${String(report.verdictReachability.inconclusiveBandReachable)}</p>
  <h2>Uncertainty</h2>
  <p>calibratedNullStandardError: ${String(report.uncertainty.calibratedNullStandardError)}</p>
  <p>exact central 95%: ${JSON.stringify(report.uncertainty.calibratedNullExactCentralInterval95)}</p>
  <h2>Stopping / LORO</h2>
  <p>stoppingRuleStatus: ${escapeHtml(report.stoppingRuleAssessment.stoppingRuleStatus)}</p>
  <p>loroCurrentlyInformative: ${String(report.loroAssessment.loroCurrentlyInformative)}</p>
  <p>loro reason: ${escapeHtml(report.loroAssessment.reason)}</p>
  <h2>Historical lineage (exploratory only)</h2>
  <p>observationCount: ${report.historicalLineageContext.observationCount}</p>
  <p>uniqueTradingDays: ${report.historicalLineageContext.uniqueTradingDays}</p>
  <p>passes: ${String(report.historicalLineageContext.passes)}</p>
  <p>robustnessScore: ${report.historicalLineageContext.robustnessScore}</p>
  <h2>Power sensitivity</h2>
  <table>
    <thead><tr><th>assumptionId</th><th>requiredN</th><th>targetGap</th><th>power</th></tr></thead>
    <tbody>
${powerRows}
    </tbody>
  </table>
  <h2>Recommended research action</h2>
  <p>${escapeHtml(report.recommendedResearchAction)}</p>
  <h2>Methodology warnings</h2>
  <ul>
${warnings}
  </ul>
</body>
</html>
`;
}
