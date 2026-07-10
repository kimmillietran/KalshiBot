import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { OrderbookSemanticsValidationReport } from "./orderbookSemanticsValidationTypes";

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

export function serializeOrderbookSemanticsValidationHtml(
  report: OrderbookSemanticsValidationReport,
): string {
  const summary = report.summary;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Orderbook Semantics Validation</title>
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
  <h1>Orderbook Semantics Validation (M12.6)</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>

  <div class="panel">
    <div class="verdict">${escapeHtml(summary.recommendedPricingModel)}</div>
    <p>${escapeHtml(summary.recommendedNextFix)} · confidence: ${escapeHtml(summary.confidence)}</p>
    <p class="muted">Root cause: ${escapeHtml(summary.rootCauseClassification)}</p>
    <p class="muted">Capture run: <code>${escapeHtml(summary.captureRunDir)}</code></p>
    <div class="grid">
      <div class="metric"><strong>Messages</strong><div>${summary.messagesScanned}</div></div>
      <div class="metric"><strong>Markets</strong><div>${summary.marketsAnalyzed}</div></div>
      <div class="metric"><strong>Bid ladders</strong><div>${summary.yesNoBidLaddersFound ? "yes" : "no"}</div></div>
      <div class="metric"><strong>Explicit asks</strong><div>${summary.explicitAskFieldsFound ? "yes" : "no"}</div></div>
      <div class="metric"><strong>Complement crossed</strong><div>${formatPercent(summary.crossedShareComplementModel)}</div></div>
      <div class="metric"><strong>Sync crossed</strong><div>${formatPercent(summary.crossedShareSynchronizedModel)}</div></div>
      <div class="metric"><strong>Fresh dual-side</strong><div>${summary.freshDualSideRecordCount}</div></div>
      <div class="metric"><strong>Fresh crossed</strong><div>${summary.freshDualSideCrossedCount}</div></div>
    </div>
  </div>

  <div class="panel">
    <h2>Raw Payload Semantics</h2>
    <p>Snapshot fields: ${escapeHtml(report.rawPayloadSemantics.snapshotFieldNames.join(", ") || "—")}</p>
    <p>Delta fields: ${escapeHtml(report.rawPayloadSemantics.deltaFieldNames.join(", ") || "—")}</p>
    <p>Sides: ${escapeHtml(report.rawPayloadSemantics.observedSideValues.join(", ") || "—")}</p>
    <ul>${report.rawPayloadSemantics.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </div>

  <div class="panel">
    <h2>Transform Model Comparison</h2>
    <table>
      <thead><tr><th>Model</th><th>Evaluated</th><th>Valid</th><th>Crossed</th><th>Parity-usable</th><th>Crossed share</th></tr></thead>
      <tbody>
        ${report.transformModels.map((model) => `
          <tr>
            <td><code>${escapeHtml(model.modelId)}</code></td>
            <td>${model.recordsEvaluated}</td>
            <td>${model.validRecords}</td>
            <td>${model.crossedRecords}</td>
            <td>${model.parityUsableRecords}</td>
            <td>${formatPercent(model.crossedShare)}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Complement Transform Check</h2>
    <p>yesBid+noBid&gt;100: ${report.complementTransform.yesBidPlusNoBidGreaterThan100Count} / ${report.complementTransform.recordsWithBothBids}</p>
    <p>Fresh dual-side crossed share: ${formatPercent(report.complementTransform.crossedWhenBothSidesFreshShare)}</p>
    <p>Median opposite-side gap: ${report.complementTransform.medianOppositeSideGapMs ?? "—"} ms</p>
    <p>${escapeHtml(report.microstructure.rationale)}</p>
  </div>

  <div class="panel">
    <h2>Evidence</h2>
    <h3>Codebase</h3>
    <ul>${report.evidence.codebaseEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h3>Schema</h3>
    <ul>${report.evidence.localSchemaEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h3>Observed payloads</h3>
    <ul>${report.evidence.observedPayloadEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </div>

  <div class="panel">
    <h2>Warnings / Caveats</h2>
    <ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
    <ul>${report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul>
  </div>
</body>
</html>`;
}
