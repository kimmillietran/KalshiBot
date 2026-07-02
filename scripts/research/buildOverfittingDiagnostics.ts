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
  buildOverfittingDiagnosticsFromDirectories,
  serializeOverfittingDiagnosticsReport,
} from "@/lib/data/research/overfittingDiagnostics";

import { normalizeOverfittingDiagnosticsArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseExperimentsRootFromArgv,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildOverfittingDiagnosticsTypes";
import type { OverfittingDiagnosticsCommandIo } from "./buildOverfittingDiagnosticsTypes";

export function runOverfittingDiagnosticsCommand(
  argv: readonly string[],
  io: OverfittingDiagnosticsCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeOverfittingDiagnosticsArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const experimentsRoot = parseExperimentsRootFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildOverfittingDiagnosticsFromDirectories(
      inputRoot,
      outputPath,
      io,
      {
        generatedAt,
        experimentsRoot,
      },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeOverfittingDiagnosticsReport(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot: report.inputRoot,
          experimentsRoot: report.experimentsRoot,
          outputPath: report.outputPath,
          strategyFamilyCount: report.evaluationScope.strategyFamilyCount,
          configCount: report.evaluationScope.configCount,
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
  const exitCode = runOverfittingDiagnosticsCommand(process.argv.slice(2), {
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
  OverfittingDiagnosticsCommandError,
  parseExperimentsRootFromArgv,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildOverfittingDiagnosticsTypes";
