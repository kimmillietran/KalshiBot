import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CalibrationFadeForwardValidationReport } from "./calibrationFadeForwardValidationTypes";

export function serializeCalibrationFadeForwardValidationReport(
  report: CalibrationFadeForwardValidationReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeCalibrationFadeForwardValidationHtml(
  report: CalibrationFadeForwardValidationReport,
): string {
  const rows = report.funnel
    .map((stage) => `<tr><td>${stage.label}</td><td>${stage.count}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Calibration Fade Forward Validation</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; color: #111; }
    h1, h2 { margin-bottom: 0.5rem; }
    table { border-collapse: collapse; margin: 1rem 0; }
    td, th { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
    .muted { color: #555; }
  </style>
</head>
<body>
  <h1>M13.2 Calibration Fade Forward Validation</h1>
  <p class="muted">${report.disclaimer}</p>
  <h2>Executive result</h2>
  <p><strong>${report.summary.interpretationClassification}</strong> — ${report.summary.rationale}</p>
  <p>Recommended next action: <strong>${report.summary.recommendedNextAction}</strong></p>
  <h2>Frozen hypothesis</h2>
  <p>${report.hypothesisId} (${report.hypothesisVersion})</p>
  <p>Configuration hash: ${report.hypothesisConfigurationHash}</p>
  <h2>Selected run</h2>
  <p>${report.selectedRunId} — ${report.recordsScanned} records, ${report.candidateMarketCount} candidate markets</p>
  <h2>Candidate funnel</h2>
  <table><thead><tr><th>Stage</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>
  <h2>Historical benchmark</h2>
  <pre>${stableStringify(report.historicalBenchmark)}</pre>
  <h2>Forward benchmark</h2>
  <pre>${stableStringify(report.forwardBenchmark)}</pre>
</body>
</html>`;
}
