import { join } from "node:path";

import {
  DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
  LEAD_LAG_DISCOVERY_JSON_FILENAME,
  type LeadLagGovernedDiscoveryReport,
} from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import {
  DEFAULT_LEAD_LAG_HOLDOUT_JSON_ROOT,
  LEAD_LAG_HOLDOUT_JSON_FILENAME,
  type LeadLagHoldoutReport,
} from "../btcKalshiLeadLagHoldout/leadLagHoldoutTypes";
import {
  DEFAULT_LEAD_LAG_VALIDATION_JSON_ROOT,
  LEAD_LAG_VALIDATION_JSON_FILENAME,
  type LeadLagValidationReport,
} from "../btcKalshiLeadLagValidation/leadLagValidationTypes";
import { hashCandidateDefinition } from "../btcKalshiLeadLagEvidenceContract/holdoutContract";

import {
  LeadLagReplicationReadinessError,
  type LeadLagReplicationReadinessIo,
} from "./leadLagReplicationReadinessTypes";

export function resolveDiscoveryReportPath(
  discoveryIdentityHash: string,
  explicitPath: string | null,
): string {
  return (
    explicitPath
    ?? join(
      DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
      discoveryIdentityHash,
      LEAD_LAG_DISCOVERY_JSON_FILENAME,
    )
  );
}

export function resolveValidationReportPath(
  validationIdentityHash: string,
  explicitPath: string | null,
): string {
  return (
    explicitPath
    ?? join(
      DEFAULT_LEAD_LAG_VALIDATION_JSON_ROOT,
      validationIdentityHash,
      LEAD_LAG_VALIDATION_JSON_FILENAME,
    )
  );
}

export function resolveHoldoutReportPath(
  holdoutIdentityHash: string,
  explicitPath: string | null,
): string {
  return (
    explicitPath
    ?? join(
      DEFAULT_LEAD_LAG_HOLDOUT_JSON_ROOT,
      holdoutIdentityHash,
      LEAD_LAG_HOLDOUT_JSON_FILENAME,
    )
  );
}

export type LoadedReplicationLineage = {
  discovery: LeadLagGovernedDiscoveryReport;
  validation: LeadLagValidationReport;
  holdout: LeadLagHoldoutReport;
  lockedCandidateDefinitionHash: string;
};

export function loadReplicationLineageArtifacts(input: {
  io: LeadLagReplicationReadinessIo;
  discoveryIdentityHash: string;
  discoveryReportPath?: string | null;
  validationIdentityHash: string;
  validationReportPath?: string | null;
  holdoutIdentityHash: string;
  holdoutReportPath?: string | null;
  expectedEvidenceContractIdentity?: string | null;
}): LoadedReplicationLineage {
  const discoveryPath = resolveDiscoveryReportPath(
    input.discoveryIdentityHash,
    input.discoveryReportPath ?? null,
  );
  if (!input.io.fileExists(discoveryPath)) {
    throw new LeadLagReplicationReadinessError(`Missing discovery artifact: ${discoveryPath}`);
  }
  const discovery = JSON.parse(input.io.readFile(discoveryPath)) as LeadLagGovernedDiscoveryReport;
  if (discovery.discoveryIdentityHash !== input.discoveryIdentityHash) {
    throw new LeadLagReplicationReadinessError(
      `Discovery identity mismatch: expected ${input.discoveryIdentityHash}, `
        + `got ${discovery.discoveryIdentityHash}`,
    );
  }

  const validationPath = resolveValidationReportPath(
    input.validationIdentityHash,
    input.validationReportPath ?? null,
  );
  if (!input.io.fileExists(validationPath)) {
    throw new LeadLagReplicationReadinessError(`Missing validation artifact: ${validationPath}`);
  }
  const validation = JSON.parse(input.io.readFile(validationPath)) as LeadLagValidationReport;
  if (validation.validationIdentityHash !== input.validationIdentityHash) {
    throw new LeadLagReplicationReadinessError(
      `Validation identity mismatch: expected ${input.validationIdentityHash}, `
        + `got ${validation.validationIdentityHash}`,
    );
  }
  if (validation.discoveryIdentity !== input.discoveryIdentityHash) {
    throw new LeadLagReplicationReadinessError(
      `Validation discoveryIdentity mismatch: expected ${input.discoveryIdentityHash}, `
        + `got ${validation.discoveryIdentity}`,
    );
  }
  if (validation.lockedHoldoutCandidate == null) {
    throw new LeadLagReplicationReadinessError("Validation artifact has no lockedHoldoutCandidate");
  }

  const holdoutPath = resolveHoldoutReportPath(
    input.holdoutIdentityHash,
    input.holdoutReportPath ?? null,
  );
  if (!input.io.fileExists(holdoutPath)) {
    throw new LeadLagReplicationReadinessError(`Missing holdout artifact: ${holdoutPath}`);
  }
  const holdout = JSON.parse(input.io.readFile(holdoutPath)) as LeadLagHoldoutReport;
  if (holdout.holdoutIdentityHash !== input.holdoutIdentityHash) {
    throw new LeadLagReplicationReadinessError(
      `Holdout identity mismatch: expected ${input.holdoutIdentityHash}, `
        + `got ${holdout.holdoutIdentityHash}`,
    );
  }
  if (holdout.discoveryIdentity !== input.discoveryIdentityHash) {
    throw new LeadLagReplicationReadinessError(
      `Holdout discoveryIdentity mismatch vs discovery artifact`,
    );
  }
  if (holdout.validationIdentity !== input.validationIdentityHash) {
    throw new LeadLagReplicationReadinessError(
      `Holdout validationIdentity mismatch vs validation artifact`,
    );
  }
  if (
    input.expectedEvidenceContractIdentity
    && holdout.evidenceContractIdentity !== input.expectedEvidenceContractIdentity
  ) {
    throw new LeadLagReplicationReadinessError(
      `Evidence contract identity mismatch: expected ${input.expectedEvidenceContractIdentity}, `
        + `got ${holdout.evidenceContractIdentity}`,
    );
  }

  const locked = validation.lockedHoldoutCandidate;
  if (holdout.lockedCandidateId !== locked.candidateId) {
    throw new LeadLagReplicationReadinessError(
      `Locked candidate mismatch between validation (${locked.candidateId}) `
        + `and holdout (${holdout.lockedCandidateId})`,
    );
  }

  const lockedCandidateDefinitionHash = hashCandidateDefinition({
    hypothesisId: locked.exactDefinition.hypothesisId,
    btcMoveHorizonMs: locked.exactDefinition.btcMoveHorizonMs,
    responseWindowMs: locked.exactDefinition.responseWindowMs,
    btcMagnitudeBin: locked.exactDefinition.btcMagnitudeBin,
    timeRemainingBin: locked.exactDefinition.timeRemainingBin,
    impliedProbabilityBin: locked.exactDefinition.impliedProbabilityBin,
    direction: locked.exactDefinition.direction,
  });
  if (lockedCandidateDefinitionHash !== holdout.lockedCandidateDefinitionHash) {
    throw new LeadLagReplicationReadinessError(
      "Locked candidate definition hash mismatch between recomputation and holdout artifact",
    );
  }

  if (holdout.holdoutStatisticalVerdict !== "underpowered") {
    throw new LeadLagReplicationReadinessError(
      `M12.8d expects historical holdout verdict underpowered; got ${holdout.holdoutStatisticalVerdict}`,
    );
  }

  return { discovery, validation, holdout, lockedCandidateDefinitionHash };
}
