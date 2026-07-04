import {
  DEFAULT_CROSS_VALIDATION_HTML_PATH,
  DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/crossValidation/crossValidationTypes";

export class CrossValidationCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossValidationCommandError";
  }
}

export type CrossValidationCommandIo = {
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
        throw new CrossValidationCommandError(`Missing value for ${flag} <path>`);
      }

      return next;
    }
  }

  return undefined;
}

function readNumericFlag(argv: readonly string[], flag: string): number | undefined {
  const value = readFlagValue(argv, flag);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CrossValidationCommandError(`Invalid numeric value for ${flag}: ${value}`);
  }

  return parsed;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_CROSS_VALIDATION_OUTPUT_PATH,
): string {
  return readFlagValue(argv, "--output") ?? defaultPath;
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_CROSS_VALIDATION_HTML_PATH,
): string {
  return readFlagValue(argv, "--html-output") ?? defaultPath;
}

export function parseCrossValidationConfigFromArgv(argv: readonly string[]): {
  rollingWindowMonths?: number;
  bootstrapIterations?: number;
  bootstrapSeed?: number;
} {
  return {
    rollingWindowMonths: readNumericFlag(argv, "--rolling-window-months"),
    bootstrapIterations: readNumericFlag(argv, "--bootstrap-iterations"),
    bootstrapSeed: readNumericFlag(argv, "--bootstrap-seed"),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
