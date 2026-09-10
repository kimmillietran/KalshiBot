import {
  CalibrationFadeV2CrossRunValidationError,
  V2_CROSS_RUN_HTML_ROOT,
  V2_CROSS_RUN_JSON_ROOT,
} from "./calibrationFadeV2CrossRunValidationTypes";

export const V2_CROSS_RUN_ARTIFACT_AUTHORITY_KINDS = [
  "snapshot-scoped-authoritative",
  "legacy-root-historical",
  "invalid-path-identity",
] as const;

export type V2CrossRunArtifactAuthorityKind =
  (typeof V2_CROSS_RUN_ARTIFACT_AUTHORITY_KINDS)[number];

export type V2CrossRunArtifactPathIdentity = {
  runSetHash: string | null;
  settlementSnapshotHash: string | null;
  isLegacyRoot: boolean;
  isSnapshotScoped: boolean;
};

export type V2CrossRunArtifactAuthorityClassification = {
  kind: V2CrossRunArtifactAuthorityKind;
  /** True when the artifact is a historical run-set root report. */
  legacyRootArtifact: boolean;
  pathRunSetHash: string | null;
  pathSettlementSnapshotHash: string | null;
  reportRunSetHash: string | null;
  reportSettlementSnapshotHash: string | null;
  reason: string;
};

const SNAPSHOT_PATH_PATTERN =
  /\/calibration-fade-v2\/cross-run\/confirmatory\/([^/]+)\/settlement-snapshots\/([^/]+)\//;
const LEGACY_ROOT_PATH_PATTERN =
  /\/calibration-fade-v2\/cross-run\/confirmatory\/([^/]+)\/calibration-fade-v2-cross-run-validation\.(json|html)$/;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function readHash(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Parse path identity for a v2 cross-run report without filesystem I/O.
 * Does not select among snapshots; path must already be explicit.
 */
export function parseV2CrossRunArtifactPathIdentity(
  artifactPath: string,
): V2CrossRunArtifactPathIdentity {
  const normalized = normalizePath(artifactPath);
  if (normalized.includes("/latest") || normalized.endsWith("/latest")) {
    return {
      runSetHash: null,
      settlementSnapshotHash: null,
      isLegacyRoot: false,
      isSnapshotScoped: false,
    };
  }

  const snapshot = normalized.match(SNAPSHOT_PATH_PATTERN);
  if (snapshot) {
    return {
      runSetHash: snapshot[1] ?? null,
      settlementSnapshotHash: snapshot[2] ?? null,
      isLegacyRoot: false,
      isSnapshotScoped: true,
    };
  }

  const legacy = normalized.match(LEGACY_ROOT_PATH_PATTERN);
  if (legacy) {
    return {
      runSetHash: legacy[1] ?? null,
      settlementSnapshotHash: null,
      isLegacyRoot: true,
      isSnapshotScoped: false,
    };
  }

  return {
    runSetHash: null,
    settlementSnapshotHash: null,
    isLegacyRoot: false,
    isSnapshotScoped: false,
  };
}

/**
 * Classify whether a report path+payload pair is settlement-snapshot authoritative,
 * a historical legacy root, or an identity mismatch.
 *
 * Authority is never inferred from mtime, lexical order, or "latest" aliases.
 */
export function classifyV2CrossRunArtifactAuthority(input: {
  artifactPath: string;
  report: {
    runSetHash?: unknown;
    settlementSnapshotHash?: unknown;
  };
}): V2CrossRunArtifactAuthorityClassification {
  const pathIdentity = parseV2CrossRunArtifactPathIdentity(input.artifactPath);
  const reportRunSetHash = readHash(input.report.runSetHash);
  const reportSettlementSnapshotHash = readHash(input.report.settlementSnapshotHash);

  if (!pathIdentity.isLegacyRoot && !pathIdentity.isSnapshotScoped) {
    return {
      kind: "invalid-path-identity",
      legacyRootArtifact: false,
      pathRunSetHash: pathIdentity.runSetHash,
      pathSettlementSnapshotHash: pathIdentity.settlementSnapshotHash,
      reportRunSetHash,
      reportSettlementSnapshotHash,
      reason:
        "Path is not a recognized v2 cross-run snapshot-scoped or legacy-root report path "
        + "(implicit latest/mtime/lexical selection is forbidden)",
    };
  }

  if (pathIdentity.isLegacyRoot) {
    if (
      reportRunSetHash
      && pathIdentity.runSetHash
      && reportRunSetHash !== pathIdentity.runSetHash
    ) {
      return {
        kind: "invalid-path-identity",
        legacyRootArtifact: true,
        pathRunSetHash: pathIdentity.runSetHash,
        pathSettlementSnapshotHash: null,
        reportRunSetHash,
        reportSettlementSnapshotHash,
        reason:
          `Legacy root path runSetHash ${pathIdentity.runSetHash} disagrees with report.runSetHash ${reportRunSetHash}`,
      };
    }
    return {
      kind: "legacy-root-historical",
      legacyRootArtifact: true,
      pathRunSetHash: pathIdentity.runSetHash,
      pathSettlementSnapshotHash: null,
      reportRunSetHash,
      reportSettlementSnapshotHash,
      reason:
        "Legacy run-set root artifact is historical/non-authoritative for settlement-aware interpretation",
    };
  }

  if (
    !pathIdentity.runSetHash
    || !pathIdentity.settlementSnapshotHash
    || !reportRunSetHash
    || !reportSettlementSnapshotHash
  ) {
    return {
      kind: "invalid-path-identity",
      legacyRootArtifact: false,
      pathRunSetHash: pathIdentity.runSetHash,
      pathSettlementSnapshotHash: pathIdentity.settlementSnapshotHash,
      reportRunSetHash,
      reportSettlementSnapshotHash,
      reason:
        "Snapshot-scoped artifact requires both path and report runSetHash + settlementSnapshotHash",
    };
  }

  if (pathIdentity.runSetHash !== reportRunSetHash) {
    return {
      kind: "invalid-path-identity",
      legacyRootArtifact: false,
      pathRunSetHash: pathIdentity.runSetHash,
      pathSettlementSnapshotHash: pathIdentity.settlementSnapshotHash,
      reportRunSetHash,
      reportSettlementSnapshotHash,
      reason:
        `Path runSetHash ${pathIdentity.runSetHash} disagrees with report.runSetHash ${reportRunSetHash}`,
    };
  }

  if (pathIdentity.settlementSnapshotHash !== reportSettlementSnapshotHash) {
    return {
      kind: "invalid-path-identity",
      legacyRootArtifact: false,
      pathRunSetHash: pathIdentity.runSetHash,
      pathSettlementSnapshotHash: pathIdentity.settlementSnapshotHash,
      reportRunSetHash,
      reportSettlementSnapshotHash,
      reason:
        `Path settlementSnapshotHash ${pathIdentity.settlementSnapshotHash} disagrees with `
        + `report.settlementSnapshotHash ${reportSettlementSnapshotHash}`,
    };
  }

  return {
    kind: "snapshot-scoped-authoritative",
    legacyRootArtifact: false,
    pathRunSetHash: pathIdentity.runSetHash,
    pathSettlementSnapshotHash: pathIdentity.settlementSnapshotHash,
    reportRunSetHash,
    reportSettlementSnapshotHash,
    reason: "Snapshot-scoped path identity matches report settlement-state identity",
  };
}

/**
 * Fail closed unless the artifact is snapshot-scoped and identity-consistent.
 * Legacy root reports remain readable via classifyV2CrossRunArtifactAuthority,
 * but must not be treated as current settlement-state authority.
 */
export function requireSnapshotScopedV2CrossRunArtifact(input: {
  artifactPath: string;
  report: {
    runSetHash?: unknown;
    settlementSnapshotHash?: unknown;
  };
}): V2CrossRunArtifactAuthorityClassification {
  const classification = classifyV2CrossRunArtifactAuthority(input);
  if (classification.kind === "snapshot-scoped-authoritative") {
    return classification;
  }
  if (classification.kind === "legacy-root-historical") {
    throw new CalibrationFadeV2CrossRunValidationError(
      "Legacy run-set root artifact is not settlement-snapshot authoritative. "
        + "Provide an explicit settlementSnapshotHash / snapshot-scoped report path.",
    );
  }
  throw new CalibrationFadeV2CrossRunValidationError(
    `v2 cross-run artifact identity is invalid for settlement-aware use: ${classification.reason}`,
  );
}

/**
 * Build the canonical snapshot-scoped JSON report path from explicit identities.
 * Callers must supply settlementSnapshotHash; runSetHash alone is never enough.
 */
export function resolveExplicitV2SettlementSnapshotReportPath(input: {
  runSetHash: string;
  settlementSnapshotHash: string;
  root?: "json" | "html";
}): string {
  const runSetHash = input.runSetHash.trim();
  const settlementSnapshotHash = input.settlementSnapshotHash.trim();
  if (!runSetHash || !settlementSnapshotHash) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "Explicit runSetHash and settlementSnapshotHash are required; "
        + "legacy root and implicit latest selection are forbidden",
    );
  }
  if (
    runSetHash === "latest"
    || settlementSnapshotHash === "latest"
    || runSetHash.includes("/")
    || settlementSnapshotHash.includes("/")
  ) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "Explicit settlement snapshot identity must not use latest aliases or path segments",
    );
  }
  const base = input.root === "html" ? V2_CROSS_RUN_HTML_ROOT : V2_CROSS_RUN_JSON_ROOT;
  const filename =
    input.root === "html"
      ? "calibration-fade-v2-cross-run-validation.html"
      : "calibration-fade-v2-cross-run-validation.json";
  return `${base}/${runSetHash}/settlement-snapshots/${settlementSnapshotHash}/${filename}`;
}

/**
 * Historical legacy-root path for provenance inspection only.
 * Never use this path as settlement-aware governed evidence.
 */
export function resolveLegacyV2CrossRunRootReportPath(input: {
  runSetHash: string;
  root?: "json" | "html";
}): string {
  const runSetHash = input.runSetHash.trim();
  if (!runSetHash || runSetHash === "latest" || runSetHash.includes("/")) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "Legacy root path requires an explicit runSetHash (latest aliases forbidden)",
    );
  }
  const base = input.root === "html" ? V2_CROSS_RUN_HTML_ROOT : V2_CROSS_RUN_JSON_ROOT;
  const filename =
    input.root === "html"
      ? "calibration-fade-v2-cross-run-validation.html"
      : "calibration-fade-v2-cross-run-validation.json";
  return `${base}/${runSetHash}/${filename}`;
}
