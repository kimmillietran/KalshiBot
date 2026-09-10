import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { NextFamilyReadinessReport } from "./nextFamilyReadinessTypes";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeNextFamilyReadinessJson(
  report: NextFamilyReadinessReport,
): string {
  return `${stableStringify(report)}\n`;
}

export function serializeNextFamilyReadinessHtml(
  report: NextFamilyReadinessReport,
): string {
  const familyRows = report.familyReadiness
    .map((family) => {
      const dimList = family.dimensions
        .map(
          (dimension) =>
            `<li><code>${escapeHtml(dimension.dimension)}</code>: `
            + `${escapeHtml(dimension.status)} — ${escapeHtml(dimension.rationale)}</li>`,
        )
        .join("\n");
      return `<section>
  <h3>${escapeHtml(family.displayName)} (<code>${escapeHtml(family.familyId)}</code>)</h3>
  <p>overallStatus: ${escapeHtml(family.overallStatus)}</p>
  <p>maturity: ${escapeHtml(family.maturity)}</p>
  <p>independence: ${escapeHtml(family.independenceFromCalibrationFade)}</p>
  <p>multiplicity: ${escapeHtml(family.multiplicity.status)} — ${escapeHtml(family.multiplicity.note)}</p>
  <p>incidence (exploratoryOnly=${String(family.candidateIncidence.exploratoryOnly)}, `
    + `confirmatoryReuseForbidden=${String(family.candidateIncidence.confirmatoryReuseForbidden)}): `
    + `${escapeHtml(family.candidateIncidence.status)} — ${escapeHtml(family.candidateIncidence.note)}</p>
  <p>exploratoryHistoricalReturnProxy (ignored by selection): `
    + `${family.exploratoryHistoricalReturnProxy ?? "null"}</p>
  <ul>
${dimList}
  </ul>
</section>`;
    })
    .join("\n");

  const exploratory = report.exploratoryDataIdentities
    .map(
      (identity) =>
        `<li><code>${escapeHtml(identity.runId)}</code> role=${escapeHtml(identity.role)} `
        + `verdict=${escapeHtml(identity.captureHealthVerdict ?? "null")} `
        + `hours=${identity.durationHours ?? "null"} `
        + `fields=${escapeHtml(identity.fieldsObserved.join(", "))}</li>`,
    )
    .join("\n");

  const rationale = report.recommendationRationale
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");
  const blockers = report.blockingRequirements
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");
  const freeze = report.whatMustBeFrozenBeforeNewCapture
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");
  const governance = report.governancePipelineExpectations
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Next-family readiness audit</title>
</head>
<body>
  <h1>Next-family readiness and selection audit</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <h2>Identity</h2>
  <p>analysisVersion: ${escapeHtml(report.analysisVersion)}</p>
  <p>reportIdentityHash: ${escapeHtml(report.reportIdentityHash)}</p>
  <p>generatedAt: ${escapeHtml(report.generatedAt)}</p>
  <h2>Lead-lag lineage disposition</h2>
  <p>lineageDisposition: ${escapeHtml(report.lineageDisposition)}</p>
  <p>historicalVerdict: ${escapeHtml(report.historicalVerdict ?? "null")}</p>
  <p>prospectiveReplicationStatus: ${escapeHtml(report.prospectiveReplicationStatus)}</p>
  <p>prospectiveRequiredFreshEss: ${report.prospectiveRequiredFreshEss ?? "null"}</p>
  <p>candidateShoppingForbidden: ${String(report.candidateShoppingForbidden)}</p>
  <p>promotionForbidden: ${String(report.promotionForbidden)}</p>
  <p>freezeForbidden: ${String(report.freezeForbidden)}</p>
  <p>prospectiveCaptureStarted: ${String(report.prospectiveCaptureStarted)}</p>
  <p>completedLineage: ${escapeHtml(
    report.completedLineage ? report.completedLineage.lineageSummary : "null",
  )}</p>
  <h2>Selection</h2>
  <p>selectionStatus: ${escapeHtml(report.selectionStatus)}</p>
  <p>recommendedFamily: ${escapeHtml(report.recommendedFamily ?? "null")}</p>
  <p>recommendedNextAction: ${escapeHtml(report.recommendedNextAction)}</p>
  <p>confirmatoryReuseForbidden: ${String(report.confirmatoryReuseForbidden)}</p>
  <p>${escapeHtml(report.confirmatoryReuseWarning)}</p>
  <ul>
${rationale}
  </ul>
  <h2>Families evaluated</h2>
  <p>${escapeHtml(report.familiesEvaluated.join(", "))}</p>
${familyRows}
  <h2>Exploratory data identities</h2>
  <ul>
${exploratory || "<li>none supplied</li>"}
  </ul>
  <h2>Blocking requirements</h2>
  <ul>
${blockers}
  </ul>
  <h2>What must be frozen before new capture</h2>
  <ul>
${freeze}
  </ul>
  <h2>Governance pipeline expectations</h2>
  <ul>
${governance}
  </ul>
</body>
</html>
`;
}
