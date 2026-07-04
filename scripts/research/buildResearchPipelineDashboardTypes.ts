import {
  DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
} from "@/lib/data/research/pipelineDashboard";

export class PipelineDashboardCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineDashboardCommandError";
  }
}

export type PipelineDashboardCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
};

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new PipelineDashboardCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }
  return defaultValue;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output", DEFAULT_RESEARCH_DASHBOARD_HTML_PATH);
}

export function parsePipelineSummaryPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--pipeline-summary",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.pipelineSummaryPath,
  );
}

export function parseArtifactIndexPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--artifact-index",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.artifactIndexPath,
  );
}

export function parseHypothesisCandidatesPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--hypothesis-candidates",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.hypothesisCandidatesPath,
  );
}

export function parseHypothesisValidationPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--hypothesis-validation",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.hypothesisValidationPath,
  );
}

export function parseStrategySynthesisPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--strategy-synthesis",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.strategySynthesisPath,
  );
}

export function parseHarnessResultsPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--harness-results",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.harnessResultsPath,
  );
}

export function parseHarnessSummaryFallbackPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--harness-summary",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.harnessSummaryFallbackPath,
  );
}

export function parseStrategyLeaderboardPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--leaderboard",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.strategyLeaderboardPath,
  );
}

export function parseDataHealthPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--data-health",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.dataHealthPath,
  );
}

export function parseFullResearchSummaryPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--full-research-summary",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.fullResearchSummaryPath,
  );
}

export function parseHistoricalCoveragePlanPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--historical-coverage-plan",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.historicalCoveragePlanPath,
  );
}

export function parseHistoricalExpansionConfigPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--historical-expansion-config",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.historicalExpansionConfigPath,
  );
}

export function parseCoverageValidationPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(
    argv,
    "--coverage-validation",
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.coverageValidationPath,
  );
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof PipelineDashboardCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Research pipeline dashboard failed";
}
