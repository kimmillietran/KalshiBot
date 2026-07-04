import type { FullResearchOrchestratorConfig } from "./fullResearchOrchestratorTypes";

/** Builds argv for research:execute-expansion-import when orchestrator import mode is enabled. */
export function buildExecuteExpansionImportStepArgs(
  config: FullResearchOrchestratorConfig,
): readonly string[] {
  const args: string[] = ["--execute"];

  if (config.expansionImportMaxMarkets !== null) {
    args.push("--max-markets", String(config.expansionImportMaxMarkets));
  }

  if (config.expansionImportJobId !== null) {
    args.push("--job-id", config.expansionImportJobId);
  }

  if (config.expansionImportResume) {
    args.push("--resume");
  }

  return args;
}
