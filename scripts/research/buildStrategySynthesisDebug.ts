import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildStrategySynthesisDebugReport,
  serializeStrategySynthesisDebugHtml,
  serializeStrategySynthesisDebugReport,
} from "@/lib/data/research/strategySynthesisDebug";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeStrategySynthesisDebugArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseStrategySynthesisDebugConfigFromArgv,
} from "./buildStrategySynthesisDebugTypes";
import type { StrategySynthesisDebugCommandIo } from "./buildStrategySynthesisDebugTypes";

export function runStrategySynthesisDebugCommand(
  argv: readonly string[],
  io: StrategySynthesisDebugCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeStrategySynthesisDebugArgv(argv);
    const config = parseStrategySynthesisDebugConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildStrategySynthesisDebugReport({
      generatedAt,
      outputPath: config.outputPath,
      htmlOutputPath: config.htmlOutputPath,
      inputPaths: config.inputPaths,
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
      },
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeStrategySynthesisDebugReport(report));
    io.writeFile(config.htmlOutputPath, serializeStrategySynthesisDebugHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          diagnosis: report.summary.diagnosis,
          funnel: report.summary.funnel,
          recommendedNextTask: report.summary.recommendedNextTask,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function main(): void {
  const exitCode = runStrategySynthesisDebugCommand(process.argv.slice(2), {
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
