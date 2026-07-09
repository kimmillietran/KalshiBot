import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { VendorOrderbookSufficiencyAuditReport } from "./vendorOrderbookSufficiencyAuditTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function verdictClass(verdict: string): string {
  if (verdict.includes("sufficient") && !verdict.includes("insufficient")) {
    return "positive";
  }

  if (verdict.includes("promising") || verdict.includes("request")) {
    return "warning";
  }

  return "negative";
}

function renderStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: ${theme.pageBg}; color: ${theme.text}; line-height: 1.5; }
    main { max-width: 1280px; margin: 0 auto; padding: 24px 16px 48px; display: grid; gap: 20px; }
    h1, h2, h3 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel { background: ${theme.panelBg}; border: 1px solid ${theme.panelBorder}; border-radius: 12px; padding: 20px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .stat { background: ${theme.panelInset}; border-radius: 8px; padding: 12px; }
    .stat .label { color: ${theme.textMuted}; font-size: 12px; text-transform: uppercase; }
    .stat .value { font-size: 20px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid ${theme.panelBorder}; padding: 8px 10px; text-align: left; vertical-align: top; }
    .positive { color: ${theme.bullish}; }
    .negative { color: ${theme.bearish}; }
    .warning { color: ${theme.warning}; }
    pre { white-space: pre-wrap; background: ${theme.panelInset}; border-radius: 8px; padding: 12px; font-size: 12px; }
    ul { margin: 0; padding-left: 20px; }
  `;
}

export function serializeVendorOrderbookSufficiencyAuditReport(
  report: VendorOrderbookSufficiencyAuditReport,
): string {
  return stableStringify(report);
}

export function serializeVendorOrderbookSufficiencyAuditHtml(
  report: VendorOrderbookSufficiencyAuditReport,
): string {
  const vendorRows = report.vendors
    .map(
      (vendor) => `
        <tr>
          <td>${escapeHtml(vendor.displayName)}</td>
          <td>${vendor.sampleAudit?.sampleStatus ?? "missing-samples"}</td>
          <td>${vendor.metadata.kxbtc15mCoverageStatus}</td>
          <td>${vendor.metadata.kxbtcdCoverageStatus}</td>
          <td>${escapeHtml(vendor.sufficiency.kxbtc15mLeadLag)}</td>
          <td>${escapeHtml(vendor.sufficiency.kxbtc15mParity)}</td>
          <td>${escapeHtml(vendor.sufficiency.kxbtc15mLadder)}</td>
          <td>${escapeHtml(vendor.sufficiency.kxbtcdLadder)}</td>
          <td>${escapeHtml(vendor.recommendation)}</td>
        </tr>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Vendor Orderbook Sufficiency Audit (M12.1A)</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Vendor Orderbook Sufficiency Audit (M12.1A)</h1>
        <p class="muted">${escapeHtml(report.disclaimer)}</p>
        <p class="negative"><strong>Do not treat marketing claims as sufficient. Vendor data must be sample-proven. KXBTC15M ladder research remains blocked unless sample proves multiple strikes per event. Vendor backfill importer should not be built until this audit promotes a source.</strong></p>
      </section>

      <section class="panel">
        <h2>Executive Verdict</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Overall Verdict</div>
            <div class="value ${verdictClass(report.summary.overallVerdict)}">${escapeHtml(report.summary.overallVerdict)}</div>
          </div>
          <div class="stat">
            <div class="label">Recommended Next Action</div>
            <div class="value">${escapeHtml(report.summary.recommendedNextAction)}</div>
          </div>
          <div class="stat">
            <div class="label">Vendors</div>
            <div class="value">${report.summary.vendorCount}</div>
          </div>
          <div class="stat">
            <div class="label">With Samples</div>
            <div class="value">${report.summary.vendorsWithSamples}</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Vendor-by-Vendor Table</h2>
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Sample Status</th>
              <th>KXBTC15M</th>
              <th>KXBTCD</th>
              <th>Lead-Lag</th>
              <th>Parity</th>
              <th>KXBTC15M Ladder</th>
              <th>KXBTCD Ladder</th>
              <th>Recommendation</th>
            </tr>
          </thead>
          <tbody>${vendorRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Sample Availability</h2>
        <p>Vendors with verified KXBTC15M samples: <strong>${report.summary.vendorsWithKxbtc15mVerified}</strong></p>
        <p>Vendors with verified KXBTCD samples: <strong>${report.summary.vendorsWithKxbtcdVerified}</strong></p>
      </section>

      <section class="panel">
        <h2>KXBTC15M Lead-Lag Sufficiency</h2>
        <p>Requires KXBTC15M coverage, sub-minute snapshots, executable bid/ask, sizes, and non-zero spreads.</p>
      </section>

      <section class="panel">
        <h2>KXBTC15M Parity Sufficiency</h2>
        <p>Requires real YES/NO book state with prices, quantities, and timestamps. Close-only or zero-spread-only samples are insufficient.</p>
      </section>

      <section class="panel">
        <h2>KXBTC15M Ladder (Product Blocked)</h2>
        <p class="negative">M12.0 proved one strike per event in historical KXBTC15M. Ladder research stays blocked unless vendor sample contradicts with multi-strike events.</p>
      </section>

      <section class="panel">
        <h2>KXBTCD Ladder Opportunity</h2>
        <p>Potentially sufficient if sample proves multiple strikes per event, co-timestamped quotes, floor_strike metadata, and real bid/ask depth.</p>
      </section>

      <section class="panel">
        <h2>Unknowns and Blockers</h2>
        <ul>${report.vendors.flatMap((vendor) => vendor.blockers.map((blocker) => `<li><strong>${escapeHtml(vendor.displayName)}:</strong> ${escapeHtml(blocker)}</li>`)).join("")}</ul>
      </section>

      <section class="panel">
        <h2>Vendor Sample Request Template</h2>
        <p><strong>Subject:</strong> ${escapeHtml(report.vendorSampleRequest.subject)}</p>
        <pre>${escapeHtml(report.vendorSampleRequest.body)}</pre>
      </section>

      <section class="panel">
        <h2>Recommended Next Milestone</h2>
        <p>${escapeHtml(report.summary.recommendedNextAction)}</p>
      </section>

      <section class="panel">
        <h2>Warnings</h2>
        <ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
      </section>

      <section class="panel">
        <h2>Caveats</h2>
        <ul>${report.caveats.map((caveat) => `<li>${escapeHtml(caveat)}</li>`).join("")}</ul>
      </section>
    </main>
  </body>
</html>`;
}
