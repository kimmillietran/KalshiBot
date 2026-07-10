import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { BidSizeCoverageAuditReport } from "./bidSizeCoverageAuditTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function serializeBidSizeCoverageAuditHtml(
  report: BidSizeCoverageAuditReport,
): string {
  const sampleRows = report.samples.length
    ? report.samples
        .map(
          (sample) => `
        <tr>
          <td><code>${escapeHtml(String(sample.sequence))}</code></td>
          <td>${sample.capturedYesBidCents ?? "—"} / ${sample.capturedYesBidSize ?? "—"}</td>
          <td>${sample.replayedYesBidCents ?? "—"} / ${sample.replayedYesBidSize ?? "—"}</td>
          <td>${sample.capturedNoBidCents ?? "—"} / ${sample.capturedNoBidSize ?? "—"}</td>
          <td>${sample.replayedNoBidCents ?? "—"} / ${sample.replayedNoBidSize ?? "—"}</td>
          <td>${escapeHtml(sample.classification)}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="muted">No comparison samples.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Bid Size Coverage Audit</title>
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
  <h1>Bid Size Coverage / Top-of-Book Depth Fidelity</h1>
  <p class="muted">${escapeHtml(report.disclaimer)}</p>
  <p class="muted">M12.8 compares raw Kalshi ladder sizes, replayed OrderbookCaptureBook state, and emitted top-of-book records. Missing bid sizes block M12.7 bid-only parity unless min(yesBidSize, noBidSize) &gt;= 1 contract.</p>

  <div class="panel">
    <div class="verdict">${escapeHtml(report.summary.sizeLossClassification)}</div>
    <p class="muted">Recommended next fix: ${escapeHtml(report.summary.recommendedNextFix)}</p>
    <p class="muted">Confidence: ${escapeHtml(report.summary.confidence)}</p>
    <div class="grid">
      <div class="metric"><strong>Messages scanned</strong><div>${report.summary.messagesScanned}</div></div>
      <div class="metric"><strong>Compared</strong><div>${report.summary.topOfBookRecordsCompared}</div></div>
      <div class="metric"><strong>Bid pair w/ size</strong><div>${report.summary.bidPairWithSizeCount}</div></div>
      <div class="metric"><strong>Bid pair w/o size</strong><div>${report.summary.bidPairWithoutSizeCount}</div></div>
      <div class="metric"><strong>TOB size coverage</strong><div>${report.comparison.bidSizeCoverageShare ?? "—"}</div></div>
      <div class="metric"><strong>Replay dust levels</strong><div>${report.replayState.dustLevelBestBidCount}</div></div>
    </div>
  </div>

  <div class="panel">
    <h2>Comparison samples</h2>
    <table>
      <thead>
        <tr><th>Seq</th><th>Cap YES bid/size</th><th>Replay YES</th><th>Cap NO bid/size</th><th>Replay NO</th><th>Class</th></tr>
      </thead>
      <tbody>${sampleRows}</tbody>
    </table>
  </div>
</body>
</html>`;
}
