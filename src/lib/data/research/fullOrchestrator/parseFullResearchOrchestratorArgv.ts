import {
  DEFAULT_FULL_RESEARCH_SUMMARY_PATH,
  FullResearchOrchestratorError,
  FullResearchOrchestratorErrorCode,
} from "./fullResearchOrchestratorTypes";
import type { FullResearchOrchestratorConfig } from "./fullResearchOrchestratorTypes";

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function readOptionalFlagValue(argv: readonly string[], flag: string): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new FullResearchOrchestratorError(
          `Missing value for ${flag} <value>`,
          FullResearchOrchestratorErrorCode.INVALID_ARGUMENT,
        );
      }
      return next;
    }
  }

  return null;
}

function readOptionalNumberFlag(argv: readonly string[], flag: string): number | null {
  const raw = readOptionalFlagValue(argv, flag);
  if (raw === null) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new FullResearchOrchestratorError(
      `Invalid numeric value for ${flag}: ${raw}`,
      FullResearchOrchestratorErrorCode.INVALID_ARGUMENT,
    );
  }

  return parsed;
}

/** Parses CLI argv into full research orchestrator config. */
export function parseFullResearchOrchestratorConfigFromArgv(
  argv: readonly string[],
): FullResearchOrchestratorConfig {
  let summaryOutputPath = DEFAULT_FULL_RESEARCH_SUMMARY_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new FullResearchOrchestratorError(
          "Missing value for --output <path>",
          FullResearchOrchestratorErrorCode.INVALID_ARGUMENT,
        );
      }
      summaryOutputPath = next;
      index += 1;
    }
  }

  return {
    continueOnError: hasFlag(argv, "--continue-on-error"),
    summaryOutputPath,
    executeExpansionImport: hasFlag(argv, "--execute-expansion-import"),
    expansionImportMaxMarkets: readOptionalNumberFlag(argv, "--max-markets"),
    expansionImportJobId: readOptionalFlagValue(argv, "--job-id"),
    expansionImportResume: hasFlag(argv, "--resume"),
  };
}
