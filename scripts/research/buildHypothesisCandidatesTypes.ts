import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
  DEFAULT_LEAD_LAG_INPUT_PATH,
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
  DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH,
  DEFAULT_STRATEGY_LEADERBOARD_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates";
import { DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH } from "@/lib/data/research/hypothesisEvidence";
import { DEFAULT_LEAD_LAG_INPUT_DIR } from "@/lib/data/research/leadLag";

export class HypothesisCandidatesCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisCandidatesCommandError";
  }
}

export type HypothesisCandidatesCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--html-output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisCandidatesCommandError(
          "Missing value for --html-output <path>",
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseResearchInputRootFromArgv(
  argv: readonly string[],
  defaultRoot = DEFAULT_LEAD_LAG_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--research-input-root") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisCandidatesCommandError(
          "Missing value for --research-input-root <path>",
        );
      }
      return next;
    }
  }

  return defaultRoot;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisCandidatesCommandError(
          "Missing value for --output <path>",
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseArtifactPathFromArgv(
  argv: readonly string[],
  flag: string,
  defaultPath: string,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisCandidatesCommandError(
          `Missing value for ${flag} <path>`,
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseMinSampleFromArgv(
  argv: readonly string[],
  defaultMinSample = DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
): number {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--min-sample") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HypothesisCandidatesCommandError(
          "Missing value for --min-sample <count>",
        );
      }

      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new HypothesisCandidatesCommandError(
          `Invalid min sample size: ${next}`,
        );
      }

      return parsed;
    }
  }

  return defaultMinSample;
}

export function parseArtifactPathsFromArgv(argv: readonly string[]): {
  mispricingAtlasPath: string;
  leadLagAnalysisPath: string;
  statisticalSignificancePath: string;
  regimeTagsPath: string;
  strategyLeaderboardPath: string;
} {
  return {
    mispricingAtlasPath: parseArtifactPathFromArgv(
      argv,
      "--mispricing-atlas",
      DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    ),
    leadLagAnalysisPath: parseArtifactPathFromArgv(
      argv,
      "--lead-lag",
      DEFAULT_LEAD_LAG_INPUT_PATH,
    ),
    statisticalSignificancePath: parseArtifactPathFromArgv(
      argv,
      "--significance",
      DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_PATH,
    ),
    regimeTagsPath: parseArtifactPathFromArgv(
      argv,
      "--regime-tags",
      DEFAULT_REGIME_TAGS_INPUT_PATH,
    ),
    strategyLeaderboardPath: parseArtifactPathFromArgv(
      argv,
      "--leaderboard",
      DEFAULT_STRATEGY_LEADERBOARD_INPUT_PATH,
    ),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof HypothesisCandidatesCommandError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Hypothesis candidate generation failed";
}
