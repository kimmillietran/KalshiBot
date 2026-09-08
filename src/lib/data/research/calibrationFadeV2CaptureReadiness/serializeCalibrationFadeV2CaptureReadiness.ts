import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CalibrationFadeV2CaptureReadinessReport } from "./calibrationFadeV2CaptureReadinessTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeCalibrationFadeV2CaptureReadinessJson(
  report: CalibrationFadeV2CaptureReadinessReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeCalibrationFadeV2CaptureReadinessHtml(
  report: CalibrationFadeV2CaptureReadinessReport,
): string {
  const reasons = report.blockingReasons.length > 0
    ? report.blockingReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")
    : "<li>none</li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Calibration-fade v2 capture readiness</title>
</head>
<body>
  <h1>Calibration-fade v2 exact-run capture readiness</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <h2>Classification</h2>
  <p>${escapeHtml(report.classification)}</p>
  <h2>Selected run</h2>
  <ul>
    <li>selectedRunId: ${escapeHtml(report.selectedRunId)}</li>
    <li>captureRunDir: ${escapeHtml(report.captureRunDir)}</li>
    <li>captureStartedAt: ${escapeHtml(report.captureStartedAt ?? "unavailable")}</li>
    <li>captureEndedAt: ${escapeHtml(report.captureEndedAt ?? "unavailable")}</li>
    <li>captureTerminalState: ${escapeHtml(report.captureTerminalState ?? "unavailable")}</li>
  </ul>
  <h2>Verdict</h2>
  <p><strong>${escapeHtml(report.verdict)}</strong></p>
  <p>Recommended next action: <strong>${escapeHtml(report.recommendedNextAction)}</strong></p>
  <p>Confirmatory eligibility: ${String(report.confirmatoryEligibility)}</p>
  <h3>Blocking reasons</h3>
  <ul>${reasons}</ul>
  <h2>Freeze boundary</h2>
  <ul>
    <li>freezeCommitSha: ${escapeHtml(report.freezeCommitSha ?? "unavailable")}</li>
    <li>freezeTimestamp: ${escapeHtml(report.freezeTimestamp ?? "unavailable")}</li>
  </ul>
  <h2>Source contract</h2>
  <pre>${escapeHtml(stableStringify(report.sourceContract))}</pre>
  <h2>Candle artifact</h2>
  <ul>
    <li>path: ${escapeHtml(report.candleArtifactPath ?? "missing")}</li>
    <li>recordCount: ${report.candleRecordCount}</li>
    <li>distinctValidCompletedMinutes: ${report.distinctValidCompletedMinutes}</li>
    <li>processEpochId: ${escapeHtml(report.candleProcessEpochId ?? "unavailable")}</li>
  </ul>
  <h2>Quote probe</h2>
  <pre>${escapeHtml(stableStringify(report.quoteProbe))}</pre>
  <h2>Spot join probe</h2>
  <pre>${escapeHtml(stableStringify(report.spotProbe))}</pre>
</body>
</html>
`;
}
