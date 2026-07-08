import {
  DEFAULT_COST_AWARE_ATLAS_HTML_OUTPUT_PATH,
  DEFAULT_COST_AWARE_ATLAS_INPUT_DIR,
  DEFAULT_COST_AWARE_ATLAS_OUTPUT_PATH,
  DEFAULT_COST_AWARE_MISPRICING_ATLAS_PATH,
  CostAwareAtlasError,
} from "@/lib/data/research/costAwareAtlas";

export class CostAwareAtlasCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostAwareAtlasCommandError";
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

export function parseInputDirFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--input-dir") ?? DEFAULT_COST_AWARE_ATLAS_INPUT_DIR;
}

export function parseOutputPathFromArgv(argv: readonly string[]): string {
  return readFlagValue(argv, "--output") ?? DEFAULT_COST_AWARE_ATLAS_OUTPUT_PATH;
}

export function parseHtmlOutputPathFromArgv(argv: readonly string[]): string {
  return (
    readFlagValue(argv, "--html-output")
    ?? DEFAULT_COST_AWARE_ATLAS_HTML_OUTPUT_PATH
  );
}

export function parseMispricingAtlasPathFromArgv(argv: readonly string[]): string {
  return (
    readFlagValue(argv, "--mispricing-atlas")
    ?? DEFAULT_COST_AWARE_MISPRICING_ATLAS_PATH
  );
}

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof CostAwareAtlasCommandError) {
    return error.message;
  }

  if (error instanceof CostAwareAtlasError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Cost-aware atlas failed";
}

export type CostAwareAtlasCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
