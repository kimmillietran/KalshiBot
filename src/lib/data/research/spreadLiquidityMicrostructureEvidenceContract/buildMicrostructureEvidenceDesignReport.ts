import { createHash } from "node:crypto";
import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildMicrostructureEpisodeSemantics } from "./episodeSemantics";
import {
  buildMicrostructureEstimandContract,
  buildMicrostructureExecutionSemantics,
} from "./estimandsAndExecution";
import { buildMicrostructureExplicitExclusions } from "./exclusions";
import { buildMicrostructureHoldoutSemantics } from "./holdoutSemantics";
import { buildMicrostructureLockPolicy } from "./lockAndTieBreak";
import {
  EXPECTED_MICROSTRUCTURE_FAMILY_ID,
  EXPECTED_MICROSTRUCTURE_SUBFAMILY_ID,
  MICROSTRUCTURE_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  MICROSTRUCTURE_EVIDENCE_CONTRACT_DISCLAIMER,
  MICROSTRUCTURE_EVIDENCE_DESIGN_HTML_FILENAME,
  MICROSTRUCTURE_EVIDENCE_DESIGN_HTML_ROOT,
  MICROSTRUCTURE_EVIDENCE_DESIGN_JSON_FILENAME,
  MICROSTRUCTURE_EVIDENCE_DESIGN_JSON_ROOT,
  MICROSTRUCTURE_RECOMMENDED_MATERIAL_EFFECT_CENTS,
  type MicrostructureEvidenceContractConfig,
  type MicrostructureEvidenceDesignReport,
} from "./microstructureEvidenceContractTypes";
import { buildMicrostructureMultiplicityDesign } from "./multiplicityDesign";
import { buildMicrostructurePowerMethodology } from "./powerAndStopping";
import { buildMicrostructureShortlistPolicy } from "./shortlistPolicy";
import { buildMicrostructureStatisticalUnitContract } from "./statisticalUnit";
import { buildMicrostructureValidationSemantics } from "./validationSemantics";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export const MICROSTRUCTURE_CAPTURE_QUALITY_REQUIREMENTS = [
  "valid economic book coverage",
  "bid-size coverage",
  "timestamp availability/quality",
  "sequence/resync integrity",
  "response observability",
] as const;

export function resolveMicrostructureEvidenceDesignOutputPaths(input: {
  contractIdentityHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
}): { outputPath: string; htmlOutputPath: string } {
  return {
    outputPath:
      input.outputPath
      ?? join(
        MICROSTRUCTURE_EVIDENCE_DESIGN_JSON_ROOT,
        input.contractIdentityHash,
        MICROSTRUCTURE_EVIDENCE_DESIGN_JSON_FILENAME,
      ),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(
        MICROSTRUCTURE_EVIDENCE_DESIGN_HTML_ROOT,
        input.contractIdentityHash,
        MICROSTRUCTURE_EVIDENCE_DESIGN_HTML_FILENAME,
      ),
  };
}

export function buildMicrostructureEvidenceDesignReport(input: {
  config: MicrostructureEvidenceContractConfig;
  generatedAt?: string;
}): MicrostructureEvidenceDesignReport {
  const statisticalUnit = buildMicrostructureStatisticalUnitContract();
  const episodeSemantics = buildMicrostructureEpisodeSemantics();
  const estimands = buildMicrostructureEstimandContract();
  const executionSemantics = buildMicrostructureExecutionSemantics();
  const shortlistPolicy = buildMicrostructureShortlistPolicy();
  const validationSemantics = buildMicrostructureValidationSemantics();
  const lockAndTieBreak = buildMicrostructureLockPolicy();
  const holdoutSemantics = buildMicrostructureHoldoutSemantics();
  const multiplicityDesign = buildMicrostructureMultiplicityDesign();
  const powerMethodology = buildMicrostructurePowerMethodology({
    materialEffectThresholdCents: input.config.materialEffectThresholdCents,
  });
  const explicitExclusions = buildMicrostructureExplicitExclusions();

  const identityPayload = {
    analysisVersion: MICROSTRUCTURE_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    expectedFamilyId: EXPECTED_MICROSTRUCTURE_FAMILY_ID,
    expectedSubfamilyId: EXPECTED_MICROSTRUCTURE_SUBFAMILY_ID,
    familyDefinitionIdentity: input.config.familyDefinitionIdentity,
    statisticalUnit: statisticalUnit.primaryIndependentUnit,
    episodeRule: episodeSemantics.rule,
    refractoryFormula: episodeSemantics.refractoryFormula,
    primaryEstimand: estimands.primaryEstimand,
    shortlistMaxK: shortlistPolicy.maxK,
    discoveryHypothesisCount: multiplicityDesign.discoveryHypothesisCount,
    multiplicityLineage: multiplicityDesign.lineage,
    alpha: input.config.alpha,
    targetPower: input.config.targetPower,
    materialEffectThresholdCents: input.config.materialEffectThresholdCents,
    outcomeStandardDeviationCents: input.config.outcomeStandardDeviationCents,
    stoppingRule: input.config.stoppingRule,
    explicitExclusions,
    authority: "content-addressed-not-latest-mtime",
  };

  const contractIdentityHash = sha256Hex(stableStringify(identityPayload));
  const paths = resolveMicrostructureEvidenceDesignOutputPaths({
    contractIdentityHash,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
  });

  return {
    analysisVersion: MICROSTRUCTURE_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    disclaimer: MICROSTRUCTURE_EVIDENCE_CONTRACT_DISCLAIMER,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    contractIdentityHash,
    expectedFamilyId: EXPECTED_MICROSTRUCTURE_FAMILY_ID,
    expectedSubfamilyId: EXPECTED_MICROSTRUCTURE_SUBFAMILY_ID,
    familyDefinitionIdentity: input.config.familyDefinitionIdentity,
    statisticalUnit,
    episodeSemantics,
    estimands,
    executionSemantics,
    shortlistPolicy,
    validationSemantics,
    lockAndTieBreak,
    holdoutSemantics,
    multiplicityDesign,
    powerMethodology,
    stoppingRulePolicy:
      "Prefer fixed-n (power expressed as ESS requirement). fixed-capture-horizon and "
      + "explicit-sequential only when repository infrastructure already supports them. "
      + "Reject keep-collecting-until-p<.05 / effect-looks-good|bad optional stopping.",
    captureQualityRequirements: MICROSTRUCTURE_CAPTURE_QUALITY_REQUIREMENTS,
    explicitExclusions,
    m13aIntegrationBoundary:
      "M13.0a family-definition identity is injected via familyDefinitionIdentity when available. "
      + "This module does not edit M13.0a core files and is not the identity authority for the "
      + "12-cell universe. Expected eventual binding: M13.0a familyDefinitionIdentity + "
      + "M13.0b-prep evidence contractIdentityHash → M13.0b TRAIN-only discovery.",
    reusableGovernanceStack: [
      "powerAnalysis.computeRequiredSampleSize",
      "oosPowerCorrection (staged multiplicity lineage documentation)",
      "candidatePromotion / candidatePreregistrationEligibility (M12.7c-compatible future gates)",
      "btcKalshiLeadLagEvidenceContract / Validation / Holdout patterns (adapted, not BTC-coupled)",
      "prospective statistical promotion contracts (fixed-n / fail-closed stopping)",
    ],
    microstructureSpecificAdapters: [
      "independent unit: ≤1 episode per marketTicker/calendarDay/structuralCell",
      "refractory R = max(responseHorizon, 2s)",
      "midpoint diagnostic vs one-contract executable primary",
      "complement-book YES ask = 100 - NO bid (derived ask not independent)",
      "exclusions: BTC features, depth/cancel/size-drop/spread-interaction families",
      "shortlist K≤3 with non-max-effect ranking",
      "materialEffectThresholdCents fail-closed when unbound",
    ],
    materialEffectDecisionStatus: {
      bound: input.config.materialEffectThresholdCents != null,
      materialEffectThresholdCents: input.config.materialEffectThresholdCents,
      recommendedCents: MICROSTRUCTURE_RECOMMENDED_MATERIAL_EFFECT_CENTS,
      recommendationRationale: powerMethodology.methodologyRecommendation,
      failsClosedIfMissing: true,
    },
    quarantine: {
      realHistoricalMicrostructureOutcomesRead: false,
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

export function assertCaptureQualityOrInvalidate(input: {
  validEconomicBookCoverage: boolean;
  bidSizeCoverage: boolean;
  timestampQuality: boolean;
  sequenceResyncIntegrity: boolean;
  responseObservability: boolean;
}): { valid: boolean; failures: string[] } {
  const failures: string[] = [];
  if (!input.validEconomicBookCoverage) failures.push("valid economic book coverage");
  if (!input.bidSizeCoverage) failures.push("bid-size coverage");
  if (!input.timestampQuality) failures.push("timestamp availability/quality");
  if (!input.sequenceResyncIntegrity) failures.push("sequence/resync integrity");
  if (!input.responseObservability) failures.push("response observability");
  return { valid: failures.length === 0, failures };
}
