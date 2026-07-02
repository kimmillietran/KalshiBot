import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

import {
  discoverResearchOutputPaths,
  inspectResearchOutputDocument,
  serializeResearchOutputInspectionSummaries,
} from "@/lib/data/research/inspect";

import { normalizeResearchInspectArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseInputPathFromArgv,
  parseLimitFromArgv,
  parseStrategyIdFromArgv,
  InspectResearchOutputCommandError,
} from "./inspectResearchOutputTypes";
import type { InspectResearchOutputCommandIo } from "./inspectResearchOutputTypes";

export function runInspectResearchOutputCommand(
  argv: readonly string[],
  io: InspectResearchOutputCommandIo,
): number {
  try {
    const normalizedArgv = normalizeResearchInspectArgv(argv);
    const inputPath = parseInputPathFromArgv(normalizedArgv);
    const inputDir = parseInputDirFromArgv(normalizedArgv);

    if (inputPath && inputDir) {
      throw new InspectResearchOutputCommandError(
        "Use either --input or --input-dir, not both",
      );
    }

    if (!inputPath && !inputDir) {
      throw new InspectResearchOutputCommandError(
        "Missing required --input <path> or --input-dir <path>",
      );
    }

    if (inputPath) {
      const summary = inspectResearchOutputDocument(io.readFile(inputPath), {
        inputPath,
      });
      io.writeStdout(
        formatStdoutOutput(serializeResearchOutputInspectionSummaries(summary)),
      );
      return 0;
    }

    const strategyId = parseStrategyIdFromArgv(normalizedArgv);
    const limit = parseLimitFromArgv(normalizedArgv);
    const outputPaths = discoverResearchOutputPaths(inputDir!, io, {
      strategyId,
      limit,
    });

    if (outputPaths.length === 0) {
      throw new InspectResearchOutputCommandError(
        "No research-output.json files were discovered",
      );
    }

    const summaries = outputPaths.map((path) =>
      inspectResearchOutputDocument(io.readFile(path), { inputPath: path }),
    );

    io.writeStdout(
      formatStdoutOutput(serializeResearchOutputInspectionSummaries(summaries)),
    );

    return 0;
  } catch (error) {
    const message = mapCommandError(error);
    io.writeStderr(message.endsWith("\n") ? message : `${message}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runInspectResearchOutputCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    writeStdout: (text) => {
      process.stdout.write(text);
    },
    writeStderr: (text) => {
      process.stderr.write(text);
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
  InspectResearchOutputCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseInputPathFromArgv,
  parseLimitFromArgv,
  parseStrategyIdFromArgv,
} from "./inspectResearchOutputTypes";
