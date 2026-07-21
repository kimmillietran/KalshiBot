import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  parseCaptureRunStatus,
  type CaptureRunStatusArtifact,
} from "@/lib/data/live/forwardQuoteCapture/captureRunStatus";
import {
  selectAuditableCaptureRun,
  type CaptureRunSelectionEntry,
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
      let status: CaptureRunStatusArtifact | null = null;
      if (existsSync(statusPath)) {
        status = parseCaptureRunStatus(readFileSync(statusPath, "utf8"));
      }
      return {
        runDir,
        runId: dirent.name,
        status,
        hasCaptureHealth: existsSync(join(runDir, "capture-health.json")),
        lastModifiedMs: statSync(runDir).mtimeMs,
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

if (process.env.VITEST !== "true") {
  main();
}
