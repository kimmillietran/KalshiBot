import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildFeatureCatalogExplorerReport,
  loadFeatureCatalogExplorerInputs,
  parseFeatureCatalogExplorerPathsFromArgv,
  serializeFeatureCatalogExplorerHtml,
  serializeFeatureCatalogExplorerReport,
} from "@/lib/data/research/featureCatalogExplorer";

import { normalizeFeatureCatalogExplorerArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildFeatureCatalogExplorerTypes";
import type { FeatureCatalogExplorerCommandIo } from "./buildFeatureCatalogExplorerTypes";

export function runFeatureCatalogExplorerCommand(
  argv: readonly string[],
  io: FeatureCatalogExplorerCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeFeatureCatalogExplorerArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseFeatureCatalogExplorerPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const loadedInputs = loadFeatureCatalogExplorerInputs(io, inputPaths);
    const report = buildFeatureCatalogExplorerReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      loadedInputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeFeatureCatalogExplorerReport(report));
    io.writeFile(htmlOutputPath, serializeFeatureCatalogExplorerHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalFeatures: report.summary.totalFeatures,
          usedInResearchCount: report.summary.usedInResearchCount,
          computedButUnusedCount: report.summary.computedButUnusedCount,
          missingIndicators: report.summary.missingIndicators,
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
  const exitCode = runFeatureCatalogExplorerCommand(process.argv.slice(2), {
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
