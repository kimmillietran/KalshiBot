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

export function parseCaptureRunStatus(text: string): CaptureRunStatusArtifact | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object"
    || parsed === null
    || !("state" in parsed)
    || typeof (parsed as { state: unknown }).state !== "string"
    || !(CAPTURE_RUN_LIFECYCLE_STATES as readonly string[]).includes(
      (parsed as { state: string }).state,
    )
    || !("runId" in parsed)
    || typeof (parsed as { runId: unknown }).runId !== "string"
  ) {
    return null;
  }
  return parsed as CaptureRunStatusArtifact;
}
