import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import type {
  CostAwareAtlasReport,
  CostAwareAtlasWarning,
  CostAwareBucketEntry,
  CostAwareGrossEdgeDisappearanceEntry,
  CostAwareAtlasRankingEntry,
} from "./costAwareAtlasTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatNullableNumber(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function formatPercentShare(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function renderStyles(): string {
  return `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: ${theme.pageBg};
      color: ${theme.text};
      line-height: 1.5;
    }
    main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px 16px 48px;
      display: grid;
      gap: 20px;
    }
    h1, h2, h3 { margin: 0 0 8px; }
    p { margin: 0 0 12px; }
    .muted { color: ${theme.textMuted}; }
    .panel {
      background: ${theme.panelBg};
      border: 1px solid ${theme.panelBorder};
      border-radius: 12px;
      padding: 20px;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat {
      background: ${theme.panelInset};
      border-radius: 8px;
      padding: 12px;
    }
    .stat .label {
      color: ${theme.textMuted};
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat .value { font-size: 20px; font-weight: 600; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    .positive { color: ${theme.bullish}; }
    .negative { color: ${theme.bearish}; }
    .warning { color: ${theme.warning}; }
  `;
}

function renderRankingTable(
  title: string,
  entries: readonly CostAwareAtlasRankingEntry[],
  valueLabel: string,
): string {
  if (entries.length === 0) {
    return `
      <section class="panel">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">No ranked buckets available.</p>
      </section>
    `;
  }

  const rows = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.dimension)}</td>
          <td>${escapeHtml(entry.bucketLabel)}</td>
          <td>${formatNullableNumber(entry.valueCents, 3)}</td>
          <td>${escapeHtml(entry.tradeability)}</td>
          <td>${escapeHtml(entry.impliedSide)}</td>
          <td>${entry.observations}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Bucket</th>
            <th>${escapeHtml(valueLabel)}</th>
            <th>Tradeability</th>
            <th>Side</th>
            <th>N</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function renderDisappearanceTable(
  entries: readonly CostAwareGrossEdgeDisappearanceEntry[],
): string {
  if (entries.length === 0) {
    return `
      <section class="panel">
        <h2>Largest gross-edge disappearances after cost</h2>
        <p class="muted">No buckets where gross edge collapsed after spread and fees.</p>
      </section>
    `;
  }

  const rows = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.dimension)}</td>
          <td>${escapeHtml(entry.bucketLabel)}</td>
          <td>${formatNullableNumber(entry.grossExpectedValueCents, 3)}</td>
          <td>${formatNullableNumber(entry.feeAdjustedExpectedValueCents, 3)}</td>
          <td class="warning">${formatNullableNumber(entry.edgeLostCents, 3)}</td>
          <td>${entry.observations}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <section class="panel">
      <h2>Largest gross-edge disappearances after cost</h2>
      <table>
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Bucket</th>
            <th>Gross EV (¢)</th>
            <th>Fee-adj EV (¢)</th>
            <th>Edge lost (¢)</th>
            <th>N</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function renderWarnings(warnings: readonly CostAwareAtlasWarning[]): string {
  if (warnings.length === 0) {
    return `
      <section class="panel">
        <h2>Warnings</h2>
        <p class="muted">No fillability or underpowered bucket warnings.</p>
      </section>
    `;
  }

  const items = warnings
    .slice(0, 25)
    .map((warning) => `<li>${escapeHtml(warning.message)}</li>`)
    .join("");

  return `
    <section class="panel">
      <h2>Warnings</h2>
      <ul>${items}</ul>
      ${warnings.length > 25 ? `<p class="muted">Showing 25 of ${warnings.length} warnings.</p>` : ""}
    </section>
  `;
}

function renderBucketRow(bucket: CostAwareBucketEntry): string {
  const primary = bucket.primaryCohort;
  const feeClass =
    (primary.feeAdjustedExpectedValueCents ?? 0) > 0
      ? "positive"
      : (primary.feeAdjustedExpectedValueCents ?? 0) < 0
        ? "negative"
        : "";

  return `
    <tr>
      <td>${escapeHtml(bucket.dimension)}</td>
      <td>${escapeHtml(bucket.bucketLabel)}</td>
      <td>${primary.observations}</td>
      <td>${formatNullableNumber(bucket.atlasCalibrationError, 4)}</td>
      <td>${formatNullableNumber(primary.grossExpectedValueCents, 3)}</td>
      <td class="${feeClass}">${formatNullableNumber(primary.feeAdjustedExpectedValueCents, 3)}</td>
      <td>${escapeHtml(primary.tradeability)}</td>
      <td>${escapeHtml(bucket.settlementSourceStatus)}</td>
    </tr>
  `;
}

export function serializeCostAwareAtlasHtml(report: CostAwareAtlasReport): string {
  const summary = report.summary;
  const tradeabilityRows = Object.entries(summary.tradeabilityCounts)
    .map(
      ([classification, count]) => `
        <div class="stat">
          <div class="label">${escapeHtml(classification)}</div>
          <div class="value">${count}</div>
        </div>
      `,
    )
    .join("");

  const bucketRows = [...report.buckets]
    .filter((bucket) => bucket.primaryCohort.observations > 0)
    .sort((left, right) => {
      const netCompare =
        (right.primaryCohort.feeAdjustedExpectedValueCents ?? Number.NEGATIVE_INFINITY)
        - (left.primaryCohort.feeAdjustedExpectedValueCents ?? Number.NEGATIVE_INFINITY);
      if (netCompare !== 0) {
        return netCompare;
      }

      return left.bucketId.localeCompare(right.bucketId);
    })
    .slice(0, 50)
    .map((bucket) => renderBucketRow(bucket))
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cost-Aware Fillability Atlas</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Cost-Aware Fillability Atlas</h1>
        <p class="muted">
          Re-grades mispricing atlas buckets with spread, fee, and fillability diagnostics.
          Generated ${escapeHtml(report.generatedAt)} from ${escapeHtml(report.inputRoot)}.
        </p>
        <p class="muted">
          <strong>Read-only diagnostic.</strong>
          Tradeability labels describe whether a bucket&apos;s gross calibration gap survives basic spread and taker-fee haircuts on the
          <code>validBidAsk</code> cohort. They do <em>not</em> imply a validated strategy, statistical power, or out-of-sample edge.
          Formal MDE/power analysis is deferred to later milestones.
        </p>
      </header>

      <section class="panel">
        <h2>Summary</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Buckets analyzed</div>
            <div class="value">${summary.totalBuckets}</div>
          </div>
          <div class="stat">
            <div class="label">Non-empty buckets</div>
            <div class="value">${summary.nonEmptyBuckets}</div>
          </div>
          <div class="stat">
            <div class="label">Tradeable positive</div>
            <div class="value positive">${summary.tradeablePositiveBuckets}</div>
          </div>
          <div class="stat">
            <div class="label">Gross only</div>
            <div class="value warning">${summary.grossOnlyBuckets}</div>
          </div>
          <div class="stat">
            <div class="label">Untradeable</div>
            <div class="value negative">${summary.untradeableBuckets}</div>
          </div>
          <div class="stat">
            <div class="label">Official settlement share</div>
            <div class="value">${formatPercentShare(summary.officialSettlementObservationShare)}</div>
          </div>
          <div class="stat">
            <div class="label">Derived settlement share</div>
            <div class="value">${formatPercentShare(summary.derivedSettlementObservationShare)}</div>
          </div>
        </div>
        <h3>Tradeability counts</h3>
        <div class="stat-grid">${tradeabilityRows}</div>
      </section>

      ${renderRankingTable("Top gross edges", report.rankings.topGrossEdges, "Gross EV (¢)")}
      ${renderRankingTable("Top net edges", report.rankings.topNetEdges, "Fee-adj EV (¢)")}
      ${renderDisappearanceTable(report.rankings.largestGrossEdgeDisappearances)}
      ${renderWarnings(report.warnings)}

      <section class="panel">
        <h2>Bucket diagnostics (top 50 by net edge)</h2>
        <table>
          <thead>
            <tr>
              <th>Dimension</th>
              <th>Bucket</th>
              <th>N</th>
              <th>Atlas gap</th>
              <th>Gross EV (¢)</th>
              <th>Fee-adj EV (¢)</th>
              <th>Tradeability</th>
              <th>Settlement</th>
            </tr>
          </thead>
          <tbody>${bucketRows}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}
