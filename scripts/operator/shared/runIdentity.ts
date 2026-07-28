import { join } from "node:path";

import { OperatorCliError } from "./argv";

export type ExactCaptureRunIdentity = {
  runId: string;
  outputDir: string;
  runDir: string;
  rawLine: string;
};

/**
 * Extract the exact capture run identity from capture CLI stdout.
 * Never falls back to newest-directory or mtime selection.
 */
export function parseExactRunIdentityFromOutput(
  stdout: string,
): ExactCaptureRunIdentity {
  const lines = stdout.split(/\r?\n/);
  let lastMatch: ExactCaptureRunIdentity | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes('"runId"')) {
      continue;
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
    lastMatch = {
      runId,
      outputDir,
      runDir: join(outputDir, runId),
      rawLine: trimmed,
    };
  }

  if (lastMatch === null) {
    throw new OperatorCliError(
      "Could not identify the capture run: no runId JSON found in capture output.",
    );
  }
  return lastMatch;
}

export function tryParseExactRunIdentityFromChunk(
  buffer: string,
): ExactCaptureRunIdentity | null {
  try {
    return parseExactRunIdentityFromOutput(buffer);
  } catch (error) {
    if (
      error instanceof OperatorCliError
      && error.message.includes("Malformed run identity JSON")
    ) {
      throw error;
    }
    return null;
  }
}
