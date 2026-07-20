import { resolveSelectedRunId } from "@/lib/data/research/selectedRunCaptureHealth";

export type CrossRunSourceArtifactFingerprint = {
  path: string;
  role: string;
  sizeBytes: number | null;
  mtimeMs: number | null;
};

export type CrossRunSourceIdentity = {
  selectedRunId: string;
  captureRunDir: string;
  artifacts: readonly CrossRunSourceArtifactFingerprint[];
};

export type CrossRunSourceIdentityIo = {
  fileExists: (path: string) => boolean;
  fileSizeBytes?: (path: string) => number | null;
  fileMtimeMs?: (path: string) => number | null;
};

function normalizeCapturePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/$/, "");
}

function joinCapturePath(captureRunDir: string, filename: string): string {
  return `${normalizeCapturePath(captureRunDir)}/${filename}`;
}

function fingerprint(
  io: CrossRunSourceIdentityIo,
  path: string,
  role: string,
): CrossRunSourceArtifactFingerprint | null {
  const normalized = normalizeCapturePath(path);
  if (!io.fileExists(normalized) && !io.fileExists(path)) {
    return null;
  }
  const existing = io.fileExists(normalized) ? normalized : path;
  return {
    path: normalizeCapturePath(existing),
    role,
    sizeBytes: io.fileSizeBytes?.(existing) ?? null,
    mtimeMs: io.fileMtimeMs?.(existing) ?? null,
  };
}

/**
 * Bounded source-artifact identity for run-set hashing.
 * Uses path + size + mtime (not full content hash) for large JSONL streams.
 */
export function collectRunSourceArtifactIdentities(
  io: CrossRunSourceIdentityIo,
  captureRunDir: string,
): CrossRunSourceIdentity {
  const normalizedDir = normalizeCapturePath(captureRunDir);
  const selectedRunId = resolveSelectedRunId(normalizedDir);
  const candidates: { filename: string; role: string }[] = [
    { filename: "top-of-book.jsonl", role: "top-of-book" },
    { filename: "btc-spot.jsonl", role: "btc-spot" },
    { filename: "market-metadata.jsonl", role: "market-metadata" },
    { filename: "capture-health.json", role: "native-capture-health" },
    { filename: "capture-health-audit.json", role: "run-scoped-capture-health-audit" },
  ];

  const artifacts = candidates
    .map((entry) => fingerprint(io, joinCapturePath(normalizedDir, entry.filename), entry.role))
    .filter((entry): entry is CrossRunSourceArtifactFingerprint => entry !== null)
    .sort((left, right) => left.role.localeCompare(right.role) || left.path.localeCompare(right.path));

  return {
    selectedRunId,
    captureRunDir: normalizedDir,
    artifacts,
  };
}
