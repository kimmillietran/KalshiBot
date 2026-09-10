import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";
import { sha256Hex } from "../btcKalshiLeadLagDiscovery/buildLeadLagResearchSplitManifest";
import type { LeadLagGovernedDiscoveryReport } from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";

import {
  DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
  LEAD_LAG_DISCOVERY_JSON_FILENAME,
} from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";

import {
  LeadLagValidationError,
  type LeadLagFrozenCandidateDefinition,
  type LeadLagValidationIo,
} from "./leadLagValidationTypes";

export function resolveDiscoveryArtifactPath(discoveryIdentityHash: string): string {
  return join(
    DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
    discoveryIdentityHash,
    LEAD_LAG_DISCOVERY_JSON_FILENAME,
  );
}

export function loadLeadLagDiscoveryReportForValidation(input: {
  io: LeadLagValidationIo;
  discoveryIdentityHash: string;
  discoveryReportPath?: string | null;
  expectedSplitManifestHash?: string | null;
}): {
  report: LeadLagGovernedDiscoveryReport;
  frozenCandidates: LeadLagFrozenCandidateDefinition[];
  discoveryReportPath: string;
} {
  const discoveryReportPath =
    input.discoveryReportPath
    ?? resolveDiscoveryArtifactPath(input.discoveryIdentityHash);

  if (!input.io.fileExists(discoveryReportPath)) {
    throw new LeadLagValidationError(
      `Missing discovery artifact for identity ${input.discoveryIdentityHash}: ${discoveryReportPath}`,
    );
  }

  let report: LeadLagGovernedDiscoveryReport;
  try {
    report = JSON.parse(input.io.readFile(discoveryReportPath).replace(/^\uFEFF/, "")) as LeadLagGovernedDiscoveryReport;
  } catch (error) {
    throw new LeadLagValidationError(
      `Malformed discovery artifact at ${discoveryReportPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (report.discoveryIdentityHash !== input.discoveryIdentityHash) {
    throw new LeadLagValidationError(
      `Discovery identity mismatch: expected ${input.discoveryIdentityHash}, found ${report.discoveryIdentityHash}.`,
    );
  }
  if (report.discoveryIsolationStatus !== "train-only-discovery") {
    throw new LeadLagValidationError(
      `Discovery isolation must be train-only-discovery; found ${report.discoveryIsolationStatus}.`,
    );
  }
  if (
    input.expectedSplitManifestHash
    && report.splitManifestHash !== input.expectedSplitManifestHash
  ) {
    throw new LeadLagValidationError(
      `Split manifest hash mismatch: expected ${input.expectedSplitManifestHash}, found ${report.splitManifestHash}.`,
    );
  }
  if (!Array.isArray(report.candidates) || report.candidates.length === 0) {
    throw new LeadLagValidationError(
      "Discovery artifact has no shortlisted candidates to validate.",
    );
  }

  const frozenCandidates = report.candidates.map((candidate) => {
    const definition: LeadLagFrozenCandidateDefinition = {
      candidateId: candidate.hypothesisId,
      hypothesisId: candidate.hypothesisId,
      discoveryRank: candidate.rank,
      direction: candidate.direction,
      btcMoveHorizonMs: candidate.btcMoveHorizonMs,
      responseWindowMs: candidate.responseWindowMs,
      btcMagnitudeBin: candidate.btcMagnitudeBin,
      timeRemainingBin: candidate.timeRemainingBin,
      impliedProbabilityBin: candidate.impliedProbabilityBin,
      trainEligibleMarketTriggerCount: candidate.eligibleMarketTriggerCount,
      trainIndependentMarketCount: candidate.independentMarketCount,
      trainIndependentMarketDayCount: candidate.independentMarketDayCount,
      trainMedianSignedMidResponseCents: candidate.medianSignedMidResponseCents,
      trainExecutableObservabilityShare: candidate.executableObservabilityShare,
      trainUniqueBtcTriggerCount: candidate.uniqueBtcTriggerCount,
    };
    const rebuiltId = [
      definition.btcMoveHorizonMs,
      definition.responseWindowMs,
      definition.btcMagnitudeBin,
      definition.timeRemainingBin,
      definition.impliedProbabilityBin,
      definition.direction,
    ].join("|");
    if (rebuiltId !== definition.hypothesisId) {
      throw new LeadLagValidationError(
        `Discovery candidate definition is internally inconsistent: ${definition.hypothesisId} vs ${rebuiltId}.`,
      );
    }
    return definition;
  });

  // Freeze order by discovery rank then hypothesisId — no validation-time reordering of the family.
  frozenCandidates.sort((left, right) => {
    if (left.discoveryRank !== right.discoveryRank) {
      return left.discoveryRank - right.discoveryRank;
    }
    return left.hypothesisId.localeCompare(right.hypothesisId);
  });

  return { report, frozenCandidates, discoveryReportPath };
}

export function hashValidationContract(contract: unknown): string {
  return sha256Hex(stableStringify(contract));
}

export function assertCandidateDefinitionsImmutable(input: {
  frozen: readonly LeadLagFrozenCandidateDefinition[];
  observedHypothesisIds: readonly string[];
}): void {
  const frozenIds = input.frozen.map((candidate) => candidate.hypothesisId);
  const observed = [...input.observedHypothesisIds].sort();
  const expected = [...frozenIds].sort();
  if (observed.length !== expected.length || observed.some((id, index) => id !== expected[index])) {
    throw new LeadLagValidationError(
      "Validation attempted to mutate or expand the discovery shortlist. "
        + `Frozen=${expected.join(",")} observed=${observed.join(",")}`,
    );
  }
}
