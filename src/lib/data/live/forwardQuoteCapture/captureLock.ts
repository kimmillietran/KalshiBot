import { posix } from "node:path";

import type { ForwardQuoteCaptureIo } from "./forwardQuoteCaptureTypes";

export const CAPTURE_LOCK_FILENAME = "capture.lock";

export function resolveCaptureLockPath(outputDir: string): string {
  return posix.join(outputDir.replaceAll("\\", "/"), CAPTURE_LOCK_FILENAME);
}

export type CaptureLockHandle = {
  lockPath: string;
  release: () => void;
};

/**
 * Acquires the global capture lock atomically via exclusive file creation
 * (O_EXCL). The lock is taken by the capture command itself — not only by
 * wrapper scripts — which closes the check-then-start race where two
 * captures both pass a directory-scan preflight before either publishes an
 * active run-status marker.
 *
 * Returns null when the io does not provide exclusive creation (legacy
 * in-memory test io). Throws when the lock is already held; the message
 * names the lock path so a stale lock left by a hard crash can be
 * reconciled by the operator.
 *
 * The caller must release only after terminal status publication.
 */
export function acquireCaptureLock(input: {
  io: Pick<
    ForwardQuoteCaptureIo,
    "createExclusiveFile" | "deleteFile" | "mkdirSync" | "now"
  >;
  outputDir: string;
  runId: string;
}): CaptureLockHandle | null {
  const { io } = input;
  if (!io.createExclusiveFile) {
    return null;
  }

  const lockPath = resolveCaptureLockPath(input.outputDir);
  io.mkdirSync(input.outputDir, { recursive: true });
  try {
    io.createExclusiveFile(
      lockPath,
      `${JSON.stringify({
        runId: input.runId,
        pid: typeof process !== "undefined" ? process.pid : null,
        acquiredAt: io.now().toISOString(),
      })}\n`,
    );
  } catch (error) {
    throw new Error(
      `Another capture appears to be running: could not acquire the capture lock at ${lockPath}. `
        + "If no capture process is alive, a previous run crashed without releasing it; "
        + `verify with the run-status markers and remove the lock file manually. (${
          error instanceof Error ? error.message : String(error)
        })`,
    );
  }

  let released = false;
  return {
    lockPath,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      try {
        io.deleteFile?.(lockPath);
      } catch {
        // A failed unlock must never mask the capture outcome; the stale
        // lock is visible on disk and blocks the next start loudly.
      }
    },
  };
}
