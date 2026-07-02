import {
  DEFAULT_WALK_FORWARD_SWEEP_OUTPUT_DIR,
  DEFAULT_WALK_FORWARD_SPLIT_INPUT_DIR,
} from "@/lib/data/research/walkForwardSweep";

export class WalkForwardSweepCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalkForwardSweepCommandError";
  }
}

export type WalkForwardSweepCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export type WalkForwardSweepCommandDeps = {
  filesystem: import("@/lib/data/research/walkForwardSweep").WalkForwardSweepFilesystem;
  strategyRegistry: import("@/lib/data/strategies/plugin/StrategyPluginRegistry").StrategyPluginRegistry;
  parseFixtureJson: (
    json: string,
    marketTicker?: string,
  ) => import("@/lib/data/fixtures").HistoricalResearchCliInputDocument;
  runResearch: import("@/lib/data/research/walkForwardSweep").WalkForwardSweepRunnerDeps["runResearch"];
  now?: () => Date;
};

export type RunWalkForwardSweepCommandOptions = {
  deps?: WalkForwardSweepCommandDeps;
};

export function parseSplitIdFromArgv(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--split-id") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new WalkForwardSweepCommandError("Missing value for --split-id <id>");
      }
      return next;
    }
  }

  return undefined;
}

export function parseSplitInputDirFromArgv(
  argv: readonly string[],
  defaultSplitInputDir = DEFAULT_WALK_FORWARD_SPLIT_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--split-input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new WalkForwardSweepCommandError("Missing value for --split-input-dir <path>");
      }
      return next;
    }
  }

  return defaultSplitInputDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultOutputDir = DEFAULT_WALK_FORWARD_SWEEP_OUTPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new WalkForwardSweepCommandError("Missing value for --output-dir <path>");
      }
      return next;
    }
  }

  return defaultOutputDir;
}

export function parseConcurrencyFromArgv(argv: readonly string[]): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--concurrency") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new WalkForwardSweepCommandError("Missing value for --concurrency <n>");
      }

      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new WalkForwardSweepCommandError("concurrency must be a positive integer");
      }

      return parsed;
    }
  }

  return undefined;
}

export function parseAllStrategiesFromArgv(argv: readonly string[]): boolean {
  return argv.includes("--all");
}

export function parseStrategyIdsFromArgv(argv: readonly string[]): string[] {
  const strategyIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--strategy") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new WalkForwardSweepCommandError("Missing value for --strategy <id>");
      }
      strategyIds.push(next);
    }
  }

  return strategyIds;
}

export function resolveStrategySelectionFromArgv(
  argv: readonly string[],
  listRegisteredStrategyIds: () => readonly string[],
): readonly string[] {
  const runAll = parseAllStrategiesFromArgv(argv);
  const explicitStrategyIds = parseStrategyIdsFromArgv(argv);

  if (runAll && explicitStrategyIds.length > 0) {
    throw new WalkForwardSweepCommandError("Use either --all or --strategy, not both");
  }

  if (!runAll && explicitStrategyIds.length === 0) {
    throw new WalkForwardSweepCommandError(
      "Missing strategy selection. Pass --all or one or more --strategy <id> flags",
    );
  }

  const selected = runAll ? listRegisteredStrategyIds() : explicitStrategyIds;
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const strategyId of selected) {
    const trimmed = strategyId.trim();
    if (!trimmed) {
      continue;
    }

    if (seen.has(trimmed)) {
      throw new WalkForwardSweepCommandError(`Duplicate strategy id "${trimmed}"`);
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  if (normalized.length === 0) {
    throw new WalkForwardSweepCommandError("At least one strategy id is required");
  }

  return normalized;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
