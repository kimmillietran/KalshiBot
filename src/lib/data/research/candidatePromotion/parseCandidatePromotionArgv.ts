import {
  DEFAULT_CANDIDATE_PROMOTIONS_HTML_PATH,
  DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH,
  DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS,
} from "./candidatePromotionTypes";
import type { CandidatePromotionInputPaths } from "./candidatePromotionTypes";

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }
  return defaultValue;
}

/** Parses CLI argv into candidate promotion input paths and output locations. */
export function parseCandidatePromotionConfigFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CandidatePromotionInputPaths;
} {
  let outputPath = DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH;
  let htmlOutputPath = DEFAULT_CANDIDATE_PROMOTIONS_HTML_PATH;
  const inputPaths: CandidatePromotionInputPaths = {
    ...DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --output <path>");
      }
      outputPath = next;
      index += 1;
      continue;
    }
    if (token === "--html-output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error("Missing value for --html-output <path>");
      }
      htmlOutputPath = next;
      index += 1;
    }
  }

  inputPaths.hypothesisValidationPath = readFlagValue(
    argv,
    "--hypothesis-validation",
    inputPaths.hypothesisValidationPath,
  );
  inputPaths.strategySynthesisPath = readFlagValue(
    argv,
    "--strategy-synthesis",
    inputPaths.strategySynthesisPath,
  );
  inputPaths.harnessResultsPath = readFlagValue(
    argv,
    "--harness-results",
    inputPaths.harnessResultsPath,
  );
  inputPaths.harnessSummaryFallbackPath = readFlagValue(
    argv,
    "--harness-summary",
    inputPaths.harnessSummaryFallbackPath,
  );
  inputPaths.statisticalSignificancePath = readFlagValue(
    argv,
    "--statistical-significance",
    inputPaths.statisticalSignificancePath,
  );

  if (hasFlag(argv, "--help")) {
    throw new Error("help");
  }

  return { outputPath, htmlOutputPath, inputPaths };
}
