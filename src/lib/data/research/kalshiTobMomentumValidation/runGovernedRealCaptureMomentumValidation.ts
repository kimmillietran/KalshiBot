/**
 * Governed production entrypoint: authorize outcome open → stream real captures
 * → feed existing M14.0c validator → durable transition/report artifacts.
 *
 * Do NOT invoke against accepted M14 validation captures until this code is
 * reviewed/merged and a separate explicit outcome-open task authorizes it.
 */
import { createHash } from "node:crypto";
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
import { serializeMomentumValidationHtml } from "./serializeMomentumValidation";
import {
  streamMomentumValidationOutcomesFromAcceptedCohort,
  type SealedAcceptedCaptureDescriptor,
} from "./streamMomentumValidationOutcomesFromAcceptedCohort";

export type MomentumValidationOutcomeOpenTransition = {
  schemaVersion: "m14-momentum-validation-outcome-open-v1";
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
};

export type GovernedRealCaptureMomentumValidationResult = {
  report: MomentumValidationReport;
  transition: MomentumValidationOutcomeOpenTransition;
  transitionPath: string | null;
  reportPath: string | null;
  htmlPath: string | null;
  episodeCount: number;
  alreadyOpened: boolean;
};

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fingerprintRegistry(authority: MomentumValidationCohortAuthorityInput): string {
  const accepted = authority.acceptedSegments ?? authority.registry.accepted;
  const payload = {
    planIdentity: authority.registry.planIdentity,
    accepted: accepted.map((row) => ({
      runId: row.runId,
      captureIdentityHash: row.captureIdentityHash,
      captureStartMs: row.captureStartMs,
    })),
    excluded: (authority.registry.excluded ?? []).map((row) => row.runId).sort(),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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

  // Idempotent exact rerun: if transition already exists for this identity, return it.
  // We compute stream first for identity, then check — or check after report hash.
  const stream = await streamMomentumValidationOutcomesFromAcceptedCohort({
    io: input.io as MomentumDiscoveryIo,
    registry: input.cohortAuthority.registry,
    planIdentity: input.cohortAuthority.planIdentity,
    familyDefinitionIdentity: input.cohortAuthority.familyDefinitionIdentity,
    evidenceContractIdentity: input.cohortAuthority.evidenceContractIdentity,
    discoveryIdentity: input.cohortAuthority.discoveryIdentity,
    lockedCandidateId: input.cohortAuthority.lockedCandidateId,
    acceptedCaptures: input.acceptedCaptures,
    excludedRunIds: (input.cohortAuthority.registry.excluded ?? []).map((row) => row.runId),
    verifyCaptureIdentity: input.verifyCaptureIdentities === true
      ? async ({ captureRunDir }) => {
          const tobPath = `${captureRunDir.replace(/\/$/, "")}/top-of-book.jsonl`;
          return hashCaptureTopOfBookIdentity(tobPath);
        }
      : undefined,
    log: input.log,
  });

  const report = buildMomentumValidationReport({
    cohortAuthority: input.cohortAuthority,
    injectedOutcomes: stream.episodes,
    requestRealCaptureStream: false,
    realCaptureStreamed: true,
    generatedAt: input.generatedAt,
    io: input.io,
    writeArtifacts: false,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
  });

  const transitionFile = transitionPathFor(report.validationIdentityHash);
  let alreadyOpened = false;
  if (input.io.fileExists(transitionFile)) {
    const existing = JSON.parse(input.io.readFile(transitionFile)) as MomentumValidationOutcomeOpenTransition;
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
    alreadyOpened = true;
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
    };
  }

  const transition: MomentumValidationOutcomeOpenTransition = {
    schemaVersion: "m14-momentum-validation-outcome-open-v1",
    openedAt: input.generatedAt ?? new Date().toISOString(),
    implementationIdentity: "runGovernedRealCaptureMomentumValidation/v1",
    codeAuthoritySha: input.codeAuthoritySha ?? null,
    cohortPlanIdentity: authorities.planIdentity,
    cohortRegistryFingerprint: fingerprintRegistry(input.cohortAuthority),
    validationIdentityHash: report.validationIdentityHash,
    cohortCaptureFingerprint: stream.cohortCaptureFingerprint,
    acceptedRunIds: stream.acceptedRunIds,
    acceptedCaptureIdentityHashes: input.acceptedCaptures
      .slice()
      .sort((a, b) => a.runId.localeCompare(b.runId))
      .map((row) => row.captureIdentityHash),
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
  };

  let reportPath: string | null = null;
  let htmlPath: string | null = null;
  if (input.writeArtifacts !== false) {
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
    transitionPath: input.writeArtifacts !== false ? transitionFile : null,
    reportPath,
    htmlPath,
    episodeCount: stream.episodes.length,
    alreadyOpened,
  };
}
