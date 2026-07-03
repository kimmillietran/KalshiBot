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
  buildHypothesisLifecycleReportFromInputs,
  HypothesisLifecycleError,
  loadHypothesisLifecycleInputs,
  serializeHypothesisLifecycleHtml,
} from "@/lib/data/research/hypothesisLifecycle";

import { normalizeHypothesisLifecycleArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  HypothesisLifecycleCommandError,
  mapCommandError,
  parseEvidenceHtmlPathFromArgv,
  parseHypothesisCandidatesPathFromArgv,
  parseHypothesisValidationPathFromArgv,
  parseOutputPathFromArgv,
  parseStrategyHarnessOutputDirFromArgv,
  parseStrategyHarnessSummaryPathFromArgv,
  parseStrategySynthesisPathFromArgv,
} from "./buildHypothesisLifecycleDashboardTypes";
import type { HypothesisLifecycleCommandIo } from "./buildHypothesisLifecycleDashboardTypes";

export function runHypothesisLifecycleDashboardCommand(
  argv: readonly string[],
  io: HypothesisLifecycleCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHypothesisLifecycleArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const inputPaths = {
      hypothesisCandidatesPath: parseHypothesisCandidatesPathFromArgv(normalizedArgv),
      evidenceHtmlPath: parseEvidenceHtmlPathFromArgv(normalizedArgv),
      hypothesisValidationPath: parseHypothesisValidationPathFromArgv(normalizedArgv),
      strategySynthesisPath: parseStrategySynthesisPathFromArgv(normalizedArgv),
      strategyHarnessSummaryPath: parseStrategyHarnessSummaryPathFromArgv(normalizedArgv),
      strategyHarnessOutputDir: parseStrategyHarnessOutputDirFromArgv(normalizedArgv),
    };
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const inputs = loadHypothesisLifecycleInputs(io, inputPaths);
    const report = buildHypothesisLifecycleReportFromInputs(
      generatedAt,
      outputPath,
      inputPaths,
      inputs,
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeHypothesisLifecycleHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          totalHypotheses: report.summary.totalHypotheses,
          promotedCount: report.summary.promotedCount,
          rejectedCount: report.summary.rejectedCount,
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
  const exitCode = runHypothesisLifecycleDashboardCommand(process.argv.slice(2), {
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
    getLastModified: (path) => {
      if (!existsSync(path)) {
        return null;
      }
      return statSync(path).mtime.toISOString();
    },
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export { HypothesisLifecycleError, HypothesisLifecycleCommandError };
