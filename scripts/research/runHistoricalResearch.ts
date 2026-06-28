import { readFileSync } from "node:fs";

import { runHistoricalResearchFromBronze } from "@/lib/data/research/runner";

import {
  HistoricalResearchCommandError,
  historicalResearchCliInputSchema,
  resolveBuiltinStrategy,
} from "./types";
import type {
  HistoricalResearchCliInputDocument,
  HistoricalResearchCommandIo,
} from "./types";

export function parseInputPathFromArgv(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HistoricalResearchCommandError(
          "Missing value for --input <path>",
        );
      }
      return next;
    }
  }

  throw new HistoricalResearchCommandError(
    "Missing required --input <path>",
  );
}

export function parseHistoricalResearchInputJson(
  json: string,
): HistoricalResearchCliInputDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new HistoricalResearchCommandError("Input file contains invalid JSON");
  }

  const result = historicalResearchCliInputSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HistoricalResearchCommandError(
      issue?.message ?? "Input file failed validation",
    );
  }

  return result.data;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function runHistoricalResearchCommand(
  argv: readonly string[],
  io: HistoricalResearchCommandIo = {
    readFile: (path) => readFileSync(path, "utf8"),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
    },
  },
): number {
  try {
    const inputPath = parseInputPathFromArgv(argv);
    const document = parseHistoricalResearchInputJson(io.readFile(inputPath));
    const strategy = resolveBuiltinStrategy(document.strategyId);

    const result = runHistoricalResearchFromBronze({
      bronzeRecords: document.bronzeRecords,
      strategy,
      engineConfig: document.engineConfig,
      initialCashCents: document.initialCashCents,
      runId: document.runId,
      durationMs: document.durationMs,
      fillConfig: document.fillConfig,
      metricsConfig: document.metricsConfig,
    });

    io.writeStdout(formatStdoutOutput(result.serialized));
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Historical research command failed";
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runHistoricalResearchCommand(argv);
}

if (process.env.VITEST !== "true") {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
