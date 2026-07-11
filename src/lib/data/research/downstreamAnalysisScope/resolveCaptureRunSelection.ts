import type { CaptureRunSelection } from "./downstreamAnalysisScopeTypes";
import { DownstreamAnalysisScopeError } from "./downstreamAnalysisScopeTypes";
import { resolveRunIdFromPath } from "./downstreamAnalysisScopeUtils";

function readArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return argv[index + 1] ?? null;
}

/** Resolves aggregate vs selected-run scope from CLI argv. */
export function resolveCaptureRunSelection(input: {
  argv: readonly string[];
  defaultForwardQuotesDir: string;
}): CaptureRunSelection {
  const captureRunDir =
    readArgValue(input.argv, "--capture-run-dir")
    ?? readArgValue(input.argv, "--run-dir");
  const forwardQuotesDir =
    readArgValue(input.argv, "--forward-quotes-dir")
    ?? readArgValue(input.argv, "--input-dir")
    ?? input.defaultForwardQuotesDir;

  if (captureRunDir !== null && captureRunDir !== undefined) {
    const normalized = captureRunDir.replace(/\\/g, "/").replace(/\/$/, "");
    if (!normalized) {
      throw new DownstreamAnalysisScopeError("--capture-run-dir must not be empty.");
    }

    return {
      analysisScope: "selected-run",
      forwardQuotesDir,
      captureRunDir: normalized,
      selectedRunId: resolveRunIdFromPath(normalized),
    };
  }

  return {
    analysisScope: "aggregate",
    forwardQuotesDir,
    captureRunDir: null,
    selectedRunId: null,
  };
}
