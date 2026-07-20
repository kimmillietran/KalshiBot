import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CalibrationFadeCrossRunValidationReport } from "./calibrationFadeCrossRunValidationTypes";

export function serializeCalibrationFadeCrossRunValidationReport(
  report: CalibrationFadeCrossRunValidationReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeCalibrationFadeCrossRunValidationHtml(
  report: CalibrationFadeCrossRunValidationReport,
): string {
  const runRows = report.perRunSummaries
    .map(
      (run) => `<tr>
      <td>${run.selectedRunId}</td>
      <td>${run.captureHealthSource ?? "n/a"}</td>
      <td>${run.captureVerdict ?? "n/a"}</td>
      <td>${run.recordsScanned}</td>
      <td>${run.qualifyingObservationCount}</td>
      <td>${run.candidateEpisodeCount}</td>
      <td>${run.rawCandidateMarketAppearanceCount}</td>
      <td>${run.feeAdjustedReturnCents ?? "n/a"}</td>
      <td>${run.interpretationClassification}</td>
    </tr>`,
    )
    .join("");

  const candidateFunnel = report.candidateFunnel
    .map((stage) => `<tr><td>${stage.label}</td><td>${stage.count}</td></tr>`)
    .join("");
  const runFunnel = report.runFunnel
    .map((stage) => `<tr><td>${stage.label}</td><td>${stage.count}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Calibration Fade Cross-Run Validation</title>
  <style>
    body { font-family: sans-serif; margin: 2rem; color: #111; }
    h1, h2 { margin-bottom: 0.5rem; }
    table { border-collapse: collapse; margin: 1rem 0; }
    td, th { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
    .muted { color: #555; }
  </style>
</head>
<body>
  <h1>M13.3 Cross-Run Frozen Calibration-Fade Validation</h1>
  <p class="muted">${report.disclaimer}</p>
  <h2>Executive result</h2>
  <p><strong>${report.classification}</strong> — ${report.rationale}</p>
  <p>Recommended next action: <strong>${report.recommendedNextAction}</strong></p>
  <h2>Frozen hypothesis</h2>
  <p>${report.hypothesisId} (${report.hypothesisVersion})</p>
  <p>Configuration hash: ${report.hypothesisConfigurationHash}</p>
  <p>Run-set hash: ${report.runSetHash}</p>
  <h2>Run funnel</h2>
  <table><thead><tr><th>Stage</th><th>Count</th></tr></thead><tbody>${runFunnel}</tbody></table>
  <h2>Candidate funnel</h2>
  <table><thead><tr><th>Stage</th><th>Count</th></tr></thead><tbody>${candidateFunnel}</tbody></table>
  <h2>Per-run results</h2>
  <table>
    <thead>
      <tr>
        <th>Run</th><th>Health source</th><th>Verdict</th><th>Records</th>
        <th>Qualifying</th><th>Episodes</th><th>Appearances</th><th>Fee-adj ¢</th><th>Classification</th>
      </tr>
    </thead>
    <tbody>${runRows}</tbody>
  </table>
  <h2>Historical benchmark</h2>
  <pre>${stableStringify(report.historicalBenchmark)}</pre>
  <h2>Pooled calibration</h2>
  <pre>${stableStringify(report.calibration)}</pre>
  <h2>Pooled executable</h2>
  <pre>${stableStringify(report.executable)}</pre>
  <h2>Missing settlements</h2>
  <pre>${stableStringify({
    missingSettlementMarkets: report.missingSettlementMarkets,
    recommendedBackfillRunIds: report.recommendedBackfillRunIds,
  })}</pre>
  <h2>Warnings</h2>
  <ul>${report.warnings.map((warning) => `<li>${warning}</li>`).join("")}</ul>
</body>
</html>`;
}
