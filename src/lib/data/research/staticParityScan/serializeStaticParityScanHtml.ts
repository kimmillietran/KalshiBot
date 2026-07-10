import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { StaticParityScanReport } from "./staticParityScanTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }

  return value.toLocaleString("en-US");
}

function renderCandidateRows(report: StaticParityScanReport): string {
  if (report.candidateSamples.length === 0) {
    return `<tr><td colspan="9" class="muted">No candidate samples captured.</td></tr>`;
  }

  return report.candidateSamples
    .map(
      (sample) => `
      <tr>
        <td><code>${escapeHtml(sample.timestamp)}</code></td>
        <td><code>${escapeHtml(sample.marketTicker)}</code></td>
        <td>${sample.yesBidCents ?? "—"} / ${sample.noBidCents ?? "—"}</td>
        <td>${sample.bidSumCents ?? "—"}</td>
        <td>${sample.bidOnlyEdgeCents ?? sample.grossEdgeCents ?? "—"}</td>
        <td>${sample.estimatedNetEdgeCents ?? "—"}</td>
        <td>${sample.minBidSizeContracts ?? sample.availableSize ?? "—"}</td>
        <td>${escapeHtml(sample.classification)}</td>
        <td class="muted">${escapeHtml(sample.reason)}</td>
      </tr>`,
    )
    .join("");
}

function renderRunRows(report: StaticParityScanReport): string {
  if (report.runs.length === 0) {
    return `<tr><td colspan="5" class="muted">No runs scanned.</td></tr>`;
  }

  const isBidOnly = report.summary.pricingModel === "bid-only";

  return report.runs
    .map(
      (run) => `
      <tr>
        <td><code>${escapeHtml(run.runId)}</code></td>
        <td>${run.scanned ? "yes" : "no"}</td>
        <td>${escapeHtml(run.skipReason ?? "—")}</td>
        <td>${formatNumber(run.topOfBookRecordCount)}</td>
        <td>${
          isBidOnly
            ? `${run.bidOnlyGrossCandidateCount} / ${run.bidOnlyBufferAdjustedCandidateCount}`
            : `${run.grossCandidateCount} / ${run.bufferAdjustedCandidateCount}`
        }</td>
      </tr>`,
    )
    .join("");
}

export function serializeStaticParityScanHtml(
  report: StaticParityScanReport,
): string {
  const isBidOnly = report.summary.pricingModel === "bid-only";
  const modelLabel = isBidOnly ? "Bid-Only Parity Scan" : "Complement-Derived Parity Scan (legacy)";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${modelLabel}</title>
  <style>
    body { background: ${theme.pageBg}; color: ${theme.text}; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .muted { color: ${theme.textMuted}; }
    .verdict { color: ${theme.info}; font-size: 1.25rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: left; vertical-align: top; }
    code { color: ${theme.warning}; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
  </style>
</head>
<body>
  <h1>${modelLabel}</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>
  <p class="muted">Kalshi forward captures expose bid-only YES/NO ladders. M12.6 found no explicit asks. M12.7 uses bid-only parity diagnostics by default. <code>yesBid + noBid &gt; 100</code> is a bid-book imbalance, not guaranteed arbitrage. Executable confirmation is required before treating any candidate as actionable.</p>

  <div class="panel">
    <div class="verdict">${escapeHtml(report.summary.overallClassification)}</div>
    <p class="muted">Pricing model: <code>${escapeHtml(report.summary.pricingModel)}</code></p>
    <p class="muted">Recommended next action: ${escapeHtml(report.summary.recommendedNextAction)}</p>
    <div class="grid">
      <div class="metric"><strong>Runs scanned</strong><div>${report.metrics.runCountScanned}</div></div>
      <div class="metric"><strong>Runs skipped</strong><div>${report.metrics.runsSkipped}</div></div>
      <div class="metric"><strong>Records scanned</strong><div>${formatNumber(report.metrics.topOfBookRecordsScanned)}</div></div>
      <div class="metric"><strong>Gross candidates</strong><div>${formatNumber(isBidOnly ? report.metrics.bidOnlyGrossCandidateCount : report.metrics.grossParityCandidateCount)}</div></div>
      <div class="metric"><strong>Buffer-adjusted</strong><div>${formatNumber(isBidOnly ? report.metrics.bidOnlyBufferAdjustedCandidateCount : report.metrics.bufferAdjustedCandidateCount)}</div></div>
      <div class="metric"><strong>Executable confirmed</strong><div>${formatNumber(report.metrics.executableConfirmedCandidateCount)}</div></div>
      <div class="metric"><strong>Max edge</strong><div>${(isBidOnly ? report.metrics.maxBidOnlyEdgeCents : report.metrics.maxGrossEdgeCents) ?? "—"}¢</div></div>
    </div>
  </div>

  <div class="panel">
    <h2>Friction model</h2>
    <p class="muted">pricingModel=${report.friction.pricingModel}, feeBuffer=${report.friction.feeBufferCents}¢, minGrossEdge=${report.friction.minGrossEdgeCents}¢, minBidOnlyEdge=${report.friction.minBidOnlyEdgeCents}¢, minSize=${report.friction.minSizeContracts}, requireExecutableConfirmation=${report.friction.requireExecutableConfirmation}</p>
  </div>

  <div class="panel">
    <h2>Candidate samples</h2>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th><th>Market</th><th>YES/NO bid</th>
          <th>Bid sum</th><th>Edge</th><th>Net edge</th><th>Min size</th><th>Class</th><th>Reason</th>
        </tr>
      </thead>
      <tbody>${renderCandidateRows(report)}</tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Runs</h2>
    <table>
      <thead>
        <tr><th>Run</th><th>Scanned</th><th>Skip reason</th><th>Records</th><th>Gross / buffered</th></tr>
      </thead>
      <tbody>${renderRunRows(report)}</tbody>
    </table>
  </div>
</body>
</html>`;
}
