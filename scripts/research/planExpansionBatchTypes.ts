import {
  DEFAULT_EXPANSION_BATCH_PLAN_COVERAGE_AWARE_VALIDATION_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_COVERAGE_PLAN_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_DISCOVERY_RESULT_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_EXPANSION_CONFIG_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_EXPANSION_IMPORT_SUMMARY_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_HYPOTHESIS_VALIDATION_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_HTML_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_OUTPUT_PATH,
  DEFAULT_EXPANSION_BATCH_PLAN_SELECTION_STRATEGY,
  EXPANSION_BATCH_PLAN_SELECTION_STRATEGIES,
  ExpansionBatchPlannerError,
  type ExpansionBatchPlannerConfig,
} from "@/lib/data/research/expansionBatchPlanner";

export class PlanExpansionBatchCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanExpansionBatchCommandError";
  }
}

export type PlanExpansionBatchCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new PlanExpansionBatchCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

function readNumberFlagValue(
  argv: readonly string[],
  flag: string,
  defaultValue: number,
): number {
  const raw = readFlagValue(argv, flag, String(defaultValue));
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new PlanExpansionBatchCommandError(`Invalid numeric value for ${flag}: ${raw}`);
  }

  return parsed;
}

function readSelectionStrategyFlag(
  argv: readonly string[],
): ExpansionBatchPlannerConfig["selectionStrategy"] {
  const raw = readFlagValue(
    argv,
    "--selection-strategy",
    DEFAULT_EXPANSION_BATCH_PLAN_SELECTION_STRATEGY,
  );

  if (!(EXPANSION_BATCH_PLAN_SELECTION_STRATEGIES as readonly string[]).includes(raw)) {
    throw new PlanExpansionBatchCommandError(
      `Invalid value for --selection-strategy: ${raw}. Expected one of: ${EXPANSION_BATCH_PLAN_SELECTION_STRATEGIES.join(", ")}`,
    );
  }

  return raw as ExpansionBatchPlannerConfig["selectionStrategy"];
}

export function parsePlanExpansionBatchConfigFromArgv(
  argv: readonly string[],
): ExpansionBatchPlannerConfig {
  return {
    outputPath: readFlagValue(argv, "--output", DEFAULT_EXPANSION_BATCH_PLAN_OUTPUT_PATH),
    htmlOutputPath: readFlagValue(argv, "--html-output", DEFAULT_EXPANSION_BATCH_PLAN_HTML_PATH),
    maxMarkets: readNumberFlagValue(argv, "--max-markets", 1000),
    selectionStrategy: readSelectionStrategyFlag(argv),
    selectionSeed: readFlagValue(argv, "--selection-seed", "expansion-batch-plan"),
    inputPaths: {
      coveragePlanPath: readFlagValue(
        argv,
        "--historical-coverage-plan",
        DEFAULT_EXPANSION_BATCH_PLAN_COVERAGE_PLAN_PATH,
      ),
      expansionConfigPath: readFlagValue(
        argv,
        "--historical-expansion-config",
        DEFAULT_EXPANSION_BATCH_PLAN_EXPANSION_CONFIG_PATH,
      ),
      expansionImportSummaryPath: readFlagValue(
        argv,
        "--historical-expansion-import-summary",
        DEFAULT_EXPANSION_BATCH_PLAN_EXPANSION_IMPORT_SUMMARY_PATH,
      ),
      hypothesisValidationPath: readFlagValue(
        argv,
        "--hypothesis-validation",
        DEFAULT_EXPANSION_BATCH_PLAN_HYPOTHESIS_VALIDATION_PATH,
      ),
      coverageAwareValidationPath: readFlagValue(
        argv,
        "--coverage-aware-validation",
        DEFAULT_EXPANSION_BATCH_PLAN_COVERAGE_AWARE_VALIDATION_PATH,
      ),
      discoveryResultPath: readFlagValue(
        argv,
        "--discovery-result",
        DEFAULT_EXPANSION_BATCH_PLAN_DISCOVERY_RESULT_PATH,
      ),
    },
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof PlanExpansionBatchCommandError
    || error instanceof ExpansionBatchPlannerError
  ) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Expansion batch plan build failed";
}
