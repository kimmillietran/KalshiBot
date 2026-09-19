/**
 * Governed production entrypoint: authorize outcome open → stream real captures
 * → feed existing M14.0c validator → durable transition/report artifacts.
 *
 * Capture causality = JSONL file/append order (not exchange-ts monotonicity).
 */
import { join } from "node:path";

import type { MomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery/momentumDiscoveryTypes";
import {
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  hashCaptureTopOfBookIdentity,
  sumAcceptedCaptureHours,
  type MomentumValidationCohortStatus,
} from "../kalshiTobMomentumValidationCohort";

import { authorizeMomentumValidationOutcomeAccess } from "./assertCohortReadyForOutcomeOpen";
import { bindValidationAuthorities } from "./bindValidationAuthorities";
import {
  buildMomentumValidationReport,
  resolveMomentumValidationOutputPaths,
} from "./buildMomentumValidationReport";
import { assertRealValidationCaptureStreamAllowed } from "./createValidationOnlyMomentumIo";
import {
  DEFAULT_MOMENTUM_VALIDATION_JSON_ROOT,
  MomentumValidationError,
  type MomentumValidationCohortAuthorityInput,
  type MomentumValidationIo,
  type MomentumValidationReport,
} from "./momentumValidationTypes";
import {
  assertSoftwareIncidentRetryLineage,
  buildOutcomeExecutionIncident,
  buildOutcomeExecutionStarted,
  fingerprintCohortRegistryAuthority,
  outcomeExecutionIncidentPath,
  outcomeExecutionStartedPath,
  serializeOutcomeExecutionArtifact,
  type MomentumValidationOutcomeExecutionIncident,
  type SoftwareIncidentRetryLineage,
} from "./outcomeOpenIncident";
import { serializeMomentumValidationHtml } from "./serializeMomentumValidation";
import {
  streamMomentumValidationOutcomesFromAcceptedCohort,
  type SealedAcceptedCaptureDescriptor,
} from "./streamMomentumValidationOutcomesFromAcceptedCohort";

export type MomentumValidationOutcomeOpenTransition = {
  schemaVersion: "m14-momentum-validation-outcome-open-v1";
  phase: "validation-artifact-sealed";
  openedAt: string;
  implementationIdentity: string;
  codeAuthoritySha: string | null;
  cohortPlanIdentity: string;
  cohortRegistryFingerprint: string;
  validationIdentityHash: string;
  cohortCaptureFingerprint: string;
  acceptedRunIds: readonly string[];
  acceptedCaptureIdentityHashes: readonly string[];
  excludedRunIds: readonly string[];
  lockedCandidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  familyDefinitionIdentity: typeof KNOWN_M140A_FAMILY_DEFINITION_IDENTITY;
  evidenceContractIdentity: typeof KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY;
  discoveryIdentity: typeof KNOWN_M140B_DISCOVERY_IDENTITY;
  cumulativeBlindEss: number;
  acceptedCaptureHours: number;
  overallStatus: MomentumValidationReport["overallStatus"];
  holdoutOpened: false;
  realCaptureStreamed: true;
  /** Present when this sealed run completed a software-incident retry. */
  priorIncidentIdentity: string | null;
};

export type GovernedRealCaptureMomentumValidationResult = {
  report: MomentumValidationReport;
  transition: MomentumValidationOutcomeOpenTransition;
  transitionPath: string | null;
  reportPath: string | null;
  htmlPath: string | null;
  episodeCount: number;
  alreadyOpened: boolean;
  executionStartedPath: string | null;
  priorIncidentIdentity: string | null;
};

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function transitionPathFor(validationIdentityHash: string): string {
  return join(
    DEFAULT_MOMENTUM_VALIDATION_JSON_ROOT,
    validationIdentityHash,
    "outcome-open-transition.json",
  );
}

/**
 * Production governed real-capture validation.
 * Requires cohortStatus === ready-for-outcome-open and explicit capture descriptors.
 *
 * After a software execution incident, pass `softwareIncidentRetry` referencing the
 * preserved incident receipt to complete the SAME predeclared analysis (not a
 * second scientific validation).
 */
export async function runGovernedRealCaptureMomentumValidation(input: {
  cohortAuthority: MomentumValidationCohortAuthorityInput;
  acceptedCaptures: readonly SealedAcceptedCaptureDescriptor[];
  io: MomentumValidationIo;
  codeAuthoritySha?: string | null;
  generatedAt?: string;
  writeArtifacts?: boolean;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  verifyCaptureIdentities?: boolean;
  softwareIncidentRetry?: SoftwareIncidentRetryLineage | null;
  log?: (message: string) => void;
}): Promise<GovernedRealCaptureMomentumValidationResult> {
  const authorities = bindValidationAuthorities();
  const gate = authorizeMomentumValidationOutcomeAccess(input.cohortAuthority);

  assertRealValidationCaptureStreamAllowed({
    authorizedForOutcomeOpen: gate.authorized,
    requestRealCaptureStream: true,
  });

  if (!gate.authorized) {
    throw new MomentumValidationError(
      `Real-capture validation refused (${gate.disposition}): ${gate.reason}`,
    );
  }

  if (input.cohortAuthority.cohortStatus !== ("ready-for-outcome-open" as MomentumValidationCohortStatus)) {
    throw new MomentumValidationError(
      "Real-capture validation requires cohortStatus=ready-for-outcome-open",
    );
  }

  const accepted = input.cohortAuthority.acceptedSegments
    ?? input.cohortAuthority.registry.accepted;
  const acceptedHours = sumAcceptedCaptureHours(accepted);
  const acceptedRunIds = [...input.acceptedCaptures]
    .map((row) => row.runId)
    .sort((a, b) => a.localeCompare(b));
  const acceptedCaptureIdentityHashes = [...input.acceptedCaptures]
    .map((row) => row.captureIdentityHash)
    .sort((a, b) => a.localeCompare(b));
  const excludedRunIds = (input.cohortAuthority.registry.excluded ?? [])
    .map((row) => row.runId)
    .sort((a, b) => a.localeCompare(b));
  const cohortRegistryFingerprint = fingerprintCohortRegistryAuthority(
    input.cohortAuthority,
  );
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const writeArtifacts = input.writeArtifacts !== false;

  let priorIncidentIdentity: string | null = null;
  if (input.softwareIncidentRetry) {
    if (!input.io.fileExists(input.softwareIncidentRetry.priorIncidentPath)) {
      throw new MomentumValidationError(
        `Software-incident retry requires preserved incident at `
          + input.softwareIncidentRetry.priorIncidentPath,
      );
    }
    const incident = JSON.parse(
      input.io.readFile(input.softwareIncidentRetry.priorIncidentPath),
    ) as MomentumValidationOutcomeExecutionIncident;
    assertSoftwareIncidentRetryLineage({
      retry: input.softwareIncidentRetry,
      incident,
      cohortAuthority: input.cohortAuthority,
      acceptedCaptureIdentityHashes,
      lockedCandidateId: input.cohortAuthority.lockedCandidateId,
    });
    priorIncidentIdentity = incident.incidentIdentity;
  }

  const started = buildOutcomeExecutionStarted({
    startedAt: generatedAt,
    codeAuthoritySha: input.codeAuthoritySha ?? null,
    cohortAuthority: input.cohortAuthority,
    acceptedRunIds,
    acceptedCaptureIdentityHashes,
    excludedRunIds,
    priorIncidentIdentity,
  });
  const executionStartedPath = outcomeExecutionStartedPath(cohortRegistryFingerprint);
  if (writeArtifacts) {
    input.io.mkdirSync(executionStartedPath.replace(/[/\\][^/\\]+$/, ""), {
      recursive: true,
    });
    input.io.writeFile(executionStartedPath, serializeOutcomeExecutionArtifact(started));
  }

  let stream;
  try {
    stream = await streamMomentumValidationOutcomesFromAcceptedCohort({
      io: input.io as MomentumDiscoveryIo,
      registry: input.cohortAuthority.registry,
      planIdentity: input.cohortAuthority.planIdentity,
      familyDefinitionIdentity: input.cohortAuthority.familyDefinitionIdentity,
      evidenceContractIdentity: input.cohortAuthority.evidenceContractIdentity,
      discoveryIdentity: input.cohortAuthority.discoveryIdentity,
      lockedCandidateId: input.cohortAuthority.lockedCandidateId,
      acceptedCaptures: input.acceptedCaptures,
      excludedRunIds,
      verifyCaptureIdentity: input.verifyCaptureIdentities === true
        ? async ({ captureRunDir }) => {
            const tobPath = `${captureRunDir.replace(/\/$/, "")}/top-of-book.jsonl`;
            return hashCaptureTopOfBookIdentity(tobPath);
          }
        : undefined,
      log: input.log,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const incident = buildOutcomeExecutionIncident({
      recordedAt: new Date().toISOString(),
      codeAuthoritySha: input.codeAuthoritySha ?? null,
      cohortAuthority: input.cohortAuthority,
      acceptedRunIds,
      acceptedCaptureIdentityHashes,
      excludedRunIds,
      errorMessage: message,
    });
    if (writeArtifacts) {
      const incidentPath = outcomeExecutionIncidentPath(
        cohortRegistryFingerprint,
        incident.incidentIdentity,
      );
      input.io.mkdirSync(incidentPath.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
      input.io.writeFile(incidentPath, serializeOutcomeExecutionArtifact(incident));
      input.log?.(
        `outcome-execution-incident recorded: identity=${incident.incidentIdentity.slice(0, 12)}… `
          + `path=${incidentPath} (NOT validation-failed)`,
      );
    }
    throw error;
  }

  const report = buildMomentumValidationReport({
    cohortAuthority: input.cohortAuthority,
    injectedOutcomes: stream.episodes,
    requestRealCaptureStream: false,
    realCaptureStreamed: true,
    generatedAt,
    io: input.io,
    writeArtifacts: false,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });

  const transitionFile = transitionPathFor(report.validationIdentityHash);
  if (input.io.fileExists(transitionFile)) {
    const existing = JSON.parse(
      input.io.readFile(transitionFile),
    ) as MomentumValidationOutcomeOpenTransition;
    if (existing.validationIdentityHash !== report.validationIdentityHash) {
      throw new MomentumValidationError(
        "Conflicting outcome-open transition for cohort; refusing to overwrite",
      );
    }
    if (existing.cohortCaptureFingerprint !== stream.cohortCaptureFingerprint) {
      throw new MomentumValidationError(
        "Outcome-open transition capture fingerprint mismatch on rerun",
      );
    }
    const paths = resolveMomentumValidationOutputPaths({
      validationIdentityHash: report.validationIdentityHash,
      outputPath: input.outputPath,
      htmlOutputPath: input.htmlOutputPath,
    });
    return {
      report,
      transition: existing,
      transitionPath: transitionFile,
      reportPath: paths.outputPath,
      htmlPath: paths.htmlOutputPath,
      episodeCount: stream.episodes.length,
      alreadyOpened: true,
      executionStartedPath: writeArtifacts ? executionStartedPath : null,
      priorIncidentIdentity,
    };
  }

  const transition: MomentumValidationOutcomeOpenTransition = {
    schemaVersion: "m14-momentum-validation-outcome-open-v1",
    phase: "validation-artifact-sealed",
    openedAt: generatedAt,
    implementationIdentity: "runGovernedRealCaptureMomentumValidation/v1",
    codeAuthoritySha: input.codeAuthoritySha ?? null,
    cohortPlanIdentity: authorities.planIdentity,
    cohortRegistryFingerprint,
    validationIdentityHash: report.validationIdentityHash,
    cohortCaptureFingerprint: stream.cohortCaptureFingerprint,
    acceptedRunIds: stream.acceptedRunIds,
    acceptedCaptureIdentityHashes,
    excludedRunIds: stream.excludedRunIds,
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
    evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
    discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
    cumulativeBlindEss: gate.cumulativeBlindEss,
    acceptedCaptureHours: acceptedHours,
    overallStatus: report.overallStatus,
    holdoutOpened: false,
    realCaptureStreamed: true,
    priorIncidentIdentity,
  };

  let reportPath: string | null = null;
  let htmlPath: string | null = null;
  if (writeArtifacts) {
    const paths = resolveMomentumValidationOutputPaths({
      validationIdentityHash: report.validationIdentityHash,
      outputPath: input.outputPath,
      htmlOutputPath: input.htmlOutputPath,
    });
    input.io.mkdirSync(paths.outputDir, { recursive: true });
    input.io.writeFile(paths.outputPath, stableStringify(report));
    input.io.mkdirSync(paths.htmlOutputPath.replace(/[/\\][^/\\]+$/, ""), {
      recursive: true,
    });
    input.io.writeFile(paths.htmlOutputPath, serializeMomentumValidationHtml(report));
    input.io.mkdirSync(transitionFile.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
    input.io.writeFile(transitionFile, stableStringify(transition));
    reportPath = paths.outputPath;
    htmlPath = paths.htmlOutputPath;
  }

  input.log?.(
    `governed real-capture validation complete: status=${report.overallStatus} `
      + `identity=${report.validationIdentityHash.slice(0, 12)}… `
      + `episodes=${stream.episodes.length} acceptedHours=${acceptedHours}`,
  );

  return {
    report,
    transition,
    transitionPath: writeArtifacts ? transitionFile : null,
    reportPath,
    htmlPath,
    episodeCount: stream.episodes.length,
    alreadyOpened: false,
    executionStartedPath: writeArtifacts ? executionStartedPath : null,
    priorIncidentIdentity,
  };
}
