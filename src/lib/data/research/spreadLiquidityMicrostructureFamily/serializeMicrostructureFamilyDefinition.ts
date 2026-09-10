import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { MicrostructureFamilyDefinitionReport } from "./microstructureFamilyTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeMicrostructureFamilyDefinitionJson(
  report: MicrostructureFamilyDefinitionReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeMicrostructureFamilyDefinitionHtml(
  report: MicrostructureFamilyDefinitionReport,
): string {
  const rows = report.searchUniverse.hypotheses
    .map(
      (cell) =>
        `<tr><td>${escapeHtml(cell.hypothesisId)}</td>`
        + `<td>${cell.imbalanceThresholdAbs}</td>`
        + `<td>${cell.responseHorizonMs}</td>`
        + `<td>${escapeHtml(cell.timeRemainingBin)}</td>`
        + `<td>${escapeHtml(cell.directionConvention)}</td></tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>M13.0a TOB imbalance microstructure family definition</title>
</head>
<body>
  <h1>Spread / liquidity microstructure family definition</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <p><strong>Identity:</strong> ${escapeHtml(report.familyDefinitionIdentityHash)}</p>
  <p><strong>Family:</strong> ${escapeHtml(report.familyId)} / ${escapeHtml(report.subfamilyId)}</p>
  <p><strong>Imbalance:</strong> ${escapeHtml(report.imbalanceFormula.formula)}</p>
  <p><strong>Direction:</strong> ${escapeHtml(report.directionConvention.convention)}</p>
  <p><strong>Response match:</strong> ${report.responseMatchContract.responseMatchToleranceMs}ms
    (${escapeHtml(report.responseMatchContract.timestampPolicy)})</p>
  <p><strong>Hypothesis count:</strong> ${report.searchUniverse.hypothesisCount}</p>
  <table>
    <thead>
      <tr>
        <th>hypothesisId</th>
        <th>|imb|</th>
        <th>horizonMs</th>
        <th>timeRemaining</th>
        <th>direction</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <h2>Quarantine</h2>
  <pre>${escapeHtml(stableStringify(report.quarantine))}</pre>
  <h2>Explicit exclusions</h2>
  <ul>
    ${report.explicitExclusions.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n    ")}
  </ul>
</body>
</html>
`;
}
