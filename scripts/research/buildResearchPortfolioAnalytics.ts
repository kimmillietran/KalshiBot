import { dirname } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  buildResearchPortfolioAnalyticsReport,
  DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS,
  loadResearchPortfolioAnalyticsInputs,
  ResearchPortfolioAnalyticsError,
  serializeResearchPortfolioAnalyticsHtml,
  serializeResearchPortfolioAnalyticsReport,
} from "@/lib/data/research/researchPortfolioAnalytics";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  formatStdoutOutput,
  ResearchPortfolioAnalyticsCommandError,
  parseHtmlOutputPathFromArgv,
  parseOutputPathFromArgv,
} from "./buildResearchPortfolioAnalyticsTypes";
import type { ResearchPortfolioAnalyticsCommandIo } from "./buildResearchPortfolioAnalyticsTypes";

function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

function mapCommandError(error: unknown): string {
  if (error instanceof ResearchPortfolioAnalyticsCommandError) {
    return error.message;
  }

  if (error instanceof ResearchPortfolioAnalyticsError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Research portfolio analytics failed";
}

export function runResearchPortfolioAnalyticsCommand(
  argv: readonly string[],
  io: ResearchPortfolioAnalyticsCommandIo,
  options?: { generatedAt?: string },
): number {
  try {
    const outputPath = parseOutputPathFromArgv(argv);
    const htmlOutputPath = parseHtmlOutputPathFromArgv(argv);
    const inputPaths = {
      hypothesisValidationPath:
        readOptionalFlag(argv, "--hypothesis-validation")
        ?? DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS.hypothesisValidationPath,
      hypothesisFailureAnalysisPath:
        readOptionalFlag(argv, "--hypothesis-failure-analysis")
        ?? DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS.hypothesisFailureAnalysisPath,
      hypothesisCandidatesPath:
        readOptionalFlag(argv, "--hypothesis-candidates")
        ?? DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS.hypothesisCandidatesPath,
      crossValidationPath:
        readOptionalFlag(argv, "--cross-validation")
        ?? DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS.crossValidationPath,
      coverageAwareValidationPath:
        readOptionalFlag(argv, "--coverage-aware-validation")
        ?? DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS.coverageAwareValidationPath,
      researchDimensionExplorerPath:
        readOptionalFlag(argv, "--research-dimension-explorer")
        ?? DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS.researchDimensionExplorerPath,
    };

    const generatedAt = options?.generatedAt ?? new Date().toISOString();
    const loadedInputs = loadResearchPortfolioAnalyticsInputs(io, inputPaths);
    const report = buildResearchPortfolioAnalyticsReport({
      generatedAt,
      outputPath,
      htmlOutputPath,
      inputPaths,
      loadedInputs,
    });

    io.mkdirSync(dirname(outputPath), { recursive: true });
    io.mkdirSync(dirname(htmlOutputPath), { recursive: true });
    io.writeFile(outputPath, serializeResearchPortfolioAnalyticsReport(report));
    io.writeFile(htmlOutputPath, serializeResearchPortfolioAnalyticsHtml(report));

    io.writeStdout(
      formatStdoutOutput(
        stableStringify({
          outputPath: report.outputPath,
          htmlOutputPath: report.htmlOutputPath,
          totalCandidates: report.summary.totalCandidates,
          totalValidations: report.summary.totalValidations,
          totalPasses: report.summary.totalPasses,
          overallPassRate: report.summary.overallPassRate,
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
  const exitCode = runResearchPortfolioAnalyticsCommand(process.argv.slice(2), {
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

export { ResearchPortfolioAnalyticsCommandError, ResearchPortfolioAnalyticsError };
