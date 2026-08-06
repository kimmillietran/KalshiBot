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
  const funnelRows = report.funnel
    .map((stage) => `<tr><td>${stage.label}</td><td>${stage.count}</td></tr>`)
    .join("");
  const gateRows = Object.entries(report.gatePassCounts)
    .map(([gate, count]) => `<tr><td>${gate}</td><td>${count}</td></tr>`)
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
  <h2>Provenance</h2>
  <p>Status: <strong>${report.provenance.provenanceStatus}</strong> (available=${report.provenance.provenanceAvailable})</p>
  <p>Verification model: <strong>${report.provenance.verificationModel ?? "none"}</strong> — reviewed manifest validated; repository history is <em>not</em> checked at runtime.</p>
  <p>Hash semantics: ${report.provenance.hashSemantics ?? report.provenance.configurationHashSemantics ?? "semantic normalized-spec hashes"}</p>
  <p>Manifest: ${report.provenance.provenanceManifestPath ?? "none"}</p>
  <p>Manifest hash: ${report.provenance.provenanceManifestHash ?? "none"}</p>
  <p>Conclusion: ${report.provenance.provenanceConclusion ?? "none"}</p>
  <p>Historical benchmark availability: ${report.provenance.historicalBenchmarkAvailability ?? "none"}</p>
  <p>First-forward boundary: ${report.provenance.firstForwardEvaluationBoundary
    ? `${report.provenance.firstForwardEvaluationBoundary.claim} (${report.provenance.firstForwardEvaluationBoundary.verificationBasis}; runtimeVerified=${report.provenance.firstForwardEvaluationBoundary.runtimeVerified})`
    : "none"} — project-context evidence, not independently verified at runtime.</p>
  <p>Original freeze: ${report.provenance.originalFreezeCommitSha ?? "none"} @ ${report.provenance.originalFreezeCommitTimestamp ?? "none"}</p>
  <p>Config hashes: original=${report.provenance.originalConfigHash ?? "none"} resolved=${report.provenance.resolvedConfigHash ?? "none"}</p>
  <pre>${stableStringify({
    ruleFreezeEvidence: report.provenance.ruleFreezeEvidence,
    missingArtifacts: report.provenance.missingArtifacts,
    declaredMissingArtifacts: report.provenance.declaredMissingArtifacts,
    runtimeMissingArtifacts: report.provenance.runtimeMissingArtifacts,
    runtimeLoadedArtifacts: report.provenance.runtimeLoadedArtifacts,
    limitations: report.provenance.limitations,
    integrityCorrections: report.provenance.integrityCorrections,
  })}</pre>
  <h2>Selected run</h2>
  <p>${report.selectedRunId} — ${report.recordsScanned} records across ${report.marketsScanned} markets, ${report.candidateMarketCount} candidate markets</p>
  <h2>Sequential candidate funnel</h2>
  <p class="muted">Observation-level stages are monotonic; each row requires all prior gates.</p>
  <table><thead><tr><th>Stage</th><th>Count</th></tr></thead><tbody>${funnelRows}</tbody></table>
  <h2>Independent gate pass counts</h2>
  <p class="muted">Each gate is counted independently across all scanned records.</p>
  <table><thead><tr><th>Gate</th><th>Count</th></tr></thead><tbody>${gateRows}</tbody></table>
  <h2>Volatility window rejections</h2>
  <pre>${stableStringify(report.volatilityWindowRejections)}</pre>
  <h2>Historical benchmark</h2>
  <pre>${stableStringify(report.historicalBenchmark)}</pre>
  <h2>Forward benchmark</h2>
  <pre>${stableStringify(report.forwardBenchmark)}</pre>
</body>
</html>`;
}
