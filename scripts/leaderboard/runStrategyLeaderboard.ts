import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";

import {
  buildStrategyLeaderboardFromDirectories,
  parseStrategyLeaderboardRankMetric,
  serializeStrategyLeaderboard,
  StrategyLeaderboardError,
} from "@/lib/data/research/leaderboard";

import {
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
  parseRankByFromArgv,
  StrategyLeaderboardCommandError,
} from "./strategyLeaderboardTypes";
import type { StrategyLeaderboardCommandIo } from "./strategyLeaderboardTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof StrategyLeaderboardCommandError) {
    return error.message;
  }

  if (error instanceof StrategyLeaderboardError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Strategy leaderboard build failed";
}

export function runStrategyLeaderboardCommand(
  argv: readonly string[],
  io: StrategyLeaderboardCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const inputRoot = parseInputDirFromArgv(argv);
    const outputPath = parseOutputPathFromArgv(argv);
    const rankBy = parseStrategyLeaderboardRankMetric(parseRankByFromArgv(argv));
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const leaderboard = buildStrategyLeaderboardFromDirectories(
      inputRoot,
      {
        readdir: (path) => io.readdir(path),
        readFile: (path) => io.readFile(path),
        fileExists: (path) => io.fileExists(path),
        isDirectory: (path) => io.isDirectory(path),
      },
      {
        generatedAt,
        outputPath,
        rankBy,
      },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeStrategyLeaderboard(leaderboard));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot: leaderboard.inputRoot,
          outputPath: leaderboard.outputPath,
          rankBy: leaderboard.rankBy,
          strategyCount: leaderboard.strategies.length,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function createDefaultIo(): StrategyLeaderboardCommandIo {
  return {
    readFile: (path) => readFileSync(path, "utf8"),
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
    writeFile: (path, data) => writeFileSync(path, data, "utf8"),
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    readdir: (path) => readdirSync(path),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  };
}

function main(): void {
  const exitCode = runStrategyLeaderboardCommand(process.argv.slice(2), createDefaultIo());
  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}
