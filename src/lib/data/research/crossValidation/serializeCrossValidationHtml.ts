import { researchReportTheme as theme } from "@/lib/data/research/reports/reportTheme";

import { CROSS_VALIDATION_METHOD_IDS } from "./crossValidationTypes";
import type {
  CrossValidationEntry,
  CrossValidationMethodId,
  CrossValidationReport,
} from "./crossValidationTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatMethodLabel(method: CrossValidationMethodId): string {
  switch (method) {
    case "rollingWindow":
      return "Rolling window";
    case "expandingWindow":
      return "Expanding window";
    case "leaveOneMonthOut":
      return "Leave-one-month-out";
    case "leaveOneRegimeOut":
      return "Leave-one-regime-out";
    case "randomBootstrap":
      return "Random bootstrap";
  }
}

function formatNumber(value: number | null, digits = 4): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return value.toFixed(digits);
}

function renderMethodTable(entry: CrossValidationEntry): string {
  const rows = CROSS_VALIDATION_METHOD_IDS.map((methodId) => {
    const method = entry.methods[methodId];
    const passClass = method.passes ? "pass" : "fail";

    return `
      <tr>
        <td>${escapeHtml(formatMethodLabel(methodId))}</td>
        <td>${formatNumber(method.calibrationError)}</td>
        <td>${formatNumber(method.variance)}</td>
        <td>${method.observationCount}</td>
        <td>${formatNumber(method.stabilityMetrics.errorStdDev)}</td>
        <td>${formatNumber(method.stabilityMetrics.persistenceRate, 2)}</td>
        <td class="${passClass}">${method.passes ? "PASS" : "FAIL"}</td>
      </tr>
    `;
  }).join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Calibration error</th>
          <th>Variance</th>
          <th>Observations</th>
          <th>Std dev</th>
          <th>Persistence</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderEntryCard(entry: CrossValidationEntry): string {
  const passClass = entry.overallPasses ? "pass" : "fail";
  const validationRef = entry.hypothesisValidationReference;

  return `
    <section class="panel">
      <h2>${escapeHtml(entry.targetId)}</h2>
      <p class="muted">
        ${escapeHtml(entry.targetType)} · hypothesis ${escapeHtml(entry.hypothesisId)}
        ${entry.strategyFamily ? ` · ${escapeHtml(entry.strategyFamily)}` : ""}
      </p>
      <div class="stat-grid">
        <div class="stat">
          <div class="label">Overall</div>
          <div class="value ${passClass}">${entry.overallPasses ? "PASS" : "FAIL"}</div>
        </div>
        <div class="stat">
          <div class="label">Observations</div>
          <div class="value">${entry.observationCount}</div>
        </div>
        <div class="stat">
          <div class="label">Direction</div>
          <div class="value">${entry.direction ?? "—"}</div>
        </div>
        ${
          validationRef
            ? `
        <div class="stat">
          <div class="label">Hypothesis validation</div>
          <div class="value">${validationRef.robustnessScore} (${validationRef.passes ? "pass" : "fail"})</div>
        </div>`
            : ""
        }
      </div>
      ${renderMethodTable(entry)}
    </section>
  `;
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
      max-width: 1180px;
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
    .stat .value {
      font-size: 22px;
      font-weight: 700;
      margin-top: 4px;
    }
    .pass { color: ${theme.bullish}; }
    .fail { color: ${theme.bearish}; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid ${theme.panelBorder};
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    th { color: ${theme.textMuted}; font-weight: 600; }
  `;
}

export function serializeCrossValidationHtml(report: CrossValidationReport): string {
  const methodSummary = CROSS_VALIDATION_METHOD_IDS.map((methodId) => {
    const rate = report.summary.methodPassRates[methodId];
    return `
      <div class="stat">
        <div class="label">${escapeHtml(formatMethodLabel(methodId))}</div>
        <div class="value">${(rate * 100).toFixed(0)}%</div>
      </div>
    `;
  }).join("");

  const entryCards = report.entries.map(renderEntryCard).join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Research Cross-Validation</title>
    <style>${renderStyles()}</style>
  </head>
  <body>
    <main>
      <header class="panel">
        <h1>Research Cross-Validation</h1>
        <p class="muted">Generated ${escapeHtml(report.generatedAt)}</p>
        <p class="muted">
          Read-only diagnostics across rolling, expanding, leave-one-month-out,
          leave-one-regime-out, and bootstrap validation methods.
        </p>
      </header>

      <section class="panel">
        <h2>Summary</h2>
        <div class="stat-grid">
          <div class="stat">
            <div class="label">Total targets</div>
            <div class="value">${report.summary.totalTargets}</div>
          </div>
          <div class="stat">
            <div class="label">Hypotheses</div>
            <div class="value">${report.summary.hypothesisCount}</div>
          </div>
          <div class="stat">
            <div class="label">Synthesized strategies</div>
            <div class="value">${report.summary.synthesizedStrategyCount}</div>
          </div>
          <div class="stat">
            <div class="label">Passing all methods</div>
            <div class="value pass">${report.summary.passingCount}</div>
          </div>
          <div class="stat">
            <div class="label">Failing</div>
            <div class="value fail">${report.summary.failingCount}</div>
          </div>
        </div>
        <h3>Method pass rates</h3>
        <div class="stat-grid">${methodSummary}</div>
      </section>

      ${entryCards || `<section class="panel"><p class="muted">No cross-validation targets found.</p></section>`}
    </main>
  </body>
</html>`;
}
