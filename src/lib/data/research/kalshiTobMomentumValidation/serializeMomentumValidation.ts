import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { MomentumValidationReport } from "./momentumValidationTypes";

export function serializeMomentumValidationReport(
  report: MomentumValidationReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeMomentumValidationJson(
  report: MomentumValidationReport,
): string {
  return serializeMomentumValidationReport(report);
}

export function serializeMomentumValidationHtml(
  report: MomentumValidationReport,
): string {
  const evalRow = report.candidateEvaluation
    ? `<tr>
        <td><code>${report.candidateEvaluation.candidateId}</code></td>
        <td>${report.candidateEvaluation.status}</td>
        <td>${report.candidateEvaluation.directionalConsistency}</td>
        <td>${report.outcomeMetrics?.independentValidationEss ?? "n/a"}</td>
        <td>${report.outcomeMetrics?.signedExecutableMedianCents ?? "n/a"}</td>
        <td>${report.outcomeMetrics?.signedExecutableMeanCents ?? "n/a"}</td>
        <td>${report.outcomeMetrics?.executableObservabilityShare ?? "n/a"}</td>
      </tr>`
    : `<tr><td colspan="7">Outcomes not opened (${report.overallStatus})</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>M14.0c Momentum Validation</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; }
    code { font-size: 0.85em; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
  </style>
</head>
<body>
  <h1>M14.0c Momentum Validation</h1>
  <p>${report.disclaimer}</p>
  <p><strong>Overall:</strong> ${report.overallStatus}</p>
  <p><strong>Next action:</strong> ${report.nextAction}</p>
  <p><strong>Outcomes opened:</strong> ${report.outcomesOpened}</p>
  <p><strong>Validation identity:</strong> <code>${report.validationIdentityHash}</code></p>
  <p><strong>Discovery:</strong> <code>${report.discoveryIdentity}</code></p>
  <p><strong>Plan:</strong> <code>${report.planIdentity}</code></p>
  <p><strong>Locked candidate:</strong> <code>${report.lockedCandidateId}</code></p>
  <p><strong>Cohort ESS:</strong> ${report.cumulativeBlindEss} (min ${report.minEssForValidation})</p>
  <p><strong>Holdout lock eligibility:</strong> ${
    report.holdoutLockEligibility
      ? `<code>${report.holdoutLockEligibility.candidateId}</code> (holdout not opened)`
      : "none"
  }</p>
  <table>
    <thead>
      <tr>
        <th>Candidate</th><th>Status</th><th>Direction</th><th>ESS</th>
        <th>Median exec ¢</th><th>Mean exec ¢</th><th>Exec obs</th>
      </tr>
    </thead>
    <tbody>${evalRow}</tbody>
  </table>
</body>
</html>
`;
}
