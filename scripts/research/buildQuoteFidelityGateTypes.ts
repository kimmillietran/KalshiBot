import {
  DEFAULT_QUOTE_FIDELITY_GATE_HTML_OUTPUT_PATH,
  DEFAULT_QUOTE_FIDELITY_GATE_OUTPUT_PATH,
  QuoteFidelityGateError,
  buildDefaultQuoteFidelityGateInputPaths,
  type QuoteFidelityGateInputPaths,
} from "@/lib/data/research/quoteFidelityGate";

export class QuoteFidelityGateCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteFidelityGateCommandError";
  }
}

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output") ?? DEFAULT_QUOTE_FIDELITY_GATE_OUTPUT_PATH;
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--html-output") ?? DEFAULT_QUOTE_FIDELITY_GATE_HTML_OUTPUT_PATH;
}

export function parseInputPathsFromArgv(argv: readonly string[]): QuoteFidelityGateInputPaths {
  const series = readFlagValue(argv, "--series-ticker") ?? "KXBTC15M";

  return buildDefaultQuoteFidelityGateInputPaths({
    datasetRegistryPath:
      readFlagValue(argv, "--dataset-registry")
      ?? `data/research-datasets/${series}/dataset-registry.json`,
    fixturesDir: readFlagValue(argv, "--fixtures-dir") ?? `data/fixtures/${series}`,
    researchResultsDir: readFlagValue(argv, "--research-results-dir"),
  });
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof QuoteFidelityGateCommandError) {
    return error.message;
  }

  if (error instanceof QuoteFidelityGateError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Quote fidelity gate failed";
}

export type QuoteFidelityGateCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};
