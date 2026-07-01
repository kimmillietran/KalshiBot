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
  buildResearchAggregateOutputPaths,
  buildResearchAggregateSummariesFromDirectories,
  ResearchAggregateError,
  serializeResearchAggregateSummary,
} from "@/lib/data/research/aggregation";

import {
  AggregateResearchStatisticsCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputDirFromArgv,
} from "./aggregateResearchStatisticsTypes";
import type { AggregateResearchStatisticsCommandIo } from "./aggregateResearchStatisticsTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof AggregateResearchStatisticsCommandError) {
    return error.message;
  }

  if (error instanceof ResearchAggregateError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Research aggregate statistics build failed";
}

export function runAggregateResearchStatisticsCommand(
  argv: readonly string[],
  io: AggregateResearchStatisticsCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const inputRoot = parseInputDirFromArgv(argv);
    const outputRoot = parseOutputDirFromArgv(argv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const summaries = buildResearchAggregateSummariesFromDirectories(
      inputRoot,
      {
        readdir: (path) => io.readdir(path),
        readFile: (path) => io.readFile(path),
        fileExists: (path) => io.fileExists(path),
        isDirectory: (path) => io.isDirectory(path),
      },
      { generatedAt },
    );

    const outputPaths = buildResearchAggregateOutputPaths(outputRoot, summaries);

    for (let index = 0; index < summaries.length; index += 1) {
      const summary = summaries[index];
      const outputPath = outputPaths[index];
      if (!summary || !outputPath) {
        continue;
      }

      io.mkdirSync(dirname(outputPath), { recursive: true });
      io.writeFile(outputPath, serializeResearchAggregateSummary(summary));
    }

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot,
          outputRoot,
          seriesCount: summaries.length,
          marketCount: summaries.reduce(
            (total, summary) => total + summary.marketCounts.total,
            0,
          ),
          outputPaths,
        }),
      ),
    );

    return 0;
  } catch (error) {
    const message = mapCommandError(error);
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runAggregateResearchStatisticsCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
    writeFile: (path, data) => {
      writeFileSync(path, data, "utf8");
    },
    mkdirSync: (path, options) => {
      mkdirSync(path, options);
    },
    readdir: (path) => readdirSync(path),
    fileExists: (path) => existsSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  AggregateResearchStatisticsCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputDirFromArgv,
} from "./aggregateResearchStatisticsTypes";
