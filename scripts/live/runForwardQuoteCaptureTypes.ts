import {
  DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH,
  DEFAULT_FORWARD_QUOTE_CAPTURE_OUTPUT_DIR,
  FORWARD_CAPTURE_PRICE_REPRESENTATION,
  type ForwardQuoteCaptureConfig,
} from "@/lib/data/live/forwardQuoteCapture";
import { DEFAULT_KALSHI_WS_WATCHDOG_CONFIG } from "@/lib/data/live/forwardQuoteCapture/kalshiWsLivenessWatchdog";

export class ForwardQuoteCaptureCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForwardQuoteCaptureCommandError";
  }
}

export type ForwardQuoteCaptureCommandIo = {
  readFile?: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  appendFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  createAppendStream?: (
    path: string,
  ) => import("@/lib/data/live/forwardQuoteCapture/jsonlForwardCaptureWriter").ForwardCaptureAppendStream;
  renameFile?: (from: string, to: string) => void;
  /** Atomic exclusive file creation (O_EXCL) for the global capture lock. */
  createExclusiveFile?: (path: string, data: string) => void;
  deleteFile?: (path: string) => void;
  fetchImpl?: typeof fetch;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (handle: number) => void;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (handle: number) => void;
  /**
   * Test seam for native CLI progress. Production main injects
   * startCaptureProgressMonitor. Presentation-only; not capture config.
   */
  startProgressMonitor?: (
    options: ForwardQuoteCaptureProgressMonitorOptions,
  ) => ForwardQuoteCaptureProgressMonitorHandle;
};

/** Default native progress cadence for short/medium direct captures. */
export const DEFAULT_DIRECT_CAPTURE_PROGRESS_INTERVAL_MS = 10_000;

/** Minimum accepted --progress-interval-ms. 0 is not a disable mechanism. */
export const MIN_DIRECT_CAPTURE_PROGRESS_INTERVAL_MS = 1_000;

/**
 * CLI-only presentation options. Never part of ForwardQuoteCaptureConfig,
 * hypothesis config, eligibility, or readiness.
 */
export type ForwardQuoteCaptureProgressOptions = {
  enabled: boolean;
  intervalMs: number;
};

export type ForwardQuoteCaptureProgressMonitorOptions = {
  runId: string;
  runDir: string;
  startedAt: string;
  durationMinutes: number;
  intervalMs: number;
  includeBtcSpot: boolean;
  includeBtcCandles1m: boolean;
  writeLine: (line: string) => void;
};

export type ForwardQuoteCaptureProgressMonitorHandle = {
  stop: () => void;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ForwardQuoteCaptureCommandError(`Missing value for ${flag} <value>`);
      }

      return next;
    }
  }

  return undefined;
}

function readNumberFlag(argv: readonly string[], flag: string, defaultValue: number): number {
  const value = readFlagValue(argv, flag);
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ForwardQuoteCaptureCommandError(`${flag} must be a non-negative finite number`);
  }

  return parsed;
}

export function parseForwardQuoteCaptureConfigFromArgv(
  argv: readonly string[],
): ForwardQuoteCaptureConfig {
  return {
    series: readFlagValue(argv, "--series") ?? "KXBTC15M",
    durationMinutes: readNumberFlag(argv, "--duration-minutes", 60),
    maxMarkets: readNumberFlag(argv, "--max-markets", 3),
    outputDir: readFlagValue(argv, "--output-dir") ?? DEFAULT_FORWARD_QUOTE_CAPTURE_OUTPUT_DIR,
    dryRun: argv.includes("--dry-run"),
    marketTicker: readFlagValue(argv, "--market-ticker"),
    privateKeyPath: readFlagValue(argv, "--private-key-path"),
    captureBtcSpot: argv.includes("--capture-btc-spot"),
    captureBtcCandles1m: argv.includes("--capture-btc-candles-1m"),
    btcCandles1mPollIntervalMs: readNumberFlag(
      argv,
      "--btc-candles-1m-poll-interval-ms",
      15_000,
    ),
    btcCandles1mRequestTimeoutMs: readNumberFlag(
      argv,
      "--btc-candles-1m-request-timeout-ms",
      10_000,
    ),
    btcCandles1mBackfillCompletedMinutes: readNumberFlag(
      argv,
      "--btc-candles-1m-backfill-completed-minutes",
      15,
    ),
    rolloverCheckSeconds: readNumberFlag(argv, "--rollover-check-seconds", 30),
    healthFlushSeconds: readNumberFlag(argv, "--health-flush-seconds", 60),
    topOfBookThrottleMs: readNumberFlag(argv, "--top-of-book-throttle-ms", 0),
    wsWatchdogEnabled: !argv.includes("--disable-ws-watchdog"),
    wsSoftSilenceThresholdMs: readNumberFlag(
      argv,
      "--ws-stall-timeout-ms",
      DEFAULT_KALSHI_WS_WATCHDOG_CONFIG.wsSoftSilenceThresholdMs,
    ),
    wsHardStallThresholdMs: readNumberFlag(
      argv,
      "--ws-hard-stall-timeout-ms",
      DEFAULT_KALSHI_WS_WATCHDOG_CONFIG.wsHardStallThresholdMs,
    ),
    wsProbeGraceMs: readNumberFlag(
      argv,
      "--ws-probe-grace-ms",
      DEFAULT_KALSHI_WS_WATCHDOG_CONFIG.wsProbeGraceMs,
    ),
    wsRecoveryMaxAttempts: readNumberFlag(
      argv,
      "--ws-recovery-max-attempts",
      DEFAULT_KALSHI_WS_WATCHDOG_CONFIG.wsRecoveryMaxAttempts,
    ),
    priceRepresentation: FORWARD_CAPTURE_PRICE_REPRESENTATION,
  };
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH,
): string {
  return readFlagValue(argv, "--html-output") ?? defaultPath;
}

/**
 * Parse native direct-CLI progress presentation flags.
 *
 * --no-progress disables human progress (stdout protocol is unchanged).
 * --progress-interval-ms defaults to 10_000 and must be finite and >= 1000.
 * Do not use 0 to disable; that is what --no-progress is for.
 */
export function parseForwardQuoteCaptureProgressOptionsFromArgv(
  argv: readonly string[],
): ForwardQuoteCaptureProgressOptions {
  const enabled = !argv.includes("--no-progress");
  const raw = readProgressIntervalRaw(argv);
  if (raw === undefined) {
    return { enabled, intervalMs: DEFAULT_DIRECT_CAPTURE_PROGRESS_INTERVAL_MS };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_DIRECT_CAPTURE_PROGRESS_INTERVAL_MS) {
    throw new ForwardQuoteCaptureCommandError(
      `--progress-interval-ms must be a finite number >= ${MIN_DIRECT_CAPTURE_PROGRESS_INTERVAL_MS} `
        + `(got ${raw})`,
    );
  }

  return { enabled, intervalMs: parsed };
}

function readProgressIntervalRaw(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--progress-interval-ms") {
      continue;
    }
    const next = argv[index + 1];
    // Allow numeric negatives such as -1 so they fail the >= 1000 check
    // instead of being misread as a missing value / next flag.
    if (next === undefined || next === "" || next.startsWith("--")) {
      throw new ForwardQuoteCaptureCommandError(
        "Missing value for --progress-interval-ms <n>",
      );
    }
    return next;
  }
  return undefined;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof ForwardQuoteCaptureCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Forward quote capture failed";
}
