import {
  CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_SCHEMA,
  CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_VERSION,
  CausalFeatureEquivalenceAuditError,
  EVIDENCE_STATUSES,
  EXPECTED_FREEZE_COMMIT_SHA,
  EXPECTED_HYPOTHESIS_CONFIGURATION_HASH,
  EXPECTED_HYPOTHESIS_ID,
  VOLATILITY_CONTRACT_FIELDS,
  type CausalFeatureEquivalenceEvidenceDocument,
  type EvidenceClaim,
  type EvidenceStatus,
  type VolatilityContractField,
} from "./causalFeatureEquivalenceAuditTypes";

const FULL_SHA_RE = /^[0-9a-f]{40}$/i;

const EVIDENCE_TOP_LEVEL_KEYS = [
  "schema",
  "version",
  "auditId",
  "hypothesisId",
  "hypothesisConfigurationHash",
  "freezeCommitSha",
  "freezeCommitTimestamp",
  "runtimeGitPolicy",
  "claims",
  "unresolvedAmbiguities",
  "limitations",
] as const;

const EVIDENCE_CLAIM_KEYS = [
  "claimId",
  "claim",
  "status",
  "commitSha",
  "path",
  "blobSha",
  "symbol",
  "contractField",
  "value",
  "summary",
  "limitations",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvidenceStatus(value: unknown): value is EvidenceStatus {
  return typeof value === "string" && (EVIDENCE_STATUSES as readonly string[]).includes(value);
}

function isContractField(value: unknown): value is VolatilityContractField {
  return typeof value === "string" && (VOLATILITY_CONTRACT_FIELDS as readonly string[]).includes(value);
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowlist: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowlist);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      const fieldPath = path.length === 0 ? key : `${path}.${key}`;
      throw new CausalFeatureEquivalenceAuditError(`Unknown evidence field: ${fieldPath}`);
    }
  }
}

function requireString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CausalFeatureEquivalenceAuditError(`${path}.${key} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(record: Record<string, unknown>, key: string, path: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new CausalFeatureEquivalenceAuditError(`${path}.${key} must be a string array`);
  }
  return value as string[];
}

function parseClaim(raw: unknown, index: number): EvidenceClaim {
  if (!isRecord(raw)) {
    throw new CausalFeatureEquivalenceAuditError(`claims[${index}] must be an object`);
  }
  // Fail closed on unknown keys before reading allowlisted fields (no strip-via-destructure).
  rejectUnknownKeys(raw, EVIDENCE_CLAIM_KEYS, `claims[${index}]`);

  const claimId = requireString(raw, "claimId", `claims[${index}]`);
  const claim = requireString(raw, "claim", `claims[${index}]`);
  const statusRaw = raw.status;
  if (!isEvidenceStatus(statusRaw)) {
    throw new CausalFeatureEquivalenceAuditError(
      `claims[${index}].status is unsupported: ${String(statusRaw)}`,
    );
  }
  const summary = requireString(raw, "summary", `claims[${index}]`);
  const limitations = requireStringArray(raw, "limitations", `claims[${index}]`);

  if (raw.commitSha !== null && raw.commitSha !== undefined && typeof raw.commitSha !== "string") {
    throw new CausalFeatureEquivalenceAuditError(`claims[${index}].commitSha must be string or null`);
  }
  const commitSha =
    raw.commitSha === null || raw.commitSha === undefined ? null : (raw.commitSha as string);
  if (commitSha !== null && !FULL_SHA_RE.test(commitSha)) {
    throw new CausalFeatureEquivalenceAuditError(
      `claims[${index}].commitSha is malformed: ${commitSha}`,
    );
  }

  const path =
    raw.path === null || raw.path === undefined
      ? null
      : typeof raw.path === "string"
        ? raw.path
        : (() => {
            throw new CausalFeatureEquivalenceAuditError(`claims[${index}].path must be string or null`);
          })();
  const blobSha =
    raw.blobSha === null || raw.blobSha === undefined
      ? null
      : typeof raw.blobSha === "string"
        ? raw.blobSha
        : (() => {
            throw new CausalFeatureEquivalenceAuditError(
              `claims[${index}].blobSha must be string or null`,
            );
          })();
  if (blobSha !== null && !FULL_SHA_RE.test(blobSha)) {
    throw new CausalFeatureEquivalenceAuditError(
      `claims[${index}].blobSha is malformed: ${blobSha}`,
    );
  }
  if (raw.symbol !== null && raw.symbol !== undefined && typeof raw.symbol !== "string") {
    throw new CausalFeatureEquivalenceAuditError(`claims[${index}].symbol must be string or null`);
  }
  const symbol =
    raw.symbol === null || raw.symbol === undefined ? null : (raw.symbol as string);
  if (typeof symbol === "string" && symbol.trim().length === 0) {
    throw new CausalFeatureEquivalenceAuditError(
      `claims[${index}].symbol must be null (file-level scope) or a non-empty string`,
    );
  }

  const contractField =
    raw.contractField === null || raw.contractField === undefined
      ? null
      : isContractField(raw.contractField)
        ? raw.contractField
        : (() => {
            throw new CausalFeatureEquivalenceAuditError(
              `claims[${index}].contractField is unsupported: ${String(raw.contractField)}`,
            );
          })();

  const value = raw.value;
  if (
    value !== null
    && typeof value !== "string"
    && typeof value !== "number"
    && typeof value !== "boolean"
  ) {
    throw new CausalFeatureEquivalenceAuditError(
      `claims[${index}].value must be string, number, boolean, or null`,
    );
  }

  // Nested objects are not part of the claim schema; value must be scalar/null.
  if (isRecord(value)) {
    throw new CausalFeatureEquivalenceAuditError(
      `Unknown evidence field: claims[${index}].value (nested object)`,
    );
  }

  if (statusRaw === "proven-by-executable-code") {
    if (!commitSha || !path || !blobSha) {
      throw new CausalFeatureEquivalenceAuditError(
        `claims[${index}] (${claimId}) proven-by-executable-code requires commitSha, path, and blobSha`,
      );
    }
  }

  if (statusRaw === "proven-by-preserved-artifact") {
    if (!path) {
      throw new CausalFeatureEquivalenceAuditError(
        `claims[${index}] (${claimId}) proven-by-preserved-artifact requires path`,
      );
    }
  }

  if (statusRaw === "inferred-from-call-chain") {
    if (!commitSha || !path) {
      throw new CausalFeatureEquivalenceAuditError(
        `claims[${index}] (${claimId}) inferred-from-call-chain requires commitSha and path`,
      );
    }
  }

  return {
    claimId,
    claim,
    status: statusRaw,
    commitSha,
    path,
    blobSha,
    symbol,
    contractField,
    value: value as string | number | boolean | null,
    summary,
    limitations,
  };
}

/** Returns contract fields that have conflicting non-null proven values. */
export function findConflictingProvenContractFields(
  claims: readonly EvidenceClaim[],
): VolatilityContractField[] {
  const byField = new Map<VolatilityContractField, EvidenceClaim[]>();
  for (const claim of claims) {
    if (
      claim.contractField
      && (
        claim.status === "proven-by-executable-code"
        || claim.status === "proven-by-test"
        || claim.status === "proven-by-preserved-artifact"
      )
      && claim.value !== null
    ) {
      const existing = byField.get(claim.contractField) ?? [];
      existing.push(claim);
      byField.set(claim.contractField, existing);
    }
  }
  const conflicts: VolatilityContractField[] = [];
  for (const [field, fieldClaims] of byField) {
    const values = new Set(fieldClaims.map((claim) => JSON.stringify(claim.value)));
    if (values.size > 1) {
      conflicts.push(field);
    }
  }
  return conflicts;
}

/**
 * Strictly validates and loads the committed historical-evidence document.
 * Fail-closed on schema/version/identity/hash/SHA/proven-field problems and on
 * any unknown top-level, claim, or nested keys.
 * Does not execute Git.
 */
export function loadCausalFeatureEquivalenceEvidence(input: {
  rawContent: string;
  expectedHypothesisId?: string;
  expectedConfigurationHash?: string;
  expectedFreezeCommitSha?: string;
}): CausalFeatureEquivalenceEvidenceDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawContent.replace(/^\uFEFF/, ""));
  } catch {
    throw new CausalFeatureEquivalenceAuditError("Evidence document is not valid JSON");
  }
  if (!isRecord(parsed)) {
    throw new CausalFeatureEquivalenceAuditError("Evidence document must be a JSON object");
  }

  rejectUnknownKeys(parsed, EVIDENCE_TOP_LEVEL_KEYS, "");

  const schema = requireString(parsed, "schema", "evidence");
  if (schema !== CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_SCHEMA) {
    throw new CausalFeatureEquivalenceAuditError(`Unsupported evidence schema: ${schema}`);
  }
  const version = requireString(parsed, "version", "evidence");
  if (version !== CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_VERSION) {
    throw new CausalFeatureEquivalenceAuditError(`Unsupported evidence version: ${version}`);
  }

  const auditId = requireString(parsed, "auditId", "evidence");
  const hypothesisId = requireString(parsed, "hypothesisId", "evidence");
  const expectedHypothesisId = input.expectedHypothesisId ?? EXPECTED_HYPOTHESIS_ID;
  if (hypothesisId !== expectedHypothesisId) {
    throw new CausalFeatureEquivalenceAuditError(
      `Evidence hypothesisId mismatch: expected ${expectedHypothesisId}, got ${hypothesisId}`,
    );
  }

  const hypothesisConfigurationHash = requireString(parsed, "hypothesisConfigurationHash", "evidence");
  const expectedHash = input.expectedConfigurationHash ?? EXPECTED_HYPOTHESIS_CONFIGURATION_HASH;
  if (hypothesisConfigurationHash !== expectedHash) {
    throw new CausalFeatureEquivalenceAuditError(
      `Evidence hypothesisConfigurationHash mismatch: expected ${expectedHash}, got ${hypothesisConfigurationHash}`,
    );
  }

  const freezeCommitSha = requireString(parsed, "freezeCommitSha", "evidence");
  if (!FULL_SHA_RE.test(freezeCommitSha)) {
    throw new CausalFeatureEquivalenceAuditError(`Malformed freezeCommitSha: ${freezeCommitSha}`);
  }
  const expectedFreeze = input.expectedFreezeCommitSha ?? EXPECTED_FREEZE_COMMIT_SHA;
  if (freezeCommitSha !== expectedFreeze) {
    throw new CausalFeatureEquivalenceAuditError(
      `Evidence freezeCommitSha mismatch: expected ${expectedFreeze}, got ${freezeCommitSha}`,
    );
  }

  const freezeCommitTimestamp = requireString(parsed, "freezeCommitTimestamp", "evidence");
  const runtimeGitPolicy = requireString(parsed, "runtimeGitPolicy", "evidence");
  if (!/not execute Git|does not execute Git|not dynamically reverified/i.test(runtimeGitPolicy)) {
    throw new CausalFeatureEquivalenceAuditError(
      "Evidence runtimeGitPolicy must state that runtime does not execute Git",
    );
  }

  if (!Array.isArray(parsed.claims) || parsed.claims.length === 0) {
    throw new CausalFeatureEquivalenceAuditError("Evidence claims must be a non-empty array");
  }
  const claims = parsed.claims.map((claim, index) => parseClaim(claim, index));
  const claimIds = new Set<string>();
  for (const claim of claims) {
    if (claimIds.has(claim.claimId)) {
      throw new CausalFeatureEquivalenceAuditError(`Duplicate claim ID: ${claim.claimId}`);
    }
    claimIds.add(claim.claimId);
  }

  const conflictingFields = findConflictingProvenContractFields(claims);
  const unresolvedAmbiguities = [
    ...requireStringArray(parsed, "unresolvedAmbiguities", "evidence"),
    ...conflictingFields.map(
      (field) => `Conflicting proven claims for contract field ${field}.`,
    ),
  ];
  const limitations = requireStringArray(parsed, "limitations", "evidence");

  return {
    schema: CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_SCHEMA,
    version: CAUSAL_FEATURE_EQUIVALENCE_EVIDENCE_VERSION,
    auditId,
    hypothesisId,
    hypothesisConfigurationHash,
    freezeCommitSha,
    freezeCommitTimestamp,
    runtimeGitPolicy,
    claims,
    unresolvedAmbiguities,
    limitations,
  };
}

export function parseCausalFeatureEquivalenceEvidenceJson(
  rawContent: string,
): CausalFeatureEquivalenceEvidenceDocument {
  return loadCausalFeatureEquivalenceEvidence({ rawContent });
}
