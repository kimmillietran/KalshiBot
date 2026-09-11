import { createHash } from "node:crypto";
import { join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildEligibilityGates } from "./eligibility";
import { enumerateMomentumHypotheses } from "./enumerateUniverse";
import { buildIndependentUnitPolicy } from "./independentUnit";
import { buildComplementBookSemantics } from "./midpointAndComplement";
import {
  BACKWARD_WINDOWS_MS,
  DEFAULT_MOMENTUM_FAMILY_HTML_ROOT,
  DEFAULT_MOMENTUM_FAMILY_JSON_ROOT,
  DIRECTION_CONVENTION,
  DIRECTION_COUNT,
  EXPLICIT_EXCLUSIONS,
  FAMILY_HYPOTHESIS_COUNT,
  FORWARD_HORIZONS_MS,
  MIDPOINT_FORMULA,
  MOMENTUM_FAMILY_DEFINITION_VERSION,
  MOMENTUM_FAMILY_DISCLAIMER,
  MOMENTUM_FAMILY_HTML_FILENAME,
  MOMENTUM_FAMILY_ID,
  MOMENTUM_FAMILY_JSON_FILENAME,
  MOMENTUM_SUBFAMILY_ID,
  PRIMARY_EVENT_CLASS,
  REFRACTORY_FLOOR_MS,
  RETURN_THRESHOLDS_CENTS,
  STRUCTURAL_CELL_COUNT,
  TIMESTAMP_POLICY,
  type AnchorPolicy,
  type DirectionConventionSpec,
  type MidpointFormulaSpec,
  type MomentumFamilyDefinitionConfig,
  type MomentumFamilyDefinitionReport,
  type OutcomeSemantics,
  type RefractoryPolicy,
} from "./momentumFamilyTypes";
import { buildResponseMatchContract } from "./responseMatch";

function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function buildMidpointFormulaSpec(): MidpointFormulaSpec {
  return {
    formula: MIDPOINT_FORMULA,
    equivalentForm: "50 + (yesBestBidCents - noBestBidCents) / 2",
    units: "cents",
  };
}

export function buildDirectionConventionSpec(): DirectionConventionSpec {
  return {
    convention: DIRECTION_CONVENTION,
    directionCount: DIRECTION_COUNT,
    positiveBackwardReturnImplies: "positive-forward-continuation",
    negativeBackwardReturnImplies: "negative-forward-continuation",
    reversalSearched: false,
    note:
      "Fixed continuation-only direction. Reversal requires a separate future lineage.",
  };
}

export function buildAnchorPolicy(): AnchorPolicy {
  return {
    rule: "last-eligible-quote-with-timestamp-at-or-before-t-minus-W",
    targetOffsetMs: "W",
    matchToleranceMs: 250,
    failClosedIfMissing: true,
    failClosedIfMismatchBeyondTolerance: true,
    noQuoteAfterEventMayAffectPredictor: true,
  };
}

export function buildRefractoryPolicy(): RefractoryPolicy {
  return {
    rule: "R = max(H, 2000ms)",
    floorMs: REFRACTORY_FLOOR_MS,
    note:
      "Per structural cell, refractory R = max(forwardHorizonMs, 2000ms) suppresses overlapping "
      + "same-market events so repeated response windows are not independent evidence.",
  };
}

export function buildOutcomeSemantics(): OutcomeSemantics {
  return {
    diagnostic: "signed-midpoint-continuation-cents",
    primaryEconomic: "gross-one-contract-executable-horizon-pnl-cents",
    feeAdjustedNet: "requires-separately-bound-deterministic-fee-contract",
    feeContractBound: false,
    assumesFillBeyondDisplayedSize: false,
    settlementIsPrimaryOutcome: false,
  };
}

export function resolveMomentumFamilyOutputPaths(input: {
  familyDefinitionIdentityHash: string;
  outputPath: string | null;
  htmlOutputPath: string | null;
}): { outputPath: string; htmlOutputPath: string } {
  return {
    outputPath:
      input.outputPath
      ?? join(
        DEFAULT_MOMENTUM_FAMILY_JSON_ROOT,
        input.familyDefinitionIdentityHash,
        MOMENTUM_FAMILY_JSON_FILENAME,
      ),
    htmlOutputPath:
      input.htmlOutputPath
      ?? join(
        DEFAULT_MOMENTUM_FAMILY_HTML_ROOT,
        input.familyDefinitionIdentityHash,
        MOMENTUM_FAMILY_HTML_FILENAME,
      ),
  };
}

export function buildMomentumFamilyIdentityPayload(input: {
  complementBookSemantics: ReturnType<typeof buildComplementBookSemantics>;
  midpointFormula: MidpointFormulaSpec;
  directionConvention: DirectionConventionSpec;
  anchorPolicy: AnchorPolicy;
  responseMatchContract: ReturnType<typeof buildResponseMatchContract>;
  eligibilityGates: ReturnType<typeof buildEligibilityGates>;
  refractoryPolicy: RefractoryPolicy;
  independentUnitPolicy: ReturnType<typeof buildIndependentUnitPolicy>;
  outcomeSemantics: OutcomeSemantics;
  hypotheses: ReturnType<typeof enumerateMomentumHypotheses>;
}): Record<string, unknown> {
  return {
    analysisVersion: MOMENTUM_FAMILY_DEFINITION_VERSION,
    familyId: MOMENTUM_FAMILY_ID,
    subfamilyId: MOMENTUM_SUBFAMILY_ID,
    scientificLabel: "Kalshi own-price momentum",
    complementBookSemantics: input.complementBookSemantics,
    midpointFormula: input.midpointFormula,
    directionConvention: input.directionConvention,
    backwardWindowsMs: [...BACKWARD_WINDOWS_MS],
    returnThresholdsCents: [...RETURN_THRESHOLDS_CENTS],
    forwardHorizonsMs: [...FORWARD_HORIZONS_MS],
    primaryEventClass: PRIMARY_EVENT_CLASS,
    anchorPolicy: input.anchorPolicy,
    responseMatchContract: input.responseMatchContract,
    eligibilityGates: input.eligibilityGates,
    refractoryPolicy: input.refractoryPolicy,
    independentUnitPolicy: input.independentUnitPolicy,
    outcomeSemantics: input.outcomeSemantics,
    timestampPolicy: TIMESTAMP_POLICY,
    structuralCellCount: STRUCTURAL_CELL_COUNT,
    directionCount: DIRECTION_COUNT,
    hypothesisCount: FAMILY_HYPOTHESIS_COUNT,
    hypothesisIds: input.hypotheses.map((cell) => cell.hypothesisId),
    explicitExclusions: [...EXPLICIT_EXCLUSIONS],
    btcFeaturesForbidden: true,
    feeContractBound: false,
    authority: "content-addressed-not-latest-mtime",
  };
}

export function buildMomentumFamilyDefinitionReport(input?: {
  config?: Partial<MomentumFamilyDefinitionConfig>;
  generatedAt?: string;
}): MomentumFamilyDefinitionReport {
  const complementBookSemantics = buildComplementBookSemantics();
  const midpointFormula = buildMidpointFormulaSpec();
  const directionConvention = buildDirectionConventionSpec();
  const anchorPolicy = buildAnchorPolicy();
  const responseMatchContract = buildResponseMatchContract();
  const eligibilityGates = buildEligibilityGates();
  const refractoryPolicy = buildRefractoryPolicy();
  const independentUnitPolicy = buildIndependentUnitPolicy();
  const outcomeSemantics = buildOutcomeSemantics();
  const hypotheses = enumerateMomentumHypotheses();

  const identityPayload = buildMomentumFamilyIdentityPayload({
    complementBookSemantics,
    midpointFormula,
    directionConvention,
    anchorPolicy,
    responseMatchContract,
    eligibilityGates,
    refractoryPolicy,
    independentUnitPolicy,
    outcomeSemantics,
    hypotheses,
  });
  const familyDefinitionIdentityHash = sha256Hex(stableStringify(identityPayload));
  const outputs = resolveMomentumFamilyOutputPaths({
    familyDefinitionIdentityHash,
    outputPath: input?.config?.outputPath ?? null,
    htmlOutputPath: input?.config?.htmlOutputPath ?? null,
  });

  return {
    generatedAt: input?.generatedAt ?? new Date().toISOString(),
    analysisVersion: MOMENTUM_FAMILY_DEFINITION_VERSION,
    familyId: MOMENTUM_FAMILY_ID,
    subfamilyId: MOMENTUM_SUBFAMILY_ID,
    disclaimer: MOMENTUM_FAMILY_DISCLAIMER,
    familyDefinitionIdentityHash,
    scientificLabel: "Kalshi own-price momentum",
    notToBeConfusedWith: [
      "legacy BTC recentMomentum feature",
      "atlas BTC momentum buckets",
      "simpleMomentumStrategyPlugin",
      "BTC/Kalshi lead-lag",
      "TOB size imbalance microstructure",
    ],
    complementBookSemantics,
    midpointFormula,
    directionConvention,
    backwardWindowsMs: BACKWARD_WINDOWS_MS,
    returnThresholdsCents: RETURN_THRESHOLDS_CENTS,
    forwardHorizonsMs: FORWARD_HORIZONS_MS,
    primaryEventClass: PRIMARY_EVENT_CLASS,
    anchorPolicy,
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
    btcFeaturesForbidden: true,
    quarantine: {
      historicalMomentumOutcomesRead: false,
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
