import { readFileSync } from "node:fs";

import {
  runConfiguredHistoricalBronzeImport,
  runHistoricalImportFromConfig,
} from "@/lib/data/importJobs";
import type { HistoricalImportFetchLike } from "@/lib/data/importJobs";

import {
  buildHistoricalBronzeImportPlan,
  HistoricalImportCommandError,
  parseDryRunFromArgv,
  parseHistoricalImportInputJson,
  serializeHistoricalBronzeImportPlan,
} from "./types";
import type {
  HistoricalImportCommandDeps,
  HistoricalImportCommandIo,
} from "./types";

export type RunHistoricalImportCommandOptions = {
  deps?: HistoricalImportCommandDeps;
  fetchImpl?: HistoricalImportFetchLike;
};

function normalizeCommandOptions(
  options?: HistoricalImportCommandDeps | RunHistoricalImportCommandOptions,
): RunHistoricalImportCommandOptions {
  if (!options) {
    return {};
  }

  if ("kalshiProvider" in options) {
    return { deps: options };
  }

  return options;
}

export function parseInputPathFromArgv(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HistoricalImportCommandError(
          "Missing value for --input <path>",
        );
      }
      return next;
    }
  }

  throw new HistoricalImportCommandError(
    "Missing required --input <path>",
  );
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function runHistoricalImportCommand(
  argv: readonly string[],
  io: HistoricalImportCommandIo = {
    readFile: (path) => readFileSync(path, "utf8"),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  },
  options?: HistoricalImportCommandDeps | RunHistoricalImportCommandOptions,
): number | Promise<number> {
  try {
    const inputPath = parseInputPathFromArgv(argv);
    const dryRun = parseDryRunFromArgv(argv);
    const config = parseHistoricalImportInputJson(io.readFile(inputPath));

    if (dryRun) {
      const plan = buildHistoricalBronzeImportPlan(config, { dryRun: true });
      io.writeStdout(
        formatStdoutOutput(serializeHistoricalBronzeImportPlan(plan)),
      );
      return 0;
    }

    const { deps, fetchImpl } = normalizeCommandOptions(options);

    if (deps) {
      const result = runConfiguredHistoricalBronzeImport({
        config,
        kalshiProvider: deps.kalshiProvider,
        btcProvider: deps.btcProvider,
      });

      io.writeStdout(formatStdoutOutput(result.serialized));
      return 0;
    }

    return runHistoricalImportFromConfig({ config, fetchImpl }).then(
      (result) => {
        io.writeStdout(formatStdoutOutput(result.serialized));
        return 0;
      },
      (error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Historical import command failed";
        io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
        return 1;
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Historical import command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const result = runHistoricalImportCommand(argv);
  return result instanceof Promise ? result : result;
}

if (process.env.VITEST !== "true") {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
