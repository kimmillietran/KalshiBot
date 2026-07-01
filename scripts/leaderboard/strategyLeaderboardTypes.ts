export class StrategyLeaderboardCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategyLeaderboardCommandError";
  }
}

export type StrategyLeaderboardCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export function parseInputDirFromArgv(
  argv: readonly string[],
  defaultDir = "data/research-results",
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StrategyLeaderboardCommandError(
          "Missing value for --input-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultDir;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = "data/leaderboards/strategy-leaderboard.json",
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StrategyLeaderboardCommandError(
          "Missing value for --output <path>",
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseRankByFromArgv(
  argv: readonly string[],
  defaultMetric = "totalPnL",
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--rank-by") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new StrategyLeaderboardCommandError(
          "Missing value for --rank-by <metric>",
        );
      }
      return next;
    }
  }

  return defaultMetric;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
