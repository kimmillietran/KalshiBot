import type { BtcKalshiLeadLagAnalysisReport, LeadLagAggregateBucket } from "./btcKalshiLeadLagAnalysisTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderCountRows(record: Record<string, number>): string {
  return Object.entries(record)
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${value}</td></tr>`)
    .join("");
}

function renderAggregateBucketRows(
  title: string,
  buckets: Record<string, LeadLagAggregateBucket>,
): string {
  const rows = Object.entries(buckets)
    .map(([key, bucket]) => `<tr>
      <td>${escapeHtml(key)}</td>
      <td>${bucket.triggerCount}</td>
      <td>${bucket.eligibleTriggerCount}</td>
      <td>${bucket.directionalResponseShare ?? "—"}</td>
      <td>${bucket.medianSignedYesMidResponseCents ?? "—"}</td>
      <td>${bucket.medianTimeToFirst1CentResponseMs ?? "—"}</td>
    </tr>`)
    .join("");

  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th>Bucket</th><th>Triggers</th><th>Eligible</th>
          <th>Directional share</th><th>Median signed mid (¢)</th><th>Median 1¢ latency (ms)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

export function serializeBtcKalshiLeadLagAnalysisHtml(
  report: BtcKalshiLeadLagAnalysisReport,
): string {
  const quality = report.selectedRunQuality;
  const join = report.causalJoinQuality;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>BTC-to-Kalshi Lead-Lag Analysis</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
    h1, h2 { margin-top: 2rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
    .muted { color: #555; }
    .guardrail { background: #fff8e6; padding: 1rem; border-left: 4px solid #d4a017; }
  </style>
</head>
<body>
  <h1>BTC-to-Kalshi Lead-Lag Characterization</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>

  <section>
    <h2>Executive result</h2>
    <p><strong>Classification:</strong> ${escapeHtml(report.summary.interpretationClassification)}</p>
    <p><strong>Recommended next action:</strong> ${escapeHtml(report.summary.recommendedNextAction)}</p>
    <p><strong>Classification rationale:</strong> ${escapeHtml(report.summary.classificationRationale)}</p>
    <p><strong>Selected run:</strong> <code>${escapeHtml(report.selectedRunId)}</code></p>
    <p><strong>Top-of-book records scanned:</strong> ${report.recordsScanned}</p>
    <p><strong>BTC records scanned:</strong> ${report.btcRecordsScanned}</p>
    <p><strong>BTC triggers:</strong> ${report.triggerCount}</p>
    <p><strong>Eligible event-market pairs:</strong> ${report.eligibleTriggerCount}</p>
    <p><strong>Suppressed overlapping BTC triggers:</strong> ${report.suppressedOverlappingTriggerCount}</p>
  </section>

  <section>
    <h2>Selected-run quality</h2>
    <table><tbody>
      <tr><td>Run duration (s)</td><td>${quality.runDurationSeconds ?? "—"}</td></tr>
      <tr><td>Valid book share</td><td>${quality.validBookShare ?? "—"}</td></tr>
      <tr><td>BTC join coverage</td><td>${quality.btcJoinCoverageShare ?? "—"}</td></tr>
      <tr><td>Bid size coverage</td><td>${quality.bidSizeCoverageShare ?? "—"}</td></tr>
      <tr><td>Reconnect count</td><td>${quality.reconnectCount ?? "—"}</td></tr>
      <tr><td>Sequence gaps</td><td>${quality.sequenceGapCount ?? "—"}</td></tr>
      <tr><td>Suspected system sleep (s)</td><td>${quality.suspectedSystemSleepSeconds ?? "—"}</td></tr>
      <tr><td>Capture verdict</td><td>${escapeHtml(quality.captureVerdict ?? "—")}</td></tr>
      <tr><td>Reconciliation verdict</td><td>${escapeHtml(quality.reconciliationVerdict ?? "—")}</td></tr>
    </tbody></table>
  </section>

  <section>
    <h2>Causal join quality</h2>
    <table><tbody>
      <tr><td>Join direction</td><td>${join.btcJoinDirection}</td></tr>
      <tr><td>Maximum BTC join age (ms)</td><td>${join.maximumBtcJoinAgeMs}</td></tr>
      <tr><td>Unjoined observations</td><td>${join.unjoinedObservationCount}</td></tr>
      <tr><td>Stale joins</td><td>${join.staleJoinCount}</td></tr>
      <tr><td>Future leakage guard</td><td>${join.futureLeakageGuardStatus}</td></tr>
    </tbody></table>
    <h3>BTC sample age distribution</h3>
    <table><tbody>${renderCountRows(join.btcSampleAgeMsDistribution)}</tbody></table>
  </section>

  <section>
    <h2>Market and contract coverage</h2>
    <table><tbody>
      <tr><td>Markets with directional semantics</td><td>${report.marketCoverage.marketsWithDirectionalSemantics}</td></tr>
      <tr><td>Markets excluded from directional analysis</td><td>${report.marketCoverage.marketsExcludedFromDirectionalAnalysis}</td></tr>
      <tr><td>Markets with threshold metadata</td><td>${report.marketCoverage.marketsWithThresholdMetadata}</td></tr>
    </tbody></table>
    <h3>Exclusion reasons</h3>
    <table><tbody>${renderCountRows(report.marketCoverage.exclusionReasons)}</tbody></table>
  </section>

  <section>
    <h2>BTC move distribution</h2>
    <table><tbody>${renderCountRows(report.btcMoveDistribution)}</tbody></table>
  </section>

  <section>
    <h2>Trigger counts</h2>
    <h3>By horizon</h3>
    <table><tbody>${renderCountRows(report.triggerCountsByHorizon)}</tbody></table>
    <h3>By magnitude bin</h3>
    <table><tbody>${renderCountRows(report.triggerCountsByMagnitudeBin)}</tbody></table>
  </section>

  ${renderAggregateBucketRows("Kalshi response by lag window", report.responseByLagWindow)}
  ${renderAggregateBucketRows("Response by BTC magnitude", report.responseByMagnitudeBin)}
  ${renderAggregateBucketRows("Response by time remaining", report.responseByTimeRemainingBin)}
  ${renderAggregateBucketRows("Response by implied probability", report.responseByImpliedProbabilityBin)}

  <section>
    <h2>Threshold-crossing versus non-crossing events</h2>
    <table><tbody>
      <tr><td>Threshold crossing share</td><td>${report.summary.thresholdCrossingEventShare ?? "—"}</td></tr>
      <tr><td>Non-crossing share</td><td>${report.summary.nonThresholdCrossingEventShare ?? "—"}</td></tr>
    </tbody></table>
  </section>

  <section class="guardrail">
    <h2>Interpretation guardrails</h2>
    <ul>
      <li>Midpoint response is not executable profit.</li>
      <li>Lag episodes are descriptive characterization, not trade candidates.</li>
      <li>Predeclared BTC magnitude bins and lag windows were not optimized against outcomes.</li>
      <li>Configuration hash: <code>${escapeHtml(report.configurationHash)}</code></li>
      <li>Events dataset: <code>${escapeHtml(report.eventsOutputPath)}</code></li>
    </ul>
    ${report.warnings.length > 0 ? `<p><strong>Warnings:</strong> ${escapeHtml(report.warnings.join(" "))}</p>` : ""}
  </section>
</body>
</html>`;
}
