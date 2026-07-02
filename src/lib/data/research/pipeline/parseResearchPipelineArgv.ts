import { STRATEGY_LEADERBOARD_RANK_METRICS } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";

import {
  DEFAULT_DISCOVERY_OUTPUT_PATH,
  DEFAULT_RESEARCH_PIPELINE_CONCURRENCY,
  DEFAULT_RESEARCH_PIPELINE_LIMIT,
  DEFAULT_RESEARCH_PIPELINE_SERIES,
  DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH,
  ResearchPipelineError,
  ResearchPipelineErrorCode,
} from "./researchPipelineTypes";
import type { ResearchPipelineConfig } from "./researchPipelineTypes";

function parseFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ResearchPipelineError(
          `Missing value for ${flag} <value>`,
          ResearchPipelineErrorCode.INVALID_ARGUMENT,
        );
      }
      return next;
    }
  }

  return undefined;
}

function parsePositiveInteger(
  value: string,
  flag: string,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ResearchPipelineError(
      `Invalid ${flag} value: ${value}`,
      ResearchPipelineErrorCode.INVALID_ARGUMENT,
    );
  }

  return parsed;
}

function parseRankBy(
  value: string,
): ResearchPipelineConfig["rankBy"] {
  if (
    (STRATEGY_LEADERBOARD_RANK_METRICS as readonly string[]).includes(value)
  ) {
    return value as ResearchPipelineConfig["rankBy"];
  }

  throw new ResearchPipelineError(
    `Invalid --rank-by value: ${value}`,
    ResearchPipelineErrorCode.INVALID_ARGUMENT,
  );
}

export function parseResearchPipelineConfigFromArgv(
  argv: readonly string[],
): ResearchPipelineConfig {
  const series = parseFlagValue(argv, "--series") ?? DEFAULT_RESEARCH_PIPELINE_SERIES;
  const limit = parsePositiveInteger(
    parseFlagValue(argv, "--limit") ?? String(DEFAULT_RESEARCH_PIPELINE_LIMIT),
    "--limit",
  );
  const concurrency = parsePositiveInteger(
    parseFlagValue(argv, "--concurrency")
      ?? String(DEFAULT_RESEARCH_PIPELINE_CONCURRENCY),
    "--concurrency",
  );
  const rankBy = parseRankBy(parseFlagValue(argv, "--rank-by") ?? "totalPnL");

  return {
    series,
    limit,
    concurrency,
    continueOnError: argv.includes("--continue-on-error"),
    discoveryOutputPath:
      parseFlagValue(argv, "--discovery-output") ?? DEFAULT_DISCOVERY_OUTPUT_PATH,
    summaryOutputPath:
      parseFlagValue(argv, "--output") ?? DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH,
    rankBy,
  };
}
