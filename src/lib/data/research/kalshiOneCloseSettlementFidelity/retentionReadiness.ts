import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { OneCloseFidelityError } from "./types";

export type RetentionPaths = {
  primaryRoot: string;
  archiveRoot: string;
};

export type RetentionReadiness = {
  ready: boolean;
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
    env: env as Record<string, string | undefined>,
  };
}

/**
 * Resolve primary + independently recoverable archive roots.
 * Archive must be on a different device id than primary (external volume /
 * distinct mount). Same-disk second directories are rejected.
 */
export function resolveRetentionPaths(io: RetentionIo): RetentionPaths | { blocker: string } {
  const env = io.env ?? {};
  const primaryRoot = env.KALSHI_FIDELITY_PRIMARY_ROOT?.trim()
    || join(env.HOME ?? "", "Documents", "KalshiResearchArchive", "one-close-settlement-fidelity");
  const archiveRoot = env.KALSHI_FIDELITY_ARCHIVE_ROOT?.trim() || "";
  if (!archiveRoot) {
    return {
      blocker:
        "independent-archive-root-unset: set KALSHI_FIDELITY_ARCHIVE_ROOT to an off-disk/external mount; same-disk directories are not accepted",
    };
  }
  if (!primaryRoot || primaryRoot === join("", "Documents", "KalshiResearchArchive", "one-close-settlement-fidelity")) {
    if (!env.HOME) {
      return { blocker: "primary-root-unresolvable: HOME unset and KALSHI_FIDELITY_PRIMARY_ROOT unset" };
    }
  }
  return { primaryRoot, archiveRoot };
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Verify retention prerequisites including a synthetic archive→retrieve round-trip
 * into a separate path, with device-id inequality between primary and archive.
 */
export function verifyRetentionReadiness(input: {
  io: RetentionIo;
  nowIso?: string;
}): RetentionReadiness {
  const resolved = resolveRetentionPaths(input.io);
  if ("blocker" in resolved) {
    return {
      ready: false,
      blocker: resolved.blocker,
      primaryRoot: null,
      archiveRoot: null,
      primaryDeviceId: null,
      archiveDeviceId: null,
      sameDevice: null,
      roundTripVerified: false,
      syntheticSha256: null,
      retrievedSha256: null,
      note: "PR #119 requires an independently recoverable archive; same-disk copies are disallowed for this one-close run.",
    };
  }
  const { primaryRoot, archiveRoot } = resolved;
  try {
    input.io.mkdir(primaryRoot);
    input.io.mkdir(archiveRoot);
  } catch (error) {
    return {
      ready: false,
      blocker: `retention-mkdir-failed: ${error instanceof Error ? error.message : "unknown"}`,
      primaryRoot,
      archiveRoot,
      primaryDeviceId: null,
      archiveDeviceId: null,
      sameDevice: null,
      roundTripVerified: false,
      syntheticSha256: null,
      retrievedSha256: null,
      note: "Could not create primary or archive roots.",
    };
  }

  let primaryDeviceId: number;
  let archiveDeviceId: number;
  try {
    primaryDeviceId = input.io.deviceId(primaryRoot);
    archiveDeviceId = input.io.deviceId(archiveRoot);
  } catch (error) {
    return {
      ready: false,
      blocker: `device-id-unreadable: ${error instanceof Error ? error.message : "unknown"}`,
      primaryRoot,
      archiveRoot,
      primaryDeviceId: null,
      archiveDeviceId: null,
      sameDevice: null,
      roundTripVerified: false,
      syntheticSha256: null,
      retrievedSha256: null,
      note: "Unable to compare filesystem device ids.",
    };
  }

  if (primaryDeviceId === archiveDeviceId) {
    return {
      ready: false,
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
      note: "Time Machine / external volume / off-host archive required.",
    };
  }

  const stamp = (input.nowIso ?? new Date().toISOString()).replace(/[:.]/g, "-");
  const syntheticName = `retention-roundtrip-${stamp}.txt`;
  const primaryFile = join(primaryRoot, "roundtrip", syntheticName);
  const archiveFile = join(archiveRoot, "roundtrip", syntheticName);
  const retrieveFile = join(primaryRoot, "roundtrip-retrieved", syntheticName);
  const payload = Buffer.from(
    `kalshi-one-close-retention-roundtrip\ncampaign=kalshi-kxbtc15m-one-close-settlement-fidelity-v0\nat=${input.nowIso ?? ""}\n`,
    "utf8",
  );
  const syntheticSha = sha256Buffer(payload);
  try {
    input.io.writeFile(primaryFile, payload);
    input.io.writeFile(archiveFile, payload);
    const archived = input.io.readFile(archiveFile);
    input.io.writeFile(retrieveFile, archived);
    const retrieved = input.io.readFile(retrieveFile);
    const retrievedSha = sha256Buffer(retrieved);
    if (retrievedSha !== syntheticSha) {
      throw new OneCloseFidelityError("retention-roundtrip-hash-mismatch");
    }
  } catch (error) {
    return {
      ready: false,
      blocker: `roundtrip-failed: ${error instanceof Error ? error.message : "unknown"}`,
      primaryRoot,
      archiveRoot,
      primaryDeviceId,
      archiveDeviceId,
      sameDevice: false,
      roundTripVerified: false,
      syntheticSha256: syntheticSha,
      retrievedSha256: null,
      note: "Synthetic artifact archive/retrieve verification failed.",
    };
  }

  return {
    ready: true,
    blocker: null,
    primaryRoot,
    archiveRoot,
    primaryDeviceId,
    archiveDeviceId,
    sameDevice: false,
    roundTripVerified: true,
    syntheticSha256: syntheticSha,
    retrievedSha256: syntheticSha,
    note: "Primary and archive are on distinct devices; synthetic round-trip hash matched.",
  };
}

export function assertRetentionReady(readiness: RetentionReadiness): void {
  if (!readiness.ready) {
    throw new OneCloseFidelityError(
      `retention-not-ready: ${readiness.blocker ?? "unknown-blocker"}`,
    );
  }
}
