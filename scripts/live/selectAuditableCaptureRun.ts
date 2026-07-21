import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseCaptureRunStatus,
  type CaptureRunStatusArtifact,
} from "@/lib/data/live/forwardQuoteCapture/captureRunStatus";
import {
  parseRunIdTimestampMs,
  selectAuditableCaptureRun,
  type CaptureRunSelectionEntry,
  type CaptureRunStatusIntegrity,
} from "@/lib/data/live/forwardQuoteCapture/selectAuditableCaptureRun";

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag} <value>`);
  }
  return value;
}

export function loadCaptureRunSelectionEntries(
  captureRoot: string,
): CaptureRunSelectionEntry[] {
  if (!existsSync(captureRoot)) {
    return [];
  }
  return readdirSync(captureRoot, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => {
      const runDir = join(captureRoot, dirent.name);
      const statusPath = join(runDir, "capture-run-status.json");
      const healthPath = join(runDir, "capture-health.json");
      const hasCaptureHealth = existsSync(healthPath);

      // A status file that exists but cannot be strictly validated is never
      // treated like an absent legacy marker: it fails closed as "invalid"
      // (or "identity-mismatched" when its runId disagrees with the
      // directory name).
      let status: CaptureRunStatusArtifact | null = null;
      let statusIntegrity: CaptureRunStatusIntegrity = "absent";
      if (existsSync(statusPath)) {
        const parsed = parseCaptureRunStatus(readFileSync(statusPath, "utf8"));
        if (parsed === null) {
          statusIntegrity = "invalid";
        } else if (parsed.runId !== dirent.name) {
          statusIntegrity = "identity-mismatched";
        } else {
          status = parsed;
          statusIntegrity = "valid";
        }
      }

      // Stable completion time (never the mutable directory mtime):
      // validated status.endedAt, else the run-id timestamp, else the legacy
      // health artifact timestamp for pre-status runs.
      const completedAtMs =
        status?.endedAt != null
          ? Date.parse(status.endedAt)
          : parseRunIdTimestampMs(dirent.name)
            ?? (statusIntegrity === "absent" && hasCaptureHealth
              ? statSync(healthPath).mtimeMs
              : null);

      return {
        runDir,
        runId: dirent.name,
        status,
        statusIntegrity,
        hasCaptureHealth,
        completedAtMs,
      };
    });
}

function main(): void {
  const argv = process.argv.slice(2);
  const captureRoot =
    readFlagValue(argv, "--capture-root") ?? "data/live-capture/forward-quotes";
  const explicitRunDir = readFlagValue(argv, "--run-dir");

  const result = selectAuditableCaptureRun({
    entries: loadCaptureRunSelectionEntries(captureRoot),
    explicitRunDir,
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.outcome === "selected" ? 0 : 1;
}

/**
 * Run main() only when this file is the CLI entrypoint. Before this guard,
 * importing loadCaptureRunSelectionEntries (as evaluateCaptureRestartGate.ts
 * does) executed main() as an import side effect and printed a selection
 * JSON line to stdout ahead of the importer's own output — which corrupted
 * the canonical-profile JSON captured by run-capture-restart-smoke.ps1.
 * Case-insensitive compare: Windows paths are case-insensitive.
 */
const isDirectInvocation =
  process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href.toLowerCase()
    === import.meta.url.toLowerCase();

if (process.env.VITEST !== "true" && isDirectInvocation) {
  main();
}
