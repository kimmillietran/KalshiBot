import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  BatchImportFailureAnalysisError,
  buildBatchImportFailureAnalysis,
  parseBatchImportSummaryJson,
  serializeBatchImportFailureAnalysis,
} from "@/lib/data/importJobs/batchImport";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeImportAnalyzeFailuresArgv } from "../lib/cliArgvSchemas";

import {
  AnalyzeBatchImportFailuresCommandError,
  formatStdoutOutput,
  parseInputPathFromArgv,
  parseOutputPathFromArgv,
} from "./analyzeBatchImportFailuresTypes";
import type { AnalyzeBatchImportFailuresCommandIo } from "./analyzeBatchImportFailuresTypes";

function mapCommandError(error: unknown): string {
  if (error instanceof AnalyzeBatchImportFailuresCommandError) {
    return error.message;
  }

  if (error instanceof BatchImportFailureAnalysisError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Batch import failure analysis failed";
}

export function runAnalyzeBatchImportFailuresCommand(
  argv: readonly string[],
  io: AnalyzeBatchImportFailuresCommandIo,
): number {
  try {
    const normalizedArgv = normalizeImportAnalyzeFailuresArgv(argv);
    const inputPath = parseInputPathFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);

    if (!io.fileExists(inputPath)) {
      throw new AnalyzeBatchImportFailuresCommandError(
        `Missing batch import summary: ${inputPath}`,
      );
    }

    const summary = parseBatchImportSummaryJson(io.readFile(inputPath));
    const analysis = buildBatchImportFailureAnalysis({
      totalConfigs: summary.totalConfigs,
      successfulImports: summary.successfulImports,
      failedImports: summary.failedImports,
      failedMarkets: summary.markets,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeBatchImportFailureAnalysis(analysis));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath,
          totalConfigs: analysis.totalConfigs,
          successfulImports: analysis.successfulImports,
          failedImports: analysis.failedImports,
          recoverableFailures: analysis.recoverableFailures,
          unrecoverableFailures: analysis.unrecoverableFailures,
          failureReasonCount: analysis.failureReasons.length,
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
  const exitCode = runAnalyzeBatchImportFailuresCommand(process.argv.slice(2), {
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
    fileExists: (path) => existsSync(path),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export {
  AnalyzeBatchImportFailuresCommandError,
  formatStdoutOutput,
  parseInputPathFromArgv,
  parseOutputPathFromArgv,
} from "./analyzeBatchImportFailuresTypes";
