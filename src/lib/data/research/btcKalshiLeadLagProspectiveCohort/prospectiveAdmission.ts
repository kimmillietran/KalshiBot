import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  HISTORICAL_LEAD_LAG_LINEAGE_RUN_IDS,
  LeadLagProspectiveCohortError,
  type LeadLagHistoricalLineageRole,
  type LeadLagProspectiveRunEvidence,
} from "./leadLagProspectiveCohortTypes";

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function hashLeadLagProspectiveArtifact(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function resolveHistoricalLineageRole(
  runId: string,
): LeadLagHistoricalLineageRole | null {
  if (runId === HISTORICAL_LEAD_LAG_LINEAGE_RUN_IDS[0]) {
    return "discovery-train";
  }
  if (runId === HISTORICAL_LEAD_LAG_LINEAGE_RUN_IDS[1]) {
    return "validation";
  }
  if (runId === HISTORICAL_LEAD_LAG_LINEAGE_RUN_IDS[2]) {
    return "historical-holdout";
  }
  return null;
}

/**
 * Prefer lineage binding over a bare denylist: any run already bound to
 * discovery/validation/historical-holdout is ineligible for prospective cohort membership.
 */
export function assertRunEligibleForProspectiveCohort(input: {
  runId: string;
  lineageRole?: LeadLagHistoricalLineageRole | "unbound" | null;
  alreadyBoundToResearchLineage?: boolean;
}): void {
  const role = input.lineageRole ?? resolveHistoricalLineageRole(input.runId);
  if (role === "discovery-train") {
    throw new LeadLagProspectiveCohortError(
      `historical discovery run rejected from prospective cohort: ${input.runId}`,
    );
  }
  if (role === "validation") {
    throw new LeadLagProspectiveCohortError(
      `historical validation run rejected from prospective cohort: ${input.runId}`,
    );
  }
  if (role === "historical-holdout") {
    throw new LeadLagProspectiveCohortError(
      `historical holdout run rejected from prospective cohort: ${input.runId}`,
    );
  }
  if (input.alreadyBoundToResearchLineage) {
    throw new LeadLagProspectiveCohortError(
      `run already bound to discovery/validation/historical-holdout lineage → ineligible: ${input.runId}`,
    );
  }
  if ((HISTORICAL_LEAD_LAG_LINEAGE_RUN_IDS as readonly string[]).includes(input.runId)) {
    throw new LeadLagProspectiveCohortError(
      `historical research lineage run rejected from prospective cohort: ${input.runId}`,
    );
  }
}

export function assertCaptureBeganAfterProspectiveFreeze(input: {
  captureStartIso: string | null;
  prospectiveFreezeTimestampIso: string | null;
  prospectiveFreezeIdentity: string | null;
}): void {
  if (!input.prospectiveFreezeIdentity || !input.prospectiveFreezeTimestampIso) {
    throw new LeadLagProspectiveCohortError(
      "pre-freeze run rejected: prospective freeze identity/timestamp not established",
    );
  }
  if (!input.captureStartIso) {
    throw new LeadLagProspectiveCohortError(
      "pre-freeze run rejected: missing capture start timestamp",
    );
  }
  const captureMs = Date.parse(input.captureStartIso);
  const freezeMs = Date.parse(input.prospectiveFreezeTimestampIso);
  if (!Number.isFinite(captureMs) || !Number.isFinite(freezeMs)) {
    throw new LeadLagProspectiveCohortError(
      "pre-freeze run rejected: invalid capture/freeze timestamps",
    );
  }
  if (captureMs < freezeMs) {
    throw new LeadLagProspectiveCohortError(
      "pre-freeze run rejected: capture began before prospective freeze timestamp",
    );
  }
}

export function assertExactCandidateAndContract(input: {
  evidence: LeadLagProspectiveRunEvidence;
  expectedCandidateDefinitionHash: string;
  expectedProspectiveContractIdentity: string;
}): void {
  if (input.evidence.candidateDefinitionHash !== input.expectedCandidateDefinitionHash) {
    throw new LeadLagProspectiveCohortError("exact candidate identity required");
  }
  if (
    input.evidence.prospectiveContractIdentity
    !== input.expectedProspectiveContractIdentity
  ) {
    throw new LeadLagProspectiveCohortError("exact contract identity required");
  }
}

export function assertCaptureQualityPassed(evidence: LeadLagProspectiveRunEvidence): void {
  if (!evidence.captureQuality.passed) {
    throw new LeadLagProspectiveCohortError(
      `poor capture quality prevents admission: ${evidence.runId} `
        + `(${evidence.captureQuality.failureReasons.join("; ") || "failed"})`,
    );
  }
}

export function assertStreamingBoundedMemory(evidence: LeadLagProspectiveRunEvidence): void {
  if (evidence.processingMode !== "streaming-bounded-memory") {
    throw new LeadLagProspectiveCohortError(
      "top-of-book processing must remain streaming/bounded-memory",
    );
  }
}
