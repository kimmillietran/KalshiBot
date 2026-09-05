import {
  GOVERNED_VOLATILITY_CONTRACT_FIELDS,
  VOLATILITY_CONTRACT_FIELDS,
  isHistoricalNoAdjacentSourceGapDefinition,
  type ContractComparisonResult,
  type ContractFieldComparison,
  type ContractFieldComparisonStatus,
  type HistoricalEvidenceStatus,
  type VolatilityContractField,
  type VolatilityFeatureContract,
} from "./causalFeatureEquivalenceAuditTypes";

const GOVERNED_SET = new Set<VolatilityContractField>(GOVERNED_VOLATILITY_CONTRACT_FIELDS);

const DESCRIPTIVE_ONLY_FIELDS = new Set<VolatilityContractField>([
  "quoteJoinAgeRole",
  "timestampMeaning",
]);

function valuesEqual(
  left: string | number | boolean | null,
  right: string | number | boolean | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (typeof left === "number" && typeof right === "number") {
    return Object.is(left, right);
  }
  return left === right;
}

/**
 * Historical no-gap-gate + null threshold means the threshold is not operative,
 * not that the historical threshold is unknown.
 */
function historicalGapThresholdNotApplicable(
  historical: VolatilityFeatureContract,
): boolean {
  return (
    isHistoricalNoAdjacentSourceGapDefinition(historical.sourceGapDefinition)
    && historical.sourceGapThresholdMs === null
  );
}

function compareField(
  field: VolatilityContractField,
  historical: VolatilityFeatureContract,
  forward: VolatilityFeatureContract,
): ContractFieldComparison {
  const historicalValue = historical[field];
  const forwardValue = forward[field];
  const governed = GOVERNED_SET.has(field);

  let status: ContractFieldComparisonStatus;

  // Known absence of an operative gap threshold vs forward's operative threshold.
  if (field === "sourceGapThresholdMs" && historicalGapThresholdNotApplicable(historical)) {
    if (forwardValue === null) {
      status = "equivalent";
    } else if (governed) {
      status = "mismatch";
    } else {
      status = "descriptive-only";
    }
    return { field, historicalValue, forwardValue, status, governed };
  }

  if (DESCRIPTIVE_ONLY_FIELDS.has(field) && !governed) {
    status = valuesEqual(historicalValue, forwardValue)
      ? "equivalent"
      : historicalValue === null
        ? "ambiguous-missing-historical"
        : "descriptive-only";
  } else if (historicalValue === null && forwardValue !== null) {
    status = "ambiguous-missing-historical";
  } else if (historicalValue === null && forwardValue === null) {
    status = governed ? "ambiguous-missing-historical" : "descriptive-only";
  } else if (valuesEqual(historicalValue, forwardValue)) {
    status = "equivalent";
  } else if (!governed) {
    status = "descriptive-only";
  } else {
    status = "mismatch";
  }

  return { field, historicalValue, forwardValue, status, governed };
}

/**
 * Field-by-field contract comparison.
 * Missing historical governed fields → ambiguous-missing-historical (not inferred equality).
 * Proven no-gap-gate with null threshold → not-applicable (mismatch vs operative forward threshold).
 * Descriptive label differences alone are not semantic mismatches.
 */
export function compareVolatilityContracts(input: {
  historical: VolatilityFeatureContract;
  forward: VolatilityFeatureContract;
  historicalEvidenceStatus: HistoricalEvidenceStatus;
}): ContractComparisonResult {
  const fields = VOLATILITY_CONTRACT_FIELDS.map((field) =>
    compareField(field, input.historical, input.forward),
  );

  const hasAmbiguousMissingHistorical = fields.some(
    (field) => field.governed && field.status === "ambiguous-missing-historical",
  );
  const hasSemanticMismatch = fields.some(
    (field) => field.governed && field.status === "mismatch",
  );
  const equivalent =
    !hasAmbiguousMissingHistorical
    && !hasSemanticMismatch
    && fields
      .filter((field) => field.governed)
      .every((field) => field.status === "equivalent");

  const historicalEvidenceStatus: HistoricalEvidenceStatus =
    input.historicalEvidenceStatus === "ambiguous" || hasAmbiguousMissingHistorical
      ? "ambiguous"
      : input.historicalEvidenceStatus;

  return {
    fields,
    equivalent,
    hasSemanticMismatch,
    hasAmbiguousMissingHistorical,
    historicalEvidenceStatus,
  };
}
