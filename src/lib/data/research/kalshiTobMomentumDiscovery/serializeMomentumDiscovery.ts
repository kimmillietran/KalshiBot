import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { MomentumGovernedDiscoveryReport } from "./momentumDiscoveryTypes";

export function serializeMomentumDiscoveryJson(
  report: MomentumGovernedDiscoveryReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeMomentumDiscoveryHtml(
  report: MomentumGovernedDiscoveryReport,
): string {
  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const rows = report.perCandidateResults
    .map(
      (cell) =>
        `<tr><td>${escape(cell.candidateId)}</td><td>${cell.effectiveSampleSize}</td>`
        + `<td>${cell.signedExecutableMedianCents ?? "null"}</td>`
        + `<td>${String(cell.directionConsistentWithFamily)}</td>`
        + `<td>${String(cell.shortlisted)}</td></tr>`,
    )
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>M14.0b momentum TRAIN discovery</title></head>
<body>
<h1>M14.0b TRAIN-only momentum discovery</h1>
<p>${escape(report.disclaimer)}</p>
<p>discoveryIdentity: ${escape(report.discoveryIdentity)}</p>
<p>status: ${escape(report.discoveryStatus)} → ${escape(report.recommendedNextAction)}</p>
<p>validationAccess: ${String(report.quarantine.validationAccess)}</p>
<p>shortlist: ${report.shortlist.map((c) => escape(c.candidateId)).join(", ") || "(none)"}</p>
<table><thead><tr><th>candidate</th><th>ESS</th><th>medianExec</th><th>dirOK</th><th>shortlisted</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>
`;
}
