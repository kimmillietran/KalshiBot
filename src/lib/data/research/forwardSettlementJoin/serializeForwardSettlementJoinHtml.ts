import type { ForwardSettlementJoinReport } from "./forwardSettlementJoinTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatPercent(share: number | null): string {
  if (share === null) {
    return "n/a";
  }

  return `${(share * 100).toFixed(1)}%`;
}

export function serializeForwardSettlementJoinHtml(
  report: ForwardSettlementJoinReport,
): string {
  const marketRows = report.marketJoins
    .map(
      (join) => `
        <tr>
          <td><code>${escapeHtml(join.marketTicker)}</code></td>
          <td>${escapeHtml(join.settlementStatus)}</td>
          <td>${escapeHtml(join.settledOutcome)}</td>
          <td>${escapeHtml(join.settlementTime ?? "—")}</td>
          <td>${escapeHtml(join.joinConfidence)}</td>
          <td>${escapeHtml(join.sourceArtifact ?? "—")}</td>
        </tr>`,
    )
    .join("");

  const episodeRows = report.episodeJoins
    .slice(0, 50)
    .map(
      (join) => `
        <tr>
          <td><code>${escapeHtml(join.episodeId)}</code></td>
          <td><code>${escapeHtml(join.marketTicker)}</code></td>
          <td>${escapeHtml(join.episodeClassification)}</td>
          <td>${escapeHtml(join.settledOutcome)}</td>
          <td>${join.isOutcomeKnown ? "yes" : "no"}</td>
          <td>${join.timeFromEpisodeEndToSettlementMs ?? "—"}</td>
        </tr>`,
    )
    .join("");

  const warningList = report.summary.warnings.length
    ? `<ul>${report.summary.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "<p>None</p>";

  const missingMarkets = report.summary.missingSettlementMarkets.length
    ? `<ul>${report.summary.missingSettlementMarkets
      .slice(0, 100)
      .map((market) => `<li><code>${escapeHtml(market)}</code></li>`)
      .join("")}</ul>`
    : "<p>None</p>";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Forward Settlement Join</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
      h1, h2 { margin-bottom: 0.5rem; }
      .disclaimer, .caveat { background: #f6f8fa; border-left: 4px solid #0969da; padding: 0.75rem 1rem; margin: 1rem 0; }
      table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; }
      th, td { border: 1px solid #d0d7de; padding: 0.45rem 0.6rem; text-align: left; vertical-align: top; }
      th { background: #f6f8fa; }
      .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
      .metric { border: 1px solid #d0d7de; border-radius: 8px; padding: 0.75rem; }
      code { font-size: 0.9em; }
    </style>
  </head>
  <body>
    <h1>Forward Capture Settlement Outcome Join</h1>
    <p>Generated ${escapeHtml(report.generatedAt)}</p>

    <div class="disclaimer">
      <strong>Disclaimer:</strong> ${escapeHtml(report.disclaimer)}
    </div>

    <div class="metrics">
      <div class="metric"><strong>Verdict</strong><br />${escapeHtml(report.summary.overallVerdict)}</div>
      <div class="metric"><strong>Recommended next action</strong><br />${escapeHtml(report.summary.recommendedNextAction)}</div>
      <div class="metric"><strong>Captured markets</strong><br />${report.summary.capturedMarketCount}</div>
      <div class="metric"><strong>Settlement-known markets</strong><br />${report.summary.settlementKnownMarketCount} (${formatPercent(report.summary.settlementCoverageShare)})</div>
      <div class="metric"><strong>Candidate episodes</strong><br />${report.summary.candidateEpisodeCount}</div>
      <div class="metric"><strong>Settlement-known episodes</strong><br />${report.summary.settlementKnownEpisodeCount} (${formatPercent(report.summary.episodeSettlementCoverageShare)})</div>
    </div>

    <h2>Caveats</h2>
    <ul>${report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul>

    <h2>Input artifacts</h2>
    <ul>${report.summary.inputArtifactsUsed.map((artifact) => `<li><code>${escapeHtml(artifact)}</code></li>`).join("")}</ul>

    <h2>Missing artifacts</h2>
    <ul>${report.summary.missingArtifacts.length
      ? report.summary.missingArtifacts.map((artifact) => `<li><code>${escapeHtml(artifact)}</code></li>`).join("")
      : "<li>None</li>"}</ul>

    <h2>Warnings</h2>
    ${warningList}

    <h2>Missing settlement markets</h2>
    ${missingMarkets}

    <h2>Market joins</h2>
    <table>
      <thead>
        <tr>
          <th>Market</th>
          <th>Status</th>
          <th>Outcome</th>
          <th>Settlement time</th>
          <th>Confidence</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>${marketRows || "<tr><td colspan=\"6\">No captured markets</td></tr>"}</tbody>
    </table>

    <h2>Episode joins (first 50)</h2>
    <table>
      <thead>
        <tr>
          <th>Episode</th>
          <th>Market</th>
          <th>Classification</th>
          <th>Outcome</th>
          <th>Known</th>
          <th>Episode end → settlement (ms)</th>
        </tr>
      </thead>
      <tbody>${episodeRows || "<tr><td colspan=\"6\">No candidate episodes</td></tr>"}</tbody>
    </table>
  </body>
</html>`;
}
