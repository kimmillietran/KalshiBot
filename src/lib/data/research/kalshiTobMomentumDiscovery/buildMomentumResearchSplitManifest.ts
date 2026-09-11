import { createHash } from "node:crypto";
import { basename, join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  SEALED_PRIOR_LINEAGE_CLASSIFICATIONS,
  buildMetadataOnlyMomentumCaptureInventory,
} from "../momentumEvidenceContract";
import type { MomentumContaminationClassification, MomentumSplitRole } from "../momentumEvidenceContract";

import {
  MOMENTUM_DISCOVERY_RESEARCH_SPLIT_VERSION,
  MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
  MomentumGovernedDiscoveryError,
  type MomentumCaptureArtifactIdentity,
  type MomentumDiscoveryContaminationClassification,
  type MomentumDiscoveryIo,
  type MomentumResearchSplitManifest,
} from "./momentumDiscoveryTypes";

export function sha256Hex(payload: string | Buffer): string {
  return createHash("sha256").update(payload).digest("hex");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/$/, "");
}

function readJsonRecord(io: MomentumDiscoveryIo, path: string): Record<string, unknown> | null {
  if (!io.fileExists(path)) {
    return null;
  }
  try {
    const parsed = JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveByteLength(io: MomentumDiscoveryIo, path: string): number | null {
  if (!io.fileExists(path)) {
    return null;
  }
  if (typeof io.fileByteLength === "function") {
    try {
      return io.fileByteLength(path);
    } catch {
      return null;
    }
  }
  try {
    return Buffer.byteLength(io.readFile(path), "utf8");
  } catch {
    return null;
  }
}

export function hashLargeJsonlIdentity(
  io: MomentumDiscoveryIo,
  path: string,
): { byteLength: number | null; identityHash: string | null } {
  const byteLength = resolveByteLength(io, path);
  if (byteLength === null) {
    return { byteLength: null, identityHash: null };
  }
  if (byteLength <= 128 * 1024) {
    try {
      return {
        byteLength,
        identityHash: sha256Hex(io.readFile(path).replace(/^\uFEFF/, "")),
      };
    } catch {
      return { byteLength, identityHash: sha256Hex(stableStringify({ path, byteLength })) };
    }
  }
  return {
    byteLength,
    identityHash: sha256Hex(
      stableStringify({
        path: normalizePath(path),
        byteLength,
        fingerprintKind: "byte-length-bound-no-mtime",
      }),
    ),
  };
}

export function resolveRunIdFromCaptureDir(captureRunDir: string): string {
  return basename(normalizePath(captureRunDir));
}

function toDiscoveryClassification(
  classification: MomentumContaminationClassification,
): MomentumDiscoveryContaminationClassification {
  return classification;
}

function resolveSealedLineage(runId: string): {
  contaminationClassification: MomentumDiscoveryContaminationClassification;
  contaminationEvidence: string[];
  eligibleForRole: (role: MomentumSplitRole) => boolean;
} | null {
  const sealed = SEALED_PRIOR_LINEAGE_CLASSIFICATIONS.find((row) => row.runId === runId);
  if (!sealed) {
    return null;
  }
  return {
    contaminationClassification: toDiscoveryClassification(sealed.contaminationClassification),
    contaminationEvidence: [sealed.rationale, ...sealed.priorResearchRoles.map((role) => `prior role: ${role}`)],
    eligibleForRole: (role) => sealed.eligibleRoles.includes(role),
  };
}

export function buildMomentumCaptureArtifactIdentity(input: {
  io: MomentumDiscoveryIo;
  captureRunDir: string;
  role: MomentumSplitRole;
  captureRoot?: string;
}): MomentumCaptureArtifactIdentity {
  const captureRunDir = normalizePath(input.captureRunDir);
  if (!input.io.isDirectory(captureRunDir)) {
    throw new MomentumGovernedDiscoveryError(
      `Capture run directory does not exist for ${input.role}: ${captureRunDir}`,
    );
  }

  const runId = resolveRunIdFromCaptureDir(captureRunDir);
  const sealed = resolveSealedLineage(runId);
  const inventory = buildMetadataOnlyMomentumCaptureInventory({
    captureRoot: input.captureRoot,
    sealedOnly: true,
  });
  const inventoryRow = inventory.rows.find((row) => row.runId === runId);

  const contaminationClassification =
    sealed?.contaminationClassification
    ?? inventoryRow?.contaminationClassification
    ?? "not-established";
  const contaminationEvidence =
    sealed?.contaminationEvidence
    ?? (inventoryRow ? [inventoryRow.rationale] : ["No sealed lineage or inventory row for run"]);
  const eligibleForRole =
    sealed?.eligibleForRole(input.role)
    ?? inventoryRow?.eligibleRoles.includes(input.role)
    ?? false;

  const healthPath = join(captureRunDir, "capture-health.json");
  const topOfBookPath = join(captureRunDir, "top-of-book.jsonl");
  const health = readJsonRecord(input.io, healthPath);

  let durationHours: number | null = null;
  if (health) {
    const config =
      health.config && typeof health.config === "object"
        ? (health.config as Record<string, unknown>)
        : null;
    const durationSeconds = readNumber(config?.durationSeconds);
    const durationMinutes = readNumber(config?.durationMinutes);
    if (durationSeconds !== null) {
      durationHours = durationSeconds / 3600;
    } else if (durationMinutes !== null) {
      durationHours = durationMinutes / 60;
    }
  }

  const topOfBook = hashLargeJsonlIdentity(input.io, topOfBookPath);
  const captureHealthContentHash = input.io.fileExists(healthPath)
    ? sha256Hex(input.io.readFile(healthPath).replace(/^\uFEFF/, ""))
    : null;

  const quarantinedForOutcomeScoring =
    input.role === "validation"
    || input.role === "holdout"
    || contaminationClassification === "ineligible-validation"
    || contaminationClassification === "ineligible-holdout"
    || !eligibleForRole;

  const identityPayload = {
    runId,
    role: input.role,
    captureHealthContentHash,
    topOfBookIdentityHash: topOfBook.identityHash,
    topOfBookByteLength: topOfBook.byteLength,
    contaminationClassification,
    eligibleForRole,
    quarantinedForOutcomeScoring,
  };

  return {
    runId,
    captureRunDir,
    role: input.role,
    exploratoryRole: "exploratory-design-data-not-confirmatory",
    confirmatoryReuseForbidden: true,
    contaminationClassification,
    contaminationEvidence,
    eligibleForRole,
    quarantinedForOutcomeScoring,
    captureHealthContentHash,
    durationHours,
    topOfBookByteLength: topOfBook.byteLength,
    topOfBookIdentityHash: topOfBook.identityHash,
    identityHash: sha256Hex(stableStringify(identityPayload)),
    nativeCaptureVerdict: readString(health?.verdict),
  };
}

export function buildMomentumResearchSplitManifest(input: {
  io: MomentumDiscoveryIo;
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  captureRoot?: string;
}): MomentumResearchSplitManifest {
  const train = buildMomentumCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.trainCaptureRunDir,
    role: "train",
    captureRoot: input.captureRoot,
  });
  const validation = buildMomentumCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.validationCaptureRunDir,
    role: "validation",
    captureRoot: input.captureRoot,
  });
  const holdout = buildMomentumCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.holdoutCaptureRunDir,
    role: "holdout",
    captureRoot: input.captureRoot,
  });

  const warnings: string[] = [];

  if (!train.eligibleForRole) {
    throw new MomentumGovernedDiscoveryError(
      `TRAIN run ${train.runId} is not eligible for train role under momentum contamination policy. `
        + "Fail closed before outcome access.",
    );
  }

  if (validation.quarantinedForOutcomeScoring) {
    warnings.push(
      `VALIDATION run ${validation.runId} is quarantined/ineligible for momentum outcome scoring `
        + `(classification=${validation.contaminationClassification}).`,
    );
  }
  if (holdout.quarantinedForOutcomeScoring) {
    warnings.push(
      `HOLDOUT run ${holdout.runId} is quarantined/ineligible for momentum outcome scoring `
        + `(classification=${holdout.contaminationClassification}).`,
    );
  }

  if (
    train.runId === validation.runId
    || train.runId === holdout.runId
    || validation.runId === holdout.runId
  ) {
    throw new MomentumGovernedDiscoveryError(
      "Train/validation/holdout run IDs must be distinct in the momentum split manifest.",
    );
  }

  const splitBody = {
    splitVersion: MOMENTUM_DISCOVERY_RESEARCH_SPLIT_VERSION,
    createdForAnalysisVersion: MOMENTUM_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
    confirmatoryReuseForbidden: true as const,
    familyDefinitionIdentity: input.familyDefinitionIdentity,
    evidenceContractIdentity: input.evidenceContractIdentity,
    train,
    validation,
    holdout,
  };

  return {
    ...splitBody,
    splitManifestHash: sha256Hex(stableStringify(splitBody)),
    warnings,
  };
}
