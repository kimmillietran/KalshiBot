import type { LeadLagResponseDirection } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
  LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  LeadLagEvidenceContractError,
  type LeadLagHoldoutEvidenceContract,
  type LeadLagIndependentUnitDefinition,
  type LeadLagPrimaryEstimandId,
  type LeadLagSupportRejectRules,
} from "./leadLagEvidenceContractTypes";
import { buildLeadLagMultiplicityDesign } from "./multiplicityDesign";
import { deriveRequiredEffectiveEvidence } from "./powerModel";

export const DEFAULT_LEAD_LAG_SUPPORT_REJECT_RULES: LeadLagSupportRejectRules = {
  support:
    "holdout effective-N met; signed primary estimand clears materialEffectThreshold in declared "
    + "direction at alpha; execution observability satisfied when required",
  reject:
    "holdout effective-N met and primary estimand fails material threshold / wrong direction / "
    + "execution observability failed when required",
  inconclusive:
    "stopping rule completed without required effective evidence (underpowered) or data-quality "
    + "preconditions unmet",
};

export function buildLeadLagHoldoutEvidenceContract(input: {
  discoveryIdentity: string;
  splitManifestHash: string;
  validationIdentity: string | null;
  candidateDefinitionHash: string | null;
  direction: LeadLagResponseDirection | null;
  primaryEstimand?: LeadLagPrimaryEstimandId;
  independentUnitDefinition?: LeadLagIndependentUnitDefinition;
  alpha: number;
  targetPower: number;
  materialEffectCents: number;
  outcomeStandardDeviationCents: number;
}): LeadLagHoldoutEvidenceContract {
  const required = deriveRequiredEffectiveEvidence({
    alpha: input.alpha,
    targetPower: input.targetPower,
    materialEffectCents: input.materialEffectCents,
    outcomeStandardDeviationCents: input.outcomeStandardDeviationCents,
  });

  return {
    contractVersion: LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    candidateDefinitionHash: input.candidateDefinitionHash,
    discoveryIdentity: input.discoveryIdentity,
    validationIdentity: input.validationIdentity,
    splitManifestHash: input.splitManifestHash,
    holdoutRunId: KNOWN_LEAD_LAG_HOLDOUT_RUN_ID,
    primaryEstimand: input.primaryEstimand ?? "signed-yes-mid-response-cents",
    direction: input.direction,
    materialEffectThresholdCents: input.materialEffectCents,
    alpha: input.alpha,
    targetPower: input.targetPower,
    independentUnitDefinition: input.independentUnitDefinition ?? "market-day-block",
    clusteringRule:
      "market-day blocks with unique-BTC-trigger cap; locked response window only",
    minimumEvidenceRequirement: {
      kind: "model-derived-effective-n",
      requiredEffectiveN: required.requiredEffectiveN,
      powerModelAssumptionId:
        `alpha=${input.alpha}|power=${input.targetPower}|mde=${input.materialEffectCents}`
        + `|sd=${input.outcomeStandardDeviationCents}`,
    },
    executionObservabilityRequirement:
      "Non-stale best bid/ask with executable buy/sell yes cents at entry and locked response",
    supportRejectInconclusive: DEFAULT_LEAD_LAG_SUPPORT_REJECT_RULES,
    multiplicity: buildLeadLagMultiplicityDesign(),
    requiresExactValidationLockMatch: true,
  };
}

export function hashCandidateDefinition(definition: {
  hypothesisId: string;
  btcMoveHorizonMs: number;
  responseWindowMs: number;
  btcMagnitudeBin: string;
  timeRemainingBin: string;
  impliedProbabilityBin: string;
  direction: LeadLagResponseDirection;
}): string {
  return createHash("sha256").update(stableStringify(definition), "utf8").digest("hex");
}

/**
 * Holdout evaluation may proceed only when the candidate definition hash exactly
 * matches the validation lock. Parameter drift after validation invalidates identity.
 */
export function assertHoldoutCandidateMatchesValidationLock(input: {
  validationLockedCandidateDefinitionHash: string;
  holdoutCandidateDefinitionHash: string;
}): void {
  if (
    input.validationLockedCandidateDefinitionHash
    !== input.holdoutCandidateDefinitionHash
  ) {
    throw new LeadLagEvidenceContractError(
      "holdout candidate definition must exactly match validation lock",
    );
  }
}

export function assertParameterBindingUnchanged(input: {
  validationLockedDefinition: {
    hypothesisId: string;
    btcMoveHorizonMs: number;
    responseWindowMs: number;
    btcMagnitudeBin: string;
    timeRemainingBin: string;
    impliedProbabilityBin: string;
    direction: LeadLagResponseDirection;
  };
  proposedDefinition: {
    hypothesisId: string;
    btcMoveHorizonMs: number;
    responseWindowMs: number;
    btcMagnitudeBin: string;
    timeRemainingBin: string;
    impliedProbabilityBin: string;
    direction: LeadLagResponseDirection;
  };
}): void {
  const locked = hashCandidateDefinition(input.validationLockedDefinition);
  const proposed = hashCandidateDefinition(input.proposedDefinition);
  if (locked !== proposed) {
    throw new LeadLagEvidenceContractError(
      "altered parameter after validation invalidates identity",
    );
  }
}
