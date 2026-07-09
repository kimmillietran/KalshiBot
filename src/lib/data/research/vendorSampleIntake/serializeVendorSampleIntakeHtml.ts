import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { VendorSampleIntakeReport } from "./vendorSampleIntakeTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderVendorRows(report: VendorSampleIntakeReport): string {
  return report.vendors
    .map(
      (vendor) => `
      <tr>
        <td>${escapeHtml(vendor.vendorId)}</td>
        <td>${escapeHtml(vendor.status)}</td>
        <td>${vendor.files.length}</td>
        <td>${vendor.previewRecords.length}</td>
        <td>${vendor.fieldAvailability?.hasMarketTicker ? "yes" : "no"}</td>
        <td>${vendor.fieldAvailability?.hasTimestamp ? "yes" : "no"}</td>
      </tr>`,
    )
    .join("");
}

/** Serializes vendor sample intake report as standalone HTML. */
export function serializeVendorSampleIntakeHtml(report: VendorSampleIntakeReport): string {
  const nextSteps = report.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  const warnings = report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  const reAuditNotes = report.reAuditReadiness.notes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vendor Sample Intake</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 16px; margin-top: 16px; overflow-x: auto; }
    .verdict { font-size: 24px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px; text-align: left; }
    th { color: ${theme.textMuted}; }
    ul { line-height: 1.6; }
  </style>
</head>
<body>
  <header>
    <h1>Vendor sample intake</h1>
    <p class="muted">Generated ${escapeHtml(report.generatedAt)} · ${escapeHtml(report.samplesRoot)}</p>
  </header>

  <section class="panel">
    <h2>Executive verdict</h2>
    <div class="verdict">${escapeHtml(report.summary.overallVerdict)}</div>
    <p class="muted">Recommended action: ${escapeHtml(report.summary.recommendedAction)}</p>
    <p class="muted">Files detected: ${report.summary.totalFilesDetected} · Preview records: ${report.summary.totalPreviewRecords}</p>
  </section>

  <section class="panel">
    <h2>Vendor folders</h2>
    <table>
      <thead>
        <tr><th>Vendor</th><th>Status</th><th>Files</th><th>Preview</th><th>Market</th><th>Timestamp</th></tr>
      </thead>
      <tbody>${renderVendorRows(report)}</tbody>
    </table>
  </section>

  <section class="panel">
    <h2>M12.1A re-audit readiness</h2>
    <p>Can run M12.1A: ${report.reAuditReadiness.canRunM12_1A ? "yes" : "no"}</p>
    <p class="muted">M12.1A verdict: ${escapeHtml(report.reAuditReadiness.m12_1AOverallVerdict ?? "n/a")}</p>
    <p class="muted">Vendors with samples: ${report.reAuditReadiness.vendorsWithSamples}</p>
    <ul>${reAuditNotes}</ul>
  </section>

  <section class="panel">
    <h2>Next steps</h2>
    <ul>${nextSteps}</ul>
  </section>

  <section class="panel">
    <h2>Warnings</h2>
    <ul>${warnings || "<li>None</li>"}</ul>
  </section>
</body>
</html>`;
}
