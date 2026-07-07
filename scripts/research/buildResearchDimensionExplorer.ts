import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildResearchDimensionExplorerReport,
  loadResearchDimensionExplorerInputs,
  parseResearchDimensionExplorerPathsFromArgv,
  serializeResearchDimensionExplorerHtml,
  serializeResearchDimensionExplorerReport,
} from "@/lib/data/research/researchDimensionExplorer";

import { normalizeResearchDimensionExplorerArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildResearchDimensionExplorerTypes";
import type { ResearchDimensionExplorerCommandIo } from "./buildResearchDimensionExplorerTypes";

export function runResearchDimensionExplorerCommand(
  argv: readonly string[],
  io: ResearchDimensionExplorerCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchDimensionExplorerArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseResearchDimensionExplorerPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const loadedInputs = loadResearchDimensionExplorerInputs(io, inputPaths);
    const report = buildResearchDimensionExplorerReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      loadedInputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeResearchDimensionExplorerReport(report));
    io.writeFile(htmlOutputPath, serializeResearchDimensionExplorerHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          dimensionCount: report.summary.dimensionCount,
          axisGroupCount: report.summary.axisGroupCount,
          recommendationCount: report.summary.recommendationCount,
          totalObservations: report.summary.totalObservations,
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
  const exitCode = runResearchDimensionExplorerCommand(process.argv.slice(2), {
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
