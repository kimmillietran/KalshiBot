import type {
  CausalFeatureEquivalenceEvidenceDocument,
  EvidenceClaim,
  HistoricalEvidenceStatus,
  VolatilityContractField,
  VolatilityFeatureContract,
} from "./causalFeatureEquivalenceAuditTypes";
import {
  HISTORICAL_NO_ADJACENT_SOURCE_GAP_DEFINITION,
  VOLATILITY_CONTRACT_FIELDS,
  isHistoricalNoAdjacentSourceGapDefinition,
} from "./causalFeatureEquivalenceAuditTypes";

/** Statuses that can establish an executable historical contract field value. */
const PROVEN_STATUSES = new Set([
  "proven-by-executable-code",
  "proven-by-test",
  "proven-by-preserved-artifact",
]);

const DECLARATIVE_STATUSES = new Set([
  "declared-by-frozen-config",
  "inferred-from-call-chain",
]);

function emptyContract(): VolatilityFeatureContract {
  return {
    sourceInstrument: null,
    sourceRecordType: null,
    timestampField: null,
    timestampMeaning: null,
    returnIntervalMs: null,
    lookbackReturns: null,
    requiredCloseCount: null,
    annualizationMethod: null,
    quoteMinuteInclusionPolicy: null,
    missingMinuteBehavior: null,
    sourceGapDefinition: null,
    sourceGapThresholdMs: null,
    startBoundaryHandling: null,
    internalGapHandling: null,
    trailingGapHandling: null,
    quoteJoinAgeMs: null,
    quoteJoinAgeRole: null,
    duplicateHandling: null,
    orderingHandling: null,
    invalidPriceHandling: null,
    futureSampleHandling: null,
    volHighThreshold: null,
  };
}

function claimsForField(
  claims: readonly EvidenceClaim[],
  field: VolatilityContractField,
): EvidenceClaim[] {
  return claims.filter((claim) => claim.contractField === field);
}

function provenValuesConflict(fieldClaims: readonly EvidenceClaim[]): boolean {
  const proven = fieldClaims.filter(
    (claim) => PROVEN_STATUSES.has(claim.status) && claim.value !== null,
  );
  const values = new Set(proven.map((claim) => JSON.stringify(claim.value)));
  return values.size > 1;
}

function hasProvenClaim(fieldClaims: readonly EvidenceClaim[]): boolean {
  return fieldClaims.some((claim) => PROVEN_STATUSES.has(claim.status));
}

/**
 * Null is a meaningful proven value only for sourceGapThresholdMs under the
 * no-adjacent-source-gap-gate contract (threshold not operative — not unknown).
 */
function isMeaningfulNullProvenValue(
  field: VolatilityContractField,
  claim: EvidenceClaim,
): boolean {
  return (
    field === "sourceGapThresholdMs"
    && claim.value === null
    && PROVEN_STATUSES.has(claim.status)
  );
}

/**
 * Builds the historical volatility contract strictly from evidence claims.
 * Proven absence of gap gates is distinct from unknown/unavailable fields.
 * Declared maximumSourceGapMs=5000 never becomes the executable historical threshold.
 * Project-context-only claims never set governed executable fields alone.
 * Unavailable claims do not override stronger proven evidence for the same field.
 */
export function reconstructHistoricalVolatilityContract(
  evidence: CausalFeatureEquivalenceEvidenceDocument,
): {
  contract: VolatilityFeatureContract;
  historicalEvidenceStatus: HistoricalEvidenceStatus;
  ambiguities: readonly string[];
} {
  const contract = emptyContract();
  const ambiguities = [...evidence.unresolvedAmbiguities];

  for (const field of VOLATILITY_CONTRACT_FIELDS) {
    const fieldClaims = claimsForField(evidence.claims, field);
    if (fieldClaims.length === 0) {
      continue;
    }

    if (provenValuesConflict(fieldClaims)) {
      contract[field] = null as never;
      ambiguities.push(`Conflicting proven claims for ${field}; treating as ambiguous.`);
      continue;
    }

    // Stronger proven evidence wins over stale unavailable claims.
    const proven = fieldClaims.find(
      (claim) =>
        PROVEN_STATUSES.has(claim.status)
        && (claim.value !== null || isMeaningfulNullProvenValue(field, claim)),
    );
    if (proven) {
      (contract as Record<string, unknown>)[field] = proven.value;
      continue;
    }

    const unavailable = fieldClaims.some((claim) => claim.status === "unavailable");
    if (unavailable && !hasProvenClaim(fieldClaims)) {
      contract[field] = null as never;
      if (
        field === "sourceGapDefinition"
        || field === "startBoundaryHandling"
        || field === "internalGapHandling"
        || field === "trailingGapHandling"
        || field === "sourceGapThresholdMs"
        || field === "timestampMeaning"
      ) {
        ambiguities.push(`Historical field ${field} is unavailable from executable evidence.`);
      }
      continue;
    }

    // sourceGapThresholdMs declared-only must NOT fill the executable contract —
    // config declaration without enforcement is not a reconstructable historical rule.
    // When the no-gap-gate definition is proven, null means not-operative (handled after loop).
    if (field === "sourceGapThresholdMs") {
      const inferredUnused = fieldClaims.find(
        (claim) => claim.status === "inferred-from-call-chain" && claim.value === null,
      );
      if (inferredUnused) {
        contract.sourceGapThresholdMs = null;
        // Ambiguity only if we lack a proven no-gap-gate definition elsewhere.
        continue;
      }
      contract.sourceGapThresholdMs = null;
      ambiguities.push(
        "maximumSourceGapMs is declared by frozen config but was unused by executable historical vol code.",
      );
      continue;
    }

    const declarative = fieldClaims.find(
      (claim) => DECLARATIVE_STATUSES.has(claim.status) && claim.value !== null,
    );
    if (declarative && field !== "sourceGapDefinition") {
      (contract as Record<string, unknown>)[field] = declarative.value;
      continue;
    }

    // project-context-only never establishes executable fields alone
    const projectOnly = fieldClaims.every((claim) => claim.status === "project-context-only");
    if (projectOnly) {
      contract[field] = null as never;
      ambiguities.push(
        `Field ${field} has only project-context evidence and cannot establish executable equivalence.`,
      );
    }
  }

  if (contract.lookbackReturns !== null && contract.requiredCloseCount === null) {
    contract.requiredCloseCount = contract.lookbackReturns + 1;
  }

  // Proven no-gap-gate: null threshold means not operative (not unknown / not 0 / not 5000).
  if (isHistoricalNoAdjacentSourceGapDefinition(contract.sourceGapDefinition)) {
    contract.sourceGapThresholdMs = null;
    const filtered = ambiguities.filter(
      (item) =>
        !item.includes("sourceGapThresholdMs")
        && !item.includes("maximumSourceGapMs")
        && !item.includes("sourceGapDefinition")
        && !item.includes("startBoundaryHandling")
        && !item.includes("internalGapHandling")
        && !item.includes("trailingGapHandling"),
    );
    ambiguities.length = 0;
    ambiguities.push(...filtered);
  }

  const gapFieldsMissing =
    contract.sourceGapDefinition === null
    || contract.startBoundaryHandling === null
    || contract.internalGapHandling === null
    || contract.trailingGapHandling === null;

  // Null sourceGapThresholdMs under no-gap-gate is resolved (not-operative), not missing.
  const thresholdUnknown =
    contract.sourceGapThresholdMs === null
    && contract.sourceGapDefinition !== HISTORICAL_NO_ADJACENT_SOURCE_GAP_DEFINITION
    && contract.sourceGapDefinition !== null;

  const uniqueAmbiguities = [...new Set(ambiguities)];

  const historicalEvidenceStatus: HistoricalEvidenceStatus = gapFieldsMissing
    || thresholdUnknown
    || uniqueAmbiguities.length > 0
    ? "ambiguous"
    : contract.lookbackReturns !== null
        && contract.annualizationMethod !== null
        && contract.returnIntervalMs !== null
        && contract.sourceRecordType !== null
      ? "proven"
      : "insufficient";

  return { contract, historicalEvidenceStatus, ambiguities: uniqueAmbiguities };
}
