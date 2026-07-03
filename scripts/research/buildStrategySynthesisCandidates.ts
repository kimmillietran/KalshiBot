import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  buildStrategySynthesisReport,
  loadStrategySynthesisInputs,
  serializeStrategySynthesisReport,
  StrategySynthesisError,
} from "@/lib/data/research/strategySynthesis";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeStrategySynthesisArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildStrategySynthesisCandidatesTypes";
import type { StrategySynthesisCommandIo } from "./buildStrategySynthesisCandidatesTypes";

function mapSynthesisCommandError(error: unknown): string {
  if (error instanceof StrategySynthesisError) {
    return error.message;
  }

  return mapCommandError(error);
}

export function runStrategySynthesisCommand(
  argv: readonly string[],
  io: StrategySynthesisCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeStrategySynthesisArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const inputPaths = parseInputPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const inputs = loadStrategySynthesisInputs(io, inputPaths);

    const report = buildStrategySynthesisReport({
      generatedAt,
      outputPath,
      inputPaths,
      inputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeStrategySynthesisReport(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          synthesizedCount: report.summary.synthesizedCount,
          promotionCounts: report.summary.promotionCounts,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapSynthesisCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runStrategySynthesisCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
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
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  formatStdoutOutput,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildStrategySynthesisCandidatesTypes";
