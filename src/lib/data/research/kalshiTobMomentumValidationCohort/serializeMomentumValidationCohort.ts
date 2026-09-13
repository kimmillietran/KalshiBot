import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  MomentumValidationCohortPlanArtifact,
  MomentumValidationStoppingDecision,
} from "./momentumValidationCohortTypes";
import type { MomentumValidationCohortRegistry } from "./reservationRegistry";

export function serializeMomentumValidationCohortPlanJson(
  artifact: MomentumValidationCohortPlanArtifact,
): string {
  return `${stableStringify(artifact)}\n`;
}

export function serializeMomentumValidationCohortRegistryJson(
  registry: MomentumValidationCohortRegistry,
): string {
  return `${stableStringify(registry)}\n`;
}

export function serializeMomentumValidationStoppingJson(
  decision: MomentumValidationStoppingDecision,
): string {
  return `${stableStringify(decision)}\n`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function serializeMomentumValidationCohortPlanHtml(
  artifact: MomentumValidationCohortPlanArtifact,
): string {
  const plan = artifact.plan;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Momentum validation cohort plan (prep)</title>
</head>
<body>
  <h1>M14.0c-prep momentum validation cohort</h1>
  <p>${escapeHtml(plan.disclaimer)}</p>
  <p>planIdentity: <code>${escapeHtml(artifact.planIdentity)}</code></p>
  <p>lockedCandidate: <code>${escapeHtml(plan.lockedCandidateId)}</code></p>
  <p>standardFutureSegmentDurationMinutes=${plan.standardFutureSegmentDurationMinutes}
  maxSegmentDurationMinutes=${plan.maxSegmentDurationMinutes}
  segment1GrandfatheredDurationMinutes=${plan.segment1GrandfatheredDurationMinutes}
  targetEss=${plan.targetEss}
  maxAcceptedCaptureHours=${plan.maxAcceptedCaptureHours}
  priorPlanIdentity=${escapeHtml(plan.amendment.priorPlanIdentity)}</p>
  <p>noOutcomeAccess=${String(plan.noOutcomeAccess)}
  validationToHoldoutForeverForbidden=${String(plan.validationToHoldoutForeverForbidden)}
  liveOrdersExecuted=${String(plan.quarantine.liveOrdersExecuted)}</p>
</body>
</html>
`;
}
