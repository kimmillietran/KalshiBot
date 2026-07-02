import {
  DEFAULT_STRATEGY_SWEEP_OUTPUT_DIR,
  DEFAULT_STRATEGY_SWEEP_REGISTRY_DIR,
} from "@/lib/data/research/sweep";

export class StrategySweepCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategySweepCommandError";
  }
}

export type StrategySweepCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export type StrategySweepCommandDeps = {
  filesystem: import("@/lib/data/research/sweep").StrategySweepFilesystem;
  strategyRegistry: import("@/lib/data/strategies/plugin/StrategyPluginRegistry").StrategyPluginRegistry;
  parseFixtureJson: (
    json: string,
    marketTicker?: string,
  ) => import("@/lib/data/fixtures").HistoricalResearchCliInputDocument;
  runResearch: import("@/lib/data/research/sweep").StrategySweepRunnerDeps["runResearch"];
  now?: () => Date;
  logProgress?: (message: string) => void;
  isProgressTty?: boolean;
};

export type RunStrategySweepCommandOptions = {
  deps?: StrategySweepCommandDeps;
};

export function parseRegistryDirFromArgv(
  argv: readonly string[],
  defaultRegistryDir = DEFAULT_STRATEGY_SWEEP_REGISTRY_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--registry") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StrategySweepCommandError("Missing value for --registry <path>");
      }
      return next;
    }
  }

  return defaultRegistryDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultOutputDir = DEFAULT_STRATEGY_SWEEP_OUTPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StrategySweepCommandError("Missing value for --output-dir <path>");
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
        throw new StrategySweepCommandError("Missing value for --concurrency <n>");
      }

      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new StrategySweepCommandError("concurrency must be a positive integer");
      }

      return parsed;
    }
  }

  return undefined;
}

export function parseSummaryPathFromArgv(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--summary") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StrategySweepCommandError("Missing value for --summary <path>");
      }
      return next;
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
        throw new StrategySweepCommandError("Missing value for --strategy <id>");
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
    throw new StrategySweepCommandError(
      "Use either --all or --strategy, not both",
    );
  }

  if (!runAll && explicitStrategyIds.length === 0) {
    throw new StrategySweepCommandError(
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
      throw new StrategySweepCommandError(`Duplicate strategy id "${trimmed}"`);
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  if (normalized.length === 0) {
    throw new StrategySweepCommandError(
      "At least one strategy id is required",
    );
  }

  return normalized;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
