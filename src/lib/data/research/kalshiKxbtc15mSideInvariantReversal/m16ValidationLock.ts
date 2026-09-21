/**
 * M16.2 PID-based exclusive runner lock with stale recovery.
 * Lock file is operational only — not scientific authority.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { M16ValidationCollectionError } from "./m16ValidationCohortTypes";

export type M16ValidationLockHandle = {
  lockPath: string;
  pid: number;
  acquiredAtIso: string;
};

export type M16ValidationLockIo = {
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: "utf8") => string;
  writeFileSync: (path: string, data: string, encoding: "utf8") => void;
  unlinkSync: (path: string) => void;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
  pidIsAlive: (pid: number) => boolean;
  currentPid: () => number;
  nowIso: () => string;
};

const DEFAULT_IO: M16ValidationLockIo = {
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  writeFileSync: (path, data, encoding) => writeFileSync(path, data, encoding),
  unlinkSync,
  mkdirSync: (path, opts) => {
    mkdirSync(path, opts);
  },
  pidIsAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  currentPid: () => process.pid,
  nowIso: () => new Date().toISOString(),
};

type LockPayload = {
  pid: number;
  acquiredAtIso: string;
  note: "m16-validation-runner-lock-operational-not-scientific-authority";
};

export function acquireM16ValidationRunnerLock(
  lockPath: string,
  io: M16ValidationLockIo = DEFAULT_IO,
): M16ValidationLockHandle {
  io.mkdirSync(dirname(lockPath), { recursive: true });
  if (io.existsSync(lockPath)) {
    let existing: LockPayload | null = null;
    try {
      existing = JSON.parse(io.readFileSync(lockPath, "utf8")) as LockPayload;
    } catch {
      existing = null;
    }
    if (existing && Number.isInteger(existing.pid) && io.pidIsAlive(existing.pid)) {
      throw new M16ValidationCollectionError(
        `M16 validation runner lock held by live pid=${existing.pid} at ${lockPath}`,
      );
    }
    // Stale lock (dead PID or corrupt) — recover.
    try {
      io.unlinkSync(lockPath);
    } catch {
      // fall through; write may still fail closed
    }
  }

  const handle: M16ValidationLockHandle = {
    lockPath,
    pid: io.currentPid(),
    acquiredAtIso: io.nowIso(),
  };
  const payload: LockPayload = {
    pid: handle.pid,
    acquiredAtIso: handle.acquiredAtIso,
    note: "m16-validation-runner-lock-operational-not-scientific-authority",
  };
  io.writeFileSync(lockPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return handle;
}

export function releaseM16ValidationRunnerLock(
  handle: M16ValidationLockHandle,
  io: M16ValidationLockIo = DEFAULT_IO,
): void {
  if (!io.existsSync(handle.lockPath)) return;
  try {
    const raw = io.readFileSync(handle.lockPath, "utf8");
    const existing = JSON.parse(raw) as LockPayload;
    if (existing.pid !== handle.pid) {
      throw new M16ValidationCollectionError(
        `refusing to release lock owned by pid=${existing.pid} (ours=${handle.pid})`,
      );
    }
  } catch (error) {
    if (error instanceof M16ValidationCollectionError) throw error;
    // Corrupt lock owned by us path — still remove.
  }
  io.unlinkSync(handle.lockPath);
}
