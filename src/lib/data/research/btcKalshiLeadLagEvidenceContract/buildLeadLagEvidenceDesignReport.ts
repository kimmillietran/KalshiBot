import { createHash } from "node:crypto";
import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildLeadLagEstimandContract, buildLeadLagExecutionSemantics } from "./executionSemantics";
import { buildLeadLagHoldoutEvidenceContract } from "./holdoutContract";
import {
  KNOWN_M128A_DISCOVERY_IDENTITY,
  KNOWN_M128A_SPLIT_MANIFEST_HASH,
  LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
  LEAD_LAG_EVIDENCE_CONTRACT_DISCLAIMER,
  LEAD_LAG_EVIDENCE_DESIGN_HTML_FILENAME,
  LEAD_LAG_EVIDENCE_DESIGN_HTML_ROOT,
  LEAD_LAG_EVIDENCE_DESIGN_JSON_FILENAME,
  LEAD_LAG_EVIDENCE_DESIGN_JSON_ROOT,
  type LeadLagEvidenceContractConfig,
  type LeadLagEvidenceDesignReport,
} from "./leadLagEvidenceContractTypes";
import { buildLeadLagMultiplicityDesign } from "./multiplicityDesign";
import {
  buildLeadLagMaterialEffectPolicy,
  buildLeadLagPowerSensitivityTable,
  DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS,
  DEFAULT_LEAD_LAG_OUTCOME_SD_CENTS,
  deriveRequiredEffectiveEvidence,
} from "./powerModel";
import { buildLeadLagProspectiveEvidenceContract } from "./prospectiveContract";
import { buildLeadLagStatisticalUnitContract } from "./statisticalUnit";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function resolveLeadLagEvidenceDesignOutputPaths(input: {
  designIdentityHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
}): { outputPath: string; htmlOutputPath: string } {
  return {
    outputPath:
      input.outputPath
      ?? join(
        LEAD_LAG_EVIDENCE_DESIGN_JSON_ROOT,
        input.designIdentityHash,
        LEAD_LAG_EVIDENCE_DESIGN_JSON_FILENAME,
      ),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(
        LEAD_LAG_EVIDENCE_DESIGN_HTML_ROOT,
        input.designIdentityHash,
        LEAD_LAG_EVIDENCE_DESIGN_HTML_FILENAME,
      ),
  };
}

export function buildLeadLagEvidenceDesignReport(input: {
  config: LeadLagEvidenceContractConfig;
  generatedAt?: string;
}): LeadLagEvidenceDesignReport {
  const statisticalUnit = buildLeadLagStatisticalUnitContract();
  const estimand = buildLeadLagEstimandContract();
  const executionSemantics = buildLeadLagExecutionSemantics();
  const materialEffectPolicy = buildLeadLagMaterialEffectPolicy();
  const multiplicityDesign = buildLeadLagMultiplicityDesign();

  const alpha = input.config.alpha;
  const targetPower = input.config.targetPower;
  const materialEffectCents = input.config.materialEffectCents;
  const outcomeStandardDeviationCents = input.config.outcomeStandardDeviationCents;

  const powerSensitivity = buildLeadLagPowerSensitivityTable({
    baseAlpha: alpha,
    baseTargetPower: targetPower,
    baseMaterialEffectCents: materialEffectCents,
    baseOutcomeStandardDeviationCents: outcomeStandardDeviationCents,
  });

  const holdoutContractRequirements = buildLeadLagHoldoutEvidenceContract({
    discoveryIdentity: input.config.discoveryIdentity,
    splitManifestHash: input.config.splitManifestHash,
    validationIdentity: input.config.validationIdentity,
    candidateDefinitionHash: input.config.candidateDefinitionHash,
    direction: input.config.direction,
    alpha,
    targetPower,
    materialEffectCents,
    outcomeStandardDeviationCents,
  });

  const prospective = buildLeadLagProspectiveEvidenceContract({
    executionDefinition: executionSemantics,
    alpha,
    targetPower,
    effectThresholdCents: materialEffectCents,
    outcomeStandardDeviationCents,
    stoppingRule: input.config.stoppingRule,
    signalHorizonMs: input.config.signalHorizonMs,
    kalshiResponseHorizonMs: input.config.kalshiResponseHorizonMs,
    candidateDirection: input.config.direction,
  });

  const identityPayload = {
    analysisVersion: LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    discoveryIdentity: input.config.discoveryIdentity,
    splitManifestHash: input.config.splitManifestHash,
    statisticalUnit,
    primaryEstimand: estimand.primaryEstimand,
    executionFillModel: executionSemantics.fillModel,
    alpha,
    targetPower,
    materialEffectCents,
    outcomeStandardDeviationCents,
    multiplicityDesign,
    stoppingRuleKind: input.config.stoppingRule?.kind ?? null,
    // Candidate binding changes identity but must not alter scientific constants above.
    candidateDefinitionHash: input.config.candidateDefinitionHash,
    validationIdentity: input.config.validationIdentity,
    direction: input.config.direction,
    signalHorizonMs: input.config.signalHorizonMs,
    kalshiResponseHorizonMs: input.config.kalshiResponseHorizonMs,
  };
  const designIdentityHash = sha256Hex(stableStringify(identityPayload));
  const outputs = resolveLeadLagEvidenceDesignOutputPaths({
    designIdentityHash,
    outputPath: input.config.outputPath,
    htmlOutputPath: input.config.htmlOutputPath,
  });

  // Touch required-evidence derivation so identity stays tied to model outputs.
  deriveRequiredEffectiveEvidence({
    alpha,
    targetPower,
    materialEffectCents,
    outcomeStandardDeviationCents,
  });

  return {
    analysisVersion: LEAD_LAG_EVIDENCE_CONTRACT_ANALYSIS_VERSION,
    disclaimer: LEAD_LAG_EVIDENCE_CONTRACT_DISCLAIMER,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    designIdentityHash,
    discoveryIdentity: input.config.discoveryIdentity,
    splitManifestHash: input.config.splitManifestHash,
    discoveryIsolationStatus: "train-only-discovery",
    statisticalUnit,
    dependenceModel: statisticalUnit.dependenceModel,
    primaryEstimand: estimand,
    secondaryDiagnostics: estimand.secondaryDiagnostics,
    executionSemantics,
    powerModel: {
      reusedStack: "powerAnalysis.computeRequiredSampleSize",
      essStack: "oosPowerCorrection.computeEffectiveSampleSizeEstimate",
      materialEffectPolicy,
      defaultInputs: {
        alpha,
        targetPower,
        materialEffectCents,
        outcomeStandardDeviationCents,
      },
    },
    powerSensitivity,
    allowedStoppingRules: ["fixed-n", "fixed-capture-horizon", "explicit-sequential"],
    stoppingRuleValidationPolicy:
      "fail-closed-if-missing-or-optional-without-sequential-design",
    holdoutContractRequirements,
    prospectiveContractRequirements: prospective,
    multiplicityDesign,
    promotionIntegrationStatus: "schema-ready-awaiting-holdout-and-lock",
    promotionIntegrationNotes: [
      "Future successful lineage must prove: train-only discovery + predeclared validation narrowing "
        + "+ exact locked candidate + untouched holdout + recorded multiplicity + model-derived power "
        + "+ valid stopping design before accepted promotion (M12.7a/M12.7c gates).",
      "This prep report never stamps promotionAccepted / eligibility / freeze.",
      `Default discovery lineage reference: ${KNOWN_M128A_DISCOVERY_IDENTITY}`,
      `Default split manifest reference: ${KNOWN_M128A_SPLIT_MANIFEST_HASH}`,
    ],
    validationOutcomeAccessed: false,
    holdoutOutcomeAccessed: false,
    candidateWinnerSelected: false,
    promotionCreated: false,
    preregistrationCreated: false,
    freezeCreated: false,
    captureStarted: false,
    liveTradingImplemented: false,
    outputPath: outputs.outputPath,
    htmlOutputPath: outputs.htmlOutputPath,
  };
}

export function buildDefaultLeadLagEvidenceContractConfig(
  overrides: Partial<LeadLagEvidenceContractConfig> = {},
): LeadLagEvidenceContractConfig {
  const alpha = overrides.alpha ?? 0.05;
  const targetPower = overrides.targetPower ?? 0.8;
  const materialEffectCents =
    overrides.materialEffectCents ?? DEFAULT_LEAD_LAG_MATERIAL_EFFECT_CENTS;
  const outcomeStandardDeviationCents =
    overrides.outcomeStandardDeviationCents ?? DEFAULT_LEAD_LAG_OUTCOME_SD_CENTS;
  const required = deriveRequiredEffectiveEvidence({
    alpha,
    targetPower,
    materialEffectCents,
    outcomeStandardDeviationCents,
  });
  const derivedMinimum = required.requiredEffectiveN ?? 2;

  return {
    discoveryIdentity: overrides.discoveryIdentity ?? KNOWN_M128A_DISCOVERY_IDENTITY,
    splitManifestHash: overrides.splitManifestHash ?? KNOWN_M128A_SPLIT_MANIFEST_HASH,
    candidateDefinitionHash: overrides.candidateDefinitionHash ?? null,
    validationIdentity: overrides.validationIdentity ?? null,
    direction: overrides.direction ?? null,
    signalHorizonMs: overrides.signalHorizonMs ?? null,
    kalshiResponseHorizonMs: overrides.kalshiResponseHorizonMs ?? null,
    alpha,
    targetPower,
    materialEffectCents,
    outcomeStandardDeviationCents,
    stoppingRule:
      "stoppingRule" in overrides
        ? (overrides.stoppingRule ?? null)
        : {
            kind: "fixed-n",
            minimumEffectiveSampleSize: derivedMinimum,
            interpretationIfNotReached: "inconclusive-underpowered",
          },
    outputPath: overrides.outputPath ?? null,
    htmlOutputPath: overrides.htmlOutputPath ?? null,
  };
}
