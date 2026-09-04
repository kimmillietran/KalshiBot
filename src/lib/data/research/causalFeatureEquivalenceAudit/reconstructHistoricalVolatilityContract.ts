import type {
  CausalFeatureEquivalenceEvidenceDocument,
  EvidenceClaim,
  HistoricalEvidenceStatus,
  VolatilityContractField,
  VolatilityFeatureContract,
} from "./causalFeatureEquivalenceAuditTypes";
import { VOLATILITY_CONTRACT_FIELDS } from "./causalFeatureEquivalenceAuditTypes";

const EXECUTABLE_STATUSES = new Set([
  "proven-by-executable-code",
  "proven-by-test",
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
    (claim) =>
      (claim.status === "proven-by-executable-code" || claim.status === "proven-by-test")
      && claim.value !== null,
  );
  const values = new Set(proven.map((claim) => JSON.stringify(claim.value)));
  return values.size > 1;
}

/**
 * Builds the historical volatility contract strictly from evidence claims.
 * Unavailable / declarative-only gap fields stay null — never invented.
 * Project-context-only claims never set governed executable fields alone.
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

    const unavailable = fieldClaims.some((claim) => claim.status === "unavailable");
    if (unavailable) {
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

    const executable = fieldClaims.find(
      (claim) => EXECUTABLE_STATUSES.has(claim.status) && claim.value !== null,
    );
    if (executable) {
      (contract as Record<string, unknown>)[field] = executable.value;
      continue;
    }

    // sourceGapThresholdMs declared-only must NOT fill the executable contract —
    // config declaration without enforcement is not a reconstructable historical rule.
    if (field === "sourceGapThresholdMs") {
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

  const gapFieldsMissing =
    contract.sourceGapDefinition === null
    || contract.startBoundaryHandling === null
    || contract.internalGapHandling === null
    || contract.trailingGapHandling === null;

  const historicalEvidenceStatus: HistoricalEvidenceStatus = gapFieldsMissing
    || ambiguities.length > 0
    || evidence.unresolvedAmbiguities.length > 0
    ? "ambiguous"
    : contract.lookbackReturns !== null
        && contract.annualizationMethod !== null
        && contract.returnIntervalMs !== null
      ? "proven"
      : "insufficient";

  return { contract, historicalEvidenceStatus, ambiguities: [...new Set(ambiguities)] };
}
