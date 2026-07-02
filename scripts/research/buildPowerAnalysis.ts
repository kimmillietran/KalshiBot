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
  buildPowerAnalysisReportFromDirectories,
  serializePowerAnalysisReport,
} from "@/lib/data/research/powerAnalysis";

import { normalizePowerAnalysisArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildPowerAnalysisTypes";
import type { PowerAnalysisCommandIo } from "./buildPowerAnalysisTypes";

export function runPowerAnalysisCommand(
  argv: readonly string[],
  io: PowerAnalysisCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizePowerAnalysisArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildPowerAnalysisReportFromDirectories(
      inputRoot,
      outputPath,
      io,
      { generatedAt },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializePowerAnalysisReport(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot,
          outputPath,
          strategyCount: report.overallSummary.strategyCount,
          underpoweredStrategyCount: report.overallSummary.underpoweredStrategyCount,
          medianRequiredSampleSizeFor2CentEdge:
            report.overallSummary.medianRequiredSampleSizeFor2CentEdge,
          recommendationCount: report.recommendations.length,
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
  const exitCode = runPowerAnalysisCommand(process.argv.slice(2), {
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
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
  PowerAnalysisCommandError,
} from "./buildPowerAnalysisTypes";
