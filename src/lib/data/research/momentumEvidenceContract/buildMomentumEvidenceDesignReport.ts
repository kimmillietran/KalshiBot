import { createHash } from "node:crypto";
import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  buildMetadataOnlyMomentumCaptureInventory,
  buildMomentumDataIsolationPolicy,
  buildMomentumSplitRequirements,
} from "./dataIsolation";
import { buildMomentumDirectionConsistencyRule } from "./directionConsistency";
import {
  auditMomentumFeeContract,
  buildMomentumEstimandContract,
} from "./estimandsAndFee";
import { buildMomentumHoldoutSemantics } from "./holdoutSemantics";
import { buildMomentumLockPolicy } from "./lockAndTieBreak";
import {
  EXPECTED_MOMENTUM_FAMILY_ID,
  EXPECTED_MOMENTUM_SUBFAMILY_ID,
  MOMENTUM_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  MOMENTUM_EVIDENCE_CONTRACT_DISCLAIMER,
  MOMENTUM_EVIDENCE_DESIGN_HTML_FILENAME,
  MOMENTUM_EVIDENCE_DESIGN_HTML_ROOT,
  MOMENTUM_EVIDENCE_DESIGN_JSON_FILENAME,
  MOMENTUM_EVIDENCE_DESIGN_JSON_ROOT,
  MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS,
  type MomentumEvidenceContractConfig,
  type MomentumEvidenceDesignReport,
} from "./momentumEvidenceContractTypes";
import { buildMomentumMultiplicityDesign } from "./multiplicityDesign";
import { buildMomentumPowerMethodology } from "./powerAndStopping";
import { buildMomentumShortlistPolicy } from "./shortlistPolicy";
import { buildMomentumStatisticalUnitContract } from "./statisticalUnit";
import { buildMomentumValidationSemantics } from "./validationSemantics";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export const MOMENTUM_CAPTURE_QUALITY_REQUIREMENTS = [
  "economically-valid book coverage",
  "midpoint derivability",
  "timestamp quality",
  "sequence/gap/resync integrity",
  "quote age",
  "backward anchor observability",
  "forward response observability",
  "executable entry/exit observability",
] as const;

export function resolveMomentumEvidenceDesignOutputPaths(input: {
  contractIdentityHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
}): { outputPath: string; htmlOutputPath: string } {
  return {
    outputPath:
      input.outputPath
      ?? join(
        MOMENTUM_EVIDENCE_DESIGN_JSON_ROOT,
        input.contractIdentityHash,
        MOMENTUM_EVIDENCE_DESIGN_JSON_FILENAME,
      ),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(
        MOMENTUM_EVIDENCE_DESIGN_HTML_ROOT,
        input.contractIdentityHash,
        MOMENTUM_EVIDENCE_DESIGN_HTML_FILENAME,
      ),
  };
}

export function buildMomentumEvidenceDesignReport(input: {
  config: MomentumEvidenceContractConfig;
  generatedAt?: string;
  /** When true, skip filesystem capture scan (tests). */
  sealedInventoryOnly?: boolean;
}): MomentumEvidenceDesignReport {
  const statisticalUnit = buildMomentumStatisticalUnitContract();
  const estimands = buildMomentumEstimandContract();
  const feeContract = auditMomentumFeeContract();
  const directionConsistency = buildMomentumDirectionConsistencyRule();
  const shortlistPolicy = buildMomentumShortlistPolicy();
  const validationSemantics = buildMomentumValidationSemantics();
  const lockAndTieBreak = buildMomentumLockPolicy();
  const holdoutSemantics = buildMomentumHoldoutSemantics();
  const multiplicityDesign = buildMomentumMultiplicityDesign();
  const powerMethodology = buildMomentumPowerMethodology({
    materialEffectThresholdCents: input.config.materialEffectThresholdCents,
  });
  const dataIsolationPolicy = buildMomentumDataIsolationPolicy();
  const captureInventory = buildMetadataOnlyMomentumCaptureInventory({
    sealedOnly: input.sealedInventoryOnly === true,
  });
  const splitRequirements = buildMomentumSplitRequirements();

  const identityPayload = {
    analysisVersion: MOMENTUM_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    expectedFamilyId: EXPECTED_MOMENTUM_FAMILY_ID,
    expectedSubfamilyId: EXPECTED_MOMENTUM_SUBFAMILY_ID,
    familyDefinitionIdentity: input.config.familyDefinitionIdentity,
    statisticalUnit: statisticalUnit.primaryIndependentUnit,
    primaryEstimand: estimands.primaryEstimand,
    diagnosticEstimand: estimands.diagnosticEstimand,
    feeContractStatus: feeContract.feeContractStatus,
    feeCandidateIdentity: feeContract.candidateScheduleIdentityHash,
    netEdgePromotionAuthorized: feeContract.netEdgePromotionAuthorized,
    directionConsistencyRule: directionConsistency.rule,
    shortlistMaxK: shortlistPolicy.maxK,
    discoveryHypothesisCount: multiplicityDesign.discoveryHypothesisCount,
    multiplicityLineage: multiplicityDesign.lineage,
    alpha: input.config.alpha,
    targetPower: input.config.targetPower,
    materialEffectThresholdCents: input.config.materialEffectThresholdCents,
    outcomeStandardDeviationCents: input.config.outcomeStandardDeviationCents,
    stoppingRule: input.config.stoppingRule,
    dataIsolationPolicy,
    splitVersion: splitRequirements.splitVersion,
    authority: "content-addressed-not-latest-mtime",
    noOutcomeAccessAssertion: true,
  };

  const contractIdentityHash = sha256Hex(stableStringify(identityPayload));
  const paths = resolveMomentumEvidenceDesignOutputPaths({
    contractIdentityHash,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
  });

  return {
    analysisVersion: MOMENTUM_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    disclaimer: MOMENTUM_EVIDENCE_CONTRACT_DISCLAIMER,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    contractIdentityHash,
    expectedFamilyId: EXPECTED_MOMENTUM_FAMILY_ID,
    expectedSubfamilyId: EXPECTED_MOMENTUM_SUBFAMILY_ID,
    familyDefinitionIdentity: input.config.familyDefinitionIdentity,
    familyBindingStatus: input.config.familyDefinitionIdentity ? "bound" : "unbound",
    realOutcomeAccessAuthorized: false,
    statisticalUnit,
    estimands,
    feeContract,
    directionConsistency,
    shortlistPolicy,
    validationSemantics,
    lockAndTieBreak,
    holdoutSemantics,
    multiplicityDesign,
    powerMethodology,
    stoppingRulePolicy:
      "Prefer fixed-n (power expressed as ESS requirement). Optional max capture/time budget "
      + "may terminate as underpowered/inconclusive — never automatic success. Reject "
      + "optional stopping based on observed effect magnitude/p-value.",
    captureQualityRequirements: MOMENTUM_CAPTURE_QUALITY_REQUIREMENTS,
    dataIsolationPolicy,
    captureInventory,
    splitRequirements,
    materialEffectDecisionStatus: {
      bound:
        input.config.materialEffectThresholdCents != null
        && input.config.materialEffectThresholdCents > 0,
      materialEffectThresholdCents: input.config.materialEffectThresholdCents,
      recommendedCents: MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS,
      recommendationRationale:
        `Design default ${MOMENTUM_RECOMMENDED_MATERIAL_EFFECT_CENTS}¢ gross executable MDE `
        + "aligned with repository power precedent; must be explicitly bound before "
        + "validation/holdout authorization.",
      failsClosedIfMissing: true,
    },
    m14aIntegrationBoundary:
      "M14.0a family-definition identity is injected via familyDefinitionIdentity when available. "
      + "This module does not edit M14.0a family-definition files and is not the identity "
      + "authority for the 12-cell universe. Exact identity required before real outcome access.",
    reusableGovernanceStack: [
      "powerAnalysis.computeRequiredSampleSize",
      "oosPowerCorrection (staged multiplicity lineage)",
      "candidatePromotion / candidatePreregistrationEligibility",
      "spreadLiquidityMicrostructureEvidenceContract patterns (adapted)",
      "btcKalshiLeadLagEvidenceContract unit/stopping/multiplicity patterns (adapted)",
      "backtesting/costModel.computeKalshiScheduleFeeCents (identified, unbound for family)",
    ],
    quarantine: {
      realHistoricalMomentumOutcomesRead: false,
      candidateSelected: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      freezeCreated: false,
      captureStarted: false,
      liveOrdersExecuted: false,
    },
    outputPath: paths.outputPath,
    htmlOutputPath: paths.htmlOutputPath,
  };
}
