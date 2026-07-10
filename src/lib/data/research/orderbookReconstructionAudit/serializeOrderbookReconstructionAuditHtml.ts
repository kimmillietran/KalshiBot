import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { OrderbookReconstructionAuditReport } from "./orderbookReconstructionAuditTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return `${Math.round(value * 1000) / 10}%`;
}

export function serializeOrderbookReconstructionAuditHtml(
  report: OrderbookReconstructionAuditReport,
): string {
  const summary = report.summary;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Orderbook Reconstruction Audit</title>
  <style>
    body { background: ${theme.pageBg}; color: ${theme.text}; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .muted { color: ${theme.textMuted}; }
    .verdict { color: ${theme.warning}; font-size: 1.25rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: left; vertical-align: top; }
    code { color: ${theme.info}; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .metric { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
    ul { margin: 0; padding-left: 20px; }
  </style>
</head>
<body>
  <h1>Orderbook Reconstruction Audit (M12.5)</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>

  <div class="panel">
    <div class="verdict">${escapeHtml(summary.rootCauseClassification)}</div>
    <p>${escapeHtml(summary.recommendedNextFix)}</p>
    <p class="muted">Capture run: <code>${escapeHtml(summary.captureRunDir)}</code></p>
    <div class="grid">
      <div class="metric"><strong>Messages scanned</strong><div>${summary.messagesScanned}</div></div>
      <div class="metric"><strong>Compared TOB</strong><div>${summary.topOfBookRecordsCompared}</div></div>
      <div class="metric"><strong>Matched replay</strong><div>${summary.matchedTopOfBookRecords}</div></div>
      <div class="metric"><strong>Mismatched</strong><div>${summary.mismatchedTopOfBookRecords}</div></div>
      <div class="metric"><strong>Crossed explained</strong><div>${summary.crossedRecordsExplained}</div></div>
      <div class="metric"><strong>Crossed share</strong><div>${formatPercent(report.oppositeSideAskDerivation.crossedShare)}</div></div>
    </div>
  </div>

  <div class="panel">
    <h2>Raw Message Inventory</h2>
    <p>Snapshots: ${report.rawMessageInventory.snapshotCount} | Deltas: ${report.rawMessageInventory.deltaCount}</p>
    <p class="muted">Types: ${escapeHtml(JSON.stringify(report.rawMessageInventory.messageTypeCounts))}</p>
    <p class="muted">Snapshot fields: ${escapeHtml(report.rawMessageInventory.snapshotFieldsPresent.join(", ") || "—")}</p>
    <p class="muted">Delta fields: ${escapeHtml(report.rawMessageInventory.deltaFieldsPresent.join(", ") || "—")}</p>
  </div>

  <div class="panel">
    <h2>Semantics</h2>
    <p><strong>Snapshot:</strong> ${escapeHtml(report.snapshotSemantics.evidence.join(" "))}</p>
    <p><strong>Delta:</strong> preferred=${escapeHtml(report.deltaSemantics.preferredSemantics)}; relative matches=${report.deltaSemantics.relativeReplayMatchesSnapshots}; absolute matches=${report.deltaSemantics.absoluteReplayMatchesSnapshots}</p>
    <p><strong>Opposite-side asks:</strong> ${escapeHtml(report.oppositeSideAskDerivation.evidence.join(" "))}</p>
    <p><strong>Staleness:</strong> ${escapeHtml(report.staleness.evidence.join(" ") || "No staleness pattern detected.")}</p>
  </div>

  <div class="panel">
    <h2>Market Findings</h2>
    <table>
      <thead><tr><th>Market</th><th>TOB</th><th>Economic valid</th><th>Crossed</th><th>Issue</th></tr></thead>
      <tbody>
        ${report.marketFindings.map((market) => `
          <tr>
            <td><code>${escapeHtml(market.marketTicker)}</code></td>
            <td>${market.topOfBookEmittedCount}</td>
            <td>${market.economicallyValidCount}</td>
            <td>${market.crossedCount}</td>
            <td>${escapeHtml(market.candidateReconstructionIssue)}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Replay Comparison Samples</h2>
    <table>
      <thead><tr><th>Seq</th><th>Market</th><th>Captured</th><th>Replayed</th><th>Mismatch</th></tr></thead>
      <tbody>
        ${report.comparisonSamples.map((sample) => `
          <tr>
            <td>${sample.sequence ?? "—"}</td>
            <td><code>${escapeHtml(sample.marketTicker)}</code></td>
            <td>${sample.capturedYesBid ?? "—"}/${sample.capturedYesAsk ?? "—"} | ${sample.capturedNoBid ?? "—"}/${sample.capturedNoAsk ?? "—"}</td>
            <td>${sample.replayedYesBid ?? "—"}/${sample.replayedYesAsk ?? "—"} | ${sample.replayedNoBid ?? "—"}/${sample.replayedNoAsk ?? "—"}</td>
            <td>${sample.mismatch ? escapeHtml(sample.mismatchReason ?? "yes") : "no"}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Warnings</h2>
    <ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
    <h2>Caveats</h2>
    <ul>${report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul>
  </div>
</body>
</html>`;
}
