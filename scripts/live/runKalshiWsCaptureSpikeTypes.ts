import {
  DEFAULT_KALSHI_WS_CAPTURE_SPIKE_HTML_PATH,
  DEFAULT_KALSHI_WS_CAPTURE_SPIKE_OUTPUT_DIR,
} from "@/lib/data/live/kalshiWsCaptureSpike/kalshiWsCaptureSpikeTypes";
import type { KalshiWsCaptureSpikeConfig } from "@/lib/data/live/kalshiWsCaptureSpike/kalshiWsCaptureSpikeTypes";

export class KalshiWsCaptureSpikeCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KalshiWsCaptureSpikeCommandError";
  }
}

export type KalshiWsCaptureSpikeCommandIo = {
  readFile?: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  appendFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fetchImpl?: typeof fetch;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new KalshiWsCaptureSpikeCommandError(`Missing value for ${flag} <value>`);
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
    throw new KalshiWsCaptureSpikeCommandError(`${flag} must be a non-negative finite number`);
  }

  return parsed;
}

export function parseCaptureSpikeConfigFromArgv(
  argv: readonly string[],
): KalshiWsCaptureSpikeConfig {
  return {
    series: readFlagValue(argv, "--series") ?? "KXBTC15M",
    durationSeconds: readNumberFlag(argv, "--duration-seconds", 300),
    maxMarkets: readNumberFlag(argv, "--max-markets", 1),
    outputDir: readFlagValue(argv, "--output-dir") ?? DEFAULT_KALSHI_WS_CAPTURE_SPIKE_OUTPUT_DIR,
    dryRun: argv.includes("--dry-run"),
    marketTicker: readFlagValue(argv, "--market-ticker"),
    privateKeyPath: readFlagValue(argv, "--private-key-path"),
    captureBtcSpot: argv.includes("--capture-btc-spot"),
    restSnapshotIntervalSeconds: readFlagValue(argv, "--rest-snapshot-interval-seconds")
      ? readNumberFlag(argv, "--rest-snapshot-interval-seconds", 0)
      : null,
    mockInput: argv.includes("--mock-input") || argv.includes("--dry-run"),
  };
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_KALSHI_WS_CAPTURE_SPIKE_HTML_PATH,
): string {
  return readFlagValue(argv, "--html-output") ?? defaultPath;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
