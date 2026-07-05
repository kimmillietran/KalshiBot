import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type { SingleMarketExpansionImportDebugReport } from "./singleMarketExpansionImportDebugTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatAvailability(report: SingleMarketExpansionImportDebugReport["listPayload"]): string {
  if (report.available) {
    return "available";
  }

  return report.unavailableReason ?? "unavailable";
}

function renderFieldList(values: readonly string[]): string {
  if (values.length === 0) {
    return "—";
  }

  return values.map((value) => `<code>${escapeHtml(value)}</code>`).join(", ");
}

/** Serializes the single-market expansion import debug report as standalone HTML. */
export function serializeSingleMarketExpansionImportDebugHtml(
  report: SingleMarketExpansionImportDebugReport,
): string {
  const artifactItems = report.debugArtifactPaths
    .map((path) => `<li><code>${escapeHtml(path)}</code></li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Single Market Expansion Import Debug</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Segoe UI, sans-serif; }
    body { margin: 0; background: ${theme.pageBg}; color: ${theme.text}; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
      overflow-x: auto;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid ${theme.panelBorder}; vertical-align: top; }
    th { color: ${theme.textMuted}; font-weight: 600; width: 220px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    ul { margin: 0; padding-left: 20px; }
  </style>
</head>
<body>
  <h1>Single Market Expansion Import Debug</h1>
  <p class="muted">Generated ${escapeHtml(report.generatedAt)} · ${report.durationMs} ms</p>

  <div class="panel">
    <h2>Market</h2>
    <table>
      <tbody>
        <tr><th>Ticker</th><td><code>${escapeHtml(report.marketTicker)}</code></td></tr>
        <tr><th>Series</th><td><code>${escapeHtml(report.seriesTicker)}</code></td></tr>
        <tr><th>Expansion job</th><td><code>${escapeHtml(report.jobId ?? "—")}</code></td></tr>
        <tr><th>Discovery pages fetched</th><td>${report.discoveryPagesFetched}</td></tr>
        <tr><th>Ticker found</th><td>${report.discoveryTrace.tickerFound ? "yes" : "no"}</td></tr>
        <tr><th>Found on page</th><td>${report.discoveryTrace.foundOnPage ?? "—"}</td></tr>
        <tr><th>Mode</th><td>${report.execute ? "execute" : "dry-run"}</td></tr>
        <tr><th>Import status</th><td>${escapeHtml(report.importStatus)}</td></tr>
        <tr><th>Unsupported historical market</th><td>${report.unsupportedHistoricalMarket ? "yes" : "no"}</td></tr>
        <tr><th>Failure reason</th><td>${escapeHtml(report.failureReason ?? "—")}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Payloads</h2>
    <table>
      <tbody>
        <tr>
          <th>List payload</th>
          <td>${escapeHtml(formatAvailability(report.listPayload))}</td>
        </tr>
        <tr>
          <th>List request</th>
          <td><code>${escapeHtml(report.listPayload.requestPath ?? "—")}</code></td>
        </tr>
        <tr>
          <th>List missing fields</th>
          <td>${renderFieldList(report.listPayload.missingRequiredFields)}</td>
        </tr>
        <tr>
          <th>Detail payload</th>
          <td>${escapeHtml(formatAvailability(report.detailPayload))}</td>
        </tr>
        <tr>
          <th>Detail request</th>
          <td><code>${escapeHtml(report.detailPayload.requestPath ?? "—")}</code></td>
        </tr>
        <tr>
          <th>Detail missing fields</th>
          <td>${renderFieldList(report.detailPayload.missingRequiredFields)}</td>
        </tr>
        <tr>
          <th>expiration_value source</th>
          <td>${escapeHtml(report.expirationValueSource)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Discovery payload trace</h2>
    <table>
      <tbody>
        <tr><th>Pages scanned</th><td>${report.discoveryTrace.pagesScanned}</td></tr>
        <tr><th>Raw record keys</th><td>${renderFieldList(report.discoveryTrace.rawDiscoveredMarketTopLevelKeys)}</td></tr>
        <tr><th>Raw expiration_value</th><td>${escapeHtml(report.discoveryTrace.rawDiscoveredMarketExpirationValue ?? "—")}</td></tr>
        <tr><th>Normalized expiration_value</th><td>${escapeHtml(report.discoveryTrace.normalizedMarketExpirationValue ?? "—")}</td></tr>
        <tr><th>List wire expiration_value</th><td>${escapeHtml(report.discoveryTrace.listMarketWireExpirationValue ?? "—")}</td></tr>
        <tr><th>Config metadata expiration_value</th><td>${escapeHtml(report.discoveryTrace.configMetadataExpirationValue ?? "—")}</td></tr>
        <tr><th>Reconciliation input expiration_value</th><td>${escapeHtml(report.discoveryTrace.reconciliationInputExpirationValue ?? "—")}</td></tr>
        <tr><th>Reconciliation output expiration_value</th><td>${escapeHtml(report.discoveryTrace.reconciliationOutputExpirationValue ?? "—")}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Reconciliation</h2>
    <table>
      <tbody>
        <tr><th>Success</th><td>${report.reconciliation.success ? "yes" : "no"}</td></tr>
        <tr><th>Merged fields</th><td>${renderFieldList(report.reconciliation.mergedFields)}</td></tr>
        <tr><th>Still missing</th><td>${renderFieldList(report.reconciliation.mergedMissingRequiredFields)}</td></tr>
        <tr><th>Detail missing</th><td>${renderFieldList(report.reconciliation.detailMissingRequiredFields)}</td></tr>
        <tr><th>List missing</th><td>${renderFieldList(report.reconciliation.listMissingRequiredFields)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>Artifacts</h2>
    <table>
      <tbody>
        <tr><th>Import config</th><td><code>${escapeHtml(report.configPath ?? "—")}</code></td></tr>
        <tr><th>Import result</th><td><code>${escapeHtml(report.importResultPath ?? "—")}</code></td></tr>
        <tr><th>JSON report</th><td><code>${escapeHtml(report.outputPath)}</code></td></tr>
        <tr><th>HTML report</th><td><code>${escapeHtml(report.htmlOutputPath)}</code></td></tr>
      </tbody>
    </table>
    <h2>Debug artifact paths</h2>
    ${
      artifactItems
        ? `<ul>${artifactItems}</ul>`
        : `<p class="muted">No debug artifacts written.</p>`
    }
  </div>
</body>
</html>`;
}
