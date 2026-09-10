import { join } from "node:path";

import {
  DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
  LEAD_LAG_DISCOVERY_JSON_FILENAME,
  type LeadLagGovernedDiscoveryReport,
} from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import {
  DEFAULT_LEAD_LAG_VALIDATION_JSON_ROOT,
  LEAD_LAG_VALIDATION_JSON_FILENAME,
  LeadLagValidationError,
  type LeadLagLockedHoldoutCandidate,
  type LeadLagValidationReport,
} from "../btcKalshiLeadLagValidation/leadLagValidationTypes";
import {
  hashCandidateDefinition,
} from "../btcKalshiLeadLagEvidenceContract/holdoutContract";

import { LeadLagHoldoutError, type LeadLagHoldoutIo } from "./leadLagHoldoutTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

export function loadDiscoveryArtifactForHoldout(input: {
  io: LeadLagHoldoutIo;
  discoveryIdentityHash: string;
  discoveryReportPath?: string | null;
  expectedSplitManifestHash?: string | null;
}): LeadLagGovernedDiscoveryReport {
  const path = resolveDiscoveryReportPath(
    input.discoveryIdentityHash,
    input.discoveryReportPath ?? null,
  );
  if (!input.io.fileExists(path)) {
    throw new LeadLagHoldoutError(`Missing discovery artifact: ${path}`);
  }
  const report = JSON.parse(input.io.readFile(path)) as LeadLagGovernedDiscoveryReport;
  if (report.discoveryIdentityHash !== input.discoveryIdentityHash) {
    throw new LeadLagHoldoutError(
      `Discovery identity mismatch: expected ${input.discoveryIdentityHash}, `
        + `got ${report.discoveryIdentityHash}`,
    );
  }
  if (report.discoveryIsolationStatus !== "train-only-discovery") {
    throw new LeadLagHoldoutError(
      `Discovery isolation must be train-only-discovery; got ${report.discoveryIsolationStatus}`,
    );
  }
  if (
    input.expectedSplitManifestHash
    && report.splitManifestHash !== input.expectedSplitManifestHash
  ) {
    throw new LeadLagHoldoutError(
      `Split manifest hash mismatch: expected ${input.expectedSplitManifestHash}, `
        + `got ${report.splitManifestHash}`,
    );
  }
  return report;
}

export function loadValidationArtifactForHoldout(input: {
  io: LeadLagHoldoutIo;
  validationIdentityHash: string;
  validationReportPath?: string | null;
  expectedDiscoveryIdentity: string;
  expectedSplitManifestHash: string;
  expectedValidationContractHash?: string | null;
}): {
  report: LeadLagValidationReport;
  locked: LeadLagLockedHoldoutCandidate;
  lockedCandidateDefinitionHash: string;
} {
  const path = resolveValidationReportPath(
    input.validationIdentityHash,
    input.validationReportPath ?? null,
  );
  if (!input.io.fileExists(path)) {
    throw new LeadLagHoldoutError(`Missing validation artifact: ${path}`);
  }
  const report = JSON.parse(input.io.readFile(path)) as LeadLagValidationReport;
  if (report.validationIdentityHash !== input.validationIdentityHash) {
    throw new LeadLagHoldoutError(
      `Validation identity mismatch: expected ${input.validationIdentityHash}, `
        + `got ${report.validationIdentityHash}`,
    );
  }
  if (report.discoveryIdentity !== input.expectedDiscoveryIdentity) {
    throw new LeadLagHoldoutError(
      `Validation discoveryIdentity mismatch: expected ${input.expectedDiscoveryIdentity}, `
        + `got ${report.discoveryIdentity}`,
    );
  }
  if (report.splitManifestHash !== input.expectedSplitManifestHash) {
    throw new LeadLagHoldoutError(
      `Validation splitManifestHash mismatch: expected ${input.expectedSplitManifestHash}, `
        + `got ${report.splitManifestHash}`,
    );
  }
  if (
    input.expectedValidationContractHash
    && report.validationContractHash !== input.expectedValidationContractHash
  ) {
    throw new LeadLagHoldoutError(
      `Validation contract hash mismatch: expected ${input.expectedValidationContractHash}, `
        + `got ${report.validationContractHash}`,
    );
  }
  if (report.validationOverallStatus !== "one-candidate-locked-for-holdout") {
    throw new LeadLagHoldoutError(
      `Holdout requires one-candidate-locked-for-holdout; got ${report.validationOverallStatus}`,
    );
  }
  if (report.holdoutOutcomeAccessed !== false) {
    throw new LeadLagHoldoutError(
      "Validation artifact claims holdout outcomes were already accessed; fail closed.",
    );
  }
  if (!report.lockedHoldoutCandidate) {
    throw new LeadLagHoldoutError("Validation artifact has no lockedHoldoutCandidate");
  }
  if (report.survivingCandidateCount < 1) {
    throw new LeadLagHoldoutError("Validation artifact has zero survivors");
  }

  const locked = report.lockedHoldoutCandidate;
  const lockedCandidateDefinitionHash = hashCandidateDefinition({
    hypothesisId: locked.exactDefinition.hypothesisId,
    btcMoveHorizonMs: locked.exactDefinition.btcMoveHorizonMs,
    responseWindowMs: locked.exactDefinition.responseWindowMs,
    btcMagnitudeBin: locked.exactDefinition.btcMagnitudeBin,
    timeRemainingBin: locked.exactDefinition.timeRemainingBin,
    impliedProbabilityBin: locked.exactDefinition.impliedProbabilityBin,
    direction: locked.exactDefinition.direction,
  });

  return { report, locked, lockedCandidateDefinitionHash };
}

export function assertExactlyOneLockedCandidate(
  locked: LeadLagLockedHoldoutCandidate | null,
): LeadLagLockedHoldoutCandidate {
  if (!locked) {
    throw new LeadLagHoldoutError("exactly one validation-locked candidate required");
  }
  return locked;
}

export function assertHoldoutNotPreviouslyInspected(input: {
  io: LeadLagHoldoutIo;
  holdoutIdentityHash: string;
  existingHoldoutReportPath: string | null;
}): void {
  if (!input.existingHoldoutReportPath) {
    return;
  }
  if (!input.io.fileExists(input.existingHoldoutReportPath)) {
    return;
  }
  try {
    const existing = JSON.parse(input.io.readFile(input.existingHoldoutReportPath)) as unknown;
    if (
      isRecord(existing)
      && typeof existing.holdoutIdentityHash === "string"
      && existing.holdoutIdentityHash === input.holdoutIdentityHash
      && existing.holdoutStatisticalVerdict != null
    ) {
      throw new LeadLagHoldoutError(
        "Holdout outcomes appear already evaluated for this identity; refuse silent re-open.",
      );
    }
  } catch (error) {
    if (error instanceof LeadLagHoldoutError) {
      throw error;
    }
    // malformed existing file — allow proceed with warning handled by caller
  }
}

export function mapLoadError(error: unknown): never {
  if (error instanceof LeadLagHoldoutError || error instanceof LeadLagValidationError) {
    throw error;
  }
  throw new LeadLagHoldoutError(
    error instanceof Error ? error.message : String(error),
  );
}
