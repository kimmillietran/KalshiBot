import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CalibrationFadeV2CrossRunValidationReport } from "./analyzeCalibrationFadeV2CrossRun";

export function serializeCalibrationFadeV2CrossRunValidationJson(
  report: CalibrationFadeV2CrossRunValidationReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeCalibrationFadeV2CrossRunValidationHtml(
  report: CalibrationFadeV2CrossRunValidationReport,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Calibration-fade v2 cross-run confirmatory validation</title>
</head>
<body>
  <h1>Governed v2 confirmatory cross-run aggregation</h1>
  <p><strong>Settlement evidence authority:</strong> snapshot-scoped
  (<code>runSetHash</code> + <code>settlementSnapshotHash</code>).
  Legacy run-set root artifacts are historical only and must not be treated as
  current settlement-state authority.</p>
  <p>analysisVersion: ${report.analysisVersion}</p>
  <p>runSetHash: ${report.runSetHash}</p>
  <p>settlementSnapshotHash: ${report.settlementSnapshotHash}</p>
  <p>evidenceMode: ${report.evidenceMode}</p>
  <p>selectedRunIds: ${report.selectedRunIds.join(", ")}</p>
  <p>uniqueCandidateMarketCount: ${report.uniqueCandidateMarketCount}</p>
  <p>evaluatedIndependentCandidateMarketCount: ${report.evaluatedIndependentCandidateMarketCount}</p>
  <p>minimumIndependentCandidateMarkets: ${report.minimumIndependentCandidateMarkets}</p>
  <p>settlementCoverageShare: ${String(report.settlementCoverageShare)}</p>
  <p>interpretationClassification: ${report.interpretationClassification}</p>
  <p>recommendedNextAction: ${report.recommendedNextAction}</p>
  <p>${report.rationale}</p>
</body>
</html>
`;
}

export function serializeJsonl(lines: readonly string[]): string {
  return `${lines.join("\n")}${lines.length ? "\n" : ""}`;
}
