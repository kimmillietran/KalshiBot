import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  buildPipelineDashboardReportFromInputs,
  loadPipelineDashboardInputs,
  PipelineDashboardError,
  serializePipelineDashboardHtml,
} from "@/lib/data/research/pipelineDashboard";

import { normalizeResearchPipelineDashboardArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseArtifactIndexPathFromArgv,
  parseDataHealthPathFromArgv,
  parseHarnessResultsPathFromArgv,
  parseHarnessSummaryFallbackPathFromArgv,
  parseHypothesisCandidatesPathFromArgv,
  parseHypothesisValidationPathFromArgv,
  parseOutputPathFromArgv,
  parsePipelineSummaryPathFromArgv,
  parseStrategyLeaderboardPathFromArgv,
  parseStrategySynthesisPathFromArgv,
  PipelineDashboardCommandError,
} from "./buildResearchPipelineDashboardTypes";
import type { PipelineDashboardCommandIo } from "./buildResearchPipelineDashboardTypes";

export function runResearchPipelineDashboardCommand(
  argv: readonly string[],
  io: PipelineDashboardCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchPipelineDashboardArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const inputPaths = {
      pipelineSummaryPath: parsePipelineSummaryPathFromArgv(normalizedArgv),
      artifactIndexPath: parseArtifactIndexPathFromArgv(normalizedArgv),
      hypothesisCandidatesPath: parseHypothesisCandidatesPathFromArgv(normalizedArgv),
      hypothesisValidationPath: parseHypothesisValidationPathFromArgv(normalizedArgv),
      strategySynthesisPath: parseStrategySynthesisPathFromArgv(normalizedArgv),
      harnessResultsPath: parseHarnessResultsPathFromArgv(normalizedArgv),
      harnessSummaryFallbackPath: parseHarnessSummaryFallbackPathFromArgv(normalizedArgv),
      strategyLeaderboardPath: parseStrategyLeaderboardPathFromArgv(normalizedArgv),
      dataHealthPath: parseDataHealthPathFromArgv(normalizedArgv),
    };
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const inputs = loadPipelineDashboardInputs(io, inputPaths);
    const report = buildPipelineDashboardReportFromInputs(
      generatedAt,
      outputPath,
      inputPaths,
      inputs,
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.writeFile(outputPath, serializePipelineDashboardHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          pipelineStatus: report.pipelineStatus.pipelineStatus,
          hypothesisCount: report.hypothesisSummary.hypothesisCount,
          warningCount: report.researchHealth.warningCount,
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
  const exitCode = runResearchPipelineDashboardCommand(process.argv.slice(2), {
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
    fileExists: (path) => existsSync(path),
  });

  process.exitCode = exitCode;
}

if (process.env.VITEST !== "true") {
  main();
}

export { PipelineDashboardError, PipelineDashboardCommandError };
