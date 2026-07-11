import {
  DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH,
  DEFAULT_FORWARD_QUOTE_CAPTURE_OUTPUT_DIR,
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
  fetchImpl?: typeof fetch;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (handle: number) => void;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (handle: number) => void;
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
  };
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_FORWARD_QUOTE_CAPTURE_HTML_PATH,
): string {
  return readFlagValue(argv, "--html-output") ?? defaultPath;
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
