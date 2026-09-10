import { createHash } from "node:crypto";
import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  applyLeadLagEmpiricalDisposition,
  inventoryAllFamilies,
  listEvaluatedFamilyIds,
} from "./inventoryResearchFamilies";
import { loadCompletedLeadLagLineage } from "./loadCompletedLeadLagLineage";
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
  type CandidateIncidenceAssessment,
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

function leadLagIncidenceFromLineage(input: {
  base: CandidateIncidenceAssessment;
  projectedCaptureHoursPooled: number | null;
  requiredFreshEss: number;
}): CandidateIncidenceAssessment {
  return {
    ...input.base,
    status: "insufficient-evidence",
    source: "bound-m12.8-replication-readiness",
    exploratoryOnly: true,
    confirmatoryReuseForbidden: true,
    expectedCaptureHoursForPlausiblePower: input.projectedCaptureHoursPooled,
    powerAssumptions:
      `Bound prospective required fresh ESS=${input.requiredFreshEss} from readiness artifact. `
      + "Historical Runs 1–3 cannot count toward fresh N.",
    note:
      "Lead-lag candidate-specific incidence was measured in M12.8d readiness (design only). "
      + "Historical holdout remains underpowered; prospective replication is operationally costly "
      + "and available-but-not-authorized.",
  };
}

export function buildNextFamilyReadinessReport(input: {
  config: NextFamilyReadinessConfig;
  io: NextFamilyReadinessIo;
  generatedAt?: string;
}): NextFamilyReadinessReport {
  const completedLineage = input.config.leadLagLineage
    ? loadCompletedLeadLagLineage({ io: input.io, binding: input.config.leadLagLineage })
    : null;

  let inventories = inventoryAllFamilies(input.io);
  if (completedLineage) {
    inventories = inventories.map((inventory) =>
      applyLeadLagEmpiricalDisposition(inventory, completedLineage)
    );
  }

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
    let incidence = buildCandidateIncidenceAssessment({
      familyId: inventory.familyId,
      fadeIndependentMarketsPerEightHours,
      exploratoryCaptureHours: exploratoryCaptureHours > 0 ? exploratoryCaptureHours : null,
    });
    if (completedLineage && inventory.familyId === "btc-kalshi-lead-lag") {
      incidence = leadLagIncidenceFromLineage({
        base: incidence,
        projectedCaptureHoursPooled: completedLineage.projectedCaptureHoursPooled,
        requiredFreshEss: completedLineage.prospectiveRequiredFreshEss,
      });
    }
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

  const selection = selectNextFamily(familyReadiness, {
    leadLagDeferred: completedLineage != null,
  });

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
    completedLineage: completedLineage
      ? {
          discoveryIdentity: completedLineage.discoveryIdentity,
          validationIdentity: completedLineage.validationIdentity,
          holdoutIdentity: completedLineage.holdoutIdentity,
          readinessIdentity: completedLineage.readinessIdentity,
          evidenceContractIdentity: completedLineage.evidenceContractIdentity,
          candidateId: completedLineage.candidateId,
          holdoutStatisticalVerdict: completedLineage.holdoutStatisticalVerdict,
          prospectiveRequiredFreshEss: completedLineage.prospectiveRequiredFreshEss,
          disposition: "deferred-for-prospective-replication",
        }
      : null,
    inventoryDigest: inventories.map((inventory) => ({
      familyId: inventory.familyId,
      modulePathsPresent: inventory.modulePathsPresent,
      modulePathsMissing: inventory.modulePathsMissing,
      familyDefinitionAvailable: inventory.familyDefinitionAvailable,
      maturity: inventory.maturity,
      multiplicity: inventory.multiplicity,
      microstructureDataSupport: inventory.microstructureDataSupport ?? null,
    })),
    selectionStatus: selection.selectionStatus,
    recommendedFamily: selection.recommendedFamily,
    recommendedNextAction: selection.recommendedNextAction,
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
    ...(completedLineage
      ? [
          "Lead-lag prospective freeze (M12.8e) is separate and requires capture-budget approval before any fresh capture.",
        ]
      : []),
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
    completedLineage,
    historicalVerdict: completedLineage?.holdoutStatisticalVerdict ?? null,
    prospectiveReplicationStatus: completedLineage
      ? "available-but-not-authorized"
      : "not-applicable",
    prospectiveRequiredFreshEss: completedLineage?.prospectiveRequiredFreshEss ?? null,
    operationalBurden: completedLineage
      ? {
          projectedCaptureHoursPooled: completedLineage.projectedCaptureHoursPooled,
          projectedEightHourRunsPooled:
            completedLineage.projectedEightHourRunsPooled
            ?? (completedLineage.projectedCaptureHoursPooled != null
              ? completedLineage.projectedCaptureHoursPooled / 8
              : null),
          projectedStorageGiBPooled: completedLineage.projectedStorageGiBPooled,
          burdenClass: completedLineage.burdenClass,
        }
      : null,
    lineageDisposition: completedLineage
      ? "deferred-for-prospective-replication"
      : "not-applicable",
    candidateShoppingForbidden: true,
    promotionForbidden: true,
    freezeForbidden: true,
    prospectiveCaptureStarted: false,
    liveTradingImplemented: false,
    familiesEvaluated: listEvaluatedFamilyIds(),
    familyReadiness,
    recommendedFamily: selection.recommendedFamily,
    selectionStatus: selection.selectionStatus,
    recommendedNextAction: selection.recommendedNextAction,
    recommendationRationale: selection.recommendationRationale,
    blockingRequirements,
    exploratoryDataIdentities,
    confirmatoryReuseForbidden: true,
    confirmatoryReuseWarning:
      "Exploratory capture identities inspected by this audit are design data only and must never "
      + "be silently reused as prospective confirmatory evidence for a future family. "
      + "Historical lead-lag Runs 1–3 are outcome-inspected and cannot become fresh prospective N.",
    whatMustBeFrozenBeforeNewCapture,
    governancePipelineExpectations,
    outputPath: outputs.outputPath,
    htmlOutputPath: outputs.htmlOutputPath,
  };
}
