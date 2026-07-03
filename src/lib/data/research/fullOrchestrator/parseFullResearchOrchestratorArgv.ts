import {
  DEFAULT_FULL_RESEARCH_SUMMARY_PATH,
  FullResearchOrchestratorError,
  FullResearchOrchestratorErrorCode,
} from "./fullResearchOrchestratorTypes";
import type { FullResearchOrchestratorConfig } from "./fullResearchOrchestratorTypes";

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
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
  };
}
