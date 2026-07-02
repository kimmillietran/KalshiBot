import {
  DEFAULT_SETTLEMENT_TRACE_FIXTURES_DIR,
  DEFAULT_SETTLEMENT_TRACE_IMPORT_CONFIGS_DIR,
  DEFAULT_SETTLEMENT_TRACE_IMPORTS_DIR,
  DEFAULT_SETTLEMENT_TRACE_REGISTRY_DIR,
  DEFAULT_SETTLEMENT_TRACE_RESEARCH_RESULTS_DIR,
} from "@/lib/data/audit/settlementTrace";

export class SettlementTraceCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementTraceCommandError";
  }
}

export type SettlementTraceCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new SettlementTraceCommandError(`Missing value for ${flag} <value>`);
      }

      return next;
    }
  }

  return undefined;
}

export function parseTickerFromArgv(argv: readonly string[]): string {
  const ticker = readFlagValue(argv, "--ticker");
  if (!ticker) {
    throw new SettlementTraceCommandError("Missing required --ticker <marketTicker>");
  }

  return ticker;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  marketTicker: string,
): string {
  return (
    readFlagValue(argv, "--output")
    ?? `data/audits/settlement-trace-${marketTicker}.json`
  );
}

export function parseTraceConfigFromArgv(argv: readonly string[], marketTicker: string) {
  return {
    marketTicker,
    importsDir: readFlagValue(argv, "--imports-dir") ?? DEFAULT_SETTLEMENT_TRACE_IMPORTS_DIR,
    importConfigsDir:
      readFlagValue(argv, "--import-configs-dir")
      ?? DEFAULT_SETTLEMENT_TRACE_IMPORT_CONFIGS_DIR,
    fixturesDir: readFlagValue(argv, "--fixtures-dir") ?? DEFAULT_SETTLEMENT_TRACE_FIXTURES_DIR,
    registryDir: readFlagValue(argv, "--registry-dir") ?? DEFAULT_SETTLEMENT_TRACE_REGISTRY_DIR,
    researchResultsDir:
      readFlagValue(argv, "--research-results-dir")
      ?? DEFAULT_SETTLEMENT_TRACE_RESEARCH_RESULTS_DIR,
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
