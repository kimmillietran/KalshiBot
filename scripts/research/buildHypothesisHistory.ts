import { dirname } from "node:path";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import {
  DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import {
  DEFAULT_COVERAGE_AWARE_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import {
  buildHypothesisEvolutionReport,
  HypothesisEvolutionError,
  serializeHypothesisEvolutionHtml,
} from "@/lib/data/research/hypothesisEvolution";

import { normalizeHypothesisHistoryArgv } from "../lib/cliArgvSchemas";

import {
  formatStdoutOutput,
  mapCommandError,
  parseHistoryOutputPathFromArgv,
  parseHtmlOutputPathFromArgv,
} from "./buildHypothesisHistoryTypes";
import type { HypothesisHistoryCommandIo } from "./buildHypothesisHistoryTypes";

export function runHypothesisHistoryCommand(
  argv: readonly string[],
  io: HypothesisHistoryCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const normalizedArgv = normalizeHypothesisHistoryArgv(argv);
    const historyPath = parseHistoryOutputPathFromArgv(normalizedArgv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(normalizedArgv);
    const generatedAt = options?.generatedAt ?? new Date().toISOString();

    const { historyJson, report } = buildHypothesisEvolutionReport({
      generatedAt,
      outputPath: historyPath,
      htmlOutputPath,
      historyPath,
      inputPaths: {
        hypothesisCandidatesPath: DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
        hypothesisValidationPath: DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
        coverageValidationPath: DEFAULT_COVERAGE_AWARE_VALIDATION_OUTPUT_PATH,
        mispricingAtlasPath: DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
        historyPath,
      },
      io,
    });

    io.mkdirSync(dirname(historyPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(historyPath, historyJson);
    io.writeFile(htmlOutputPath, serializeHypothesisEvolutionHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        JSON.stringify({
          historyPath,
          htmlOutputPath,
          runCount: report.summary.runCount,
          strengtheningCount: report.summary.strengtheningCount,
          weakeningCount: report.summary.weakeningCount,
          strongestImprovingHypothesis: report.highlights.strongestImprovingHypothesis,
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
  const exitCode = runHypothesisHistoryCommand(process.argv.slice(2), {
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

export {
  formatStdoutOutput,
  HypothesisHistoryCommandError,
} from "./buildHypothesisHistoryTypes";
export { HypothesisEvolutionError };
