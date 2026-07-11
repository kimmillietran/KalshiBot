import type { ParityNearMissAnalysisReport } from "./parityNearMissAnalysisTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderRankedTable(
  title: string,
  rows: ParityNearMissAnalysisReport["nearMissRankings"]["gross"],
): string {
  if (rows.length === 0) {
    return `<section><h2>${escapeHtml(title)}</h2><p>No near misses in this category.</p></section>`;
  }

  const body = rows
    .map(
      (row) => `<tr>
        <td>${row.rank}</td>
        <td>${escapeHtml(row.marketTicker)}</td>
        <td>${escapeHtml(row.timestamp)}</td>
        <td>${row.distance.toFixed(2)}</td>
        <td>${row.yesBidCents ?? "—"}</td>
        <td>${row.noBidCents ?? "—"}</td>
        <td>${escapeHtml(row.firstRejectingGate ?? "—")}</td>
        <td>${escapeHtml(row.integrityCaveat ?? "—")}</td>
      </tr>`,
    )
    .join("");

  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>
          <th>Rank</th><th>Market</th><th>Timestamp</th><th>Distance</th>
          <th>YES bid</th><th>NO bid</th><th>First gate</th><th>Integrity</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function renderCountRows(record: Record<string, number>): string {
  return Object.entries(record)
    .sort((left, right) => right[1] - left[1])
    .map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${value}</td></tr>`)
    .join("");
}

export function serializeParityNearMissAnalysisHtml(
  report: ParityNearMissAnalysisReport,
): string {
  const funnel = report.qualificationFunnel;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Parity Near-Miss Analysis</title>
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
  <h1>Run-Scoped Parity Near-Miss Analysis</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>

  <section>
    <h2>Executive result</h2>
    <p><strong>Classification:</strong> ${escapeHtml(report.summary.interpretationClassification)}</p>
    <p><strong>Recommended next action:</strong> ${escapeHtml(report.summary.recommendedNextAction)}</p>
    <p><strong>Selected run:</strong> <code>${escapeHtml(report.selectedRunId)}</code></p>
    <p><strong>Records scanned:</strong> ${report.recordsScanned}</p>
    <p><strong>Final buffer-adjusted candidates:</strong> ${report.summary.candidateCount}</p>
    <p><strong>Closest gross near miss:</strong> ${report.summary.closestGrossNearMissCents ?? "—"}</p>
    <p><strong>Closest buffer near miss:</strong> ${report.summary.closestBufferNearMissCents ?? "—"}</p>
  </section>

  <section>
    <h2>Selected-run quality</h2>
    <table>
      <tbody>
        <tr><td>Run duration (s)</td><td>${report.selectedRunQuality.runDurationSeconds ?? "—"}</td></tr>
        <tr><td>Valid book share</td><td>${report.selectedRunQuality.validBookShare ?? "—"}</td></tr>
        <tr><td>BTC join coverage</td><td>${report.selectedRunQuality.btcJoinCoverageShare ?? "—"}</td></tr>
        <tr><td>Bid size coverage</td><td>${report.selectedRunQuality.bidSizeCoverageShare ?? "—"}</td></tr>
        <tr><td>Reconnect count</td><td>${report.selectedRunQuality.reconnectCount ?? "—"}</td></tr>
        <tr><td>Sequence gaps</td><td>${report.selectedRunQuality.sequenceGapCount ?? "—"}</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Qualification funnel</h2>
    <table>
      <tbody>
        <tr><td>Records loaded</td><td>${funnel.recordsLoaded}</td></tr>
        <tr><td>Records eligible</td><td>${funnel.recordsEligible}</td></tr>
        <tr><td>Valid books</td><td>${funnel.validBooks}</td></tr>
        <tr><td>Synchronized books</td><td>${funnel.synchronizedBooks}</td></tr>
        <tr><td>Sized bid pairs</td><td>${funnel.sizedBidPairs}</td></tr>
        <tr><td>Positive edge</td><td>${funnel.positiveEdgeRecords}</td></tr>
        <tr><td>Gross pass</td><td>${funnel.grossPass}</td></tr>
        <tr><td>Fee pass</td><td>${funnel.feePass}</td></tr>
        <tr><td>Buffer pass</td><td>${funnel.bufferPass}</td></tr>
        <tr><td>Staleness pass</td><td>${funnel.stalenessPass}</td></tr>
        <tr><td>Persistent episodes</td><td>${funnel.persistentPass}</td></tr>
        <tr><td>Final candidates</td><td>${funnel.finalCandidates}</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Distance distributions</h2>
    <p><strong>Sign convention:</strong> ${escapeHtml(report.distanceSignConvention)}</p>
    <h3>Gross distance buckets</h3>
    <table><tbody>${renderCountRows(report.distanceDistributions.gross)}</tbody></table>
    <h3>Buffer-adjusted distance buckets</h3>
    <table><tbody>${renderCountRows(report.distanceDistributions.bufferAdjusted)}</tbody></table>
  </section>

  <section>
    <h2>First rejection gate</h2>
    <table><tbody>${renderCountRows(report.gateCounts.firstRejectionByGate)}</tbody></table>
  </section>

  <section>
    <h2>All rejection gates</h2>
    <table><tbody>${renderCountRows(report.gateCounts.allRejectionsByGate)}</tbody></table>
  </section>

  ${renderRankedTable("Closest gross near misses", report.nearMissRankings.gross)}
  ${renderRankedTable("Closest fee-adjusted near misses", report.nearMissRankings.feeAdjusted)}
  ${renderRankedTable("Closest buffer-adjusted near misses", report.nearMissRankings.bufferAdjusted)}

  <section>
    <h2>Per-market breakdown</h2>
    <table>
      <thead><tr><th>Market</th><th>Scanned</th><th>Gross pass</th><th>Buffer pass</th><th>Closest gross miss</th></tr></thead>
      <tbody>
        ${Object.entries(report.perMarketBreakdown)
          .map(
            ([market, stats]) => `<tr>
              <td>${escapeHtml(market)}</td>
              <td>${stats.recordsScanned}</td>
              <td>${stats.grossPass}</td>
              <td>${stats.bufferPass}</td>
              <td>${stats.closestGrossNearMissCents ?? "—"}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Time-remaining breakdown</h2>
    <table><tbody>${renderCountRows(report.timeRemainingBreakdown)}</tbody></table>
  </section>

  <section class="guardrail">
    <h2>Interpretation guardrails</h2>
    <ul>
      <li>Near-miss distance measures shortfall below frozen bid-only parity thresholds; it is not an optimization target.</li>
      <li>Lifecycle episodes are diagnostic windows, not trade candidates.</li>
      <li>Aggregate parity scans across multiple runs are intentionally excluded from this selected-run report.</li>
      <li>Rule configuration hash: <code>${escapeHtml(report.ruleConfigurationHash)}</code></li>
    </ul>
    ${report.warnings.length > 0 ? `<p><strong>Warnings:</strong> ${escapeHtml(report.warnings.join(" "))}</p>` : ""}
  </section>
</body>
</html>`;
}
