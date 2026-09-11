import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { MomentumFamilyDefinitionReport } from "./momentumFamilyTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeMomentumFamilyDefinitionJson(
  report: MomentumFamilyDefinitionReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeMomentumFamilyDefinitionHtml(
  report: MomentumFamilyDefinitionReport,
): string {
  const rows = report.searchUniverse.hypotheses
    .map(
      (cell) =>
        `<tr><td>${escapeHtml(cell.hypothesisId)}</td>`
        + `<td>${cell.backwardWindowMs}</td>`
        + `<td>${cell.returnThresholdCents}</td>`
        + `<td>${cell.forwardHorizonMs}</td>`
        + `<td>${escapeHtml(cell.directionConvention)}</td></tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>M14.0a Kalshi-native momentum family definition</title>
</head>
<body>
  <h1>Kalshi own-price momentum family definition</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <p><strong>Identity:</strong> ${escapeHtml(report.familyDefinitionIdentityHash)}</p>
  <p><strong>Family:</strong> ${escapeHtml(report.familyId)} / ${escapeHtml(report.subfamilyId)}</p>
  <p><strong>Scientific label:</strong> ${escapeHtml(report.scientificLabel)}</p>
  <p><strong>Midpoint:</strong> ${escapeHtml(report.midpointFormula.formula)}</p>
  <p><strong>Direction:</strong> ${escapeHtml(report.directionConvention.convention)}</p>
  <p><strong>Hypothesis count:</strong> ${report.searchUniverse.hypothesisCount}</p>
  <table>
    <thead>
      <tr>
        <th>hypothesisId</th>
        <th>W ms</th>
        <th>X ¢</th>
        <th>H ms</th>
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
