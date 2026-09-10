import { createHash } from "node:crypto";
import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildComplementBookSemantics } from "./complementBookSemantics";
import { buildEligibilityGates } from "./eligibility";
import { enumerateMicrostructureHypotheses } from "./enumerateUniverse";
import { buildIndependentUnitPolicy } from "./independentUnit";
import { buildResponseMatchContract } from "./responseMatch";
import {
  DEFAULT_MICROSTRUCTURE_FAMILY_HTML_ROOT,
  DEFAULT_MICROSTRUCTURE_FAMILY_JSON_ROOT,
  DIRECTION_CONVENTION,
  DIRECTION_COUNT,
  EXPLICIT_EXCLUSIONS,
  FAMILY_HYPOTHESIS_COUNT,
  IMBALANCE_THRESHOLD_ABS,
  MICROSTRUCTURE_FAMILY_DEFINITION_VERSION,
  MICROSTRUCTURE_FAMILY_DISCLAIMER,
  MICROSTRUCTURE_FAMILY_HTML_FILENAME,
  MICROSTRUCTURE_FAMILY_ID,
  MICROSTRUCTURE_FAMILY_JSON_FILENAME,
  MICROSTRUCTURE_SUBFAMILY_ID,
  PRIMARY_EVENT_CLASS,
  REFRACTORY_FLOOR_MS,
  RESPONSE_HORIZONS_MS,
  STRUCTURAL_CELL_COUNT,
  TIME_REMAINING_BINS,
  type DirectionConventionSpec,
  type ImbalanceFormulaSpec,
  type MicrostructureFamilyDefinitionConfig,
  type MicrostructureFamilyDefinitionReport,
  type OutcomeSemantics,
  type RefractoryPolicy,
} from "./microstructureFamilyTypes";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function buildImbalanceFormulaSpec(): ImbalanceFormulaSpec {
  return {
    formula: "(yesBestBidSize - noBestBidSize) / (yesBestBidSize + noBestBidSize)",
    requireFinitePositiveDenominator: true,
    requireValidFiniteSizes: true,
  };
}

export function buildDirectionConventionSpec(): DirectionConventionSpec {
  return {
    convention: DIRECTION_CONVENTION,
    directionCount: DIRECTION_COUNT,
    positiveImbalanceImplies: "yes-price-expected-to-rise",
    negativeImbalanceImplies: "yes-price-expected-to-fall",
    note:
      "Fixed same-direction convention: sign(imbalance) predicts subsequent YES repricing "
      + "in the same direction. Direction is not searched. Changing it creates a new lineage.",
  };
}

export function buildRefractoryPolicy(): RefractoryPolicy {
  return {
    rule: "R = max(H, 2000ms)",
    floorMs: REFRACTORY_FLOOR_MS,
    note:
      "Refractory period is max(responseHorizonMs, 2000ms) so overlapping response windows "
      + "on the same market cannot become independent pseudo-replicates.",
  };
}

export function buildOutcomeSemantics(): OutcomeSemantics {
  return {
    diagnostic: "midpoint-response-cents",
    primaryEconomic: "executable-one-contract-response-or-horizon-pnl",
    evidenceQuality: "execution-observability",
    executableModel: "one-contract-tob-observable-bid-and-complement-ask",
    assumesFillBeyondDisplayedSize: false,
    feeTreatment:
      "gross-executable-unless-reusable-fee-infrastructure-bound; fee-adjusted support required before promotion",
    settlementIsPrimaryOutcome: false,
  };
}

export function resolveMicrostructureFamilyOutputPaths(input: {
  familyDefinitionIdentityHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
}): { outputPath: string; htmlOutputPath: string } {
  const identityDir = input.familyDefinitionIdentityHash;
  return {
    outputPath:
      input.outputPath
      ?? join(DEFAULT_MICROSTRUCTURE_FAMILY_JSON_ROOT, identityDir, MICROSTRUCTURE_FAMILY_JSON_FILENAME),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(DEFAULT_MICROSTRUCTURE_FAMILY_HTML_ROOT, identityDir, MICROSTRUCTURE_FAMILY_HTML_FILENAME),
  };
}

export function buildMicrostructureFamilyIdentityPayload(input: {
  complementBookSemantics: ReturnType<typeof buildComplementBookSemantics>;
  imbalanceFormula: ImbalanceFormulaSpec;
  directionConvention: DirectionConventionSpec;
  responseMatchContract: ReturnType<typeof buildResponseMatchContract>;
  eligibilityGates: ReturnType<typeof buildEligibilityGates>;
  refractoryPolicy: RefractoryPolicy;
  independentUnitPolicy: ReturnType<typeof buildIndependentUnitPolicy>;
  outcomeSemantics: OutcomeSemantics;
  hypotheses: ReturnType<typeof enumerateMicrostructureHypotheses>;
}): Record<string, unknown> {
  return {
    analysisVersion: MICROSTRUCTURE_FAMILY_DEFINITION_VERSION,
    familyId: MICROSTRUCTURE_FAMILY_ID,
    subfamilyId: MICROSTRUCTURE_SUBFAMILY_ID,
    complementBookSemantics: input.complementBookSemantics,
    imbalanceFormula: input.imbalanceFormula,
    imbalanceThresholdsAbs: [...IMBALANCE_THRESHOLD_ABS],
    directionConvention: input.directionConvention,
    responseHorizonsMs: [...RESPONSE_HORIZONS_MS],
    timeRemainingBins: TIME_REMAINING_BINS,
    primaryEventClass: PRIMARY_EVENT_CLASS,
    responseMatchContract: input.responseMatchContract,
    eligibilityGates: input.eligibilityGates,
    refractoryPolicy: input.refractoryPolicy,
    independentUnitPolicy: input.independentUnitPolicy,
    outcomeSemantics: input.outcomeSemantics,
    structuralCellCount: STRUCTURAL_CELL_COUNT,
    directionCount: DIRECTION_COUNT,
    hypothesisCount: FAMILY_HYPOTHESIS_COUNT,
    hypothesisIds: input.hypotheses.map((cell) => cell.hypothesisId),
    explicitExclusions: [...EXPLICIT_EXCLUSIONS],
    independenceFromLeadLag: true,
    btcFeaturesForbidden: true,
  };
}

export function buildMicrostructureFamilyDefinitionReport(input?: {
  config?: Partial<MicrostructureFamilyDefinitionConfig>;
  generatedAt?: string;
}): MicrostructureFamilyDefinitionReport {
  const complementBookSemantics = buildComplementBookSemantics();
  const imbalanceFormula = buildImbalanceFormulaSpec();
  const directionConvention = buildDirectionConventionSpec();
  const responseMatchContract = buildResponseMatchContract();
  const eligibilityGates = buildEligibilityGates();
  const refractoryPolicy = buildRefractoryPolicy();
  const independentUnitPolicy = buildIndependentUnitPolicy();
  const outcomeSemantics = buildOutcomeSemantics();
  const hypotheses = enumerateMicrostructureHypotheses();

  const identityPayload = buildMicrostructureFamilyIdentityPayload({
    complementBookSemantics,
    imbalanceFormula,
    directionConvention,
    responseMatchContract,
    eligibilityGates,
    refractoryPolicy,
    independentUnitPolicy,
    outcomeSemantics,
    hypotheses,
  });
  const familyDefinitionIdentityHash = sha256Hex(stableStringify(identityPayload));
  const outputs = resolveMicrostructureFamilyOutputPaths({
    familyDefinitionIdentityHash,
    outputPath: input?.config?.outputPath ?? null,
    htmlOutputPath: input?.config?.htmlOutputPath ?? null,
  });

  return {
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
    analysisVersion: MICROSTRUCTURE_FAMILY_DEFINITION_VERSION,
    familyId: MICROSTRUCTURE_FAMILY_ID,
    subfamilyId: MICROSTRUCTURE_SUBFAMILY_ID,
    disclaimer: MICROSTRUCTURE_FAMILY_DISCLAIMER,
    familyDefinitionIdentityHash,
    complementBookSemantics,
    imbalanceFormula,
    imbalanceThresholdsAbs: IMBALANCE_THRESHOLD_ABS,
    directionConvention,
    responseHorizonsMs: RESPONSE_HORIZONS_MS,
    timeRemainingBins: TIME_REMAINING_BINS,
    primaryEventClass: PRIMARY_EVENT_CLASS,
    responseMatchContract,
    eligibilityGates,
    refractoryPolicy,
    independentUnitPolicy,
    outcomeSemantics,
    searchUniverse: {
      structuralCellCount: STRUCTURAL_CELL_COUNT,
      directionCount: DIRECTION_COUNT,
      hypothesisCount: FAMILY_HYPOTHESIS_COUNT,
      hypotheses,
    },
    explicitExclusions: EXPLICIT_EXCLUSIONS,
    independenceFromLeadLag: true,
    btcFeaturesForbidden: true,
    quarantine: {
      historicalDiscoveryRun: false,
      rankingPerformed: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      validationRun: false,
      holdoutRun: false,
      captureStarted: false,
      liveOrdersExecuted: false,
    },
    outputPaths: outputs,
  };
}
