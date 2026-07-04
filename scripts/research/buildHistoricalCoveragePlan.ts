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
  buildHistoricalCoveragePlanFromPaths,
  serializeHistoricalCoveragePlan,
  serializeHistoricalCoveragePlanHtml,
} from "@/lib/data/research/coveragePlanner";

import { normalizeHistoricalCoveragePlanArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHistoricalCoveragePlanConfigFromArgv,
} from "./buildHistoricalCoveragePlanTypes";
import type { HistoricalCoveragePlanCommandIo } from "./buildHistoricalCoveragePlanTypes";

export function runHistoricalCoveragePlanCommand(
  argv: readonly string[],
  io: HistoricalCoveragePlanCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHistoricalCoveragePlanArgv(argv);
    const config = parseHistoricalCoveragePlanConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildHistoricalCoveragePlanFromPaths(
      config,
      {
        readdir: io.readdir,
        readFile: io.readFile,
        fileExists: io.fileExists,
        isDirectory: io.isDirectory,
      },
      { generatedAt },
    );

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeHistoricalCoveragePlan(report));
    io.writeFile(config.htmlOutputPath, serializeHistoricalCoveragePlanHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          marketCount: report.snapshot.marketCount,
          missingMonths: report.snapshot.missingMonths.length,
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
  const exitCode = runHistoricalCoveragePlanCommand(process.argv.slice(2), {
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
