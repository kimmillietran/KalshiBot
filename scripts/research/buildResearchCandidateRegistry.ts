import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  buildResearchCandidateRegistryReportFromInputs,
  loadExistingResearchCandidateRegistry,
  loadResearchCandidateRegistryInputs,
  ResearchCandidateRegistryError,
  serializeResearchCandidateRegistryHtml,
  serializeResearchCandidateRegistryReport,
} from "@/lib/data/research/candidateRegistry";

import { normalizeResearchCandidateRegistryArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHarnessResultsPathFromArgv,
  parseHarnessSummaryFallbackPathFromArgv,
  parseHtmlOutputPathFromArgv,
  parseHypothesisCandidatesPathFromArgv,
  parseHypothesisValidationPathFromArgv,
  parseOutputPathFromArgv,
  parseStrategySynthesisPathFromArgv,
  ResearchCandidateRegistryCommandError,
} from "./buildResearchCandidateRegistryTypes";
import type { ResearchCandidateRegistryCommandIo } from "./buildResearchCandidateRegistryTypes";

export function runResearchCandidateRegistryCommand(
  argv: readonly string[],
  io: ResearchCandidateRegistryCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeResearchCandidateRegistryArgv(argv);
    const outputPath = parseOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const inputPaths = {
      hypothesisCandidatesPath: parseHypothesisCandidatesPathFromArgv(normalizedArgv),
      hypothesisValidationPath: parseHypothesisValidationPathFromArgv(normalizedArgv),
      strategySynthesisPath: parseStrategySynthesisPathFromArgv(normalizedArgv),
      harnessResultsPath: parseHarnessResultsPathFromArgv(normalizedArgv),
      harnessSummaryFallbackPath: parseHarnessSummaryFallbackPathFromArgv(normalizedArgv),
      existingRegistryPath: outputPath,
    };
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const registryIo = {
      readFile: io.readFile,
      fileExists: io.fileExists,
    };
    const inputs = loadResearchCandidateRegistryInputs(registryIo, inputPaths);
    const existingRegistry = loadExistingResearchCandidateRegistry(registryIo, outputPath);
    const report = buildResearchCandidateRegistryReportFromInputs(
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      inputs,
      existingRegistry,
    );

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeResearchCandidateRegistryReport(report));
    io.writeFile(htmlOutputPath, serializeResearchCandidateRegistryHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalCandidates: report.summary.totalCandidates,
          candidateCount: report.summary.candidateCount,
          rejectedCount: report.summary.rejectedCount,
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
  const exitCode = runResearchCandidateRegistryCommand(process.argv.slice(2), {
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

export { ResearchCandidateRegistryError, ResearchCandidateRegistryCommandError };
