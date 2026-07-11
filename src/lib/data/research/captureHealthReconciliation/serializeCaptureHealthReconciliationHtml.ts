import type {
  CaptureHealthReconciliationReport,
  CaptureTimelineAttributionReport,
} from "./captureHealthReconciliationTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatShare(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function serializeCaptureHealthReconciliationHtml(
  report: CaptureHealthReconciliationReport,
): string {
  const metricRows = report.validBookMetrics
    .map(
      (metric) => `
      <tr>
        <td>${escapeHtml(metric.metricId)}</td>
        <td>${formatShare(metric.value)}</td>
        <td>${metric.numerator}/${metric.denominator}</td>
        <td>${escapeHtml(metric.population)}</td>
        <td>${escapeHtml(metric.sourceModule)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>Capture Health Reconciliation</title>
<style>body{font-family:system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px}</style>
</head><body>
<h1>Capture Health Reconciliation</h1>
<p>${escapeHtml(report.disclaimer)}</p>
<p>Run: <code>${escapeHtml(report.summary.selectedRunId)}</code></p>
<p>Verdict: <strong>${escapeHtml(report.summary.overallVerdict)}</strong></p>
<h2>Durations (seconds)</h2>
<ul>
<li>configured: ${report.durations.configuredDurationSeconds ?? "n/a"}</li>
<li>process wall clock: ${report.durations.processWallClockSeconds ?? "n/a"}</li>
<li>event span: ${report.durations.eventWallClockSpanSeconds ?? "n/a"}</li>
<li>suspected host suspension: ${report.durations.suspectedHostSuspensionSeconds ?? "n/a"}</li>
<li>usable observation: ${report.durations.usableObservationSeconds ?? "n/a"}</li>
<li>resynchronization estimate: ${report.durations.resynchronizationSeconds ?? "n/a"}</li>
</ul>
<h2>Valid-book metric reconciliation</h2>
<table><thead><tr><th>Metric</th><th>Value</th><th>Fraction</th><th>Population</th><th>Source</th></tr></thead>
<tbody>${metricRows}</tbody></table>
<h2>Counter semantics</h2>
<ul>${report.connectionAttribution.counterSemantics
  .map((item) => `<li><strong>${escapeHtml(item.fieldName)}</strong>: ${escapeHtml(item.semanticDefinition)} (reported=${item.reportedValue ?? "n/a"})</li>`)
  .join("")}</ul>
<h2>Research suitability</h2>
<ul>
<li>Descriptive: ${escapeHtml(report.researchSuitability.descriptiveAnalysisSuitability)}</li>
<li>Continuous microstructure: ${escapeHtml(report.researchSuitability.continuousMicrostructureSuitability)}</li>
<li>Transient event detection: ${escapeHtml(report.researchSuitability.transientEventDetectionSuitability)}</li>
<li>Zero-candidate interpretation: ${escapeHtml(report.researchSuitability.zeroCandidateInterpretation)}</li>
</ul>
</body></html>`;
}

export function serializeCaptureTimelineAttributionHtml(
  report: CaptureTimelineAttributionReport,
): string {
  const bucketRows = report.connectionAttribution.timelineBuckets
    .slice(0, 100)
    .map(
      (bucket) => `
      <tr>
        <td>${escapeHtml(bucket.bucketStart)}</td>
        <td>${bucket.btcHeartbeatCount}</td>
        <td>${bucket.topOfBookCount}</td>
        <td>${bucket.rawWsMessageCount}</td>
        <td>${bucket.gapDetectedTopOfBookCount}</td>
        <td>${escapeHtml(bucket.classification)}</td>
      </tr>`,
    )
    .join("");

  const suspensionRows = report.suspension.intervals
    .map(
      (interval) => `
      <tr>
        <td>${escapeHtml(interval.startedAt)}</td>
        <td>${escapeHtml(interval.endedAt)}</td>
        <td>${interval.gapDurationMs}</td>
        <td>${escapeHtml(interval.classification)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><title>Capture Timeline Attribution</title>
<style>body{font-family:system-ui,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px}</style>
</head><body>
<h1>Capture Timeline Attribution</h1>
<p>${escapeHtml(report.disclaimer)}</p>
<p>Run: <code>${escapeHtml(report.summary.selectedRunId)}</code></p>
<h2>Suspension intervals</h2>
<table><thead><tr><th>Start</th><th>End</th><th>Gap ms</th><th>Class</th></tr></thead>
<tbody>${suspensionRows}</tbody></table>
<h2>Timeline buckets (first 100)</h2>
<table><thead><tr><th>Start</th><th>BTC</th><th>TOB</th><th>Raw WS</th><th>Gap TOB</th><th>Class</th></tr></thead>
<tbody>${bucketRows}</tbody></table>
<p>Events inside suspension windows: ${report.connectionAttribution.eventsInsideSuspensionWindows}</p>
<p>Events outside suspension windows: ${report.connectionAttribution.eventsOutsideSuspensionWindows}</p>
</body></html>`;
}
