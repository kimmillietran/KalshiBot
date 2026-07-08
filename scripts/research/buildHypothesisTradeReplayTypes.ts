import {
  DEFAULT_COST_AWARE_ATLAS_INPUT_PATH,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_HTML_PATH,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_MAX_SPREAD_CENTS,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_MIN_NET_EDGE_CENTS,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_OUTPUT_PATH,
  DEFAULT_HYPOTHESIS_TRADE_REPLAY_SLIPPAGE_BUFFER_CENTS,
} from "@/lib/data/research/hypothesisTradeReplay/hypothesisTradeReplayTypes";
import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_CALIBRATION_INPUT_DIR } from "@/lib/data/research/calibration/calibrationTypes";
import type { HypothesisTradeReplayConfig } from "@/lib/data/research/hypothesisTradeReplay/hypothesisTradeReplayTypes";

export class HypothesisTradeReplayCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisTradeReplayCommandError";
  }
}

export type HypothesisTradeReplayCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisTradeReplayCommandError(`Missing value for ${flag} <value>`);
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
  if (!Number.isFinite(parsed)) {
    throw new HypothesisTradeReplayCommandError(`${flag} must be a finite number`);
  }

  return parsed;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_TRADE_REPLAY_OUTPUT_PATH,
): string {
  return readFlagValue(argv, "--output") ?? defaultPath;
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_TRADE_REPLAY_HTML_PATH,
): string {
  return readFlagValue(argv, "--html-output") ?? defaultPath;
}

export function parseInputPathsFromArgv(argv: readonly string[]) {
  return {
    hypothesisCandidatesPath:
      readFlagValue(argv, "--input")
      ?? readFlagValue(argv, "--hypothesis-candidates")
      ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    mispricingAtlasPath:
      readFlagValue(argv, "--atlas")
      ?? readFlagValue(argv, "--mispricing-atlas")
      ?? DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    costAwareAtlasPath:
      readFlagValue(argv, "--cost-aware-atlas")
      ?? DEFAULT_COST_AWARE_ATLAS_INPUT_PATH,
    researchResultsDir:
      readFlagValue(argv, "--research-results-dir")
      ?? DEFAULT_CALIBRATION_INPUT_DIR,
    regimeTagsPath:
      readFlagValue(argv, "--regime-tags")
      ?? DEFAULT_REGIME_TAGS_INPUT_PATH,
  };
}

export function parseReplayConfigFromArgv(argv: readonly string[]): HypothesisTradeReplayConfig {
  const executionMode = readFlagValue(argv, "--execution-mode") ?? "cross-spread";
  if (executionMode !== "cross-spread") {
    throw new HypothesisTradeReplayCommandError(
      `Unsupported execution mode: ${executionMode}. Only cross-spread is supported in M11.6.`,
    );
  }

  return {
    executionMode: "cross-spread",
    maxSpreadCents: readNumberFlag(
      argv,
      "--max-spread-cents",
      DEFAULT_HYPOTHESIS_TRADE_REPLAY_MAX_SPREAD_CENTS,
    ),
    minNetEdgeCents: readNumberFlag(
      argv,
      "--min-net-edge-cents",
      DEFAULT_HYPOTHESIS_TRADE_REPLAY_MIN_NET_EDGE_CENTS,
    ),
    slippageBufferCents: readNumberFlag(
      argv,
      "--slippage-buffer-cents",
      DEFAULT_HYPOTHESIS_TRADE_REPLAY_SLIPPAGE_BUFFER_CENTS,
    ),
    officialOnly: argv.includes("--official-only"),
    feeModel: {
      kind: "kalshi-fee-schedule",
      role: "taker",
      schedule: "standard",
    },
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
