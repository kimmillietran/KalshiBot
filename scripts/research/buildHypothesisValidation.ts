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
  assertHypothesisValidationInputFiles,
  buildHypothesisValidationReportFromInputs,
  HypothesisRobustnessError,
  loadHypothesisCandidatesFromFile,
  serializeHypothesisValidationHtml,
  serializeHypothesisValidationReport,
} from "@/lib/data/research/hypothesisRobustness";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeHypothesisValidationArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  HypothesisValidationCommandError,
  parseHtmlOutputPathFromArgv,
  parseInputPathsFromArgv,
  parseOutputPathFromArgv,
} from "./buildHypothesisValidationTypes";
import type { HypothesisValidationCommandIo } from "./buildHypothesisValidationTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof HypothesisValidationCommandError) {
    return error.message;
  }

  if (error instanceof HypothesisRobustnessError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Hypothesis validation failed";
}

export function runHypothesisValidationCommand(
  argv: readonly string[],
  io: HypothesisValidationCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHypothesisValidationArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = parseInputPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    assertHypothesisValidationInputFiles(io, {
      hypothesisCandidatesPath: inputPaths.hypothesisCandidatesPath,
      mispricingAtlasPath: inputPaths.mispricingAtlasPath,
    });

    const candidates = loadHypothesisCandidatesFromFile(
      io,
      inputPaths.hypothesisCandidatesPath,
    );

    const report = buildHypothesisValidationReportFromInputs({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      candidates,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeHypothesisValidationReport(report));
    io.writeFile(htmlOutputPath, serializeHypothesisValidationHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalHypotheses: report.summary.totalHypotheses,
          passingCount: report.summary.passingCount,
          averageRobustnessScore: report.summary.averageRobustnessScore,
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
  const exitCode = runHypothesisValidationCommand(process.argv.slice(2), {
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
