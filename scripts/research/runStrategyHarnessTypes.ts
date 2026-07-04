import {
  DEFAULT_BATCH_RESEARCH_REGISTRY_DIR,
} from "@/lib/data/research/batchResearch/batchResearchTypes";
import {
  DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR,
  DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH,
} from "@/lib/data/research/strategyHarness/strategyHarnessTypes";

export class StrategyHarnessCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyHarnessCommandError";
  }
}

export type StrategyHarnessCommandIo = {
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
        throw new StrategyHarnessCommandError(`Missing value for ${flag} <path>`);
      }

      return next;
    }
  }

  return undefined;
}

function readBooleanFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

export function parseSynthesisPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH,
): string {
  return readFlagValue(argv, "--input") ?? readFlagValue(argv, "--synthesis") ?? defaultPath;
}

export function parseRegistryDirFromArgv(
  argv: readonly string[],
  defaultDir = DEFAULT_BATCH_RESEARCH_REGISTRY_DIR,
): string {
  return readFlagValue(argv, "--registry-dir") ?? defaultDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultDir = DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR,
): string {
  return readFlagValue(argv, "--output-dir") ?? defaultDir;
}

export function parseStrategyFamilyFromArgv(argv: readonly string[]): string | undefined {
  return readFlagValue(argv, "--family");
}

export function parseSynthesizedStrategyIdFromArgv(argv: readonly string[]): string | undefined {
  return readFlagValue(argv, "--strategy-id");
}

export function parseIncludeRejectedFromArgv(argv: readonly string[]): boolean {
  return readBooleanFlag(argv, "--include-rejected");
}

export function parseConcurrencyFromArgv(argv: readonly string[]): number {
  const raw = readFlagValue(argv, "--concurrency");
  if (!raw) {
    return 1;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new StrategyHarnessCommandError(`Invalid concurrency: ${raw}`);
  }

  return parsed;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
