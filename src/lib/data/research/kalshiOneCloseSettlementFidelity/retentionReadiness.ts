import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { OneCloseFidelityError, type RetentionMode } from "./types";

export type RetentionPaths = {
  primaryRoot: string;
  archiveRoot: string | null;
};

export type RetentionReadiness = {
  ready: boolean;
  mode: RetentionMode;
  independentBackup: boolean;
  blocker: string | null;
  primaryRoot: string | null;
  archiveRoot: string | null;
  primaryDeviceId: number | null;
  archiveDeviceId: number | null;
  sameDevice: boolean | null;
  roundTripVerified: boolean;
  syntheticSha256: string | null;
  retrievedSha256: string | null;
  note: string;
};

export type RetentionIo = {
  exists: (path: string) => boolean;
  mkdir: (path: string) => void;
  writeFile: (path: string, contents: string | Buffer) => void;
  readFile: (path: string) => Buffer;
  rename: (from: string, to: string) => void;
  deviceId: (path: string) => number;
  realpath?: (path: string) => string;
  env?: Record<string, string | undefined>;
};

export function createFilesystemRetentionIo(env: NodeJS.ProcessEnv = process.env): RetentionIo {
  return {
    exists: existsSync,
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    writeFile: (path, contents) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    },
    readFile: (path) => readFileSync(path),
    rename: renameSync,
    deviceId: (path) => statSync(path).dev,
    realpath: (path) => realpathSync(path),
    env: env as Record<string, string | undefined>,
  };
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function defaultPrimaryRoot(env: Record<string, string | undefined>): string | null {
  if (env.KALSHI_FIDELITY_PRIMARY_ROOT?.trim()) {
    return env.KALSHI_FIDELITY_PRIMARY_ROOT.trim();
  }
  if (!env.HOME) {
    return null;
  }
  return join(env.HOME, "Documents", "KalshiResearchArchive", "one-close-settlement-fidelity");
}

function isForbiddenPrimaryLocation(primaryRoot: string, env: Record<string, string | undefined>): string | null {
  const normalized = resolve(primaryRoot);
  const forbiddenSubstrings = [
    "/tmp/",
    "/var/folders/",
    "/Developer/kalshi-builder",
    "/Developer/kalshi-review",
    "/.cursor/",
    "/node_modules/",
  ];
  for (const fragment of forbiddenSubstrings) {
    if (normalized.includes(fragment)) {
      return `primary-root-forbidden-location: ${fragment}`;
    }
  }
  // Reject paths inside a git worktree checkout when CWD-derived
  if (env.PWD && normalized.startsWith(resolve(env.PWD)) && normalized.includes("/.git")) {
    return "primary-root-inside-git-metadata";
  }
  return null;
}

export function resolveRetentionPaths(input: {
  io: RetentionIo;
  mode: RetentionMode;
}): RetentionPaths | { blocker: string } {
  const env = input.io.env ?? {};
  const primaryRoot = defaultPrimaryRoot(env);
  if (!primaryRoot) {
    return { blocker: "primary-root-unresolvable: HOME unset and KALSHI_FIDELITY_PRIMARY_ROOT unset" };
  }
  const forbidden = isForbiddenPrimaryLocation(primaryRoot, env);
  if (forbidden) {
    return { blocker: forbidden };
  }
  if (input.mode === "local-persistent-only") {
    return { primaryRoot, archiveRoot: null };
  }
  if (input.mode === "independent-archive") {
    const archiveRoot = env.KALSHI_FIDELITY_ARCHIVE_ROOT?.trim() || "";
    if (!archiveRoot) {
      return {
        blocker:
          "independent-archive-root-unset: set KALSHI_FIDELITY_ARCHIVE_ROOT to an off-disk/external mount",
      };
    }
    return { primaryRoot, archiveRoot };
  }
  return {
    blocker: `unsupported-retention-mode: ${String(input.mode)}`,
  };
}

/**
 * Local-persistent-only: write/read synthetic artifact under primary root outside
 * worktrees. Records independentBackup=false. Does NOT treat same-disk copies as
 * independent backups.
 *
 * Independent-archive mode: still requires a distinct-device archive root.
 */
export function verifyRetentionReadiness(input: {
  io: RetentionIo;
  mode: RetentionMode;
  nowIso?: string;
  campaignId?: string;
}): RetentionReadiness {
  const independentBackup = input.mode === "independent-archive";
  const resolved = resolveRetentionPaths({ io: input.io, mode: input.mode });
  if ("blocker" in resolved) {
    return {
      ready: false,
      mode: input.mode,
      independentBackup,
      blocker: resolved.blocker,
      primaryRoot: null,
      archiveRoot: null,
      primaryDeviceId: null,
      archiveDeviceId: null,
      sameDevice: null,
      roundTripVerified: false,
      syntheticSha256: null,
      retrievedSha256: null,
      note: independentBackup
        ? "Independent-archive mode requires a distinct-device archive root."
        : "Local-persistent-only mode requires a private primary root outside repos/worktrees/tmp.",
    };
  }

  const { primaryRoot, archiveRoot } = resolved;
  try {
    input.io.mkdir(primaryRoot);
    if (archiveRoot) {
      input.io.mkdir(archiveRoot);
    }
  } catch (error) {
    return {
      ready: false,
      mode: input.mode,
      independentBackup,
      blocker: `retention-mkdir-failed: ${error instanceof Error ? error.message : "unknown"}`,
      primaryRoot,
      archiveRoot,
      primaryDeviceId: null,
      archiveDeviceId: null,
      sameDevice: null,
      roundTripVerified: false,
      syntheticSha256: null,
      retrievedSha256: null,
      note: "Could not create retention roots.",
    };
  }

  let primaryDeviceId: number | null = null;
  let archiveDeviceId: number | null = null;
  let sameDevice: boolean | null = null;
  try {
    primaryDeviceId = input.io.deviceId(primaryRoot);
    if (archiveRoot) {
      archiveDeviceId = input.io.deviceId(archiveRoot);
      sameDevice = primaryDeviceId === archiveDeviceId;
      if (sameDevice) {
        return {
          ready: false,
          mode: input.mode,
          independentBackup: true,
          blocker:
            "archive-same-device-as-primary: another directory on the same disk is not an independent backup",
          primaryRoot,
          archiveRoot,
          primaryDeviceId,
          archiveDeviceId,
          sameDevice: true,
          roundTripVerified: false,
          syntheticSha256: null,
          retrievedSha256: null,
          note: "Independent-archive mode rejected same-disk archive.",
        };
      }
    }
  } catch (error) {
    return {
      ready: false,
      mode: input.mode,
      independentBackup,
      blocker: `device-id-unreadable: ${error instanceof Error ? error.message : "unknown"}`,
      primaryRoot,
      archiveRoot,
      primaryDeviceId,
      archiveDeviceId,
      sameDevice,
      roundTripVerified: false,
      syntheticSha256: null,
      retrievedSha256: null,
      note: "Unable to read filesystem device ids.",
    };
  }

  const stamp = (input.nowIso ?? new Date().toISOString()).replace(/[:.]/g, "-");
  const syntheticName = `retention-roundtrip-${stamp}.txt`;
  const writePath = join(primaryRoot, "roundtrip", syntheticName);
  const readBackPath = join(primaryRoot, "roundtrip-reread", syntheticName);
  const payload = Buffer.from(
    `kalshi-one-close-retention-roundtrip\nmode=${input.mode}\ncampaign=${input.campaignId ?? ""}\nat=${input.nowIso ?? ""}\nindependentBackup=${independentBackup}\n`,
    "utf8",
  );
  const syntheticSha = sha256Buffer(payload);
  try {
    input.io.writeFile(writePath, payload);
    const reread = input.io.readFile(writePath);
    input.io.writeFile(readBackPath, reread);
    const retrieved = input.io.readFile(readBackPath);
    const retrievedSha = sha256Buffer(retrieved);
    if (retrievedSha !== syntheticSha) {
      throw new OneCloseFidelityError("retention-roundtrip-hash-mismatch");
    }
    if (archiveRoot) {
      const archiveFile = join(archiveRoot, "roundtrip", syntheticName);
      input.io.writeFile(archiveFile, payload);
      const archived = input.io.readFile(archiveFile);
      if (sha256Buffer(archived) !== syntheticSha) {
        throw new OneCloseFidelityError("archive-roundtrip-hash-mismatch");
      }
    }
  } catch (error) {
    return {
      ready: false,
      mode: input.mode,
      independentBackup,
      blocker: `roundtrip-failed: ${error instanceof Error ? error.message : "unknown"}`,
      primaryRoot,
      archiveRoot,
      primaryDeviceId,
      archiveDeviceId,
      sameDevice,
      roundTripVerified: false,
      syntheticSha256: syntheticSha,
      retrievedSha256: null,
      note: "Synthetic write/read hash verification failed.",
    };
  }

  return {
    ready: true,
    mode: input.mode,
    independentBackup,
    blocker: null,
    primaryRoot,
    archiveRoot,
    primaryDeviceId,
    archiveDeviceId,
    sameDevice,
    roundTripVerified: true,
    syntheticSha256: syntheticSha,
    retrievedSha256: syntheticSha,
    note: independentBackup
      ? "Distinct-device archive verified; independentBackup=true."
      : "Local-persistent-only primary root verified with write/read SHA-256; independentBackup=false (not an independent backup).",
  };
}

export function assertRetentionReady(readiness: RetentionReadiness): void {
  if (!readiness.ready) {
    throw new OneCloseFidelityError(
      `retention-not-ready: ${readiness.blocker ?? "unknown-blocker"}`,
    );
  }
}
