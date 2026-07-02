import {
  DEFAULT_DECISION_TRACE_ATTRIBUTION_INPUT_DIR,
  DEFAULT_DECISION_TRACE_ATTRIBUTION_OUTPUT_PATH,
} from "@/lib/data/research/decisionTraceAttribution";

export class DecisionTraceAttributionCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionTraceAttributionCommandError";
  }
}

export type DecisionTraceAttributionCommandIo = {
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
  defaultDir = DEFAULT_DECISION_TRACE_ATTRIBUTION_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new DecisionTraceAttributionCommandError(
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
  defaultPath = DEFAULT_DECISION_TRACE_ATTRIBUTION_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new DecisionTraceAttributionCommandError(
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
  if (error instanceof DecisionTraceAttributionCommandError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Decision trace attribution build failed";
}
