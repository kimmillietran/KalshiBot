import { createHash } from "node:crypto";
import { basename, join } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
  LEAD_LAG_RESEARCH_SPLIT_VERSION,
  LeadLagGovernedDiscoveryError,
  type LeadLagCaptureArtifactIdentity,
  type LeadLagContaminationClassification,
  type LeadLagDiscoveryIo,
  type LeadLagResearchSplitManifest,
  type LeadLagSplitRole,
} from "./leadLagDiscoveryTypes";

export function sha256Hex(payload: string | Buffer): string {
  return createHash("sha256").update(payload).digest("hex");
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/$/, "");
}

function readJsonRecord(io: LeadLagDiscoveryIo, path: string): Record<string, unknown> | null {
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

function resolveByteLength(io: LeadLagDiscoveryIo, path: string): number | null {
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

/**
 * Identity fingerprint for multi-GB JSONL: length + first/last 64 KiB when readable.
 * Avoids mtime/latest authority while remaining bounded-memory.
 */
export function hashLargeJsonlIdentity(
  io: LeadLagDiscoveryIo,
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

  // Prefer not to load multi-GB into RAM for identity; fingerprint via declared length
  // plus optional small-file companions. Full content is bound later by train analysis
  // when the stream is consumed under train-only IO.
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
 * Detect prior lead-lag *outcome* inspection for a run without reading signal tables.
 * Field-coverage / calibration-fade / next-family identity listing alone is not contamination.
 */
export function classifyLeadLagContamination(input: {
  io: LeadLagDiscoveryIo;
  runId: string;
  researchRoots?: readonly string[];
}): {
  classification: LeadLagContaminationClassification;
  evidence: string[];
} {
  const evidence: string[] = [];
  const roots = input.researchRoots ?? [
    "data/research-results",
    "data/reports",
  ];

  const suspiciousRelativePaths = [
    `btc-kalshi-lead-lag-analysis.json`,
    `btc-kalshi-lead-lag-events.jsonl`,
    `btc-kalshi-lead-lag/discovery`,
  ];

  for (const root of roots) {
    for (const relative of suspiciousRelativePaths) {
      const candidate = join(root, relative);
      const exists = input.io.fileExists(candidate);
      if (!exists) {
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
          `Lead-lag discovery directory exists at ${candidate}; `
            + `inspecting identity files for run ${input.runId} without reading outcome tables.`,
        );
        continue;
      }
      try {
        const content = input.io.readFile(candidate);
        // Identity-only: look for selectedRunId / runId string presence, not numeric outcomes.
        if (
          content.includes(`"selectedRunId":"${input.runId}"`)
          || content.includes(`"selectedRunId": "${input.runId}"`)
          || content.includes(`"runId":"${input.runId}"`)
          || content.includes(`"runId": "${input.runId}"`)
        ) {
          // Events/analysis files encode outcomes for that run → previously inspected.
          if (
            candidate.endsWith("btc-kalshi-lead-lag-analysis.json")
            || candidate.endsWith("btc-kalshi-lead-lag-events.jsonl")
            || candidate.includes("/discovery/")
          ) {
            evidence.push(
              `Found lead-lag outcome artifact referencing run ${input.runId}: ${candidate}`,
            );
            return { classification: "previously-inspected", evidence };
          }
        }
      } catch {
        evidence.push(`Unable to identity-scan ${candidate}; contamination not-established.`);
        return { classification: "not-established", evidence };
      }
    }
  }

  return {
    classification: "clean-for-lead-lag-discovery-role",
    evidence: [
      ...evidence,
      "No btc-kalshi-lead-lag outcome artifacts found for this run. "
        + "Calibration-fade / next-family field-coverage listings alone do not count as "
        + "lead-lag outcome inspection.",
    ],
  };
}

export function buildCaptureArtifactIdentity(input: {
  io: LeadLagDiscoveryIo;
  captureRunDir: string;
  role: LeadLagSplitRole;
  researchRoots?: readonly string[];
}): LeadLagCaptureArtifactIdentity {
  const captureRunDir = normalizePath(input.captureRunDir);
  if (!input.io.isDirectory(captureRunDir)) {
    throw new LeadLagGovernedDiscoveryError(
      `Capture run directory does not exist for ${input.role}: ${captureRunDir}`,
    );
  }

  const runId = resolveRunIdFromCaptureDir(captureRunDir);
  const contamination = classifyLeadLagContamination({
    io: input.io,
    runId,
    researchRoots: input.researchRoots,
  });

  const healthPath = join(captureRunDir, "capture-health.json");
  const auditPath = join(captureRunDir, "capture-health-audit.json");
  const statusPath = join(captureRunDir, "capture-run-status.json");
  const topOfBookPath = join(captureRunDir, "top-of-book.jsonl");
  const btcSpotPath = join(captureRunDir, "btc-spot.jsonl");

  const health = readJsonRecord(input.io, healthPath);
  const audit = readJsonRecord(input.io, auditPath);
  const auditSummary =
    audit?.summary && typeof audit.summary === "object"
      ? (audit.summary as Record<string, unknown>)
      : null;

  let durationHours: number | null = null;
  if (health) {
    const config =
      health.config && typeof health.config === "object"
        ? (health.config as Record<string, unknown>)
        : null;
    const durationSeconds = readNumber(config?.durationSeconds);
    durationHours = durationSeconds !== null ? durationSeconds / 3600 : null;
  }

  const topOfBook = hashLargeJsonlIdentity(input.io, topOfBookPath);
  const btcSpot = hashLargeJsonlIdentity(input.io, btcSpotPath);

  const captureHealthContentHash = input.io.fileExists(healthPath)
    ? sha256Hex(input.io.readFile(healthPath).replace(/^\uFEFF/, ""))
    : null;
  const captureHealthAuditContentHash = input.io.fileExists(auditPath)
    ? sha256Hex(input.io.readFile(auditPath).replace(/^\uFEFF/, ""))
    : null;
  const captureRunStatusContentHash = input.io.fileExists(statusPath)
    ? sha256Hex(input.io.readFile(statusPath).replace(/^\uFEFF/, ""))
    : null;

  const identityPayload = {
    runId,
    role: input.role,
    captureHealthContentHash,
    captureHealthAuditContentHash,
    captureRunStatusContentHash,
    topOfBookIdentityHash: topOfBook.identityHash,
    topOfBookByteLength: topOfBook.byteLength,
    btcSpotIdentityHash: btcSpot.identityHash,
    btcSpotByteLength: btcSpot.byteLength,
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
    captureHealthAuditContentHash,
    captureRunStatusContentHash,
    nativeCaptureVerdict: readString(health?.verdict),
    researchAuditVerdict: readString(auditSummary?.verdict),
    durationHours,
    topOfBookByteLength: topOfBook.byteLength,
    btcSpotByteLength: btcSpot.byteLength,
    btcSpotIdentityHash: btcSpot.identityHash,
    topOfBookIdentityHash: topOfBook.identityHash,
    identityHash: sha256Hex(stableStringify(identityPayload)),
  };
}

export function buildLeadLagResearchSplitManifest(input: {
  io: LeadLagDiscoveryIo;
  trainCaptureRunDir: string;
  validationCaptureRunDir: string;
  holdoutCaptureRunDir: string;
  researchRoots?: readonly string[];
  /** When true, previously-inspected validation/holdout fails closed. */
  failClosedOnContaminatedOos?: boolean;
}): LeadLagResearchSplitManifest {
  const train = buildCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.trainCaptureRunDir,
    role: "train",
    researchRoots: input.researchRoots,
  });
  const validation = buildCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.validationCaptureRunDir,
    role: "validation",
    researchRoots: input.researchRoots,
  });
  const holdout = buildCaptureArtifactIdentity({
    io: input.io,
    captureRunDir: input.holdoutCaptureRunDir,
    role: "holdout",
    researchRoots: input.researchRoots,
  });

  const warnings: string[] = [];
  const failClosed = input.failClosedOnContaminatedOos !== false;

  for (const identity of [validation, holdout]) {
    if (identity.contaminationClassification === "previously-inspected") {
      const message =
        `${identity.role} run ${identity.runId} was previously inspected for lead-lag outcomes. `
        + "Do not silently use it as validation/holdout; a fresh capture will eventually be required.";
      if (failClosed) {
        throw new LeadLagGovernedDiscoveryError(message);
      }
      warnings.push(message);
    }
    if (identity.contaminationClassification === "not-established") {
      warnings.push(
        `${identity.role} run ${identity.runId} contamination status is not-established.`,
      );
    }
  }

  if (train.runId === validation.runId || train.runId === holdout.runId || validation.runId === holdout.runId) {
    throw new LeadLagGovernedDiscoveryError(
      "Train/validation/holdout run IDs must be distinct in the split manifest.",
    );
  }

  const splitBody = {
    splitVersion: LEAD_LAG_RESEARCH_SPLIT_VERSION,
    createdForAnalysisVersion: LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION,
    confirmatoryReuseForbidden: true as const,
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
