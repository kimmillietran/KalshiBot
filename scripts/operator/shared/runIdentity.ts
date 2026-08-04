import { OperatorCliError } from "./argv";

/**
 * Maximum bytes retained for an incomplete trailing stdout fragment.
 * Only the incomplete fragment is bounded — not the capture log.
 */
export const CAPTURE_IDENTITY_MAX_FRAGMENT_BYTES = 64 * 1024;

/**
 * Startup `startedAt` may be slightly ahead of the operator clock due to
 * skew; beyond this tolerance the handshake fails closed.
 */
export const STARTED_AT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type CaptureIdentityKind = "startup" | "final";

export type ExactCaptureRunIdentity = {
  kind: CaptureIdentityKind;
  runId: string;
  outputDir: string;
  /** Always the derived join(outputDir, runId), never an unchecked supplied path. */
  runDir: string;
  rawLine: string;
  fromStartupEvent: boolean;
  /** Present for validated capture-started handshakes. */
  startedAt?: string;
  startedAtMs?: number;
};

export type CaptureIdentityProtocolPhase =
  | "awaiting-startup"
  | "startup-attached"
  | "protocol-failed"
  | "child-completed";

export type CaptureIdentityStreamDiagnostics = {
  bytesAccepted: number;
  completedLinesProcessed: number;
  identityCandidatesParsed: number;
  maxRetainedFragmentBytes: number;
  /** Full historical stdout is never retained by the parser. */
  retainedHistoryBytes: number;
  protocolFailures: number;
  duplicateStartupNoops: number;
  startupEventsAccepted: number;
  finalSummariesAccepted: number;
};

export type CaptureIdentityStreamState = {
  phase: CaptureIdentityProtocolPhase;
  startupIdentity: ExactCaptureRunIdentity | null;
  finalIdentity: ExactCaptureRunIdentity | null;
  protocolFailure: string | null;
  incompleteFragmentBytes: number;
  diagnostics: CaptureIdentityStreamDiagnostics;
};

export type CaptureIdentityStreamParser = {
  push: (chunk: string) => CaptureIdentityStreamState;
  finish: () => CaptureIdentityStreamState;
  getState: () => CaptureIdentityStreamState;
};

/**
 * Portable lexical path normalization for exact-run identity comparison.
 * Does not resolve against process.cwd() or search the filesystem.
 */
export function normalizeCaptureIdentityPath(path: string): string {
  if (path.includes("\0")) {
    throw new OperatorCliError(
      "Malformed run identity path: NUL character is not allowed.",
    );
  }
  const raw = path.replaceAll("\\", "/");
  const winDrive = /^([A-Za-z]:)(\/.*)?$/.exec(raw);
  const isPosixAbsolute = raw.startsWith("/");
  let prefix = "";
  let body = raw;

  if (winDrive) {
    prefix = `${winDrive[1]}/`;
    body = (winDrive[2] ?? "").replace(/^\//, "");
  } else if (isPosixAbsolute) {
    prefix = "/";
    body = raw.slice(1);
  }

  const stack: string[] = [];
  for (const part of body.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (stack.length > 0) {
        stack.pop();
      } else if (!prefix) {
        stack.push("..");
      }
      continue;
    }
    stack.push(part);
  }

  if (prefix === "/") {
    return `/${stack.join("/")}`;
  }
  if (prefix.endsWith("/")) {
    return `${prefix}${stack.join("/")}`;
  }
  return stack.join("/") || ".";
}

export function validateCaptureRunId(runId: string): void {
  if (typeof runId !== "string" || runId.trim() === "") {
    throw new OperatorCliError(
      "Malformed run identity JSON: runId must be a non-empty string.",
    );
  }
  if (runId.includes("\0")) {
    throw new OperatorCliError(
      "Malformed run identity JSON: runId must not contain NUL.",
    );
  }
  if (runId.includes("/") || runId.includes("\\")) {
    throw new OperatorCliError(
      "Malformed run identity JSON: runId must be a single path segment.",
    );
  }
  if (runId === "." || runId === "..") {
    throw new OperatorCliError(
      "Malformed run identity JSON: runId must not be '.' or '..'.",
    );
  }
}

export function deriveExpectedCaptureRunDir(
  outputDir: string,
  runId: string,
): string {
  const normalizedOutput = normalizeCaptureIdentityPath(outputDir);
  return normalizeCaptureIdentityPath(`${normalizedOutput}/${runId}`);
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

export function parseCaptureStartedAt(
  value: unknown,
  nowMs: number,
  futureToleranceMs: number = STARTED_AT_FUTURE_TOLERANCE_MS,
): { startedAt: string; startedAtMs: number } {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OperatorCliError(
      "Malformed capture-started JSON: startedAt must be a non-empty ISO timestamp.",
    );
  }
  const startedAtMs = Date.parse(value);
  if (!Number.isFinite(startedAtMs)) {
    throw new OperatorCliError(
      "Malformed capture-started JSON: startedAt must be a valid ISO timestamp.",
    );
  }
  if (startedAtMs - nowMs > futureToleranceMs) {
    throw new OperatorCliError(
      "Malformed capture-started JSON: startedAt is implausibly in the future.",
    );
  }
  return { startedAt: value, startedAtMs };
}

function looksLikeIdentityProtocolText(text: string): boolean {
  if (text.includes('"event"') && text.includes("capture-started")) {
    return true;
  }
  return (
    text.includes('"runId"')
    && text.includes('"outputDir"')
    && (text.includes('"verdict"') || text.includes('"captureEndReason"'))
  );
}

function isFinalSummaryRecord(record: Record<string, unknown>): boolean {
  if (record.event === "capture-started") {
    return false;
  }
  return (
    typeof record.runId === "string"
    && typeof record.outputDir === "string"
    && typeof record.verdict === "string"
    && typeof record.captureEndReason === "string"
  );
}

function isStartupRecord(record: Record<string, unknown>): boolean {
  return record.event === "capture-started";
}

function parseStartupIdentity(
  trimmed: string,
  record: Record<string, unknown>,
  nowMs: number,
): ExactCaptureRunIdentity {
  validateCaptureRunId(String(record.runId ?? ""));
  const runId = record.runId as string;
  const outputDir = record.outputDir;
  if (typeof outputDir !== "string" || outputDir.trim() === "") {
    throw new OperatorCliError(
      "Malformed capture-started JSON: outputDir must be a non-empty string.",
    );
  }
  const explicitRunDir = record.runDir;
  if (typeof explicitRunDir !== "string" || explicitRunDir.trim() === "") {
    throw new OperatorCliError(
      "Malformed capture-started JSON: runDir must be a non-empty string.",
    );
  }

  const expectedRunDir = deriveExpectedCaptureRunDir(outputDir, runId);
  const normalizedExplicit = normalizeCaptureIdentityPath(explicitRunDir);
  if (normalizedExplicit !== expectedRunDir) {
    throw new OperatorCliError(
      "Malformed capture-started JSON: explicit runDir must equal join(outputDir, runId). "
        + `expected=${expectedRunDir}; received=${normalizedExplicit}.`,
    );
  }

  const started = parseCaptureStartedAt(record.startedAt, nowMs);
  return {
    kind: "startup",
    runId,
    outputDir: normalizeCaptureIdentityPath(outputDir),
    runDir: expectedRunDir,
    rawLine: trimmed,
    fromStartupEvent: true,
    startedAt: started.startedAt,
    startedAtMs: started.startedAtMs,
  };
}

function parseFinalIdentity(
  trimmed: string,
  record: Record<string, unknown>,
): ExactCaptureRunIdentity {
  validateCaptureRunId(String(record.runId ?? ""));
  const runId = record.runId as string;
  const outputDir = record.outputDir;
  if (typeof outputDir !== "string" || outputDir.trim() === "") {
    throw new OperatorCliError(
      "Malformed final capture summary: outputDir must be a non-empty string.",
    );
  }
  const runDir = deriveExpectedCaptureRunDir(outputDir, runId);
  return {
    kind: "final",
    runId,
    outputDir: normalizeCaptureIdentityPath(outputDir),
    runDir,
    rawLine: trimmed,
    fromStartupEvent: false,
  };
}

/**
 * Classify one complete stdout line. Returns null for unrelated telemetry.
 * Throws OperatorCliError for identity-protocol failures.
 */
export function classifyCaptureIdentityLine(
  line: string,
  nowMs: number = Date.now(),
): ExactCaptureRunIdentity | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const protocolShaped = looksLikeIdentityProtocolText(trimmed);
  if (!protocolShaped && !trimmed.includes('"runId"')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    if (protocolShaped) {
      throw new OperatorCliError(
        `Malformed run identity JSON in capture output: ${trimmed.slice(0, 200)}`,
      );
    }
    return null;
  }

  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
  ) {
    if (protocolShaped) {
      throw new OperatorCliError(
        "Malformed run identity JSON: expected a JSON object.",
      );
    }
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (isStartupRecord(record)) {
    return parseStartupIdentity(trimmed, record, nowMs);
  }
  if (isFinalSummaryRecord(record)) {
    return parseFinalIdentity(trimmed, record);
  }
  // Generic runId/outputDir telemetry (and other JSON) is ignored.
  return null;
}

function createEmptyDiagnostics(): CaptureIdentityStreamDiagnostics {
  return {
    bytesAccepted: 0,
    completedLinesProcessed: 0,
    identityCandidatesParsed: 0,
    maxRetainedFragmentBytes: 0,
    retainedHistoryBytes: 0,
    protocolFailures: 0,
    duplicateStartupNoops: 0,
    startupEventsAccepted: 0,
    finalSummariesAccepted: 0,
  };
}

/**
 * Stateful incremental exact-run identity parser.
 * Processes each completed line once; retains only the incomplete trailing fragment.
 */
export function createCaptureIdentityStreamParser(options?: {
  maxFragmentBytes?: number;
  nowMs?: () => number;
}): CaptureIdentityStreamParser {
  const maxFragmentBytes =
    options?.maxFragmentBytes ?? CAPTURE_IDENTITY_MAX_FRAGMENT_BYTES;
  const nowMs = options?.nowMs ?? (() => Date.now());

  let phase: CaptureIdentityProtocolPhase = "awaiting-startup";
  let startupIdentity: ExactCaptureRunIdentity | null = null;
  let finalIdentity: ExactCaptureRunIdentity | null = null;
  let protocolFailure: string | null = null;
  let fragment = "";
  let finished = false;
  const diagnostics = createEmptyDiagnostics();

  const snapshot = (): CaptureIdentityStreamState => ({
    phase,
    startupIdentity,
    finalIdentity,
    protocolFailure,
    incompleteFragmentBytes: fragment.length,
    diagnostics: { ...diagnostics, retainedHistoryBytes: 0 },
  });

  const fail = (message: string): void => {
    if (protocolFailure !== null) {
      return;
    }
    protocolFailure = message;
    diagnostics.protocolFailures += 1;
    phase = "protocol-failed";
  };

  const processLine = (line: string): void => {
    diagnostics.completedLinesProcessed += 1;
    if (protocolFailure !== null) {
      return;
    }
    let identity: ExactCaptureRunIdentity | null;
    try {
      identity = classifyCaptureIdentityLine(line, nowMs());
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      return;
    }
    if (identity === null) {
      return;
    }
    diagnostics.identityCandidatesParsed += 1;

    if (identity.kind === "startup") {
      if (startupIdentity === null) {
        startupIdentity = identity;
        diagnostics.startupEventsAccepted += 1;
        if (phase === "awaiting-startup") {
          phase = "startup-attached";
        }
        return;
      }
      if (exactCaptureIdentitiesMatch(startupIdentity, identity)) {
        diagnostics.duplicateStartupNoops += 1;
        return;
      }
      fail(
        "Conflicting duplicate capture-started identity: "
          + `first runId=${startupIdentity.runId} runDir=${startupIdentity.runDir}; `
          + `second runId=${identity.runId} runDir=${identity.runDir}. `
          + "Failing closed; not switching the progress monitor to a second identity.",
      );
      return;
    }

    // Final summary
    if (startupIdentity !== null) {
      if (!exactCaptureIdentitiesMatch(startupIdentity, identity)) {
        fail(
          "Startup/final capture identity mismatch: "
            + `startup runId=${startupIdentity.runId} runDir=${startupIdentity.runDir}; `
            + `final runId=${identity.runId} runDir=${identity.runDir}. `
            + "Failing closed; not switching the progress monitor to a second identity.",
        );
        return;
      }
    }
    finalIdentity = identity;
    diagnostics.finalSummariesAccepted += 1;
  };

  const extractCompleteLines = (chunk: string): string[] => {
    fragment += chunk;
    diagnostics.maxRetainedFragmentBytes = Math.max(
      diagnostics.maxRetainedFragmentBytes,
      fragment.length,
    );

    if (
      fragment.length > maxFragmentBytes
      && looksLikeIdentityProtocolText(fragment)
    ) {
      fail(
        `Identity protocol line exceeded max fragment size `
          + `(${maxFragmentBytes} bytes) without a newline.`,
      );
      fragment = "";
      return [];
    }

    if (fragment.length > maxFragmentBytes && !looksLikeIdentityProtocolText(fragment)) {
      // Unrelated oversized noise: drop the retained fragment rather than
      // treating it as an identity protocol failure.
      fragment = fragment.slice(-Math.floor(maxFragmentBytes / 4));
      diagnostics.maxRetainedFragmentBytes = Math.max(
        diagnostics.maxRetainedFragmentBytes,
        fragment.length,
      );
    }

    const lines: string[] = [];
    while (true) {
      const lf = fragment.indexOf("\n");
      if (lf < 0) {
        break;
      }
      let line = fragment.slice(0, lf);
      fragment = fragment.slice(lf + 1);
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }
      lines.push(line);
    }
    return lines;
  };

  return {
    push(chunk: string): CaptureIdentityStreamState {
      if (finished) {
        return snapshot();
      }
      diagnostics.bytesAccepted += chunk.length;
      for (const line of extractCompleteLines(chunk)) {
        processLine(line);
      }
      return snapshot();
    },
    finish(): CaptureIdentityStreamState {
      if (finished) {
        return snapshot();
      }
      finished = true;
      if (fragment.length > 0) {
        const trailing = fragment;
        fragment = "";
        if (looksLikeIdentityProtocolText(trailing)) {
          processLine(trailing);
        }
      }
      if (phase !== "protocol-failed") {
        phase = "child-completed";
      }
      return snapshot();
    },
    getState: snapshot,
  };
}

/**
 * Extract the exact capture run identity from capture CLI stdout.
 * Never falls back to newest-directory or mtime selection.
 */
export function parseExactRunIdentityFromOutput(
  stdout: string,
): ExactCaptureRunIdentity {
  const parser = createCaptureIdentityStreamParser();
  parser.push(stdout);
  const state = parser.finish();
  if (state.protocolFailure) {
    throw new OperatorCliError(state.protocolFailure);
  }
  if (state.startupIdentity) {
    return state.startupIdentity;
  }
  if (state.finalIdentity) {
    return state.finalIdentity;
  }
  throw new OperatorCliError(
    "Could not identify the capture run: no runId JSON found in capture output.",
  );
}

/**
 * @deprecated Prefer createCaptureIdentityStreamParser for streaming paths.
 * Kept for focused unit tests that exercise single-buffer assembly.
 */
export function tryParseExactRunIdentityFromChunk(
  buffer: string,
): ExactCaptureRunIdentity | null {
  try {
    const parser = createCaptureIdentityStreamParser();
    parser.push(buffer);
    const state = parser.getState();
    if (state.protocolFailure) {
      throw new OperatorCliError(state.protocolFailure);
    }
    return state.startupIdentity ?? state.finalIdentity;
  } catch (error) {
    if (
      error instanceof OperatorCliError
      && (
        error.message.includes("Malformed")
        || error.message.includes("mismatch")
        || error.message.includes("Conflicting")
        || error.message.includes("exceeded max fragment")
      )
    ) {
      throw error;
    }
    return null;
  }
}

/** @deprecated Prefer createCaptureIdentityStreamParser / finish(). */
export function listCompleteStdoutLines(stdout: string): string[] {
  if (stdout.length === 0) {
    return [];
  }
  const parts = stdout.split(/\r?\n/);
  const hasTrailingIncomplete = !/(?:\r?\n)$/.test(stdout);
  const complete = hasTrailingIncomplete ? parts.slice(0, -1) : parts;
  return complete.filter((line) => line.length > 0);
}
