import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildCalibrationFadeFamilyVerdictReport,
  loadCalibrationFadeFamilyVerdictInputs,
  parseCalibrationFadeFamilyVerdictPathsFromArgv,
  serializeCalibrationFadeFamilyVerdictHtml,
  serializeCalibrationFadeFamilyVerdictReport,
} from "@/lib/data/research/calibrationFadeFamilyVerdict";

import { normalizeCalibrationFadeFamilyVerdictArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildCalibrationFadeFamilyVerdictTypes";
import type { CalibrationFadeFamilyVerdictCommandIo } from "./buildCalibrationFadeFamilyVerdictTypes";

export function runCalibrationFadeFamilyVerdictCommand(
  argv: readonly string[],
  io: CalibrationFadeFamilyVerdictCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeCalibrationFadeFamilyVerdictArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseCalibrationFadeFamilyVerdictPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const loadedInputs = loadCalibrationFadeFamilyVerdictInputs(io, inputPaths);
    const report = buildCalibrationFadeFamilyVerdictReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      loadedInputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeCalibrationFadeFamilyVerdictReport(report));
    io.writeFile(htmlOutputPath, serializeCalibrationFadeFamilyVerdictHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          familyVerdict: report.summary.familyVerdict,
          promotedHypothesisCount: report.summary.promotedHypothesisCount,
          underpoweredHypothesisCount: report.summary.underpoweredHypothesisCount,
          recommendedNextAction: report.summary.recommendedNextAction,
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
  const exitCode = runCalibrationFadeFamilyVerdictCommand(process.argv.slice(2), {
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
