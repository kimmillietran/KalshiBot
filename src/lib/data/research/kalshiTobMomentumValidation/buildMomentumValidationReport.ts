import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import {
  assertAdmittedValidationSegmentCannotBecomeHoldout,
  buildValidationHoldoutIsolationPolicy,
  deduplicateMomentumValidationCohortUnits,
  hashMomentumValidationArtifact,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MomentumValidationCohortError,
} from "../kalshiTobMomentumValidationCohort";

import {
  assertCohortReadyForOutcomeOpen,
  authorizeMomentumValidationOutcomeAccess,
} from "./assertCohortReadyForOutcomeOpen";
import { bindValidationAuthorities } from "./bindValidationAuthorities";
import { computeValidationOutcomesFromEpisodes } from "./computeValidationOutcomesFromEpisodes";
import { assertRealValidationCaptureStreamAllowed } from "./createValidationOnlyMomentumIo";
import { evaluateLockedCandidateOnValidation } from "./evaluateLockedCandidateOnValidation";
import { serializeMomentumValidationHtml } from "./serializeMomentumValidation";
import {
  DEFAULT_MOMENTUM_VALIDATION_HTML_ROOT,
  DEFAULT_MOMENTUM_VALIDATION_JSON_ROOT,
  MOMENTUM_VALIDATION_ANALYSIS_VERSION,
  MOMENTUM_VALIDATION_DISCLAIMER,
  MOMENTUM_VALIDATION_HTML_FILENAME,
  MOMENTUM_VALIDATION_JSON_FILENAME,
  MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
  MOMENTUM_VALIDATION_MIN_ESS,
  MomentumValidationError,
  type MomentumValidationBoundAuthorities,
  type MomentumValidationCohortAuthorityInput,
  type MomentumValidationHoldoutLockEligibility,
  type MomentumValidationIo,
  type MomentumValidationOverallStatus,
  type MomentumValidationReport,
  type SyntheticValidationEpisode,
} from "./momentumValidationTypes";

export function resolveMomentumValidationOutputPaths(input: {
  validationIdentityHash: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
}): {
  outputDir: string;
  outputPath: string;
  htmlOutputPath: string;
} {
  const outputDir =
    input.outputPath != null
      ? input.outputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_MOMENTUM_VALIDATION_JSON_ROOT, input.validationIdentityHash);
  const htmlDir =
    input.htmlOutputPath != null
      ? input.htmlOutputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_MOMENTUM_VALIDATION_HTML_ROOT, input.validationIdentityHash);

  return {
    outputDir,
    outputPath: input.outputPath ?? join(outputDir, MOMENTUM_VALIDATION_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath ?? join(htmlDir, MOMENTUM_VALIDATION_HTML_FILENAME),
  };
}

function buildValidationIdentityHash(input: {
  authorities: MomentumValidationBoundAuthorities;
  cohortStatus: string;
  cumulativeBlindEss: number;
  acceptedSegmentCount: number;
  outcomesOpened: boolean;
  overallStatus: MomentumValidationOverallStatus;
  candidateStatus: string | null;
  outcomeMetricsFingerprint: unknown | null;
}): string {
  return hashMomentumValidationArtifact({
    analysisVersion: MOMENTUM_VALIDATION_ANALYSIS_VERSION,
    familyDefinitionIdentity: input.authorities.familyDefinitionIdentity,
    evidenceContractIdentity: input.authorities.evidenceContractIdentity,
    discoveryIdentity: input.authorities.discoveryIdentity,
    planIdentity: input.authorities.planIdentity,
    lockedCandidateId: input.authorities.lockedCandidateId,
    lockedCandidate: input.authorities.lockedCandidate,
    minEssForValidation: input.authorities.minEssForValidation,
    minExecutableObservabilityShare: input.authorities.minExecutableObservabilityShare,
    cohortStatus: input.cohortStatus,
    cumulativeBlindEss: input.cumulativeBlindEss,
    acceptedSegmentCount: input.acceptedSegmentCount,
    outcomesOpened: input.outcomesOpened,
    overallStatus: input.overallStatus,
    candidateStatus: input.candidateStatus,
    outcomeMetricsFingerprint: input.outcomeMetricsFingerprint,
  });
}

function buildHoldoutLockEligibility(
  authorities: MomentumValidationBoundAuthorities,
  acceptedRunIds: readonly string[],
): MomentumValidationHoldoutLockEligibility {
  const isolation = buildValidationHoldoutIsolationPolicy();
  if (!isolation.validationToHoldoutForeverForbidden) {
    throw new MomentumValidationError("Holdout isolation policy must forbid validation→holdout");
  }

  for (const runId of acceptedRunIds) {
    // Admitted segments may remain validation-role only.
    assertAdmittedValidationSegmentCannotBecomeHoldout({
      runId,
      admittedToValidationCohort: true,
      proposedRole: "validation",
    });
    // Prove holdout reuse fails closed.
    try {
      assertAdmittedValidationSegmentCannotBecomeHoldout({
        runId,
        admittedToValidationCohort: true,
        proposedRole: "holdout",
      });
      throw new MomentumValidationError(
        `Expected validation→holdout isolation throw for ${runId}`,
      );
    } catch (error) {
      if (!(error instanceof MomentumValidationCohortError)) {
        throw error;
      }
    }
  }

  return {
    eligible: true,
    candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    candidate: authorities.lockedCandidate,
    holdoutOpened: false,
    holdoutOutcomesRead: false,
    isolationAttested: true,
    note:
      "Validated candidate is holdout-lock eligible pointing at the same immutable "
      + "TRAIN definition. Holdout outcomes are not opened in M14.0c.",
  };
}

function buildUnderpoweredOrBlockedReport(input: {
  generatedAt: string;
  authorities: MomentumValidationBoundAuthorities;
  gate: Extract<
    ReturnType<typeof authorizeMomentumValidationOutcomeAccess>,
    { authorized: false }
  >;
  overallStatus: MomentumValidationOverallStatus;
  nextAction: MomentumValidationReport["nextAction"];
}): MomentumValidationReport {
  const validationIdentityHash = buildValidationIdentityHash({
    authorities: input.authorities,
    cohortStatus: input.gate.cohortStatus,
    cumulativeBlindEss: input.gate.cumulativeBlindEss,
    acceptedSegmentCount: input.gate.acceptedSegmentCount,
    outcomesOpened: false,
    overallStatus: input.overallStatus,
    candidateStatus: null,
    outcomeMetricsFingerprint: null,
  });

  const report: MomentumValidationReport = {
    generatedAt: input.generatedAt,
    analysisVersion: MOMENTUM_VALIDATION_ANALYSIS_VERSION,
    disclaimer: MOMENTUM_VALIDATION_DISCLAIMER,
    validationIdentityHash,
    familyDefinitionIdentity: input.authorities.familyDefinitionIdentity,
    evidenceContractIdentity: input.authorities.evidenceContractIdentity,
    discoveryIdentity: input.authorities.discoveryIdentity,
    planIdentity: input.authorities.planIdentity,
    lockedCandidateId: input.authorities.lockedCandidateId,
    lockedCandidate: input.authorities.lockedCandidate,
    cohortStatusAtGate: input.gate.cohortStatus,
    outcomesOpened: false,
    cumulativeBlindEss: input.gate.cumulativeBlindEss,
    acceptedSegmentCount: input.gate.acceptedSegmentCount,
    minEssForValidation: MOMENTUM_VALIDATION_MIN_ESS,
    minExecutableObservabilityShare: MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
    overallStatus: input.overallStatus,
    nextAction: input.nextAction,
    candidateEvaluation: null,
    holdoutLockEligibility: null,
    outcomeMetrics: null,
    quarantine: {
      holdoutOutcomesRead: false,
      holdoutOpened: false,
      liveOrders: false,
      liveOrdersExecuted: false,
      parameterRetuningOccurred: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      realCaptureStreamed: false,
    },
    warnings: [
      input.gate.reason,
      "Outcomes were not opened; no effect fields are present.",
      "HOLDOUT momentum outcomes were never accessed.",
    ],
  };

  assertReportHasNoEffectFieldsWhenClosed(report);
  return report;
}

function assertReportHasNoHoldoutEffectFields(report: MomentumValidationReport): void {
  const serialized = stableStringify(report);
  for (const banned of [
    "holdoutMedian",
    "holdoutMean",
    "holdoutPnl",
    "holdoutExecutable",
    "holdoutMidpoint",
  ]) {
    if (serialized.includes(banned)) {
      throw new MomentumValidationError(`Report unexpectedly contains ${banned}`);
    }
  }
  if (report.quarantine.holdoutOutcomesRead !== false) {
    throw new MomentumValidationError("holdoutOutcomesRead must remain false");
  }
}

function assertReportHasNoEffectFieldsWhenClosed(report: MomentumValidationReport): void {
  if (report.outcomesOpened) {
    throw new MomentumValidationError("Closed report must not set outcomesOpened");
  }
  if (report.outcomeMetrics != null || report.candidateEvaluation != null) {
    throw new MomentumValidationError("Closed report must not include effect evaluation fields");
  }
  const serialized = stableStringify(report);
  for (const banned of [
    "signedExecutableMedianCents",
    "signedExecutableMeanCents",
    "signedMidpointMedianCents",
    "grossExecutablePnlCents",
  ]) {
    if (serialized.includes(`"${banned}"`)) {
      throw new MomentumValidationError(
        `Closed (no-peek) report must not include effect field ${banned}`,
      );
    }
  }
}

/**
 * Build governed validation report.
 * Default path: synthetic injected outcomes after gate authorization.
 * Real capture streaming is fail-closed / unimplemented in this milestone.
 */
export function buildMomentumValidationReport(input: {
  cohortAuthority: MomentumValidationCohortAuthorityInput;
  injectedOutcomes?: readonly SyntheticValidationEpisode[] | null;
  requestRealCaptureStream?: boolean;
  captureQualityValid?: boolean;
  evidenceInvalidReason?: string | null;
  generatedAt?: string;
  io?: MomentumValidationIo;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  writeArtifacts?: boolean;
  throwOnBlocked?: boolean;
}): MomentumValidationReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  // Always bind sealed authorities; do not trust caller shortlist for binding.
  const authorities = bindValidationAuthorities();

  const gate = authorizeMomentumValidationOutcomeAccess(input.cohortAuthority);

  assertRealValidationCaptureStreamAllowed({
    authorizedForOutcomeOpen: gate.authorized,
    requestRealCaptureStream: input.requestRealCaptureStream === true,
  });

  if (!gate.authorized) {
    if (gate.disposition === "underpowered-no-peek") {
      return buildUnderpoweredOrBlockedReport({
        generatedAt,
        authorities,
        gate,
        overallStatus: "underpowered-for-validation",
        nextAction: "none",
      });
    }
    if (input.throwOnBlocked !== false) {
      throw new MomentumValidationError(
        `Validation blocked (${gate.disposition}): ${gate.reason}`,
      );
    }
    return buildUnderpoweredOrBlockedReport({
      generatedAt,
      authorities,
      gate,
      overallStatus:
        gate.disposition === "invalid-evidence"
          ? "invalid-evidence"
          : "blocked-awaiting-cohort",
      nextAction:
        gate.disposition === "blocked" ? "continue-cohort-collection" : "none",
    });
  }

  if (!input.injectedOutcomes) {
    throw new MomentumValidationError(
      "Authorized outcome open requires injectedOutcomes in the default M14.0c path "
        + "(real capture streaming is fail-closed / unimplemented).",
    );
  }

  assertCohortReadyForOutcomeOpen(input.cohortAuthority);

  const accepted =
    input.cohortAuthority.acceptedSegments ?? input.cohortAuthority.registry.accepted;
  for (const segment of accepted) {
    assertAdmittedValidationSegmentCannotBecomeHoldout({
      runId: segment.runId,
      admittedToValidationCohort: true,
      proposedRole: "validation",
    });
  }

  const outcomeMetrics = computeValidationOutcomesFromEpisodes(input.injectedOutcomes, {
    candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  });

  const evaluation = evaluateLockedCandidateOnValidation({
    lockedCandidate: authorities.lockedCandidate,
    trainDefinition: authorities.lockedCandidate,
    outcomeMetrics,
    captureQualityValid: input.captureQualityValid,
    evidenceInvalidReason: input.evidenceInvalidReason,
    minEssForValidation: MOMENTUM_VALIDATION_MIN_ESS,
    minExecutableObservabilityShare: MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
  });

  let overallStatus: MomentumValidationOverallStatus;
  let nextAction: MomentumValidationReport["nextAction"];
  let holdoutLockEligibility: MomentumValidationHoldoutLockEligibility | null = null;

  if (evaluation.status === "validated") {
    overallStatus = "validated";
    nextAction = "holdout-eligible-lock-only";
    holdoutLockEligibility = buildHoldoutLockEligibility(
      authorities,
      accepted.map((segment) => segment.runId),
    );
  } else if (evaluation.status === "invalid-evidence") {
    overallStatus = "invalid-evidence";
    nextAction = "stop-lineage";
  } else if (
    evaluation.status === "underpowered-for-validation"
    || evaluation.status === "insufficient-validation-incidence"
  ) {
    overallStatus = "underpowered-for-validation";
    nextAction = "none";
  } else {
    overallStatus = "validation-failed";
    nextAction = "stop-lineage";
  }

  const validationIdentityHash = buildValidationIdentityHash({
    authorities,
    cohortStatus: input.cohortAuthority.cohortStatus,
    cumulativeBlindEss: gate.cumulativeBlindEss,
    acceptedSegmentCount: gate.acceptedSegmentCount,
    outcomesOpened: true,
    overallStatus,
    candidateStatus: evaluation.status,
    outcomeMetricsFingerprint: {
      independentValidationEss: outcomeMetrics.independentValidationEss,
      signedExecutableMedianCents: outcomeMetrics.signedExecutableMedianCents,
      signedExecutableMeanCents: outcomeMetrics.signedExecutableMeanCents,
      signedMidpointMedianCents: outcomeMetrics.signedMidpointMedianCents,
      executableObservabilityShare: outcomeMetrics.executableObservabilityShare,
      midpointOnly: outcomeMetrics.midpointOnly,
      retainedUnitCount: outcomeMetrics.retainedUnitCount,
      duplicateUnitsRemoved: outcomeMetrics.duplicateUnitsRemoved,
    },
  });

  const report: MomentumValidationReport = {
    generatedAt,
    analysisVersion: MOMENTUM_VALIDATION_ANALYSIS_VERSION,
    disclaimer: MOMENTUM_VALIDATION_DISCLAIMER,
    validationIdentityHash,
    familyDefinitionIdentity: authorities.familyDefinitionIdentity,
    evidenceContractIdentity: authorities.evidenceContractIdentity,
    discoveryIdentity: authorities.discoveryIdentity,
    planIdentity: authorities.planIdentity,
    lockedCandidateId: authorities.lockedCandidateId,
    lockedCandidate: authorities.lockedCandidate,
    cohortStatusAtGate: input.cohortAuthority.cohortStatus,
    outcomesOpened: true,
    cumulativeBlindEss: gate.cumulativeBlindEss,
    acceptedSegmentCount: gate.acceptedSegmentCount,
    minEssForValidation: MOMENTUM_VALIDATION_MIN_ESS,
    minExecutableObservabilityShare: MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
    overallStatus,
    nextAction,
    candidateEvaluation: evaluation,
    holdoutLockEligibility,
    outcomeMetrics,
    quarantine: {
      holdoutOutcomesRead: false,
      holdoutOpened: false,
      liveOrders: false,
      liveOrdersExecuted: false,
      parameterRetuningOccurred: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      realCaptureStreamed: false,
    },
    warnings: [
      "HOLDOUT momentum outcomes were never accessed.",
      "Candidate definition frozen from TRAIN shortlist; no validation-time retuning.",
      "Direction consistency uses median signed gross executable P&L > 0; mean is descriptive only.",
      "This report does not claim final OOS significance, promotion, or preregistration eligibility.",
    ],
  };

  assertReportHasNoHoldoutEffectFields(report);

  if (input.writeArtifacts && input.io) {
    const paths = resolveMomentumValidationOutputPaths({
      validationIdentityHash,
      outputPath: input.outputPath,
      htmlOutputPath: input.htmlOutputPath,
    });
    input.io.mkdirSync(paths.outputDir, { recursive: true });
    input.io.writeFile(paths.outputPath, `${stableStringify(report)}\n`);
    input.io.mkdirSync(paths.htmlOutputPath.replace(/[/\\][^/\\]+$/, ""), {
      recursive: true,
    });
    input.io.writeFile(paths.htmlOutputPath, serializeMomentumValidationHtml(report));
  }

  return report;
}

export function computeCohortDeduplicatedEss(
  authority: MomentumValidationCohortAuthorityInput,
): number {
  const accepted = authority.acceptedSegments ?? authority.registry.accepted;
  return deduplicateMomentumValidationCohortUnits(accepted).deduplicatedCohortEss;
}
