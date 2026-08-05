import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  CALIBRATION_FADE_CONFIGURATION_HASH_SEMANTICS,
  CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_CLAIM,
  CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_VERIFICATION_BASIS,
  CALIBRATION_FADE_INTERPRETATION_CLASSIFICATIONS,
  CALIBRATION_FADE_PROVENANCE_ACCEPTED_CONCLUSIONS,
  CALIBRATION_FADE_PROVENANCE_HASH_SEMANTICS,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA,
  CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION,
  CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL,
  CalibrationFadeForwardValidationError,
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
  type CalibrationFadeFirstForwardEvaluationBoundary,
  type CalibrationFadeForwardValidationIo,
  type CalibrationFadeInterpretationClassification,
  type CalibrationFadeProvenanceConclusion,
  type CalibrationFadeProvenanceReport,
  type CalibrationFadeProvenanceStatus,
  type FrozenHypothesisSpec,
  type HistoricalHypothesisBenchmark,
} from "./calibrationFadeForwardValidationTypes";
import { isRecord, readNumber, readString } from "./calibrationFadeForwardValidationUtils";
import { CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE } from "./classifyCalibrationFadeInterpretation";

const GIT_COMMIT_SHA_PATTERN = /^[0-9a-fA-F]{40}$/;
const CONFIG_HASH_PATTERN = /^[0-9a-f]{8}$/;
const ISO_8601_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
/** Accepts the manifest phrasing that runtime Git execution does not occur. */
const RUNTIME_GIT_NOT_EXECUTED_PATTERN =
  /git is not (?:executed|run|invoked)|does not (?:execute|run|invoke) git/i;

/**
 * The one registered integrity correction: the frozen config originally carried
 * explicit probability bounds that disagreed with its own registered bucket.
 */
const PROBABILITY_BAND_CORRECTION_ID = "probability-band-reconciliation-to-coarse-prob-1";
const RECOGNIZED_INTEGRITY_CORRECTION_IDS = [
  PROBABILITY_BAND_CORRECTION_ID,
  "classification-precedence-alignment",
] as const;
/** Pre-correction explicit probability bounds recorded by the freeze history. */
const ORIGINAL_FROZEN_PROBABILITY_BOUNDS = { minInclusive: 0.3, maxExclusive: 0.7 } as const;

function hashFileContent(content: string): string {
  return fnv1a32(content.replace(/^\uFEFF/, ""));
}

/** Derives adjacent provenance path: hypotheses/X.json → hypotheses/provenance/X.json */
export function deriveProvenanceManifestPath(configPath: string): string {
  const normalized = configPath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const fileName = segments.pop();
  if (!fileName) {
    throw new CalibrationFadeForwardValidationError(`Invalid hypothesis config path: ${configPath}`);
  }
  return [...segments, "provenance", fileName].join("/");
}

function fail(message: string): never {
  throw new CalibrationFadeForwardValidationError(message);
}

/**
 * Reads a governed field. Absence is always an error: a governance value is
 * never defaulted, because a silent default would fabricate a frozen rule.
 */
function requireField(parent: Record<string, unknown>, key: string, path: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(parent, key)) {
    fail(`${path} is required`);
  }
  return parent[key];
}

function requireSection(parent: Record<string, unknown>, key: string, path: string): Record<string, unknown> {
  const value = requireField(parent, key, path);
  if (!isRecord(value)) {
    fail(`${path} must be an object`);
  }
  return value;
}

function requireString(parent: Record<string, unknown>, key: string, path: string): string {
  const value = requireField(parent, key, path);
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${path} must be a non-empty string`);
  }
  return value;
}

function requireLiteral<T extends string>(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  allowed: readonly T[],
): T {
  const value = requireString(parent, key, path);
  if (!(allowed as readonly string[]).includes(value)) {
    fail(`${path} must be one of [${allowed.join(", ")}]; received ${JSON.stringify(value)}`);
  }
  return value as T;
}

/** Rejects numeric strings, NaN, and infinities; only real JSON numbers pass. */
function requireFiniteNumber(parent: Record<string, unknown>, key: string, path: string): number {
  const value = requireField(parent, key, path);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a finite number`);
  }
  return value;
}

function requireNullableFiniteNumber(
  parent: Record<string, unknown>,
  key: string,
  path: string,
): number | null {
  const value = requireField(parent, key, path);
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a finite number or explicit null`);
  }
  return value;
}

function requireNumberWithin(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
): number {
  const value = requireFiniteNumber(parent, key, path);
  if (value < minimum || value > maximum) {
    fail(`${path} must be within [${minimum}, ${maximum}]; received ${value}`);
  }
  return value;
}

function requireSafeInteger(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  minimumInclusive: number,
): number {
  const value = requireFiniteNumber(parent, key, path);
  if (!Number.isSafeInteger(value)) {
    fail(`${path} must be a safe integer; received ${value}`);
  }
  if (value < minimumInclusive) {
    fail(`${path} must be >= ${minimumInclusive}; received ${value}`);
  }
  return value;
}

function requireBoolean(parent: Record<string, unknown>, key: string, path: string): boolean {
  const value = requireField(parent, key, path);
  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }
  return value;
}

function requireExactBoolean(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  expected: boolean,
): void {
  if (requireBoolean(parent, key, path) !== expected) {
    fail(`${path} must be ${expected}`);
  }
}

function requireExactNumber(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  expected: number,
): void {
  const value = requireFiniteNumber(parent, key, path);
  if (value !== expected) {
    fail(`${path} must be ${expected}; received ${value}`);
  }
}

function requireExactString(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  expected: string,
): void {
  const value = requireString(parent, key, path);
  if (value !== expected) {
    fail(`${path} must be ${expected}; received ${value}`);
  }
}

function requireStringArray(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  options?: { unique?: boolean },
): string[] {
  const value = requireField(parent, key, path);
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      fail(`${path}[${index}] must be a non-empty string`);
    }
    if (options?.unique) {
      if (seen.has(entry)) {
        fail(`${path}[${index}] duplicates ${entry}`);
      }
      seen.add(entry);
    }
    return entry;
  });
}

function requireOrderedInterval(input: {
  minInclusive: number;
  maxExclusive: number;
  minPath: string;
  maxPath: string;
}): void {
  if (input.maxExclusive <= input.minInclusive) {
    fail(`${input.maxPath} must be greater than ${input.minPath}`);
  }
}

function parseEligibilityRules(parsed: Record<string, unknown>): FrozenHypothesisSpec["eligibilityRules"] {
  const eligibilityRules = requireSection(parsed, "eligibilityRules", "eligibilityRules");

  const volatilityRule = requireSection(eligibilityRules, "volatility", "eligibilityRules.volatility");
  const volatilityMinInclusive = requireFiniteNumber(
    volatilityRule,
    "minInclusive",
    "eligibilityRules.volatility.minInclusive",
  );
  // An open-ended upper bound is legitimate here, but it must be an explicit null.
  const volatilityMaxExclusive = requireNullableFiniteNumber(
    volatilityRule,
    "maxExclusive",
    "eligibilityRules.volatility.maxExclusive",
  );
  if (volatilityMaxExclusive !== null) {
    requireOrderedInterval({
      minInclusive: volatilityMinInclusive,
      maxExclusive: volatilityMaxExclusive,
      minPath: "eligibilityRules.volatility.minInclusive",
      maxPath: "eligibilityRules.volatility.maxExclusive",
    });
  }

  const probabilityRule = requireSection(eligibilityRules, "probability", "eligibilityRules.probability");
  const probabilityMinInclusive = requireNumberWithin(
    probabilityRule,
    "minInclusive",
    "eligibilityRules.probability.minInclusive",
    0,
    1,
  );
  const probabilityMaxExclusive = requireNumberWithin(
    probabilityRule,
    "maxExclusive",
    "eligibilityRules.probability.maxExclusive",
    0,
    1,
  );
  requireOrderedInterval({
    minInclusive: probabilityMinInclusive,
    maxExclusive: probabilityMaxExclusive,
    minPath: "eligibilityRules.probability.minInclusive",
    maxPath: "eligibilityRules.probability.maxExclusive",
  });

  const timeRule = requireSection(eligibilityRules, "timeRemainingMs", "eligibilityRules.timeRemainingMs");
  const timeMinInclusive = requireFiniteNumber(
    timeRule,
    "minInclusive",
    "eligibilityRules.timeRemainingMs.minInclusive",
  );
  const timeMaxExclusive = requireFiniteNumber(
    timeRule,
    "maxExclusive",
    "eligibilityRules.timeRemainingMs.maxExclusive",
  );
  requireOrderedInterval({
    minInclusive: timeMinInclusive,
    maxExclusive: timeMaxExclusive,
    minPath: "eligibilityRules.timeRemainingMs.minInclusive",
    maxPath: "eligibilityRules.timeRemainingMs.maxExclusive",
  });

  return {
    volatility: {
      bucketId: requireString(volatilityRule, "bucketId", "eligibilityRules.volatility.bucketId"),
      minInclusive: volatilityMinInclusive,
      maxExclusive: volatilityMaxExclusive,
    },
    probability: {
      bucketId: requireString(probabilityRule, "bucketId", "eligibilityRules.probability.bucketId"),
      minInclusive: probabilityMinInclusive,
      maxExclusive: probabilityMaxExclusive,
    },
    timeRemainingMs: {
      bucketId: requireString(timeRule, "bucketId", "eligibilityRules.timeRemainingMs.bucketId"),
      minInclusive: timeMinInclusive,
      maxExclusive: timeMaxExclusive,
    },
  };
}

function parseProbabilityMeasure(parsed: Record<string, unknown>): FrozenHypothesisSpec["probabilityMeasure"] {
  const probabilityMeasure = requireSection(parsed, "probabilityMeasure", "probabilityMeasure");
  return {
    id: requireLiteral(probabilityMeasure, "id", "probabilityMeasure.id", ["yes-bid-ask-midpoint"] as const),
    definition: requireString(probabilityMeasure, "definition", "probabilityMeasure.definition"),
    formula: requireString(probabilityMeasure, "formula", "probabilityMeasure.formula"),
  };
}

function parseVolatilityDefinition(parsed: Record<string, unknown>): FrozenHypothesisSpec["volatilityDefinition"] {
  const volatilityDefinition = requireSection(parsed, "volatilityDefinition", "volatilityDefinition");
  // A non-causal volatility measure would leak future information into forward
  // eligibility, so the frozen document may only ever declare causalOnly: true.
  requireExactBoolean(volatilityDefinition, "causalOnly", "volatilityDefinition.causalOnly", true);
  return {
    sourceInstrument: requireLiteral(
      volatilityDefinition,
      "sourceInstrument",
      "volatilityDefinition.sourceInstrument",
      ["BTC"] as const,
    ),
    returnIntervalMs: requireSafeInteger(
      volatilityDefinition,
      "returnIntervalMs",
      "volatilityDefinition.returnIntervalMs",
      1,
    ),
    lookbackBars: requireSafeInteger(volatilityDefinition, "lookbackBars", "volatilityDefinition.lookbackBars", 2),
    method: requireLiteral(volatilityDefinition, "method", "volatilityDefinition.method", [
      "realized-log-return-annualized",
    ] as const),
    causalOnly: true,
    maximumSourceGapMs: requireSafeInteger(
      volatilityDefinition,
      "maximumSourceGapMs",
      "volatilityDefinition.maximumSourceGapMs",
      0,
    ),
  };
}

function parseMarketEligibilityRules(
  parsed: Record<string, unknown>,
): FrozenHypothesisSpec["marketEligibilityRules"] {
  const rules = requireSection(parsed, "marketEligibilityRules", "marketEligibilityRules");
  return {
    requireValidBook: requireBoolean(rules, "requireValidBook", "marketEligibilityRules.requireValidBook"),
    requireSynchronizedBook: requireBoolean(
      rules,
      "requireSynchronizedBook",
      "marketEligibilityRules.requireSynchronizedBook",
    ),
    requireOpenMarket: requireBoolean(rules, "requireOpenMarket", "marketEligibilityRules.requireOpenMarket"),
    requireBtcJoin: requireBoolean(rules, "requireBtcJoin", "marketEligibilityRules.requireBtcJoin"),
  };
}

function parseDeduplicationPolicy(parsed: Record<string, unknown>): FrozenHypothesisSpec["deduplicationPolicy"] {
  const policy = requireSection(parsed, "deduplicationPolicy", "deduplicationPolicy");
  return {
    episodeBreakOnDisqualification: requireBoolean(
      policy,
      "episodeBreakOnDisqualification",
      "deduplicationPolicy.episodeBreakOnDisqualification",
    ),
    entryRule: requireString(policy, "entryRule", "deduplicationPolicy.entryRule"),
    primaryValidationUnit: requireString(
      policy,
      "primaryValidationUnit",
      "deduplicationPolicy.primaryValidationUnit",
    ),
    suppressRepeatedQualifyingSnapshots: requireBoolean(
      policy,
      "suppressRepeatedQualifyingSnapshots",
      "deduplicationPolicy.suppressRepeatedQualifyingSnapshots",
    ),
  };
}

function parseEntryPriceMeasures(parsed: Record<string, unknown>): FrozenHypothesisSpec["entryPriceMeasures"] {
  const measures = requireSection(parsed, "entryPriceMeasures", "entryPriceMeasures");
  return {
    calibrationLayer: requireString(measures, "calibrationLayer", "entryPriceMeasures.calibrationLayer"),
    executableLayer: requireString(measures, "executableLayer", "entryPriceMeasures.executableLayer"),
    diagnosticLayer: requireString(measures, "diagnosticLayer", "entryPriceMeasures.diagnosticLayer"),
  };
}

function parseSettlementMapping(parsed: Record<string, unknown>): Record<string, string | number> {
  const source = requireSection(parsed, "settlementMapping", "settlementMapping");
  const settlementMapping: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim().length > 0) {
      settlementMapping[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      settlementMapping[key] = value;
      continue;
    }
    fail(`settlementMapping.${key} must be a non-empty string or a finite number`);
  }
  return settlementMapping;
}

function parseMinimumEvidenceRequirements(
  parsed: Record<string, unknown>,
): FrozenHypothesisSpec["minimumEvidenceRequirements"] {
  const requirements = requireSection(parsed, "minimumEvidenceRequirements", "minimumEvidenceRequirements");
  return {
    minimumIndependentCandidateMarkets: requireSafeInteger(
      requirements,
      "minimumIndependentCandidateMarkets",
      "minimumEvidenceRequirements.minimumIndependentCandidateMarkets",
      1,
    ),
    minimumSettlementCoverageShare: requireNumberWithin(
      requirements,
      "minimumSettlementCoverageShare",
      "minimumEvidenceRequirements.minimumSettlementCoverageShare",
      0,
      1,
    ),
    minimumValidBookShare: requireNumberWithin(
      requirements,
      "minimumValidBookShare",
      "minimumEvidenceRequirements.minimumValidBookShare",
      0,
      1,
    ),
    minimumBtcJoinCoverageShare: requireNumberWithin(
      requirements,
      "minimumBtcJoinCoverageShare",
      "minimumEvidenceRequirements.minimumBtcJoinCoverageShare",
      0,
      1,
    ),
    materialRejectionCalibrationGap: requireNumberWithin(
      requirements,
      "materialRejectionCalibrationGap",
      "minimumEvidenceRequirements.materialRejectionCalibrationGap",
      0,
      1,
    ),
    materialSupportCalibrationGap: requireNumberWithin(
      requirements,
      "materialSupportCalibrationGap",
      "minimumEvidenceRequirements.materialSupportCalibrationGap",
      0,
      1,
    ),
    materialExecutableNetReturnCents: requireFiniteNumber(
      requirements,
      "materialExecutableNetReturnCents",
      "minimumEvidenceRequirements.materialExecutableNetReturnCents",
    ),
  };
}

/**
 * The declared precedence must reproduce the classifier's own order exactly, so
 * the frozen document can never claim an evaluation order the code does not run.
 */
function parseClassificationPrecedence(
  parsed: Record<string, unknown>,
): readonly CalibrationFadeInterpretationClassification[] {
  const classificationRules = requireSection(parsed, "classificationRules", "classificationRules");
  const value = requireField(classificationRules, "precedence", "classificationRules.precedence");
  if (!Array.isArray(value)) {
    fail("classificationRules.precedence must be an array");
  }

  const seen = new Set<string>();
  const precedence = value.map((entry, index) => {
    const path = `classificationRules.precedence[${index}]`;
    if (
      typeof entry !== "string"
      || !(CALIBRATION_FADE_INTERPRETATION_CLASSIFICATIONS as readonly string[]).includes(entry)
    ) {
      fail(`${path} must be a recognized calibration-fade interpretation classification`);
    }
    if (seen.has(entry)) {
      fail(`${path} duplicates ${entry}`);
    }
    seen.add(entry);
    return entry as CalibrationFadeInterpretationClassification;
  });

  const canonical = CANONICAL_CALIBRATION_FADE_CLASSIFICATION_PRECEDENCE;
  const matchesCanonical =
    precedence.length === canonical.length && precedence.every((entry, index) => entry === canonical[index]);
  if (!matchesCanonical) {
    fail(
      "classificationRules.precedence must exactly match the live classifier precedence "
        + `[${canonical.join(", ")}]; received [${precedence.join(", ")}]`,
    );
  }

  return precedence;
}

/**
 * Validates the freeze document field by field and fails closed. Every governed
 * value must be present and well typed; nothing is inferred or defaulted.
 */
function parseFreezeDocument(parsed: Record<string, unknown>): Omit<FrozenHypothesisSpec, "configurationHash"> {
  return {
    hypothesisId: requireString(parsed, "hypothesisId", "hypothesisId"),
    hypothesisVersion: requireString(parsed, "hypothesisVersion", "hypothesisVersion"),
    description: requireString(parsed, "description", "description"),
    canonicalSourceArtifacts: requireStringArray(
      parsed,
      "canonicalSourceArtifacts",
      "canonicalSourceArtifacts",
      { unique: true },
    ),
    sourceCandidateId: requireString(parsed, "sourceCandidateId", "sourceCandidateId"),
    axisGroupId: requireString(parsed, "axisGroupId", "axisGroupId"),
    bucketId: requireString(parsed, "bucketId", "bucketId"),
    calibrationDirection: requireLiteral(parsed, "calibrationDirection", "calibrationDirection", [
      "over",
      "under",
    ] as const),
    targetOutcomeSide: requireLiteral(parsed, "targetOutcomeSide", "targetOutcomeSide", ["yes", "no"] as const),
    suggestedStrategyFamily: requireString(parsed, "suggestedStrategyFamily", "suggestedStrategyFamily"),
    eligibilityRules: parseEligibilityRules(parsed),
    probabilityMeasure: parseProbabilityMeasure(parsed),
    volatilityDefinition: parseVolatilityDefinition(parsed),
    marketEligibilityRules: parseMarketEligibilityRules(parsed),
    deduplicationPolicy: parseDeduplicationPolicy(parsed),
    entryPriceMeasures: parseEntryPriceMeasures(parsed),
    settlementMapping: parseSettlementMapping(parsed),
    minimumEvidenceRequirements: parseMinimumEvidenceRequirements(parsed),
    classificationRules: { precedence: parseClassificationPrecedence(parsed) },
  };
}

function findCandidate(
  parsed: Record<string, unknown>,
  candidateId: string,
): HypothesisCandidate | null {
  const candidates = parsed.candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const entry of candidates) {
    if (!isRecord(entry)) {
      continue;
    }
    if (readString(entry.candidateId) === candidateId) {
      return entry as unknown as HypothesisCandidate;
    }
  }

  return null;
}

function emptyProvenance(status: CalibrationFadeProvenanceStatus, path: string | null): CalibrationFadeProvenanceReport {
  return {
    provenanceAvailable: false,
    provenanceStatus: status,
    provenanceManifestPath: path,
    provenanceManifestHash: null,
    provenanceConclusion: null,
    verificationModel: null,
    ruleFreezeEvidence: null,
    historicalBenchmarkAvailability: null,
    missingArtifacts: [],
    declaredMissingArtifacts: [],
    limitations: [],
    integrityCorrections: [],
    originalFreezeCommitSha: null,
    originalFreezeCommitTimestamp: null,
    originalConfigHash: null,
    resolvedConfigHash: null,
    firstForwardEvaluationBoundary: null,
    hashSemantics: CALIBRATION_FADE_PROVENANCE_HASH_SEMANTICS,
    configurationHashSemantics: CALIBRATION_FADE_CONFIGURATION_HASH_SEMANTICS,
  };
}

/** Carries a specific provenance status for failures that are not plain field gaps. */
class ProvenanceManifestRejection extends Error {
  constructor(
    readonly status: CalibrationFadeProvenanceStatus,
    message: string,
  ) {
    super(message);
    this.name = "ProvenanceManifestRejection";
  }
}

function requireFirstForwardEvaluationBoundary(
  manifest: Record<string, unknown>,
): CalibrationFadeFirstForwardEvaluationBoundary {
  const boundary = requireSection(manifest, "firstForwardEvaluationBoundary", "firstForwardEvaluationBoundary");
  requireExactString(
    boundary,
    "claim",
    "firstForwardEvaluationBoundary.claim",
    CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_CLAIM,
  );
  requireExactString(
    boundary,
    "verificationBasis",
    "firstForwardEvaluationBoundary.verificationBasis",
    CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_VERIFICATION_BASIS,
  );
  // The boundary is a reviewed claim, never a runtime measurement; a manifest
  // asserting runtime verification would overstate what this loader can prove.
  requireExactBoolean(boundary, "runtimeVerified", "firstForwardEvaluationBoundary.runtimeVerified", false);
  return {
    claim: CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_CLAIM,
    verificationBasis: CALIBRATION_FADE_FIRST_FORWARD_BOUNDARY_VERIFICATION_BASIS,
    runtimeVerified: false,
  };
}

function requireProbabilityBandCorrectionEvidence(input: {
  parent: Record<string, unknown>;
  path: string;
  spec: FrozenHypothesisSpec;
}): void {
  const original = requireSection(input.parent, "originalProbabilityBounds", `${input.path}.originalProbabilityBounds`);
  requireExactNumber(
    original,
    "minInclusive",
    `${input.path}.originalProbabilityBounds.minInclusive`,
    ORIGINAL_FROZEN_PROBABILITY_BOUNDS.minInclusive,
  );
  requireExactNumber(
    original,
    "maxExclusive",
    `${input.path}.originalProbabilityBounds.maxExclusive`,
    ORIGINAL_FROZEN_PROBABILITY_BOUNDS.maxExclusive,
  );

  // Resolved bounds are checked against the loaded spec, so the manifest cannot
  // describe a reconciliation the frozen config did not actually adopt.
  const resolvedRule = input.spec.eligibilityRules.probability;
  const resolved = requireSection(input.parent, "resolvedProbabilityBounds", `${input.path}.resolvedProbabilityBounds`);
  requireExactNumber(
    resolved,
    "minInclusive",
    `${input.path}.resolvedProbabilityBounds.minInclusive`,
    resolvedRule.minInclusive,
  );
  requireExactNumber(
    resolved,
    "maxExclusive",
    `${input.path}.resolvedProbabilityBounds.maxExclusive`,
    resolvedRule.maxExclusive,
  );
  requireExactString(
    resolved,
    "bucketId",
    `${input.path}.resolvedProbabilityBounds.bucketId`,
    resolvedRule.bucketId,
  );
}

function requireRuleFreezeEvidence(input: {
  manifest: Record<string, unknown>;
  spec: FrozenHypothesisSpec;
}): Record<string, unknown> {
  const evidence = requireSection(input.manifest, "ruleFreezeEvidence", "ruleFreezeEvidence");
  requireExactString(evidence, "kind", "ruleFreezeEvidence.kind", "repository-history");
  const description = requireString(evidence, "description", "ruleFreezeEvidence.description");

  const declaresNoRuntimeGit = Object.prototype.hasOwnProperty.call(evidence, "runtimeGitExecuted")
    ? requireBoolean(evidence, "runtimeGitExecuted", "ruleFreezeEvidence.runtimeGitExecuted") === false
    : RUNTIME_GIT_NOT_EXECUTED_PATTERN.test(description);
  if (!declaresNoRuntimeGit) {
    fail(
      "ruleFreezeEvidence must set runtimeGitExecuted:false or state in ruleFreezeEvidence.description "
        + "that Git is not executed at evaluation time",
    );
  }

  requireProbabilityBandCorrectionEvidence({ parent: evidence, path: "ruleFreezeEvidence", spec: input.spec });

  return evidence;
}

function requireIntegrityCorrections(input: {
  manifest: Record<string, unknown>;
  spec: FrozenHypothesisSpec;
  originalConfigHash: string;
  resolvedConfigHash: string;
}): Record<string, unknown>[] {
  const value = requireField(input.manifest, "integrityCorrections", "integrityCorrections");
  if (!Array.isArray(value)) {
    fail("integrityCorrections must be an array");
  }

  const seenIds = new Set<string>();
  const corrections = value.map((entry, index) => {
    const path = `integrityCorrections[${index}]`;
    if (!isRecord(entry)) {
      fail(`${path} must be an object`);
    }
    const id = requireLiteral(entry, "id", `${path}.id`, RECOGNIZED_INTEGRITY_CORRECTION_IDS);
    if (seenIds.has(id)) {
      fail(`${path}.id duplicates ${id}`);
    }
    seenIds.add(id);
    requireExactString(entry, "kind", `${path}.kind`, "integrity-correction");
    requireString(entry, "summary", `${path}.summary`);
    requireString(entry, "rationale", `${path}.rationale`);
    requireExactString(entry, "originalConfigHash", `${path}.originalConfigHash`, input.originalConfigHash);
    requireExactString(entry, "resolvedConfigHash", `${path}.resolvedConfigHash`, input.resolvedConfigHash);
    if (id === PROBABILITY_BAND_CORRECTION_ID) {
      requireProbabilityBandCorrectionEvidence({ parent: entry, path, spec: input.spec });
    }
    return entry;
  });

  // A hash divergence is only defensible when the manifest documents the edit
  // that produced it; otherwise the resolved config is an undocumented rewrite.
  if (input.originalConfigHash !== input.resolvedConfigHash && !seenIds.has(PROBABILITY_BAND_CORRECTION_ID)) {
    fail(
      `integrityCorrections must document ${PROBABILITY_BAND_CORRECTION_ID} because originalConfigHash `
        + `(${input.originalConfigHash}) differs from resolvedConfigHash (${input.resolvedConfigHash})`,
    );
  }

  return corrections;
}

function readValidatedManifest(input: {
  manifest: Record<string, unknown>;
  manifestPath: string;
  rawContent: string;
  configPath: string;
  spec: FrozenHypothesisSpec;
}): CalibrationFadeProvenanceReport {
  const manifest = input.manifest;

  const schema = readString(manifest.schema);
  const version = readNumber(manifest.version);
  if (
    schema !== CALIBRATION_FADE_PROVENANCE_MANIFEST_SCHEMA
    || version !== CALIBRATION_FADE_PROVENANCE_MANIFEST_VERSION
  ) {
    throw new ProvenanceManifestRejection(
      "unsupported-manifest-version",
      `Unsupported provenance manifest version/schema (schema=${schema ?? "missing"}, version=${version ?? "missing"})`,
    );
  }

  const verificationModel = requireString(manifest, "verificationModel", "verificationModel");
  if (verificationModel !== CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL) {
    throw new ProvenanceManifestRejection(
      "unsupported-verification-model",
      `Unsupported provenance verificationModel ${verificationModel}; `
        + `only ${CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL} is accepted`,
    );
  }

  const hypothesisId = requireString(manifest, "hypothesisId", "hypothesisId");
  const sourceCandidateId = requireString(manifest, "sourceCandidateId", "sourceCandidateId");
  const declaredConfigPath = requireString(manifest, "configPath", "configPath");
  if (
    hypothesisId !== input.spec.hypothesisId
    || sourceCandidateId !== input.spec.sourceCandidateId
    || declaredConfigPath !== input.configPath
  ) {
    throw new ProvenanceManifestRejection(
      "mismatched-manifest",
      "Provenance manifest identity mismatch "
        + "(hypothesisId/sourceCandidateId/configPath must match the loaded freeze spec)",
    );
  }

  const originalFreezeCommitSha = requireString(manifest, "originalFreezeCommitSha", "originalFreezeCommitSha");
  if (!GIT_COMMIT_SHA_PATTERN.test(originalFreezeCommitSha)) {
    fail("originalFreezeCommitSha must be a full 40-character hexadecimal Git commit SHA");
  }

  const originalFreezeCommitTimestamp = requireString(
    manifest,
    "originalFreezeCommitTimestamp",
    "originalFreezeCommitTimestamp",
  );
  if (
    !ISO_8601_TIMESTAMP_PATTERN.test(originalFreezeCommitTimestamp)
    || !Number.isFinite(Date.parse(originalFreezeCommitTimestamp))
  ) {
    fail("originalFreezeCommitTimestamp must be a parseable ISO-8601 timestamp with an explicit UTC offset");
  }

  const originalConfigHash = requireString(manifest, "originalConfigHash", "originalConfigHash");
  if (!CONFIG_HASH_PATTERN.test(originalConfigHash)) {
    fail("originalConfigHash must be an 8-character lowercase hexadecimal fnv1a32 hash");
  }

  const resolvedConfigHash = requireString(manifest, "resolvedConfigHash", "resolvedConfigHash");
  if (!CONFIG_HASH_PATTERN.test(resolvedConfigHash)) {
    fail("resolvedConfigHash must be an 8-character lowercase hexadecimal fnv1a32 hash");
  }
  if (resolvedConfigHash !== input.spec.configurationHash) {
    throw new ProvenanceManifestRejection(
      "mismatched-manifest",
      `Provenance manifest resolvedConfigHash ${resolvedConfigHash} does not match `
        + `current configuration hash ${input.spec.configurationHash}`,
    );
  }

  const conclusion = requireString(manifest, "conclusion", "conclusion");
  if (!(CALIBRATION_FADE_PROVENANCE_ACCEPTED_CONCLUSIONS as readonly string[]).includes(conclusion)) {
    throw new ProvenanceManifestRejection(
      "unacceptable-conclusion",
      `Unacceptable provenance conclusion ${conclusion}`,
    );
  }

  const firstForwardEvaluationBoundary = requireFirstForwardEvaluationBoundary(manifest);
  const ruleFreezeEvidence = requireRuleFreezeEvidence({ manifest, spec: input.spec });
  const historicalBenchmarkAvailability = requireLiteral(
    manifest,
    "historicalBenchmarkAvailability",
    "historicalBenchmarkAvailability",
    ["available", "unavailable"] as const,
  );

  const declaredMissingArtifacts = requireStringArray(manifest, "missingArtifacts", "missingArtifacts", {
    unique: true,
  });
  for (const [index, artifactPath] of declaredMissingArtifacts.entries()) {
    if (!input.spec.canonicalSourceArtifacts.includes(artifactPath)) {
      fail(`missingArtifacts[${index}] ${artifactPath} is not a canonical source artifact of the freeze spec`);
    }
  }

  const limitations = requireStringArray(manifest, "limitations", "limitations");
  const integrityCorrections = requireIntegrityCorrections({
    manifest,
    spec: input.spec,
    originalConfigHash,
    resolvedConfigHash,
  });

  return {
    provenanceAvailable: true,
    provenanceStatus: "valid-manifest",
    provenanceManifestPath: input.manifestPath,
    provenanceManifestHash: hashFileContent(input.rawContent),
    provenanceConclusion: conclusion as CalibrationFadeProvenanceConclusion,
    verificationModel: CALIBRATION_FADE_PROVENANCE_VERIFICATION_MODEL,
    ruleFreezeEvidence,
    historicalBenchmarkAvailability,
    missingArtifacts: declaredMissingArtifacts,
    declaredMissingArtifacts,
    limitations,
    integrityCorrections,
    originalFreezeCommitSha: originalFreezeCommitSha.toLowerCase(),
    originalFreezeCommitTimestamp,
    originalConfigHash,
    resolvedConfigHash,
    firstForwardEvaluationBoundary,
    hashSemantics: CALIBRATION_FADE_PROVENANCE_HASH_SEMANTICS,
    configurationHashSemantics: CALIBRATION_FADE_CONFIGURATION_HASH_SEMANTICS,
  };
}

function validateProvenanceManifest(input: {
  io: CalibrationFadeForwardValidationIo;
  configPath: string;
  spec: FrozenHypothesisSpec;
}): { provenance: CalibrationFadeProvenanceReport; warnings: string[] } {
  const manifestPath = deriveProvenanceManifestPath(input.configPath);
  const warnings: string[] = [];

  if (!input.io.fileExists(manifestPath)) {
    warnings.push(`Missing provenance manifest: ${manifestPath}`);
    return { provenance: emptyProvenance("missing-manifest", manifestPath), warnings };
  }

  let rawContent: string;
  let parsed: unknown;
  try {
    rawContent = input.io.readFile(manifestPath).replace(/^\uFEFF/, "");
    parsed = JSON.parse(rawContent);
  } catch {
    warnings.push(`Malformed provenance manifest: ${manifestPath}`);
    return { provenance: emptyProvenance("malformed-manifest", manifestPath), warnings };
  }

  if (!isRecord(parsed)) {
    warnings.push(`Provenance manifest root must be an object: ${manifestPath}`);
    return { provenance: emptyProvenance("malformed-manifest", manifestPath), warnings };
  }

  try {
    const provenance = readValidatedManifest({
      manifest: parsed,
      manifestPath,
      rawContent,
      configPath: input.configPath,
      spec: input.spec,
    });
    return { provenance, warnings };
  } catch (error) {
    if (error instanceof ProvenanceManifestRejection) {
      warnings.push(`${error.message} at ${manifestPath}.`);
      return { provenance: emptyProvenance(error.status, manifestPath), warnings };
    }
    if (error instanceof CalibrationFadeForwardValidationError) {
      warnings.push(`Incomplete provenance manifest at ${manifestPath}: ${error.message}.`);
      return { provenance: emptyProvenance("incomplete-manifest", manifestPath), warnings };
    }
    throw error;
  }
}

/**
 * Filesystem truth wins over the manifest's declaration. A stale declaration is
 * reported but does not invalidate rule freeze, which is an independent claim.
 */
function reconcileRuntimeArtifacts(input: {
  provenance: CalibrationFadeProvenanceReport;
  runtimeMissingArtifacts: readonly string[];
  runtimeLoadedArtifacts: readonly string[];
}): { provenance: CalibrationFadeProvenanceReport; warnings: string[] } {
  const warnings: string[] = [];
  const declared = input.provenance.declaredMissingArtifacts;

  if (input.provenance.provenanceAvailable) {
    for (const artifactPath of declared) {
      if (!input.runtimeMissingArtifacts.includes(artifactPath)) {
        warnings.push(
          `Provenance manifest declares ${artifactPath} missing, but it is present in this checkout; `
            + "runtime observation overrides the declaration.",
        );
      }
    }
    for (const artifactPath of input.runtimeMissingArtifacts) {
      if (!declared.includes(artifactPath)) {
        warnings.push(
          `Canonical source artifact ${artifactPath} is missing at runtime but is not declared missing `
            + "in the provenance manifest.",
        );
      }
    }
  }

  return {
    provenance: {
      ...input.provenance,
      missingArtifacts: input.runtimeMissingArtifacts,
      runtimeMissingArtifacts: input.runtimeMissingArtifacts,
      runtimeLoadedArtifacts: input.runtimeLoadedArtifacts,
    },
    warnings,
  };
}

/** Loads and hashes the frozen hypothesis specification with rule-freeze provenance. */
export function loadFrozenHypothesisSpec(input: {
  io: CalibrationFadeForwardValidationIo;
  hypothesisConfigPath?: string;
  hypothesisId?: string;
}): {
  spec: FrozenHypothesisSpec;
  historicalBenchmark: HistoricalHypothesisBenchmark;
  provenanceAvailable: boolean;
  provenance: CalibrationFadeProvenanceReport;
  warnings: string[];
} {
  const configPath = (input.hypothesisConfigPath ?? DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH).replace(
    /\\/g,
    "/",
  );
  if (!input.io.fileExists(configPath)) {
    throw new CalibrationFadeForwardValidationError(`Hypothesis freeze spec not found: ${configPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.io.readFile(configPath).replace(/^\uFEFF/, ""));
  } catch {
    throw new CalibrationFadeForwardValidationError(`Malformed hypothesis freeze spec: ${configPath}`);
  }

  if (!isRecord(parsed)) {
    throw new CalibrationFadeForwardValidationError(`Hypothesis freeze spec root must be an object: ${configPath}`);
  }

  const withoutHash = parseFreezeDocument(parsed);
  if (input.hypothesisId && withoutHash.hypothesisId !== input.hypothesisId) {
    throw new CalibrationFadeForwardValidationError(
      `Unknown hypothesis ID ${input.hypothesisId}; expected ${withoutHash.hypothesisId}.`,
    );
  }

  const configurationHash = fnv1a32(stableStringify(withoutHash));
  const spec: FrozenHypothesisSpec = { ...withoutHash, configurationHash };

  const { provenance: declaredProvenance, warnings: provenanceWarnings } = validateProvenanceManifest({
    io: input.io,
    configPath,
    spec,
  });

  const sourceArtifactHashes: Record<string, string> = {};
  const runtimeMissingArtifacts: string[] = [];
  const runtimeLoadedArtifacts: string[] = [];
  const warnings: string[] = [...provenanceWarnings];
  let candidate: HypothesisCandidate | null = null;
  let validationRecord: Record<string, unknown> | null = null;

  for (const artifactPath of spec.canonicalSourceArtifacts) {
    if (!input.io.fileExists(artifactPath)) {
      runtimeMissingArtifacts.push(artifactPath);
      warnings.push(`Missing canonical source artifact: ${artifactPath}`);
      continue;
    }
    const content = input.io.readFile(artifactPath);
    runtimeLoadedArtifacts.push(artifactPath);
    sourceArtifactHashes[artifactPath] = hashFileContent(content);
    const artifactParsed = JSON.parse(content.replace(/^\uFEFF/, "")) as Record<string, unknown>;
    if (artifactPath.includes("hypothesis-candidates")) {
      candidate = findCandidate(artifactParsed, spec.sourceCandidateId);
      if (!candidate) {
        warnings.push(`Canonical candidate ${spec.sourceCandidateId} not found in ${artifactPath}.`);
      }
    }
    if (artifactPath.includes("hypothesis-validation") && Array.isArray(artifactParsed.validations)) {
      validationRecord =
        artifactParsed.validations.find(
          (entry) => isRecord(entry) && readString(entry.hypothesisId) === spec.sourceCandidateId,
        ) as Record<string, unknown> | undefined ?? null;
    }
  }

  const { provenance, warnings: reconciliationWarnings } = reconcileRuntimeArtifacts({
    provenance: declaredProvenance,
    runtimeMissingArtifacts,
    runtimeLoadedArtifacts,
  });
  warnings.push(...reconciliationWarnings);

  // Rule-freeze provenance comes from the validated manifest (even when candidate JSON is absent).
  // Historical benchmark statistics remain null when discovery artifacts are missing.
  const provenanceAvailable = provenance.provenanceAvailable;
  const bucketMetadata = candidate?.bucketMetadata;
  const historicalBenchmark: HistoricalHypothesisBenchmark = {
    discoveryObservationCount: readNumber(bucketMetadata?.observations) ?? null,
    discoveryUniqueTradingDays: readNumber(bucketMetadata?.uniqueTradingDays) ?? null,
    discoveryCalibrationError: readNumber(bucketMetadata?.calibrationError) ?? null,
    discoveryAverageImpliedProbability: null,
    discoveryRealizedFrequency: null,
    discoveryRobustnessScore: readNumber(validationRecord?.robustnessScore) ?? null,
    discoveryPassesValidation: typeof validationRecord?.passes === "boolean" ? validationRecord.passes : null,
    sourceArtifactPaths: spec.canonicalSourceArtifacts,
    sourceArtifactHashes,
    caveats: candidate?.warnings ?? [],
  };

  if (candidate?.rationale) {
    const impliedMatch = candidate.rationale.match(/implied ([0-9.]+%)/i);
    const realizedMatch = candidate.rationale.match(/realized ([0-9.]+%)/i);
    if (impliedMatch?.[1]) {
      historicalBenchmark.discoveryAverageImpliedProbability =
        Number.parseFloat(impliedMatch[1].replace("%", "")) / 100;
    }
    if (realizedMatch?.[1]) {
      historicalBenchmark.discoveryRealizedFrequency =
        Number.parseFloat(realizedMatch[1].replace("%", "")) / 100;
    }
  }

  return { spec, historicalBenchmark, provenanceAvailable, provenance, warnings };
}
