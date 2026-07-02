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
  buildRegimeTagsReportFromDirectories,
  serializeRegimeTagsReport,
} from "@/lib/data/research/regimeTagging";

import { normalizeRegimeTaggingArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseInputDirFromArgv,
  parseOutputPathFromArgv,
} from "./buildRegimeTagsTypes";
import type { RegimeTaggingCommandIo } from "./buildRegimeTagsTypes";

export function runRegimeTaggingCommand(
  argv: readonly string[],
  io: RegimeTaggingCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeRegimeTaggingArgv(argv);
    const inputRoot = parseInputDirFromArgv(normalizedArgv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildRegimeTagsReportFromDirectories(
      inputRoot,
      outputPath,
      io,
      { generatedAt },
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializeRegimeTagsReport(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          inputRoot: report.inputRoot,
          outputPath: report.outputPath,
          marketCount: report.sampleCounts.marketCount,
          taggedMarketCount: report.sampleCounts.taggedMarketCount,
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
  const exitCode = runRegimeTaggingCommand(process.argv.slice(2), {
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
  RegimeTaggingCommandError,
} from "./buildRegimeTagsTypes";
