import { isRecord } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
  CALIBRATION_FADE_V2_PREREGISTRATION_SCHEMA,
  CALIBRATION_FADE_V2_PREREGISTRATION_VERSION,
  CalibrationFadeV2PreregistrationError,
  DEFAULT_CALIBRATION_FADE_V1_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
  PENDING_FREEZE_IDENTITY,
  V2_PROSPECTIVE_BOUNDARY_KIND,
  type CalibrationFadeV2PreregistrationIo,
  type CalibrationFadeV2ProvenanceManifest,
} from "./calibrationFadeV2PreregistrationTypes";

const GIT_COMMIT_SHA_PATTERN = /^[0-9a-fA-F]{40}$/;
const ISO_8601_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

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

function requireFiniteNumber(parent: Record<string, unknown>, key: string, path: string): number {
  const value = requireField(parent, key, path);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a finite number`);
  }
  return value;
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

function requireStringArray(
  parent: Record<string, unknown>,
  key: string,
  path: string,
): readonly string[] {
  const value = requireField(parent, key, path);
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    fail(`${path} must be a string array`);
  }
  return value as string[];
}

function requireFreezeIdentityToken(value: string, path: string): string {
  if (value === PENDING_FREEZE_IDENTITY) {
    return value;
  }
  if (!GIT_COMMIT_SHA_PATTERN.test(value)) {
    fail(`${path} must be a 40-char commit SHA or "${PENDING_FREEZE_IDENTITY}"`);
  }
  return value.toLowerCase();
}

function requireFreezeTimestampToken(value: string, path: string): string {
  if (value === PENDING_FREEZE_IDENTITY) {
    return value;
  }
  if (!ISO_8601_TIMESTAMP_PATTERN.test(value)) {
    fail(`${path} must be an ISO-8601 timestamp or "${PENDING_FREEZE_IDENTITY}"`);
  }
  return value;
}

function parseProvenanceDocument(parsed: Record<string, unknown>): CalibrationFadeV2ProvenanceManifest {
  requireLiteral(parsed, "schema", "schema", [CALIBRATION_FADE_V2_PREREGISTRATION_SCHEMA] as const);
  requireExactNumber(parsed, "version", "version", CALIBRATION_FADE_V2_PREREGISTRATION_VERSION);
  requireLiteral(parsed, "verificationModel", "verificationModel", ["reviewed-manifest"] as const);
  requireLiteral(parsed, "hypothesisVersion", "hypothesisVersion", [
    CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
  ] as const);

  const descendsFromV1ConfigPath = requireString(
    parsed,
    "descendsFromV1ConfigPath",
    "descendsFromV1ConfigPath",
  );
  if (descendsFromV1ConfigPath !== DEFAULT_CALIBRATION_FADE_V1_HYPOTHESIS_CONFIG_PATH) {
    fail(
      `descendsFromV1ConfigPath must be ${DEFAULT_CALIBRATION_FADE_V1_HYPOTHESIS_CONFIG_PATH}; received ${descendsFromV1ConfigPath}`,
    );
  }

  const configPath = requireString(parsed, "configPath", "configPath");
  if (configPath !== DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH) {
    fail(`configPath must be ${DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH}; received ${configPath}`);
  }

  const intentionalDifferencesRaw = requireField(
    parsed,
    "intentionalDifferences",
    "intentionalDifferences",
  );
  if (!Array.isArray(intentionalDifferencesRaw) || intentionalDifferencesRaw.length === 0) {
    fail("intentionalDifferences must be a non-empty array");
  }
  const intentionalDifferences = intentionalDifferencesRaw.map((entry, index) => {
    if (!isRecord(entry)) {
      fail(`intentionalDifferences[${index}] must be an object`);
    }
    requireExactBoolean(entry, "v1Unchanged", `intentionalDifferences[${index}].v1Unchanged`, true);
    requireExactBoolean(
      entry,
      "notIntegrityCorrectionToV1",
      `intentionalDifferences[${index}].notIntegrityCorrectionToV1`,
      true,
    );
    return {
      id: requireString(entry, "id", `intentionalDifferences[${index}].id`),
      summary: requireString(entry, "summary", `intentionalDifferences[${index}].summary`),
      v1Unchanged: true as const,
      notIntegrityCorrectionToV1: true as const,
    };
  });

  const lineage = requireSection(parsed, "historicalCandidateLineage", "historicalCandidateLineage");
  requireExactNumber(lineage, "observationCount", "historicalCandidateLineage.observationCount", 457);
  requireExactNumber(
    lineage,
    "uniqueTradingDays",
    "historicalCandidateLineage.uniqueTradingDays",
    63,
  );
  const passes = requireField(lineage, "passes", "historicalCandidateLineage.passes");
  if (passes !== false) {
    fail("historicalCandidateLineage.passes must be false (exploratory lineage, not prospective pass)");
  }
  requireExactNumber(lineage, "robustnessScore", "historicalCandidateLineage.robustnessScore", 59);

  const boundary = requireSection(
    parsed,
    "prospectiveEvidenceBoundary",
    "prospectiveEvidenceBoundary",
  );
  requireLiteral(boundary, "kind", "prospectiveEvidenceBoundary.kind", [
    V2_PROSPECTIVE_BOUNDARY_KIND,
  ] as const);
  const freezeCommitSha = requireFreezeIdentityToken(
    requireString(boundary, "freezeCommitSha", "prospectiveEvidenceBoundary.freezeCommitSha"),
    "prospectiveEvidenceBoundary.freezeCommitSha",
  );
  const freezeTimestamp = requireFreezeTimestampToken(
    requireString(boundary, "freezeTimestamp", "prospectiveEvidenceBoundary.freezeTimestamp"),
    "prospectiveEvidenceBoundary.freezeTimestamp",
  );

  const nonConfirmatoryPolicy = requireSection(
    parsed,
    "nonConfirmatoryPolicy",
    "nonConfirmatoryPolicy",
  );
  requireLiteral(nonConfirmatoryPolicy, "preFreezeRuns", "nonConfirmatoryPolicy.preFreezeRuns", [
    "diagnostic-only",
  ] as const);
  const aug4RunStartIso = requireString(
    nonConfirmatoryPolicy,
    "aug4RunStartIso",
    "nonConfirmatoryPolicy.aug4RunStartIso",
  );
  if (aug4RunStartIso !== "2026-08-04T10:33:33.601Z") {
    fail(`nonConfirmatoryPolicy.aug4RunStartIso must be 2026-08-04T10:33:33.601Z; received ${aug4RunStartIso}`);
  }

  const originalFreezeCommitSha = requireFreezeIdentityToken(
    requireString(parsed, "originalFreezeCommitSha", "originalFreezeCommitSha"),
    "originalFreezeCommitSha",
  );
  const v2FreezeCommitSha = requireFreezeIdentityToken(
    requireString(parsed, "v2FreezeCommitSha", "v2FreezeCommitSha"),
    "v2FreezeCommitSha",
  );
  const v2FreezeCommitTimestamp = requireFreezeTimestampToken(
    requireString(parsed, "v2FreezeCommitTimestamp", "v2FreezeCommitTimestamp"),
    "v2FreezeCommitTimestamp",
  );

  if (v2FreezeCommitSha !== freezeCommitSha) {
    fail("v2FreezeCommitSha must match prospectiveEvidenceBoundary.freezeCommitSha");
  }
  if (v2FreezeCommitTimestamp !== freezeTimestamp) {
    fail("v2FreezeCommitTimestamp must match prospectiveEvidenceBoundary.freezeTimestamp");
  }
  if (originalFreezeCommitSha !== v2FreezeCommitSha) {
    fail("originalFreezeCommitSha must match v2FreezeCommitSha for this preregistration schema");
  }

  const limitations = requireStringArray(parsed, "limitations", "limitations");
  const hasCorpusCaveat = limitations.some(
    (item) => item.includes("19110") && item.includes("10474"),
  );
  if (!hasCorpusCaveat) {
    fail("limitations must document the 19110 vs 10474 corpus membership caveat");
  }

  return {
    schema: CALIBRATION_FADE_V2_PREREGISTRATION_SCHEMA,
    version: CALIBRATION_FADE_V2_PREREGISTRATION_VERSION,
    verificationModel: "reviewed-manifest",
    hypothesisId: requireString(parsed, "hypothesisId", "hypothesisId"),
    hypothesisVersion: CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
    sourceCandidateId: requireString(parsed, "sourceCandidateId", "sourceCandidateId"),
    configPath,
    descendsFromV1ConfigPath,
    originalFreezeCommitSha,
    v2FreezeCommitSha,
    v2FreezeCommitTimestamp,
    conclusion: requireString(parsed, "conclusion", "conclusion"),
    intentionalDifferences,
    historicalCandidateLineage: {
      role: requireString(lineage, "role", "historicalCandidateLineage.role"),
      observationCount: 457,
      uniqueTradingDays: 63,
      passes: false,
      robustnessScore: 59,
      notes: requireStringArray(lineage, "notes", "historicalCandidateLineage.notes"),
    },
    prospectiveEvidenceBoundary: {
      kind: V2_PROSPECTIVE_BOUNDARY_KIND,
      freezeCommitSha,
      freezeTimestamp,
      rule: requireString(boundary, "rule", "prospectiveEvidenceBoundary.rule"),
    },
    nonConfirmatoryPolicy: {
      preFreezeRuns: "diagnostic-only",
      aug4RunStartIso,
      aug4Status: requireString(
        nonConfirmatoryPolicy,
        "aug4Status",
        "nonConfirmatoryPolicy.aug4Status",
      ),
      notes: requireStringArray(nonConfirmatoryPolicy, "notes", "nonConfirmatoryPolicy.notes"),
    },
    limitations,
  };
}

/** Fail-closed load of the v2 preregistration provenance manifest. */
export function loadCalibrationFadeV2Provenance(input: {
  io: CalibrationFadeV2PreregistrationIo;
  provenancePath?: string;
}): { provenancePath: string; provenance: CalibrationFadeV2ProvenanceManifest } {
  const provenancePath = (input.provenancePath ?? DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH).replace(
    /\\/g,
    "/",
  );
  if (!input.io.fileExists(provenancePath)) {
    fail(`v2 provenance manifest missing: ${provenancePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.io.readFile(provenancePath));
  } catch (error) {
    fail(
      `v2 provenance manifest is not valid JSON at ${provenancePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!isRecord(parsed)) {
    fail(`v2 provenance root must be an object at ${provenancePath}`);
  }
  return { provenancePath, provenance: parseProvenanceDocument(parsed) };
}

export function isFreezeIdentityFinalized(provenance: CalibrationFadeV2ProvenanceManifest): boolean {
  return (
    provenance.v2FreezeCommitSha !== PENDING_FREEZE_IDENTITY
    && provenance.v2FreezeCommitTimestamp !== PENDING_FREEZE_IDENTITY
    && GIT_COMMIT_SHA_PATTERN.test(provenance.v2FreezeCommitSha)
    && ISO_8601_TIMESTAMP_PATTERN.test(provenance.v2FreezeCommitTimestamp)
  );
}
