import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildResearchRecommendationEngineReport,
  loadResearchRecommendationInputs,
  parseResearchRecommendationEnginePathsFromArgv,
  serializeResearchRecommendationEngineHtml,
  serializeResearchRecommendationEngineReport,
} from "@/lib/data/research/researchRecommendationEngine";

import { normalizeResearchRecommendationEngineArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildResearchRecommendationEngineTypes";
import type { ResearchRecommendationEngineCommandIo } from "./buildResearchRecommendationEngineTypes";

export function runResearchRecommendationEngineCommand(
  argv: readonly string[],
  io: ResearchRecommendationEngineCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchRecommendationEngineArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseResearchRecommendationEnginePathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const loadedInputs = loadResearchRecommendationInputs(io, inputPaths);
    const report = buildResearchRecommendationEngineReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      loadedInputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeResearchRecommendationEngineReport(report));
    io.writeFile(htmlOutputPath, serializeResearchRecommendationEngineHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          recommendationCount: report.summary.recommendationCount,
          topRecommendation: report.summary.topRecommendation,
          artifactsAvailable: report.summary.artifactsAvailable,
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
  const exitCode = runResearchRecommendationEngineCommand(process.argv.slice(2), {
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
