import {
  buildDefaultPnlForensicsGateInputPaths,
  DEFAULT_PNL_FORENSICS_GATE_HTML_OUTPUT_PATH,
  DEFAULT_PNL_FORENSICS_GATE_OUTPUT_PATH,
  PnlForensicsGateError,
  type PnlForensicsGateInputPaths,
} from "@/lib/data/research/pnlForensicsGate";

export class PnlForensicsGateCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PnlForensicsGateCommandError";
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
  return readFlagValue(argv, "--output") ?? DEFAULT_PNL_FORENSICS_GATE_OUTPUT_PATH;
}

export function readOptionalFlag(argv: readonly string[], flag: string): string | undefined {
  return readFlagValue(argv, flag);
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--html-output") ?? DEFAULT_PNL_FORENSICS_GATE_HTML_OUTPUT_PATH;
}

export function parseInputPathsFromArgv(argv: readonly string[]): PnlForensicsGateInputPaths {
  const defaults = buildDefaultPnlForensicsGateInputPaths();

  return {
    hypothesisTradeReplayPath:
      readFlagValue(argv, "--hypothesis-trade-replay")
      ?? defaults.hypothesisTradeReplayPath,
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
    regimeTagsPath: readFlagValue(argv, "--regime-tags") ?? defaults.regimeTagsPath,
    monthRegimeAnalysisPath:
      readFlagValue(argv, "--month-regime-analysis")
      ?? defaults.monthRegimeAnalysisPath,
  };
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof PnlForensicsGateCommandError) {
    return error.message;
  }

  if (error instanceof PnlForensicsGateError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "PnL forensics gate failed";
}

export type PnlForensicsGateCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export { buildDefaultPnlForensicsGateInputPaths };
