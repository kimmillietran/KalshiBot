import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildDimensionInteractionAnalyticsReport,
  serializeDimensionInteractionAnalyticsHtml,
  serializeDimensionInteractionAnalyticsReport,
} from "@/lib/data/research/dimensionInteractionAnalytics";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeDimensionInteractionAnalyticsArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseDimensionInteractionAnalyticsConfigFromArgv,
} from "./buildDimensionInteractionAnalyticsTypes";
import type { DimensionInteractionAnalyticsCommandIo } from "./buildDimensionInteractionAnalyticsTypes";

export function runDimensionInteractionAnalyticsCommand(
  argv: readonly string[],
  io: DimensionInteractionAnalyticsCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeDimensionInteractionAnalyticsArgv(argv);
    const config = parseDimensionInteractionAnalyticsConfigFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const report = buildDimensionInteractionAnalyticsReport({
      generatedAt,
      outputPath: config.outputPath,
      htmlOutputPath: config.htmlOutputPath,
      inputPaths: config.inputPaths,
      io: {
        readFile: io.readFile,
        fileExists: io.fileExists,
      },
    });

    io.mkdirSync(dirname(config.outputPath), { recursive: true });
    io.mkdirSync(dirname(config.htmlOutputPath), { recursive: true });
    io.writeFile(config.outputPath, serializeDimensionInteractionAnalyticsReport(report));
    io.writeFile(config.htmlOutputPath, serializeDimensionInteractionAnalyticsHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          compositeGroupCount: report.summary.compositeGroupCount,
          averageInteractionScore: report.summary.averageInteractionScore,
          bestInteraction: report.rankings.bestInteractions[0] ?? null,
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
  const exitCode = runDimensionInteractionAnalyticsCommand(process.argv.slice(2), {
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
