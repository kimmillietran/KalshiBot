import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { deduplicateProspectiveCohortUnits } from "./deduplicateCohortUnits";
import { buildCollectionProgressArtifact } from "./fixedNProgress";
import {
  DEFAULT_LEAD_LAG_PROSPECTIVE_COHORT_HTML_ROOT,
  DEFAULT_LEAD_LAG_PROSPECTIVE_COHORT_JSON_ROOT,
  LEAD_LAG_COLLECTION_PROGRESS_FILENAME,
  LEAD_LAG_PROSPECTIVE_COHORT_ANALYSIS_VERSION,
  LEAD_LAG_PROSPECTIVE_COHORT_DISCLAIMER,
  LEAD_LAG_PROSPECTIVE_COHORT_HTML_FILENAME,
  LEAD_LAG_PROSPECTIVE_COHORT_JSON_FILENAME,
  LeadLagProspectiveCohortError,
  type LeadLagProspectiveCohortConfig,
  type LeadLagProspectiveCohortManifest,
  type LeadLagProspectiveCohortReport,
  type LeadLagProspectiveIo,
  type LeadLagProspectiveRunEvidence,
} from "./leadLagProspectiveCohortTypes";
import {
  assertCaptureBeganAfterProspectiveFreeze,
  assertCaptureQualityPassed,
  assertExactCandidateAndContract,
  assertRunEligibleForProspectiveCohort,
  assertStreamingBoundedMemory,
  hashLeadLagProspectiveArtifact,
  sha256Hex,
} from "./prospectiveAdmission";
import { assertPerRunEvidenceAuditable } from "./buildProspectiveRunEvidence";
import {
  serializeLeadLagCollectionProgressJson,
  serializeLeadLagProspectiveCohortHtml,
  serializeLeadLagProspectiveCohortJson,
} from "./serializeProspectiveCohort";

export function resolveProspectiveCohortOutputPaths(input: {
  cohortIdentityHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
  progressOutputPath: string | null;
}): {
  outputDir: string;
  outputPath: string;
  htmlOutputPath: string;
  progressOutputPath: string;
} {
  const outputDir =
    input.outputPath != null
      ? input.outputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_LEAD_LAG_PROSPECTIVE_COHORT_JSON_ROOT, input.cohortIdentityHash);
  const htmlDir =
    input.htmlOutputPath != null
      ? input.htmlOutputPath.replace(/[/\\][^/\\]+$/, "")
      : join(DEFAULT_LEAD_LAG_PROSPECTIVE_COHORT_HTML_ROOT, input.cohortIdentityHash);
  return {
    outputDir,
    outputPath:
      input.outputPath
      ?? join(outputDir, LEAD_LAG_PROSPECTIVE_COHORT_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(htmlDir, LEAD_LAG_PROSPECTIVE_COHORT_HTML_FILENAME),
    progressOutputPath:
      input.progressOutputPath
      ?? join(outputDir, LEAD_LAG_COLLECTION_PROGRESS_FILENAME),
  };
}

function loadRunEvidence(
  io: LeadLagProspectiveIo,
  path: string,
): LeadLagProspectiveRunEvidence {
  if (!io.fileExists(path)) {
    throw new LeadLagProspectiveCohortError(`Missing per-run evidence artifact: ${path}`);
  }
  const parsed = JSON.parse(io.readFile(path)) as LeadLagProspectiveRunEvidence;
  if (parsed.schemaVersion !== "btc-kalshi-lead-lag-prospective-run-evidence-v1") {
    throw new LeadLagProspectiveCohortError(
      `Unexpected per-run evidence schemaVersion: ${String(parsed.schemaVersion)}`,
    );
  }
  const recomputed = hashLeadLagProspectiveArtifact({
    ...parsed,
    artifactContentHash: undefined,
  });
  if (recomputed !== parsed.artifactContentHash) {
    throw new LeadLagProspectiveCohortError(
      `Per-run evidence content hash mismatch for ${parsed.runId}`,
    );
  }
  return parsed;
}

export function admitProspectiveRunEvidence(input: {
  evidence: LeadLagProspectiveRunEvidence;
  expectedCandidateDefinitionHash: string;
  expectedProspectiveContractIdentity: string;
  prospectiveFreezeIdentity: string | null;
  prospectiveFreezeTimestampIso: string | null;
  alreadyAdmittedRunIds: ReadonlySet<string>;
  alreadyAdmittedArtifactHashes: ReadonlySet<string>;
  captureStartIsoForFreezeCheck: string | null;
}): void {
  assertRunEligibleForProspectiveCohort({ runId: input.evidence.runId });
  assertExactCandidateAndContract({
    evidence: input.evidence,
    expectedCandidateDefinitionHash: input.expectedCandidateDefinitionHash,
    expectedProspectiveContractIdentity: input.expectedProspectiveContractIdentity,
  });
  assertCaptureQualityPassed(input.evidence);
  assertStreamingBoundedMemory(input.evidence);
  assertPerRunEvidenceAuditable(input.evidence);
  assertCaptureBeganAfterProspectiveFreeze({
    captureStartIso: input.captureStartIsoForFreezeCheck,
    prospectiveFreezeIdentity: input.prospectiveFreezeIdentity,
    prospectiveFreezeTimestampIso: input.prospectiveFreezeTimestampIso,
  });
  if (input.alreadyAdmittedRunIds.has(input.evidence.runId)) {
    throw new LeadLagProspectiveCohortError(`duplicate run rejected: ${input.evidence.runId}`);
  }
  if (input.alreadyAdmittedArtifactHashes.has(input.evidence.artifactContentHash)) {
    throw new LeadLagProspectiveCohortError(
      `duplicate artifact identity rejected: ${input.evidence.artifactContentHash}`,
    );
  }
  if (
    input.alreadyAdmittedArtifactHashes.has(input.evidence.captureArtifactIdentity)
  ) {
    // Same capture identity replayed under a different run packaging.
    throw new LeadLagProspectiveCohortError(
      `duplicate artifact identity rejected: capture ${input.evidence.captureArtifactIdentity}`,
    );
  }
}

export function computeProspectiveCohortIdentityHash(input: {
  replicationDesignIdentity: string;
  candidateDefinitionHash: string;
  prospectiveContractIdentity: string;
  memberEvidence: readonly LeadLagProspectiveRunEvidence[];
}): string {
  const members = [...input.memberEvidence]
    .map((evidence) => ({
      runId: evidence.runId,
      artifactContentHash: evidence.artifactContentHash,
      captureArtifactIdentity: evidence.captureArtifactIdentity,
    }))
    .sort((left, right) => left.runId.localeCompare(right.runId));
  return sha256Hex(
    stableStringify({
      analysisVersion: LEAD_LAG_PROSPECTIVE_COHORT_ANALYSIS_VERSION,
      replicationDesignIdentity: input.replicationDesignIdentity,
      candidateDefinitionHash: input.candidateDefinitionHash,
      prospectiveContractIdentity: input.prospectiveContractIdentity,
      members,
    }),
  );
}

export function buildLeadLagProspectiveCohortReport(input: {
  io: LeadLagProspectiveIo;
  config: LeadLagProspectiveCohortConfig;
  generatedAt?: string;
  /** Optional direct evidence injection for tests (bypasses filesystem paths). */
  injectedEvidence?: readonly LeadLagProspectiveRunEvidence[];
}): LeadLagProspectiveCohortReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const rejectedAdmissions: { runId: string | null; reason: string }[] = [];
  const admitted: LeadLagProspectiveRunEvidence[] = [];
  const admittedRunIds = new Set<string>();
  const admittedArtifactHashes = new Set<string>();

  const candidates =
    input.injectedEvidence
    ?? input.config.memberEvidencePaths.map((path) => loadRunEvidence(input.io, path));

  // Filesystem order must not affect admission/canonicalization — sort by runId.
  const ordered = [...candidates].sort((left, right) => left.runId.localeCompare(right.runId));

  for (const evidence of ordered) {
    try {
      const captureStartIso =
        evidence.captureWindowStartMs !== null
          ? new Date(evidence.captureWindowStartMs).toISOString()
          : null;
      admitProspectiveRunEvidence({
        evidence,
        expectedCandidateDefinitionHash: input.config.candidateDefinitionHash,
        expectedProspectiveContractIdentity: input.config.prospectiveContractIdentity,
        prospectiveFreezeIdentity: input.config.prospectiveFreezeIdentity,
        prospectiveFreezeTimestampIso: input.config.prospectiveFreezeTimestampIso,
        alreadyAdmittedRunIds: admittedRunIds,
        alreadyAdmittedArtifactHashes: admittedArtifactHashes,
        captureStartIsoForFreezeCheck: captureStartIso,
      });
      admitted.push(evidence);
      admittedRunIds.add(evidence.runId);
      admittedArtifactHashes.add(evidence.artifactContentHash);
      admittedArtifactHashes.add(evidence.captureArtifactIdentity);
    } catch (error) {
      rejectedAdmissions.push({
        runId: evidence.runId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Re-sort for deterministic identity (already sorted, but keep explicit).
  admitted.sort((left, right) => left.runId.localeCompare(right.runId));

  const cohortIdentityHash = computeProspectiveCohortIdentityHash({
    replicationDesignIdentity: input.config.replicationDesignIdentity,
    candidateDefinitionHash: input.config.candidateDefinitionHash,
    prospectiveContractIdentity: input.config.prospectiveContractIdentity,
    memberEvidence: admitted,
  });

  const dedup = deduplicateProspectiveCohortUnits(admitted);
  const captureHoursCollected = admitted.reduce(
    (sum, run) => sum + (run.captureDurationHours ?? 0),
    0,
  );
  const eligibleIncidenceTotal = admitted.reduce(
    (sum, run) => sum + run.eligibleLockedCandidateEvents,
    0,
  );

  const collectionProgress = buildCollectionProgressArtifact({
    cohortIdentityHash,
    memberRunIds: admitted.map((run) => run.runId),
    captureHoursCollected: admitted.length === 0 ? null : captureHoursCollected,
    eligibleIncidenceTotal,
    rawPerRunEssSum: dedup.rawPerRunEssSum,
    deduplicatedCohortEss: dedup.deduplicatedCohortEss,
    duplicateOrDependentUnitsRemoved: dedup.duplicateOrDependentUnitsRemoved,
    requiredEffectiveN: input.config.requiredEffectiveN,
  });

  const manifest: LeadLagProspectiveCohortManifest = {
    analysisVersion: LEAD_LAG_PROSPECTIVE_COHORT_ANALYSIS_VERSION,
    candidateDefinitionHash: input.config.candidateDefinitionHash,
    prospectiveContractIdentity: input.config.prospectiveContractIdentity,
    replicationDesignIdentity: input.config.replicationDesignIdentity,
    memberRunIds: admitted.map((run) => run.runId),
    memberRunArtifactIdentities: admitted.map((run) => run.artifactContentHash),
    cohortCreationSemantics:
      "Explicit admission of per-run evidence artifacts only; no latest/mtime/directory scan.",
    statisticalUnitSemantics:
      "PR #71 market-day ESS with BTC-trigger cap; cross-run dedupe of market-day and trigger units.",
    stoppingRuleIdentity: input.config.stoppingRuleIdentity,
    captureQualityRequirements: [
      "captureQuality.passed === true",
      "exact candidateDefinitionHash",
      "exact prospectiveContractIdentity",
      "capture began after prospective freeze identity/timestamp",
      "not bound to discovery/validation/historical-holdout lineage",
      "not already admitted (runId / artifact / capture identity)",
    ],
    prospectiveFreezeIdentity: input.config.prospectiveFreezeIdentity,
    prospectiveFreezeTimestampIso: input.config.prospectiveFreezeTimestampIso,
  };

  const paths = resolveProspectiveCohortOutputPaths({
    cohortIdentityHash,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
    progressOutputPath: input.config.progressOutputPath,
  });

  const report: LeadLagProspectiveCohortReport = {
    analysisVersion: LEAD_LAG_PROSPECTIVE_COHORT_ANALYSIS_VERSION,
    disclaimer: LEAD_LAG_PROSPECTIVE_COHORT_DISCLAIMER,
    generatedAt,
    cohortIdentityHash,
    manifest,
    admittedRuns: admitted,
    rejectedAdmissions: rejectedAdmissions.sort((left, right) =>
      String(left.runId).localeCompare(String(right.runId))
    ),
    dedup,
    collectionProgress,
    finalEvaluationBoundary: {
      status: "not-evaluated",
      note:
        "Final statistical evaluation occurs only after a future closed cohort reaches a frozen "
        + "stopping criterion. This prep report never produces a real final prospective result.",
    },
    quarantine: {
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      prospectiveFreezeCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
      historicalRunsAdmittedAsProspective: false,
      thresholdsRetuned: false,
      candidateChanged: false,
    },
    outputPath: paths.outputPath,
    htmlOutputPath: paths.htmlOutputPath,
    progressOutputPath: paths.progressOutputPath,
  };

  input.io.mkdirSync(paths.outputDir, { recursive: true });
  input.io.writeFile(paths.outputPath, serializeLeadLagProspectiveCohortJson(report));
  input.io.mkdirSync(paths.htmlOutputPath.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  input.io.writeFile(paths.htmlOutputPath, serializeLeadLagProspectiveCohortHtml(report));
  input.io.writeFile(
    paths.progressOutputPath,
    serializeLeadLagCollectionProgressJson(collectionProgress),
  );

  return report;
}
