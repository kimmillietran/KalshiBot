/** Formats milliseconds as MM:SS or HH:MM:SS when over one hour. */
export function formatDurationClock(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${paddedMinutes}:${paddedSeconds}`;
}

/** Returns whole-number completion percent, or 0 when total is zero. */
export function formatCompletionPercent(completed: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((completed / total) * 100));
}

/** Builds a text progress bar such as ██████░░░░. */
export function formatProgressBar(
  completed: number,
  total: number,
  width = 28,
): string {
  if (total <= 0) {
    return "░".repeat(width);
  }

  const ratio = Math.min(1, Math.max(0, completed / total));
  const filled = Math.round(ratio * width);

  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

/** Estimates remaining milliseconds from elapsed time and completed units. */
export function calculateEtaMs(
  elapsedMs: number,
  completed: number,
  total: number,
): number | null {
  if (completed <= 0 || total <= 0 || completed >= total) {
    return null;
  }

  const remainingUnits = total - completed;
  const averageMsPerUnit = elapsedMs / completed;

  return Math.round(averageMsPerUnit * remainingUnits);
}
