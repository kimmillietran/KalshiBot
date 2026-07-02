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
  buildDecisionTraceAttributionFromDirectories,
  serializeDecisionTraceAttributionReport,
} from "@/lib/data/research/decisionTraceAttribution";

import { normalizeDecisionTraceAttributionArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildDecisionTraceAttributionTypes";
import type { DecisionTraceAttributionCommandIo } from "./buildDecisionTraceAttributionTypes";

export function runDecisionTraceAttributionCommand(
  argv: readonly string[],
  io: DecisionTraceAttributionCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeDecisionTraceAttributionArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildDecisionTraceAttributionFromDirectories(
      inputRoot,
      outputPath,
      io,
      { generatedAt },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeDecisionTraceAttributionReport(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot: report.inputRoot,
          outputPath: report.outputPath,
          totalObservations: report.sampleCounts.totalObservations,
          traceDocumentCount: report.sampleCounts.traceDocumentCount,
          warningCount: report.warnings.length,
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
  const exitCode = runDecisionTraceAttributionCommand(process.argv.slice(2), {
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
  DecisionTraceAttributionCommandError,
  formatStdoutOutput,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildDecisionTraceAttributionTypes";
