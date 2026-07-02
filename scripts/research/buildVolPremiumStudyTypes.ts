import {
  DEFAULT_VOL_PREMIUM_INPUT_DIR,
  DEFAULT_VOL_PREMIUM_OUTPUT_PATH,
  VolPremiumError,
} from "@/lib/data/research/volPremium";

export class VolPremiumCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VolPremiumCommandError";
  }
}

export type VolPremiumCommandIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function parseInputDirFromArgv(
  argv: readonly string[],
  defaultDir = DEFAULT_VOL_PREMIUM_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new VolPremiumCommandError(
          "Missing value for --input-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultDir;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_VOL_PREMIUM_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new VolPremiumCommandError(
          "Missing value for --output <path>",
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof VolPremiumCommandError) {
    return error.message;
  }

  if (error instanceof VolPremiumError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Vol premium study build failed";
}
