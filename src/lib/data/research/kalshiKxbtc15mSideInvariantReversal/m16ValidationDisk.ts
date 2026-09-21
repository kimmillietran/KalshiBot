/**
 * M16.2a free-disk preflight helper (operational).
 */
import { execFileSync } from "node:child_process";

import { M16ValidationCollectionError } from "./m16ValidationCohortTypes";

/**
 * Parse `df -k` available kilobytes for a path → bytes.
 */
export function parseDfAvailableKilobytes(stdout: string): number {
  const lines = stdout.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw new M16ValidationCollectionError("df output unparseable");
  }
  // Prefer last line (path may wrap on some systems).
  const data = lines[lines.length - 1]!;
  const parts = data.trim().split(/\s+/);
  // Format: Filesystem 1024-blocks Used Available Capacity ...
  if (parts.length < 4) {
    throw new M16ValidationCollectionError(`df columns unexpected: ${data}`);
  }
  const availableKi = Number(parts[3]);
  if (!Number.isFinite(availableKi) || availableKi < 0) {
    throw new M16ValidationCollectionError(`df available invalid: ${parts[3]}`);
  }
  return availableKi;
}

export function getFreeDiskBytesForPath(path: string = "."): number {
  const stdout = execFileSync("df", ["-k", path], { encoding: "utf8" });
  const availableKi = parseDfAvailableKilobytes(stdout);
  return availableKi * 1024;
}
