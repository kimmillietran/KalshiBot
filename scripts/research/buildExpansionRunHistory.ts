import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

import {
  buildExpansionRunHistoryReport,
  ExpansionRunHistoryError,
  parseExpansionRunHistoryPathsFromArgv,
  serializeExpansionRunHistoryHtml,
} from "@/lib/data/research/expansionRunHistory";

import { normalizeExpansionRunHistoryArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildExpansionRunHistoryTypes";
import type { ExpansionRunHistoryCommandIo } from "./buildExpansionRunHistoryTypes";

export function runExpansionRunHistoryCommand(
  argv: readonly string[],
  io: ExpansionRunHistoryCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeExpansionRunHistoryArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseExpansionRunHistoryPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const { historyJson, report } = buildExpansionRunHistoryReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      historyPath: outputPath,
      inputPaths,
      io,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, historyJson);
    io.writeFile(htmlOutputPath, serializeExpansionRunHistoryHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          runCount: report.summary.runCount,
          latestImportedCount: report.highlights.latestRun?.importedCount ?? 0,
          bestThroughputImportsPerMinute:
            report.highlights.bestThroughputRun?.importsPerMinute ?? null,
          efficiencyImproving: report.highlights.efficiencyImproving,
          corruptedPreviousHistoryRecovered: report.summary.corruptedPreviousHistoryRecovered,
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
  const exitCode = runExpansionRunHistoryCommand(process.argv.slice(2), {
    readFile: (path) => readFileSync(path, "utf8").replace(/^\uFEFF/, ""),
    fileExists: (path) => existsSync(path),
    readdir: (path) => readdirSync(path),
    isDirectory: (path) => statSync(path).isDirectory(),
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

export { ExpansionRunHistoryError };
