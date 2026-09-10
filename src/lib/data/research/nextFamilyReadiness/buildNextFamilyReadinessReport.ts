import { createHash } from "node:crypto";
import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { inventoryAllFamilies, listEvaluatedFamilyIds } from "./inventoryResearchFamilies";
import {
  loadExploratoryCaptureIdentity,
  loadFadeIndependentMarketsPerEightHours,
} from "./loadExploratoryCaptureIdentities";
import {
  NEXT_FAMILY_READINESS_ANALYSIS_VERSION,
  NEXT_FAMILY_READINESS_DISCLAIMER,
  NEXT_FAMILY_READINESS_HTML_FILENAME,
  NEXT_FAMILY_READINESS_HTML_ROOT,
  NEXT_FAMILY_READINESS_JSON_FILENAME,
  NEXT_FAMILY_READINESS_JSON_ROOT,
  type NextFamilyReadinessConfig,
  type NextFamilyReadinessIo,
  type NextFamilyReadinessReport,
} from "./nextFamilyReadinessTypes";
import {
  buildCandidateIncidenceAssessment,
  scoreFamilyReadiness,
} from "./scoreFamilyReadiness";
import { selectNextFamily } from "./selectNextFamily";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function resolveNextFamilyReadinessOutputPaths(input: {
  reportIdentityHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
}): { outputPath: string; htmlOutputPath: string } {
  return {
    outputPath:
      input.outputPath
      ?? join(
        NEXT_FAMILY_READINESS_JSON_ROOT,
        input.reportIdentityHash,
        NEXT_FAMILY_READINESS_JSON_FILENAME,
      ),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(
        NEXT_FAMILY_READINESS_HTML_ROOT,
        input.reportIdentityHash,
        NEXT_FAMILY_READINESS_HTML_FILENAME,
      ),
  };
}

export function buildNextFamilyReadinessReport(input: {
  config: NextFamilyReadinessConfig;
  io: NextFamilyReadinessIo;
  generatedAt?: string;
}): NextFamilyReadinessReport {
  const inventories = inventoryAllFamilies(input.io);
  const exploratoryDirs = [...input.config.exploratoryCaptureRunDirs].sort((left, right) =>
    left.localeCompare(right)
  );
  const exploratoryDataIdentities = exploratoryDirs.map((dir) =>
    loadExploratoryCaptureIdentity(input.io, dir)
  );

  const fadeIndependentMarketsPerEightHours = loadFadeIndependentMarketsPerEightHours(
    input.io,
    input.config.fadeConfirmatoryReportPaths,
  );

  const exploratoryCaptureHours = exploratoryDataIdentities.reduce(
    (sum, identity) => sum + (identity.durationHours ?? 0),
    0,
  );
  const fieldCoverage = [
    ...new Set(exploratoryDataIdentities.flatMap((identity) => identity.fieldsObserved)),
  ].sort((left, right) => left.localeCompare(right));

  const familyReadiness = inventories.map((inventory) => {
    const incidence = buildCandidateIncidenceAssessment({
      familyId: inventory.familyId,
      fadeIndependentMarketsPerEightHours,
      exploratoryCaptureHours: exploratoryCaptureHours > 0 ? exploratoryCaptureHours : null,
    });
    return scoreFamilyReadiness({
      inventory,
      incidence,
      exploratoryFieldCoverage: fieldCoverage,
      exploratoryHistoricalReturnProxy:
        input.config.exploratoryHistoricalReturnProxies[inventory.familyId] ?? null,
    });
  });

  // Deterministic order by familyId (never filesystem / input order).
  familyReadiness.sort((left, right) => left.familyId.localeCompare(right.familyId));

  const selection = selectNextFamily(familyReadiness);

  const identityPayload = {
    analysisVersion: NEXT_FAMILY_READINESS_ANALYSIS_VERSION,
    familiesEvaluated: listEvaluatedFamilyIds(),
    exploratoryCaptureRunDirs: exploratoryDirs,
    exploratoryCaptureHashes: exploratoryDataIdentities.map((identity) => ({
      runId: identity.runId,
      fieldsObserved: identity.fieldsObserved,
      captureHealthVerdict: identity.captureHealthVerdict,
      durationHours: identity.durationHours,
    })),
    fadeConfirmatoryReportPaths: [...input.config.fadeConfirmatoryReportPaths].sort((a, b) =>
      a.localeCompare(b)
    ),
    inventoryDigest: inventories.map((inventory) => ({
      familyId: inventory.familyId,
      modulePathsPresent: inventory.modulePathsPresent,
      modulePathsMissing: inventory.modulePathsMissing,
      familyDefinitionAvailable: inventory.familyDefinitionAvailable,
      maturity: inventory.maturity,
      multiplicity: inventory.multiplicity,
    })),
    selectionStatus: selection.selectionStatus,
    recommendedFamily: selection.recommendedFamily,
  };
  const reportIdentityHash = sha256Hex(stableStringify(identityPayload));
  const outputs = resolveNextFamilyReadinessOutputPaths({
    reportIdentityHash,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
  });

  const blockingRequirements = [
    ...new Set(familyReadiness.flatMap((family) => family.blockingRequirements)),
  ].sort((left, right) => left.localeCompare(right));

  const whatMustBeFrozenBeforeNewCapture = [
    "Governed family definition and eligibility/entry rule (single frozen contract).",
    "Causal feature semantics and timestamp join rules (no lookahead).",
    "Pre-registered parameter subset (contain lag/horizon/bin multiplicity).",
    "Power model + stopping rule beyond a minimum floor.",
    "Discovery → validation → clean holdout → promotion evidence artifacts (#66 pipeline).",
    "Explicit labeling that prior exploratory captures are design data only (not confirmatory).",
    "If using completed-candle volatility/returns: requireContiguousWindow + expectedBarIntervalMs.",
  ];

  const governancePipelineExpectations = [
    "discovery artifact with frozen search space",
    "validation artifact on held-out historical design data",
    "clean holdout / OOS plan",
    "multiple-testing family declaration",
    "power model with explicit assumptions",
    "promotion evidence satisfying #66 acceptance binding",
    "prospective stopping design before confirmatory capture",
  ];

  return {
    analysisVersion: NEXT_FAMILY_READINESS_ANALYSIS_VERSION,
    disclaimer: NEXT_FAMILY_READINESS_DISCLAIMER,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    reportIdentityHash,
    familiesEvaluated: listEvaluatedFamilyIds(),
    familyReadiness,
    recommendedFamily: selection.recommendedFamily,
    selectionStatus: selection.selectionStatus,
    recommendationRationale: selection.recommendationRationale,
    blockingRequirements,
    exploratoryDataIdentities,
    confirmatoryReuseForbidden: true,
    confirmatoryReuseWarning:
      "Exploratory capture identities inspected by this audit are design data only and must never "
      + "be silently reused as prospective confirmatory evidence for a future family.",
    whatMustBeFrozenBeforeNewCapture,
    governancePipelineExpectations,
    outputPath: outputs.outputPath,
    htmlOutputPath: outputs.htmlOutputPath,
  };
}
