import {
  buildDefaultDerivedMonthPnlSensitivityInputPaths,
  DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_HTML_OUTPUT_PATH,
  DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_OUTPUT_PATH,
  DerivedMonthPnlSensitivityError,
  type DerivedMonthPnlSensitivityInputPaths,
} from "@/lib/data/research/derivedMonthPnlSensitivity";

export class DerivedMonthPnlSensitivityCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerivedMonthPnlSensitivityCommandError";
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

export function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  return readFlagValue(argv, flag);
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output") ?? DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_OUTPUT_PATH;
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return (
    readFlagValue(argv, "--html-output")
    ?? DEFAULT_DERIVED_MONTH_PNL_SENSITIVITY_HTML_OUTPUT_PATH
  );
}

export function parseInputPathsFromArgv(argv: readonly string[]): DerivedMonthPnlSensitivityInputPaths {
  const researchResultsDir = readFlagValue(argv, "--research-results-dir");
  const defaults = buildDefaultDerivedMonthPnlSensitivityInputPaths(
    researchResultsDir ? { researchResultsDir } : undefined,
  );

  return {
    hypothesisTradeReplayPath:
      readFlagValue(argv, "--hypothesis-trade-replay")
      ?? defaults.hypothesisTradeReplayPath,
    pnlForensicsGatePath:
      readFlagValue(argv, "--pnl-forensics-gate") ?? defaults.pnlForensicsGatePath,
    hypothesisCandidatesPath:
      readFlagValue(argv, "--hypothesis-candidates")
      ?? defaults.hypothesisCandidatesPath,
    hypothesisValidationPath:
      readFlagValue(argv, "--hypothesis-validation")
      ?? defaults.hypothesisValidationPath,
    oosPowerCorrectionPath:
      readFlagValue(argv, "--oos-power-correction")
      ?? defaults.oosPowerCorrectionPath,
    calibrationFadeFamilyVerdictPath:
      readFlagValue(argv, "--calibration-fade-family-verdict")
      ?? defaults.calibrationFadeFamilyVerdictPath,
    derivedSettlementSensitivityPath:
      readFlagValue(argv, "--derived-settlement-sensitivity")
      ?? defaults.derivedSettlementSensitivityPath,
    regimeTagsPath: readFlagValue(argv, "--regime-tags") ?? defaults.regimeTagsPath,
    researchResultsDir: researchResultsDir ?? defaults.researchResultsDir,
  };
}

export function parseSensitiveMonthFromArgv(argv: readonly string[]): string | undefined {
  return readFlagValue(argv, "--sensitive-month") ?? readFlagValue(argv, "--exclude-month");
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof DerivedMonthPnlSensitivityCommandError) {
    return error.message;
  }

  if (error instanceof DerivedMonthPnlSensitivityError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Derived-month PnL sensitivity analysis failed";
}

export type DerivedMonthPnlSensitivityCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export { buildDefaultDerivedMonthPnlSensitivityInputPaths };
