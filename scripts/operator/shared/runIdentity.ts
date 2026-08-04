import { join } from "node:path";

import { OperatorCliError } from "./argv";

export type ExactCaptureRunIdentity = {
  runId: string;
  outputDir: string;
  runDir: string;
  rawLine: string;
  /** True when the identity came from an explicit capture-started event. */
  fromStartupEvent: boolean;
};

export function normalizeCaptureIdentityPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

export function exactCaptureIdentitiesMatch(
  left: Pick<ExactCaptureRunIdentity, "runId" | "outputDir" | "runDir">,
  right: Pick<ExactCaptureRunIdentity, "runId" | "outputDir" | "runDir">,
): boolean {
  return (
    left.runId === right.runId
    && normalizeCaptureIdentityPath(left.outputDir)
      === normalizeCaptureIdentityPath(right.outputDir)
    && normalizeCaptureIdentityPath(left.runDir)
      === normalizeCaptureIdentityPath(right.runDir)
  );
}

/**
 * Split stdout into complete lines only. A trailing fragment without a
 * terminating newline is ignored so chunked JSON can be buffered safely.
 */
export function listCompleteStdoutLines(stdout: string): string[] {
  if (stdout.length === 0) {
    return [];
  }
  const parts = stdout.split(/\r?\n/);
  const hasTrailingIncomplete = !/(?:\r?\n)$/.test(stdout);
  const complete = hasTrailingIncomplete ? parts.slice(0, -1) : parts;
  return complete.filter((line) => line.length > 0);
}

function parseIdentityRecord(
  trimmed: string,
  record: Record<string, unknown>,
): ExactCaptureRunIdentity {
  const runId = record.runId;
  const outputDir = record.outputDir;
  if (typeof runId !== "string" || runId.trim() === "") {
    throw new OperatorCliError(
      "Malformed run identity JSON: runId must be a non-empty string.",
    );
  }
  if (typeof outputDir !== "string" || outputDir.trim() === "") {
    throw new OperatorCliError(
      "Malformed run identity JSON: outputDir must be a non-empty string.",
    );
  }

  const explicitRunDir = record.runDir;
  const runDir =
    typeof explicitRunDir === "string" && explicitRunDir.trim() !== ""
      ? explicitRunDir
      : join(outputDir, runId);

  return {
    runId,
    outputDir,
    runDir,
    rawLine: trimmed,
    fromStartupEvent: record.event === "capture-started",
  };
}

function tryParseIdentityLine(line: string): ExactCaptureRunIdentity | null {
  const trimmed = line.trim();
  if (!trimmed.includes('"runId"')) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new OperatorCliError(
      `Malformed run identity JSON in capture output: ${trimmed.slice(0, 200)}`,
    );
  }
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
  ) {
    throw new OperatorCliError(
      "Malformed run identity JSON: expected a JSON object with runId/outputDir.",
    );
  }
  const record = parsed as Record<string, unknown>;
  // BTC provider metric lines and other telemetry may include runId-like
  // fields without outputDir; ignore those rather than failing closed.
  if (!("outputDir" in record) && record.event !== "capture-started") {
    return null;
  }
  return parseIdentityRecord(trimmed, record);
}

/**
 * Extract the exact capture run identity from capture CLI stdout.
 * Never falls back to newest-directory or mtime selection.
 *
 * Prefers an explicit capture-started event when present; otherwise uses the
 * last valid runId/outputDir identity (typically the final summary).
 */
export function parseExactRunIdentityFromOutput(
  stdout: string,
): ExactCaptureRunIdentity {
  const lines = listCompleteStdoutLines(stdout);
  let startupMatch: ExactCaptureRunIdentity | null = null;
  let lastMatch: ExactCaptureRunIdentity | null = null;

  for (const line of lines) {
    const identity = tryParseIdentityLine(line);
    if (identity === null) {
      continue;
    }
    lastMatch = identity;
    if (identity.fromStartupEvent && startupMatch === null) {
      startupMatch = identity;
    }
  }

  const chosen = startupMatch ?? lastMatch;
  if (chosen === null) {
    throw new OperatorCliError(
      "Could not identify the capture run: no runId JSON found in capture output.",
    );
  }

  // When both startup and final identities are present, require them to match.
  if (startupMatch !== null && lastMatch !== null) {
    if (!exactCaptureIdentitiesMatch(startupMatch, lastMatch)) {
      throw new OperatorCliError(
        "Startup/final capture identity mismatch: "
          + `startup runId=${startupMatch.runId} runDir=${startupMatch.runDir}; `
          + `final runId=${lastMatch.runId} runDir=${lastMatch.runDir}. `
          + "Failing closed; not switching the progress monitor to a second identity.",
      );
    }
  }

  return chosen;
}

/**
 * Streaming-safe identity parse over a growing stdout buffer.
 * Incomplete trailing lines are ignored; complete malformed identity JSON
 * still fails closed.
 */
export function tryParseExactRunIdentityFromChunk(
  buffer: string,
): ExactCaptureRunIdentity | null {
  try {
    return parseExactRunIdentityFromOutput(buffer);
  } catch (error) {
    if (
      error instanceof OperatorCliError
      && (
        error.message.includes("Malformed run identity JSON")
        || error.message.includes("Startup/final capture identity mismatch")
      )
    ) {
      throw error;
    }
    return null;
  }
}
