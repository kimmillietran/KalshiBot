import { createHash } from "node:crypto";
import { basename, join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  MICROSTRUCTURE_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
  MICROSTRUCTURE_RESEARCH_SPLIT_VERSION,
  MicrostructureGovernedDiscoveryError,
  type MicrostructureCaptureArtifactIdentity,
  type MicrostructureContaminationClassification,
  type MicrostructureDiscoveryIo,
  type MicrostructureResearchSplitManifest,
  type MicrostructureSplitRole,
} from "./microstructureDiscoveryTypes";

export function sha256Hex(payload: string | Buffer): string {
  return createHash("sha256").update(payload).digest("hex");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/$/, "");
}

function readJsonRecord(io: MicrostructureDiscoveryIo, path: string): Record<string, unknown> | null {
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

function resolveByteLength(io: MicrostructureDiscoveryIo, path: string): number | null {
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
  io: MicrostructureDiscoveryIo,
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

/**
 * Microstructure-outcome contamination only.
 * Prior BTC/Kalshi lead-lag use does NOT contaminate this family.
 * Predictor-only field coverage / bid-size audits do NOT contaminate.
 */
export function classifyMicrostructureContamination(input: {
  io: MicrostructureDiscoveryIo;
  runId: string;
  researchRoots?: readonly string[];
}): {
  classification: MicrostructureContaminationClassification;
  evidence: string[];
} {
  const evidence: string[] = [];
  const roots = input.researchRoots ?? ["data/research-results", "data/reports"];

  const suspiciousRelativePaths = [
    "spread-liquidity-microstructure/discovery",
    "spread-liquidity-microstructure/validation",
    "spread-liquidity-microstructure/holdout",
    "tob-imbalance-governed-discovery.json",
    "tob-imbalance-discovery-cells.jsonl",
  ];

  for (const root of roots) {
    for (const relative of suspiciousRelativePaths) {
      const candidate = join(root, relative);
      if (!input.io.fileExists(candidate)) {
        continue;
      }
      let isDir = false;
      try {
        isDir = input.io.isDirectory(candidate);
      } catch {
        isDir = false;
      }
      if (isDir) {
        evidence.push(
          `Microstructure discovery/validation/holdout directory exists at ${candidate}; `
            + `identity-scanning for run ${input.runId} without reading outcome tables.`,
        );
        const identityProbe = join(candidate, "tob-imbalance-governed-discovery.json");
        const probes = [identityProbe];
        if (typeof input.io.listDirectory === "function") {
          try {
            for (const entry of input.io.listDirectory(candidate)) {
              probes.push(join(candidate, entry, "tob-imbalance-governed-discovery.json"));
              probes.push(join(candidate, entry, "microstructure-research-split.json"));
            }
          } catch {
            // ignore list failures
          }
        }
        for (const probe of probes) {
          if (!input.io.fileExists(probe)) {
            continue;
          }
          try {
            const content = input.io.readFile(probe);
            if (
              content.includes(`"trainRunId":"${input.runId}"`)
              || content.includes(`"trainRunId": "${input.runId}"`)
              || content.includes(`"${input.runId}"`)
            ) {
              evidence.push(
                `Found microstructure outcome discovery artifact referencing run ${input.runId}: ${probe}`,
              );
              return { classification: "previously-inspected", evidence };
            }
          } catch {
            evidence.push(`Unable to identity-scan ${probe}; contamination not-established.`);
            return { classification: "not-established", evidence };
          }
        }
        continue;
      }
      try {
        const content = input.io.readFile(candidate);
        if (
          content.includes(input.runId)
          && (
            candidate.endsWith("tob-imbalance-governed-discovery.json")
            || candidate.endsWith("tob-imbalance-discovery-cells.jsonl")
            || candidate.includes("/discovery/")
            || candidate.includes("/validation/")
            || candidate.includes("/holdout/")
          )
        ) {
          evidence.push(
            `Found microstructure outcome artifact referencing run ${input.runId}: ${candidate}`,
          );
          return { classification: "previously-inspected", evidence };
        }
      } catch {
        evidence.push(`Unable to identity-scan ${candidate}; contamination not-established.`);
        return { classification: "not-established", evidence };
      }
    }
  }

  return {
    classification: "clean-for-microstructure-discovery-role",
    evidence: [
      ...evidence,
      "No microstructure response-outcome artifacts found for this run. "
        + "Prior lead-lag outcome use and predictor-only field/bid-size audits do not contaminate "
        + "this independent family role.",
    ],
  };
}

export function buildMicrostructureCaptureArtifactIdentity(input: {
  io: MicrostructureDiscoveryIo;
  captureRunDir: string;
  role: MicrostructureSplitRole;
  researchRoots?: readonly string[];
}): MicrostructureCaptureArtifactIdentity {
  const captureRunDir = normalizePath(input.captureRunDir);
  if (!input.io.isDirectory(captureRunDir)) {
    throw new MicrostructureGovernedDiscoveryError(
      `Capture run directory does not exist for ${input.role}: ${captureRunDir}`,
    );
  }

  const runId = resolveRunIdFromCaptureDir(captureRunDir);
  const contamination = classifyMicrostructureContamination({
    io: input.io,
    runId,
    researchRoots: input.researchRoots,
  });

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

  const identityPayload = {
    runId,
    role: input.role,
    captureHealthContentHash,
    topOfBookIdentityHash: topOfBook.identityHash,
    topOfBookByteLength: topOfBook.byteLength,
  };

  return {
    runId,
    captureRunDir,
    role: input.role,
    exploratoryRole: "exploratory-design-data-not-confirmatory",
    confirmatoryReuseForbidden: true,
    contaminationClassification: contamination.classification,
    contaminationEvidence: contamination.evidence,
    captureHealthContentHash,
    durationHours,
    topOfBookByteLength: topOfBook.byteLength,
    topOfBookIdentityHash: topOfBook.identityHash,
    identityHash: sha256Hex(stableStringify(identityPayload)),
    nativeCaptureVerdict: readString(health?.verdict),
  };
}

export function buildMicrostructureResearchSplitManifest(input: {
  io: MicrostructureDiscoveryIo;
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  researchRoots?: readonly string[];
  failClosedOnContaminatedTrain?: boolean;
  failClosedOnContaminatedOos?: boolean;
}): MicrostructureResearchSplitManifest {
  const train = buildMicrostructureCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.trainCaptureRunDir,
    role: "train",
    researchRoots: input.researchRoots,
  });
  const validation = buildMicrostructureCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.validationCaptureRunDir,
    role: "validation",
    researchRoots: input.researchRoots,
  });
  const holdout = buildMicrostructureCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.holdoutCaptureRunDir,
    role: "holdout",
    researchRoots: input.researchRoots,
  });

  const warnings: string[] = [];

  if (
    input.failClosedOnContaminatedTrain !== false
    && train.contaminationClassification === "previously-inspected"
  ) {
    throw new MicrostructureGovernedDiscoveryError(
      `TRAIN run ${train.runId} was previously inspected for microstructure response outcomes. `
        + "Fail closed before outcome access; do not silently substitute another run.",
    );
  }

  const failClosedOos = input.failClosedOnContaminatedOos !== false;
  for (const identity of [validation, holdout]) {
    if (identity.contaminationClassification === "previously-inspected") {
      const message =
        `${identity.role} run ${identity.runId} was previously inspected for microstructure outcomes. `
        + "Do not silently reuse it as validation/holdout.";
      if (failClosedOos) {
        throw new MicrostructureGovernedDiscoveryError(message);
      }
      warnings.push(message);
    }
  }

  if (
    train.runId === validation.runId
    || train.runId === holdout.runId
    || validation.runId === holdout.runId
  ) {
    throw new MicrostructureGovernedDiscoveryError(
      "Train/validation/holdout run IDs must be distinct in the microstructure split manifest.",
    );
  }

  const splitBody = {
    splitVersion: MICROSTRUCTURE_RESEARCH_SPLIT_VERSION,
    createdForAnalysisVersion: MICROSTRUCTURE_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
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
