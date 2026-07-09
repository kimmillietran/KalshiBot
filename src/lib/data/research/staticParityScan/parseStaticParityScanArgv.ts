import {
  DEFAULT_STATIC_PARITY_SCAN_HTML_PATH,
  DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS,
  DEFAULT_STATIC_PARITY_SCAN_OUTPUT_PATH,
  StaticParityScanError,
  type StaticParityScanInputPaths,
} from "./staticParityScanTypes";

function readArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return argv[index + 1] ?? null;
}

export function parseStaticParityScanPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: StaticParityScanInputPaths;
} {
  const outputPath =
    readArgValue(argv, "--output")
    ?? readArgValue(argv, "-o")
    ?? DEFAULT_STATIC_PARITY_SCAN_OUTPUT_PATH;
  const htmlOutputPath =
    readArgValue(argv, "--html")
    ?? readArgValue(argv, "--html-output")
    ?? DEFAULT_STATIC_PARITY_SCAN_HTML_PATH;
  const forwardQuotesDir =
    readArgValue(argv, "--input-dir")
    ?? readArgValue(argv, "--forward-quotes-dir")
    ?? DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS.forwardQuotesDir;

  if (!outputPath || !htmlOutputPath || !forwardQuotesDir) {
    throw new StaticParityScanError("Missing required CLI paths.");
  }

  return {
    outputPath,
    htmlOutputPath,
    inputPaths: { forwardQuotesDir },
  };
}
