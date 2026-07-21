import type {
  CaptureEndReason,
  ForwardQuoteCaptureIo,
} from "./forwardQuoteCaptureTypes";

export const CAPTURE_RUN_STATUS_FILENAME = "capture-run-status.json";

export const CAPTURE_RUN_LIFECYCLE_STATES = [
  "active",
  "finalizing",
  "completed",
  "failed",
  "user-cancelled",
] as const;

export type CaptureRunLifecycleState = (typeof CAPTURE_RUN_LIFECYCLE_STATES)[number];

export const TERMINAL_CAPTURE_RUN_STATES: readonly CaptureRunLifecycleState[] = [
  "completed",
  "failed",
  "user-cancelled",
];

export type CaptureRunStatusArtifact = {
  schemaVersion: 1;
  runId: string;
  state: CaptureRunLifecycleState;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  captureEndReason: CaptureEndReason | null;
  failureReason: string | null;
};

export function isTerminalCaptureRunState(
  state: CaptureRunLifecycleState,
): boolean {
  return TERMINAL_CAPTURE_RUN_STATES.includes(state);
}

/** Maps a finished capture's end reason (and errors) to a terminal run state. */
export function resolveTerminalCaptureRunState(input: {
  captureEndReason: CaptureEndReason | null;
  hadFatalError: boolean;
}): Extract<CaptureRunLifecycleState, "completed" | "failed" | "user-cancelled"> {
  if (input.captureEndReason === "user-cancelled") {
    return "user-cancelled";
  }
  if (
    input.hadFatalError
    || input.captureEndReason === "terminal-websocket-failure"
    || input.captureEndReason === "authentication-failure"
    || input.captureEndReason === "writer-failure"
    || input.captureEndReason === "unexpected-error"
  ) {
    return "failed";
  }
  return "completed";
}

/**
 * Writes a file atomically via temp-file-plus-rename when the io provides
 * renameFile; falls back to a direct write otherwise (in-memory test io).
 * The temp file lives in the same directory so the rename is atomic on
 * POSIX and NTFS.
 */
export function writeCaptureArtifactAtomically(
  io: Pick<ForwardQuoteCaptureIo, "writeFile" | "renameFile">,
  path: string,
  data: string,
  pid: number = typeof process !== "undefined" ? process.pid : 0,
): void {
  if (!io.renameFile) {
    io.writeFile(path, data);
    return;
  }
  const tempPath = `${path}.${pid}.tmp`;
  io.writeFile(tempPath, data);
  io.renameFile(tempPath, path);
}

export function serializeCaptureRunStatus(artifact: CaptureRunStatusArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function publishCaptureRunStatus(
  io: Pick<ForwardQuoteCaptureIo, "writeFile" | "renameFile">,
  statusPath: string,
  artifact: CaptureRunStatusArtifact,
): void {
  writeCaptureArtifactAtomically(io, statusPath, serializeCaptureRunStatus(artifact));
}

const CAPTURE_END_REASONS = [
  "duration-complete",
  "user-cancelled",
  "terminal-websocket-failure",
  "authentication-failure",
  "writer-failure",
  "unexpected-error",
] as const;

function isValidTimestamp(value: unknown): value is string {
  return (
    typeof value === "string"
    && value.length > 0
    && Number.isFinite(Date.parse(value))
  );
}

/**
 * Strict fail-closed parser for capture-run-status.json. Rather than casting
 * whatever JSON is present, every field is validated, and cross-field
 * coherence is enforced: terminal states must carry a valid endedAt, while
 * active/finalizing states must not. Anything else returns null so callers
 * treat the file as present-but-invalid (never as an absent legacy marker).
 */
export function parseCaptureRunStatus(text: string): CaptureRunStatusArtifact | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;

  if (record.schemaVersion !== 1) {
    return null;
  }
  if (typeof record.runId !== "string" || record.runId.length === 0) {
    return null;
  }
  if (
    typeof record.state !== "string"
    || !(CAPTURE_RUN_LIFECYCLE_STATES as readonly string[]).includes(record.state)
  ) {
    return null;
  }
  const state = record.state as CaptureRunLifecycleState;
  if (!isValidTimestamp(record.startedAt) || !isValidTimestamp(record.updatedAt)) {
    return null;
  }
  if (record.endedAt !== null && !isValidTimestamp(record.endedAt)) {
    return null;
  }
  if (
    record.captureEndReason !== null
    && !(CAPTURE_END_REASONS as readonly string[]).includes(
      record.captureEndReason as string,
    )
  ) {
    return null;
  }
  if (record.failureReason !== null && typeof record.failureReason !== "string") {
    return null;
  }

  const terminal = isTerminalCaptureRunState(state);
  if (terminal && record.endedAt === null) {
    return null;
  }
  if (!terminal && record.endedAt !== null) {
    return null;
  }

  return {
    schemaVersion: 1,
    runId: record.runId,
    state,
    startedAt: record.startedAt as string,
    updatedAt: record.updatedAt as string,
    endedAt: record.endedAt as string | null,
    captureEndReason: record.captureEndReason as CaptureEndReason | null,
    failureReason: record.failureReason as string | null,
  };
}
