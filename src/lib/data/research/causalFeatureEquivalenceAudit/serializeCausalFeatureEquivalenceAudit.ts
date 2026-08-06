import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { CausalFeatureEquivalenceAuditReport } from "./causalFeatureEquivalenceAuditTypes";

export function serializeCausalFeatureEquivalenceAuditReport(
  report: CausalFeatureEquivalenceAuditReport,
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

function renderJson(value: unknown): string {
  return escapeHtml(JSON.stringify(value, null, 2));
}

export function serializeCausalFeatureEquivalenceAuditHtml(
  report: CausalFeatureEquivalenceAuditReport,
): string {
  const bins = report.btcSourceDiagnostics.thresholdBins
    .map(
      (bin) =>
        `<tr><td>${bin.comparison} ${bin.thresholdMs} ms</td><td>${bin.count}</td><td>${bin.share ?? "n/a"}</td></tr>`,
    )
    .join("\n");
  const attribution = report.volatilityWindowDiagnostics.classes
    .filter((entry) => entry.observationCount > 0)
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.class)}</td><td>${entry.observationCount}</td><td>${entry.observationShare ?? "n/a"}</td><td>${entry.affectedMarketCount}</td></tr>`,
    )
    .join("\n");
  const comparisonRows = report.contractComparison.fields
    .map(
      (field) =>
        `<tr><td>${escapeHtml(field.field)}</td><td>${escapeHtml(String(field.historicalValue))}</td><td>${escapeHtml(String(field.forwardValue))}</td><td>${escapeHtml(field.status)}</td></tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Causal Feature Equivalence Audit</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; line-height: 1.45; color: #111; }
    h1, h2 { margin-top: 1.75rem; }
    table { border-collapse: collapse; width: 100%; margin: 0.75rem 0 1.5rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.55rem; text-align: left; vertical-align: top; }
    th { background: #f4f4f4; }
    pre { background: #f7f7f7; padding: 0.75rem; overflow: auto; }
    .verdict { font-size: 1.25rem; font-weight: 650; }
    .nonclaims li { margin: 0.25rem 0; }
  </style>
</head>
<body>
  <h1>Calibration-fade causal feature-equivalence audit</h1>
  <p>Analysis version: ${escapeHtml(report.analysisVersion)}</p>
  <p>Selected run: ${escapeHtml(report.selectedRunId)}</p>
  <p>Capture run dir: ${escapeHtml(report.captureRunDir)}</p>

  <h2>1. Executive verdict</h2>
  <p class="verdict">${escapeHtml(report.verdict)}</p>
  <p>Recommended next action: ${escapeHtml(report.recommendedNextAction)}</p>
  <p>Historical evidence status: ${escapeHtml(report.historicalEvidenceStatus)}</p>

  <h2>2. Historical evidence</h2>
  <p>Evidence path: ${escapeHtml(report.auditEvidencePath)}</p>
  <p>Evidence document hash (sha256): ${escapeHtml(report.auditEvidenceHash)}</p>
  <p>Historical contract semantic hash: ${escapeHtml(report.historicalContractSemanticHash)}</p>
  <p>Current forward contract semantic hash: ${escapeHtml(report.currentForwardContractSemanticHash)}</p>
  <p>Hypothesis configuration hash: ${escapeHtml(report.hypothesisConfigurationHash)}</p>
  <p>Git history is not executed at runtime; claims were reviewed and committed as audit evidence.</p>

  <h2>3. Historical contract</h2>
  <pre>${renderJson(report.historicalContract)}</pre>

  <h2>4. Current forward contract</h2>
  <pre>${renderJson(report.currentForwardContract)}</pre>

  <h2>5. Contract comparison</h2>
  <table>
    <thead><tr><th>Field</th><th>Historical</th><th>Forward</th><th>Status</th></tr></thead>
    <tbody>${comparisonRows}</tbody>
  </table>

  <h2>6. BTC cadence</h2>
  <p>Source records: ${report.btcSourceDiagnostics.sourceRecordCount}; intervals: ${report.btcSourceDiagnostics.observedIntervalCount}</p>
  <p>p50/p90/p95/p99 interval ms: ${report.btcSourceDiagnostics.p50IntervalMs} / ${report.btcSourceDiagnostics.p90IntervalMs} / ${report.btcSourceDiagnostics.p95IntervalMs} / ${report.btcSourceDiagnostics.p99IntervalMs}</p>
  <p>Cumulative interval threshold counts (${escapeHtml(report.btcSourceDiagnostics.thresholdCountSemantics)}): each adjacent gap increments every applicable exceedance row (a 6001&nbsp;ms gap counts toward &gt;5000, &gt;5001, &gt;5100, &gt;5500, and &gt;6000).</p>
  <table>
    <thead><tr><th>Threshold</th><th>Count</th><th>Share</th></tr></thead>
    <tbody>${bins}</tbody>
  </table>

  <h2>7. Quote join age</h2>
  <p>Observations scanned: ${report.quoteJoinDiagnostics.observationsScanned}</p>
  <p>With causal source: ${report.quoteJoinDiagnostics.observationsWithCausalSource}; without: ${report.quoteJoinDiagnostics.observationsWithNoCausalSource}</p>
  <p>Age p50/p90/p95/p99 ms: ${report.quoteJoinDiagnostics.ageP50Ms} / ${report.quoteJoinDiagnostics.ageP90Ms} / ${report.quoteJoinDiagnostics.ageP95Ms} / ${report.quoteJoinDiagnostics.ageP99Ms}</p>
  <p>Clock caveat: ${escapeHtml(report.quoteJoinDiagnostics.clockDomainCaveat)}</p>
  <p>Quote join freshness is reported separately from adjacent source cadence.</p>

  <h2>8. Volatility rejection attribution</h2>
  <table>
    <thead><tr><th>Class</th><th>Count</th><th>Share</th><th>Markets</th></tr></thead>
    <tbody>${attribution}</tbody>
  </table>

  <h2>9. Reference versus forward results</h2>
  <pre>${renderJson(report.referenceComparison)}</pre>

  <h2>10. Reconstructability</h2>
  <pre>${renderJson(report.reconstructability)}</pre>

  <h2>11. Future capture requirements</h2>
  <pre>${renderJson(report.futureCaptureRequirements)}</pre>

  <h2>12. Limitations and non-claims</h2>
  <ul class="nonclaims">
    ${report.nonClaims.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
  </ul>
  <h3>Limitations</h3>
  <ul>
    ${report.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
  </ul>
  <h3>Warnings</h3>
  <ul>
    ${report.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
  </ul>
</body>
</html>
`;
}
