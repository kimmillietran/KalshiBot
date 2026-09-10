import { LeadLagProspectiveCohortError } from "./leadLagProspectiveCohortTypes";
import type { LeadLagProspectiveRunEvidence } from "./leadLagProspectiveCohortTypes";
import { hashLeadLagProspectiveArtifact } from "./prospectiveAdmission";
import { buildIndependentUnitRecordsFromSets } from "./deduplicateCohortUnits";
import { computeLeadLagEffectiveSampleSize } from "../btcKalshiLeadLagEvidenceContract/statisticalUnit";
import { LEAD_LAG_PER_RUN_EVIDENCE_SCHEMA_VERSION } from "./leadLagProspectiveCohortTypes";

/**
 * Build a compact immutable per-run evidence artifact.
 * Midpoint/executable diagnostics are retained for audit but must not drive fixed-N stopping.
 */
export function buildLeadLagProspectiveRunEvidence(input: {
  runId: string;
  captureArtifactIdentity: string;
  candidateDefinitionHash: string;
  prospectiveContractIdentity: string;
  replicationDesignIdentity: string;
  captureDurationHours: number | null;
  captureQuality: LeadLagProspectiveRunEvidence["captureQuality"];
  btcTriggerCount: number;
  eligibleLockedCandidateEvents: number;
  marketDayUnitIds: readonly string[];
  btcTriggerUnitIds: readonly string[];
  midpointDiagnosticCents: number | null;
  executableEvidenceCents: number | null;
  executionObservabilityShare: number | null;
  captureWindowStartMs: number | null;
  captureWindowEndMs: number | null;
}): LeadLagProspectiveRunEvidence {
  const independentUnitRecords = buildIndependentUnitRecordsFromSets({
    runId: input.runId,
    marketDayUnitIds: input.marketDayUnitIds,
    btcTriggerUnitIds: input.btcTriggerUnitIds,
    captureWindowStartMs: input.captureWindowStartMs,
    captureWindowEndMs: input.captureWindowEndMs,
  });
  const essContribution = computeLeadLagEffectiveSampleSize({
    rawObservationCount: input.eligibleLockedCandidateEvents,
    independentMarketCount: new Set(input.marketDayUnitIds.map((id) => id.split(":")[0] ?? id))
      .size,
    marketDayCount: input.marketDayUnitIds.length,
    uniqueBtcTriggerCount: input.btcTriggerUnitIds.length,
  });

  const withoutHash = {
    schemaVersion: LEAD_LAG_PER_RUN_EVIDENCE_SCHEMA_VERSION,
    runId: input.runId,
    captureArtifactIdentity: input.captureArtifactIdentity,
    candidateDefinitionHash: input.candidateDefinitionHash,
    prospectiveContractIdentity: input.prospectiveContractIdentity,
    replicationDesignIdentity: input.replicationDesignIdentity,
    captureDurationHours: input.captureDurationHours,
    captureQuality: input.captureQuality,
    btcTriggerCount: input.btcTriggerCount,
    eligibleLockedCandidateEvents: input.eligibleLockedCandidateEvents,
    uniqueMarkets: new Set(input.marketDayUnitIds.map((id) => id.split(":")[0] ?? id)).size,
    uniqueMarketDays: input.marketDayUnitIds.length,
    independentUnitRecords,
    essContribution: input.eligibleLockedCandidateEvents === 0 ? 0 : essContribution,
    midpointDiagnosticCents: input.midpointDiagnosticCents,
    executableEvidenceCents: input.executableEvidenceCents,
    executionObservabilityShare: input.executionObservabilityShare,
    captureWindowStartMs: input.captureWindowStartMs,
    captureWindowEndMs: input.captureWindowEndMs,
    processingMode: "streaming-bounded-memory" as const,
  };

  return {
    ...withoutHash,
    artifactContentHash: hashLeadLagProspectiveArtifact(withoutHash),
  };
}

export function assertPerRunEvidenceAuditable(evidence: LeadLagProspectiveRunEvidence): void {
  const required = [
    evidence.runId,
    evidence.captureArtifactIdentity,
    evidence.candidateDefinitionHash,
    evidence.prospectiveContractIdentity,
    evidence.artifactContentHash,
  ];
  if (required.some((value) => !value || value.trim().length === 0)) {
    throw new LeadLagProspectiveCohortError(
      "compact per-run artifact missing auditable identity fields",
    );
  }
  if (evidence.independentUnitRecords.length === 0 && evidence.essContribution > 0) {
    throw new LeadLagProspectiveCohortError(
      "ESS contribution without independent-unit records is not auditable",
    );
  }
}
