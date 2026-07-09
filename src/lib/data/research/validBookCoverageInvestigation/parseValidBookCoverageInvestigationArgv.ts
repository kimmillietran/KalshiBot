import {
  DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_HTML_PATH,
  DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_OUTPUT_PATH,
  DEFAULT_VALID_BOOK_COVERAGE_INPUT_PATHS,
  ValidBookCoverageInvestigationError,
  type ValidBookCoverageInputPaths,
} from "./validBookCoverageInvestigationTypes";

function readArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return argv[index + 1] ?? null;
}

export function parseValidBookCoverageInvestigationPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ValidBookCoverageInputPaths;
} {
  const outputPath =
    readArgValue(argv, "--output")
    ?? readArgValue(argv, "-o")
    ?? DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_OUTPUT_PATH;
  const htmlOutputPath =
    readArgValue(argv, "--html")
    ?? readArgValue(argv, "--html-output")
    ?? DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_HTML_PATH;
  const forwardQuotesDir =
    readArgValue(argv, "--input-dir")
    ?? readArgValue(argv, "--forward-quotes-dir")
    ?? DEFAULT_VALID_BOOK_COVERAGE_INPUT_PATHS.forwardQuotesDir;

  if (!outputPath || !htmlOutputPath || !forwardQuotesDir) {
    throw new ValidBookCoverageInvestigationError("Missing required CLI paths.");
  }

  return {
    outputPath,
    htmlOutputPath,
    inputPaths: { forwardQuotesDir },
  };
}
