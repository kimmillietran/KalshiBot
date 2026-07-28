/** Default capture root used by operator CLIs and smoke wrappers. */
export const DEFAULT_CAPTURE_ROOT = "data/live-capture/forward-quotes";

/** Operator log directory for tee'd capture stdout/stderr. */
export const DEFAULT_LOG_ROOT = "data/live-capture/logs";

/** Six-hour operator duration (non-canonical vs production 480). */
export const SIX_HOUR_DURATION_MINUTES = 360;

/** Production eight-hour duration. */
export const EIGHT_HOUR_DURATION_MINUTES = 480;

/** Reconnect smoke duration window (PR #41). */
export const RECONNECT_SMOKE_DURATION_MIN = 15;
export const RECONNECT_SMOKE_DURATION_MAX = 20;

/** Progress cadence for long captures. */
export const PROGRESS_INTERVAL_MS = 60_000;

export const FORBIDDEN_SKIP_GATE_FLAGS = [
  "--force",
  "--skip-gate",
  "--skip-restart-gate",
  "--skip-preflight",
  "--bypass-gate",
] as const;
