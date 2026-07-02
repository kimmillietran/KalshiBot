import {
  DEFAULT_WALK_FORWARD_OUTPUT_DIR,
  DEFAULT_WALK_FORWARD_REGISTRY_DIR,
} from "@/lib/data/research/walkForwardEngine";

export class WalkForwardCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalkForwardCommandError";
  }
}

export type WalkForwardCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new WalkForwardCommandError(`Missing value for ${flag} <value>`);
      }
      return next;
    }
  }

  return undefined;
}

function readPositiveIntegerFlag(
  argv: readonly string[],
  flag: string,
): number | undefined {
  const value = readFlagValue(argv, flag);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new WalkForwardCommandError(`${flag} must be a positive integer`);
  }

  return parsed;
}

function readNonNegativeIntegerFlag(
  argv: readonly string[],
  flag: string,
): number | undefined {
  const value = readFlagValue(argv, flag);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new WalkForwardCommandError(`${flag} must be a non-negative integer`);
  }

  return parsed;
}

export function parseRegistryDirFromArgv(
  argv: readonly string[],
  defaultRegistryDir = DEFAULT_WALK_FORWARD_REGISTRY_DIR,
): string {
  return readFlagValue(argv, "--registry") ?? defaultRegistryDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultOutputDir = DEFAULT_WALK_FORWARD_OUTPUT_DIR,
): string {
  return readFlagValue(argv, "--output-dir") ?? defaultOutputDir;
}

export function parseSplitConfigPathFromArgv(argv: readonly string[]): string | undefined {
  return readFlagValue(argv, "--config");
}

export function parseSplitIdFromArgv(argv: readonly string[]): string | undefined {
  return readFlagValue(argv, "--split-id");
}

export function parseTrainingWindowFromArgv(argv: readonly string[]): number | undefined {
  return readPositiveIntegerFlag(argv, "--training-window");
}

export function parseValidationWindowFromArgv(argv: readonly string[]): number | undefined {
  return readPositiveIntegerFlag(argv, "--validation-window");
}

export function parseStepSizeFromArgv(argv: readonly string[]): number | undefined {
  return readPositiveIntegerFlag(argv, "--step-size");
}

export function parseEmbargoFromArgv(argv: readonly string[]): number | undefined {
  return readNonNegativeIntegerFlag(argv, "--embargo");
}

export function parseAllowOverlappingValidationWindowsFromArgv(
  argv: readonly string[],
): boolean | undefined {
  const value = readFlagValue(argv, "--allow-overlapping-validation-windows");
  if (value === undefined) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new WalkForwardCommandError(
    "--allow-overlapping-validation-windows must be true or false",
  );
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
