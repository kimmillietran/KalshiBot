import { isRecord } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
  CalibrationFadeV2PreregistrationError,
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  V2_ADJACENT_SOURCE_GAP_POLICY_NONE,
  V2_REQUIRED_PROVIDER,
  V2_REQUIRED_PROVIDER_INSTRUMENT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
  type CalibrationFadeV2HypothesisSpec,
  type CalibrationFadeV2PreregistrationIo,
  type CalibrationFadeV2VolatilityDefinition,
} from "./calibrationFadeV2PreregistrationTypes";

function fail(message: string): never {
  throw new CalibrationFadeV2PreregistrationError(message);
}

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

function requireExactBoolean(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  expected: boolean,
): void {
  const value = requireField(parent, key, path);
  if (typeof value !== "boolean" || value !== expected) {
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

function requireBoolean(parent: Record<string, unknown>, key: string, path: string): boolean {
  const value = requireField(parent, key, path);
  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }
  return value;
}

function requireStringArray(
  parent: Record<string, unknown>,
  key: string,
  path: string,
): readonly string[] {
  const value = requireField(parent, key, path);
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    fail(`${path} must be a non-empty string array`);
  }
  return value as string[];
}

function parseEligibilityRules(
  parsed: Record<string, unknown>,
): CalibrationFadeV2HypothesisSpec["eligibilityRules"] {
  const eligibilityRules = requireSection(parsed, "eligibilityRules", "eligibilityRules");
  const volatility = requireSection(eligibilityRules, "volatility", "eligibilityRules.volatility");
  const probability = requireSection(eligibilityRules, "probability", "eligibilityRules.probability");
  const timeRemainingMs = requireSection(
    eligibilityRules,
    "timeRemainingMs",
    "eligibilityRules.timeRemainingMs",
  );

  const volMax = requireNullableFiniteNumber(
    volatility,
    "maxExclusive",
    "eligibilityRules.volatility.maxExclusive",
  );
  requireExactNumber(volatility, "minInclusive", "eligibilityRules.volatility.minInclusive", 0.6);

  return {
    volatility: {
      bucketId: requireString(volatility, "bucketId", "eligibilityRules.volatility.bucketId"),
      minInclusive: 0.6,
      maxExclusive: volMax,
    },
    probability: {
      bucketId: requireString(probability, "bucketId", "eligibilityRules.probability.bucketId"),
      minInclusive: requireFiniteNumber(
        probability,
        "minInclusive",
        "eligibilityRules.probability.minInclusive",
      ),
      maxExclusive: requireFiniteNumber(
        probability,
        "maxExclusive",
        "eligibilityRules.probability.maxExclusive",
      ),
    },
    timeRemainingMs: {
      bucketId: requireString(timeRemainingMs, "bucketId", "eligibilityRules.timeRemainingMs.bucketId"),
      minInclusive: requireFiniteNumber(
        timeRemainingMs,
        "minInclusive",
        "eligibilityRules.timeRemainingMs.minInclusive",
      ),
      maxExclusive: requireFiniteNumber(
        timeRemainingMs,
        "maxExclusive",
        "eligibilityRules.timeRemainingMs.maxExclusive",
      ),
    },
  };
}

/**
 * v2-only volatility parser. Rejects operative gap sentinels 0 and 5000.
 * Does not share code paths with v1 parseVolatilityDefinition.
 */
function parseVolatilityDefinition(parsed: Record<string, unknown>): CalibrationFadeV2VolatilityDefinition {
  const volatilityDefinition = requireSection(parsed, "volatilityDefinition", "volatilityDefinition");
  requireExactBoolean(volatilityDefinition, "causalOnly", "volatilityDefinition.causalOnly", true);
  requireExactNumber(
    volatilityDefinition,
    "returnIntervalMs",
    "volatilityDefinition.returnIntervalMs",
    60_000,
  );
  requireExactNumber(volatilityDefinition, "lookbackBars", "volatilityDefinition.lookbackBars", 10);
  requireExactNumber(
    volatilityDefinition,
    "requiredCloseCount",
    "volatilityDefinition.requiredCloseCount",
    11,
  );

  const adjacentSourceGapPolicy = requireLiteral(
    volatilityDefinition,
    "adjacentSourceGapPolicy",
    "volatilityDefinition.adjacentSourceGapPolicy",
    [V2_ADJACENT_SOURCE_GAP_POLICY_NONE] as const,
  );

  const maximumSourceGapMs = requireNullableFiniteNumber(
    volatilityDefinition,
    "maximumSourceGapMs",
    "volatilityDefinition.maximumSourceGapMs",
  );
  if (maximumSourceGapMs !== null) {
    fail(
      "volatilityDefinition.maximumSourceGapMs must be explicit null (not applicable) under adjacentSourceGapPolicy=none; "
        + `received ${JSON.stringify(maximumSourceGapMs)}. Sentinels 0 and 5000 are forbidden.`,
    );
  }

  return {
    sourceInstrument: requireLiteral(
      volatilityDefinition,
      "sourceInstrument",
      "volatilityDefinition.sourceInstrument",
      ["BTC"] as const,
    ),
    provider: requireLiteral(
      volatilityDefinition,
      "provider",
      "volatilityDefinition.provider",
      [V2_REQUIRED_PROVIDER] as const,
    ),
    providerInstrument: requireLiteral(
      volatilityDefinition,
      "providerInstrument",
      "volatilityDefinition.providerInstrument",
      [V2_REQUIRED_PROVIDER_INSTRUMENT] as const,
    ),
    sourceRecordType: requireLiteral(
      volatilityDefinition,
      "sourceRecordType",
      "volatilityDefinition.sourceRecordType",
      [V2_REQUIRED_SOURCE_RECORD_TYPE] as const,
    ),
    timestampField: requireLiteral(
      volatilityDefinition,
      "timestampField",
      "volatilityDefinition.timestampField",
      ["exchange-candle-close-time"] as const,
    ),
    timestampMeaning: requireLiteral(
      volatilityDefinition,
      "timestampMeaning",
      "volatilityDefinition.timestampMeaning",
      ["exchange-candle-close-time"] as const,
    ),
    returnIntervalMs: 60_000,
    lookbackBars: 10,
    requiredCloseCount: 11,
    method: requireLiteral(volatilityDefinition, "method", "volatilityDefinition.method", [
      "realized-log-return-annualized",
    ] as const),
    causalOnly: true,
    quoteMinutePolicy: requireLiteral(
      volatilityDefinition,
      "quoteMinutePolicy",
      "volatilityDefinition.quoteMinutePolicy",
      ["exclude-in-progress-minute-as-completed-candle"] as const,
    ),
    missingMinuteBehavior: requireLiteral(
      volatilityDefinition,
      "missingMinuteBehavior",
      "volatilityDefinition.missingMinuteBehavior",
      ["omit-missing-exchange-candles-no-fill"] as const,
    ),
    fillInterpolation: requireLiteral(
      volatilityDefinition,
      "fillInterpolation",
      "volatilityDefinition.fillInterpolation",
      ["none"] as const,
    ),
    adjacentSourceGapPolicy,
    maximumSourceGapMs: null,
  };
}

function parseFreezeDocument(parsed: Record<string, unknown>): CalibrationFadeV2HypothesisSpec {
  const eligibilityRules = parseEligibilityRules(parsed);
  if (eligibilityRules.probability.minInclusive !== 1 / 3) {
    fail(
      `eligibilityRules.probability.minInclusive must be exact 1/3; received ${eligibilityRules.probability.minInclusive}`,
    );
  }
  if (eligibilityRules.probability.maxExclusive !== 2 / 3) {
    fail(
      `eligibilityRules.probability.maxExclusive must be exact 2/3; received ${eligibilityRules.probability.maxExclusive}`,
    );
  }
  if (eligibilityRules.timeRemainingMs.maxExclusive !== 900_000) {
    fail(
      `eligibilityRules.timeRemainingMs.maxExclusive must be 900000 (<15m); received ${eligibilityRules.timeRemainingMs.maxExclusive}`,
    );
  }

  const probabilityMeasure = requireSection(parsed, "probabilityMeasure", "probabilityMeasure");
  const marketEligibilityRules = requireSection(
    parsed,
    "marketEligibilityRules",
    "marketEligibilityRules",
  );
  const deduplicationPolicy = requireSection(parsed, "deduplicationPolicy", "deduplicationPolicy");
  const entryPriceMeasures = requireSection(parsed, "entryPriceMeasures", "entryPriceMeasures");
  const settlementMappingSource = requireSection(parsed, "settlementMapping", "settlementMapping");
  const minimumEvidenceRequirements = requireSection(
    parsed,
    "minimumEvidenceRequirements",
    "minimumEvidenceRequirements",
  );
  const classificationRules = requireSection(parsed, "classificationRules", "classificationRules");
  const precedence = requireField(classificationRules, "precedence", "classificationRules.precedence");
  if (!Array.isArray(precedence) || precedence.some((entry) => typeof entry !== "string")) {
    fail("classificationRules.precedence must be a string array");
  }

  const settlementMapping: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(settlementMappingSource)) {
    if (typeof value === "string" && value.trim().length > 0) {
      settlementMapping[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      settlementMapping[key] = value;
      continue;
    }
    fail(`settlementMapping.${key} must be a non-empty string or finite number`);
  }

  return {
    hypothesisId: requireString(parsed, "hypothesisId", "hypothesisId"),
    hypothesisVersion: requireLiteral(parsed, "hypothesisVersion", "hypothesisVersion", [
      CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
    ] as const),
    description: requireString(parsed, "description", "description"),
    canonicalSourceArtifacts: requireStringArray(
      parsed,
      "canonicalSourceArtifacts",
      "canonicalSourceArtifacts",
    ),
    sourceCandidateId: requireString(parsed, "sourceCandidateId", "sourceCandidateId"),
    axisGroupId: requireString(parsed, "axisGroupId", "axisGroupId"),
    bucketId: requireString(parsed, "bucketId", "bucketId"),
    calibrationDirection: requireLiteral(parsed, "calibrationDirection", "calibrationDirection", [
      "over",
      "under",
    ] as const),
    targetOutcomeSide: requireLiteral(parsed, "targetOutcomeSide", "targetOutcomeSide", [
      "yes",
      "no",
    ] as const),
    suggestedStrategyFamily: requireString(
      parsed,
      "suggestedStrategyFamily",
      "suggestedStrategyFamily",
    ),
    eligibilityRules,
    probabilityMeasure: {
      id: requireString(probabilityMeasure, "id", "probabilityMeasure.id"),
      definition: requireString(probabilityMeasure, "definition", "probabilityMeasure.definition"),
      formula: requireString(probabilityMeasure, "formula", "probabilityMeasure.formula"),
    },
    volatilityDefinition: parseVolatilityDefinition(parsed),
    marketEligibilityRules: {
      requireValidBook: requireBoolean(
        marketEligibilityRules,
        "requireValidBook",
        "marketEligibilityRules.requireValidBook",
      ),
      requireSynchronizedBook: requireBoolean(
        marketEligibilityRules,
        "requireSynchronizedBook",
        "marketEligibilityRules.requireSynchronizedBook",
      ),
      requireOpenMarket: requireBoolean(
        marketEligibilityRules,
        "requireOpenMarket",
        "marketEligibilityRules.requireOpenMarket",
      ),
      requireBtcJoin: requireBoolean(
        marketEligibilityRules,
        "requireBtcJoin",
        "marketEligibilityRules.requireBtcJoin",
      ),
    },
    deduplicationPolicy: {
      episodeBreakOnDisqualification: requireBoolean(
        deduplicationPolicy,
        "episodeBreakOnDisqualification",
        "deduplicationPolicy.episodeBreakOnDisqualification",
      ),
      entryRule: requireString(deduplicationPolicy, "entryRule", "deduplicationPolicy.entryRule"),
      primaryValidationUnit: requireString(
        deduplicationPolicy,
        "primaryValidationUnit",
        "deduplicationPolicy.primaryValidationUnit",
      ),
      suppressRepeatedQualifyingSnapshots: requireBoolean(
        deduplicationPolicy,
        "suppressRepeatedQualifyingSnapshots",
        "deduplicationPolicy.suppressRepeatedQualifyingSnapshots",
      ),
    },
    entryPriceMeasures: {
      calibrationLayer: requireString(
        entryPriceMeasures,
        "calibrationLayer",
        "entryPriceMeasures.calibrationLayer",
      ),
      executableLayer: requireString(
        entryPriceMeasures,
        "executableLayer",
        "entryPriceMeasures.executableLayer",
      ),
      diagnosticLayer: requireString(
        entryPriceMeasures,
        "diagnosticLayer",
        "entryPriceMeasures.diagnosticLayer",
      ),
    },
    settlementMapping,
    minimumEvidenceRequirements: {
      minimumIndependentCandidateMarkets: requireFiniteNumber(
        minimumEvidenceRequirements,
        "minimumIndependentCandidateMarkets",
        "minimumEvidenceRequirements.minimumIndependentCandidateMarkets",
      ),
      minimumSettlementCoverageShare: requireFiniteNumber(
        minimumEvidenceRequirements,
        "minimumSettlementCoverageShare",
        "minimumEvidenceRequirements.minimumSettlementCoverageShare",
      ),
      minimumValidBookShare: requireFiniteNumber(
        minimumEvidenceRequirements,
        "minimumValidBookShare",
        "minimumEvidenceRequirements.minimumValidBookShare",
      ),
      minimumBtcJoinCoverageShare: requireFiniteNumber(
        minimumEvidenceRequirements,
        "minimumBtcJoinCoverageShare",
        "minimumEvidenceRequirements.minimumBtcJoinCoverageShare",
      ),
      materialRejectionCalibrationGap: requireFiniteNumber(
        minimumEvidenceRequirements,
        "materialRejectionCalibrationGap",
        "minimumEvidenceRequirements.materialRejectionCalibrationGap",
      ),
      materialSupportCalibrationGap: requireFiniteNumber(
        minimumEvidenceRequirements,
        "materialSupportCalibrationGap",
        "minimumEvidenceRequirements.materialSupportCalibrationGap",
      ),
      materialExecutableNetReturnCents: requireFiniteNumber(
        minimumEvidenceRequirements,
        "materialExecutableNetReturnCents",
        "minimumEvidenceRequirements.materialExecutableNetReturnCents",
      ),
    },
    classificationRules: { precedence: precedence as string[] },
  };
}

/** Fail-closed load of the v2 hypothesis config. Not wired into the default v1 forward path. */
export function loadCalibrationFadeV2HypothesisSpec(input: {
  io: CalibrationFadeV2PreregistrationIo;
  hypothesisConfigPath?: string;
}): { configPath: string; spec: CalibrationFadeV2HypothesisSpec } {
  const configPath = (input.hypothesisConfigPath ?? DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH).replace(
    /\\/g,
    "/",
  );
  if (!input.io.fileExists(configPath)) {
    fail(`v2 hypothesis config missing: ${configPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.io.readFile(configPath));
  } catch (error) {
    fail(
      `v2 hypothesis config is not valid JSON at ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!isRecord(parsed)) {
    fail(`v2 hypothesis config root must be an object at ${configPath}`);
  }
  return { configPath, spec: parseFreezeDocument(parsed) };
}
