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
  buildCrossValidationReportFromInputs,
  buildDefaultCrossValidationInputPaths,
  CrossValidationError,
  serializeCrossValidationHtml,
  serializeCrossValidationReport,
} from "@/lib/data/research/crossValidation";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeCrossValidationArgv } from "../lib/cliArgvSchemas";

import {
  CrossValidationCommandError,
  formatStdoutOutput,
  parseCrossValidationConfigFromArgv,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildCrossValidationTypes";
import type { CrossValidationCommandIo } from "./buildCrossValidationTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof CrossValidationCommandError) {
    return error.message;
  }

  if (error instanceof CrossValidationError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Cross-validation failed";
}

export function runCrossValidationCommand(
  argv: readonly string[],
  io: CrossValidationCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeCrossValidationArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = buildDefaultCrossValidationInputPaths({
      hypothesisCandidatesPath: readOptionalFlag(normalizedArgv, "--hypothesis-candidates"),
      hypothesisValidationPath: readOptionalFlag(normalizedArgv, "--hypothesis-validation"),
      strategySynthesisPath: readOptionalFlag(normalizedArgv, "--strategy-synthesis"),
      researchResultsDir: readOptionalFlag(normalizedArgv, "--research-results-dir"),
      regimeTagsPath: readOptionalFlag(normalizedArgv, "--regime-tags"),
    });
    const config = parseCrossValidationConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildCrossValidationReportFromInputs({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      io,
      config,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeCrossValidationReport(report));
    io.writeFile(htmlOutputPath, serializeCrossValidationHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalTargets: report.summary.totalTargets,
          passingCount: report.summary.passingCount,
          failingCount: report.summary.failingCount,
        }),
      ),
    );

    return 0;
  } catch (error) {
    io.writeStderr(`${mapCommandError(error)}\n`);
    return 1;
  }
}

function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

function main(): void {
  const exitCode = runCrossValidationCommand(process.argv.slice(2), {
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

export { CrossValidationError, CrossValidationCommandError };
