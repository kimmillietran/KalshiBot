import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { LeadLagHoldoutReport } from "./leadLagHoldoutTypes";

export function serializeLeadLagHoldoutReport(report: LeadLagHoldoutReport): string {
  return `${stableStringify(report)}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeLeadLagHoldoutHtml(report: LeadLagHoldoutReport): string {
  const m = report.candidateMetrics;
  const p = report.power;
  const q = report.captureQuality;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>M12.8c Lead-Lag Holdout</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; }
    code { font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>M12.8c Lead-Lag Holdout</h1>
  <p>${escapeHtml(report.disclaimer)}</p>
  <p><strong>Verdict:</strong> ${escapeHtml(report.holdoutStatisticalVerdict)}</p>
  <p><strong>Overall:</strong> ${escapeHtml(report.holdoutOverallStatus)}</p>
  <p><strong>Next action:</strong> ${escapeHtml(report.recommendedNextAction)}</p>
  <h2>Identities</h2>
  <p>discovery: <code>${escapeHtml(report.discoveryIdentity)}</code></p>
  <p>validation: <code>${escapeHtml(report.validationIdentity)}</code></p>
  <p>evidenceContract: <code>${escapeHtml(report.evidenceContractIdentity)}</code></p>
  <p>holdoutIdentity: <code>${escapeHtml(report.holdoutIdentityHash)}</code></p>
  <p>lineage: ${escapeHtml(report.lineage.lineageSummary)}</p>
  <h2>Locked candidate</h2>
  <p><code>${escapeHtml(report.lockedCandidateId)}</code></p>
  <h2>Capture quality</h2>
  <p>verdict=${escapeHtml(q.captureHealthVerdict ?? "null")} hours=${q.durationHours ?? "null"}
  records=${q.recordsScanned} validBook=${q.validBookShare ?? "null"}
  btcJoin=${q.btcJoinCoverageShare ?? "null"} passed=${String(q.qualityPassed)}</p>
  <h2>Sample</h2>
  <p>rawEligible=${m.rawEligibleEventCount} markets=${m.independentMarketCount}
  marketDays=${m.independentMarketDayCount} triggers=${m.uniqueBtcTriggerCount}
  ESS=${m.effectiveSampleSize}</p>
  <h2>Effects</h2>
  <p>midpoint=${m.holdoutEffectCents ?? "null"} executableAsk=${m.executableAskEffectCents ?? "null"}
  execObs=${m.executableObservabilityShare ?? "null"} satisfied=${String(m.executionObservabilitySatisfied)}</p>
  <h2>Power</h2>
  <p>alpha=${p.alpha} power=${p.targetPower} MDE_threshold=${p.materialEffectThresholdCents}
  requiredN=${p.requiredEvidence ?? "null"} ESS=${p.effectiveSampleSize}
  modelMDE=${p.minimumDetectableEffect ?? "null"} clearsMde=${String(p.clearsMde)}
  underpowered=${String(p.isUnderpowered)}</p>
  <p>${escapeHtml(report.promotionEligibilityNote)}</p>
</body>
</html>
`;
}
