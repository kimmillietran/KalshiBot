import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildResearchWorkflowReport,
  loadResearchWorkflowInputs,
  parseResearchWorkflowPathsFromArgv,
  serializeResearchWorkflowHtml,
  serializeResearchWorkflowReport,
} from "@/lib/data/research/researchWorkflow";

import { normalizeResearchWorkflowArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
} from "./buildResearchWorkflowTypes";
import type { ResearchWorkflowCommandIo } from "./buildResearchWorkflowTypes";

export function runResearchWorkflowCommand(
  argv: readonly string[],
  io: ResearchWorkflowCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchWorkflowArgv(argv);
    const { outputPath, htmlOutputPath, inputPaths } =
      parseResearchWorkflowPathsFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const loadedInputs = loadResearchWorkflowInputs(io, inputPaths);
    const report = buildResearchWorkflowReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      loadedInputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeResearchWorkflowReport(report));
    io.writeFile(htmlOutputPath, serializeResearchWorkflowHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalHypotheses: report.summary.totalHypotheses,
          activeHypothesisCount: report.summary.activeHypothesisCount,
          blockedHypothesisCount: report.summary.blockedHypothesisCount,
          nextRecommendedMilestone: report.summary.nextRecommendedMilestone,
          queueLength: report.queue.length,
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
  const exitCode = runResearchWorkflowCommand(process.argv.slice(2), {
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
