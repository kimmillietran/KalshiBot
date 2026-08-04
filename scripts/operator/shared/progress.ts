import { createReadStream, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

export type CaptureProgressSnapshot = {
  localTime: string;
  runId: string;
  elapsedMinutes: number;
  remainingMinutes: number;
  percent: number;
  topOfBookLineCount: number;
  btcSpotLineCount: number;
  rawJsonlSizeMb: number;
  rawFileAgeSeconds: number | null;
  topOfBookFileAgeSeconds: number | null;
  btcFileAgeSeconds: number | null;
};

export type LineCounterState = {
  path: string;
  offset: number;
  count: number;
};

/**
 * Efficient incremental JSONL line counting via retained byte offset.
 * Never loads multi-gigabyte files into memory.
 */
export async function countNewLines(
  state: LineCounterState,
): Promise<LineCounterState> {
  if (!existsSync(state.path)) {
    return state;
  }

  let size = 0;
  try {
    size = statSync(state.path).size;
  } catch {
    return state;
  }

  if (size < state.offset) {
    // File was truncated/rotated; recount from the start.
    state = { ...state, offset: 0, count: 0 };
  }
  if (size === state.offset) {
    return state;
  }

  let added = 0;
  const stream = createReadStream(state.path, {
    encoding: "utf8",
    start: state.offset,
  });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line !== undefined) {
      added += 1;
    }
  }

  return {
    path: state.path,
    offset: size,
    count: state.count + added,
  };
}

export function fileAgeSeconds(path: string, nowMs: number = Date.now()): number | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const mtimeMs = statSync(path).mtimeMs;
    return Math.round((nowMs - mtimeMs) / 1000);
  } catch {
    return null;
  }
}

export function fileSizeMb(path: string): number {
  if (!existsSync(path)) {
    return 0;
  }
  try {
    return Math.round((statSync(path).size / (1024 * 1024)) * 10) / 10;
  } catch {
    return 0;
  }
}

export function formatProgressLine(snapshot: CaptureProgressSnapshot): string {
  const ages = [
    `raw ${snapshot.rawFileAgeSeconds ?? "n/a"}s`,
    `TOB ${snapshot.topOfBookFileAgeSeconds ?? "n/a"}s`,
    `BTC ${snapshot.btcFileAgeSeconds ?? "n/a"}s`,
  ].join(", ");

  return (
    `[${snapshot.localTime}] ${snapshot.percent}% | run ${snapshot.runId} | `
    + `elapsed ${snapshot.elapsedMinutes}m | remaining ${snapshot.remainingMinutes}m | `
    + `topOfBook ${snapshot.topOfBookLineCount} | btc ${snapshot.btcSpotLineCount} | `
    + `raw ${snapshot.rawJsonlSizeMb}MB | file ages: ${ages}`
  );
}

export type ProgressMonitorHandle = {
  stop: () => void;
};

export function startCaptureProgressMonitor(options: {
  runId: string;
  runDir: string;
  durationMinutes: number;
  startedAtMs: number;
  intervalMs: number;
  writeLine: (line: string) => void;
  now?: () => number;
}): ProgressMonitorHandle {
  const topOfBookPath = join(options.runDir, "top-of-book.jsonl");
  const btcPath = join(options.runDir, "btc-spot.jsonl");
  const rawPath = join(options.runDir, "raw-kalshi-ws.jsonl");

  let topState: LineCounterState = { path: topOfBookPath, offset: 0, count: 0 };
  let btcState: LineCounterState = { path: btcPath, offset: 0, count: 0 };
  let stopped = false;
  let inFlight = false;

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = true;
    try {
      const nowMs = options.now?.() ?? Date.now();
      const elapsedMinutes =
        Math.round(((nowMs - options.startedAtMs) / 60_000) * 10) / 10;
      const remainingMinutes = Math.max(
        0,
        Math.round((options.durationMinutes - elapsedMinutes) * 10) / 10,
      );
      const percent = Math.min(
        100,
        Math.round((elapsedMinutes / options.durationMinutes) * 1000) / 10,
      );

      topState = await countNewLines(topState);
      btcState = await countNewLines(btcState);

      if (stopped) {
        return;
      }

      const snapshot: CaptureProgressSnapshot = {
        localTime: new Date(nowMs).toLocaleTimeString("en-US", { hour12: false }),
        runId: options.runId,
        elapsedMinutes,
        remainingMinutes,
        percent,
        topOfBookLineCount: topState.count,
        btcSpotLineCount: btcState.count,
        rawJsonlSizeMb: fileSizeMb(rawPath),
        rawFileAgeSeconds: fileAgeSeconds(rawPath, nowMs),
        topOfBookFileAgeSeconds: fileAgeSeconds(topOfBookPath, nowMs),
        btcFileAgeSeconds: fileAgeSeconds(btcPath, nowMs),
      };
      options.writeLine(formatProgressLine(snapshot));
    } catch {
      // Progress failures must not terminate capture.
    } finally {
      inFlight = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, options.intervalMs);
  // Unref so the timer alone cannot keep the process alive after capture exits.
  if (typeof timer.unref === "function") {
    timer.unref();
  }

  void tick();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
