import { readFileSync } from "node:fs";

import { runConfiguredHistoricalBronzeImport } from "@/lib/data/importJobs";

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
  deps?: HistoricalImportCommandDeps,
): number {
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

    if (!deps) {
      throw new HistoricalImportCommandError(
        "Historical import execution requires injected providers",
      );
    }

    const result = runConfiguredHistoricalBronzeImport({
      config,
      kalshiProvider: deps.kalshiProvider,
      btcProvider: deps.btcProvider,
    });

    io.writeStdout(formatStdoutOutput(result.serialized));
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Historical import command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runHistoricalImportCommand(argv);
}

if (process.env.VITEST !== "true") {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
