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
  buildProbabilityCalibrationReportsFromDirectories,
  CalibrationError,
  serializeProbabilityCalibrationReport,
} from "@/lib/data/research/calibration";

import { normalizeResearchCalibrationArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputDirFromArgv,
  ProbabilityCalibrationCommandError,
} from "./buildProbabilityCalibrationReportTypes";
import type { ProbabilityCalibrationCommandIo } from "./buildProbabilityCalibrationReportTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof ProbabilityCalibrationCommandError) {
    return error.message;
  }

  if (error instanceof CalibrationError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Probability calibration report build failed";
}

export function runProbabilityCalibrationReportCommand(
  argv: readonly string[],
  io: ProbabilityCalibrationCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchCalibrationArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputRoot = parseOutputDirFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const reports = buildProbabilityCalibrationReportsFromDirectories(
      inputRoot,
      outputRoot,
      {
        readdir: (path) => io.readdir(path),
        readFile: (path) => io.readFile(path),
        fileExists: (path) => io.fileExists(path),
        isDirectory: (path) => io.isDirectory(path),
      },
      { generatedAt },
    );

    const outputPaths: string[] = [];

    for (const report of reports) {
      io.mkdirSync(dirname(report.outputPath), { recursive: true });
      io.writeFile(report.outputPath, serializeProbabilityCalibrationReport(report));
      outputPaths.push(report.outputPath);
    }

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot,
          outputRoot,
          reportCount: reports.length,
          marketCount: reports.reduce(
            (total, report) => total + report.sampleCounts.marketCount,
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
  const exitCode = runProbabilityCalibrationReportCommand(process.argv.slice(2), {
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
  parseOutputDirFromArgv,
  ProbabilityCalibrationCommandError,
} from "./buildProbabilityCalibrationReportTypes";
