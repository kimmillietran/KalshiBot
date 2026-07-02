import {
  DEFAULT_PARAMETER_SWEEP_OUTPUT_DIR,
  DEFAULT_PARAMETER_SWEEP_REGISTRY_DIR,
} from "@/lib/data/research/parameterSweep/types";

export class ParameterSweepCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParameterSweepCommandError";
  }
}

export type ParameterSweepCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export function parseConfigPathFromArgv(argv: readonly string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--config") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ParameterSweepCommandError("Missing value for --config <path>");
      }
      return next;
    }
  }

  throw new ParameterSweepCommandError("Missing required --config <path>");
}

export function parseRegistryDirFromArgv(
  argv: readonly string[],
  defaultRegistryDir = DEFAULT_PARAMETER_SWEEP_REGISTRY_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--registry") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ParameterSweepCommandError("Missing value for --registry <path>");
      }
      return next;
    }
  }

  return defaultRegistryDir;
}

export function parseOutputDirFromArgv(
  argv: readonly string[],
  defaultOutputDir = DEFAULT_PARAMETER_SWEEP_OUTPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ParameterSweepCommandError("Missing value for --output-dir <path>");
      }
      return next;
    }
  }

  return defaultOutputDir;
}

export function parseConcurrencyFromArgv(argv: readonly string[]): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--concurrency") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ParameterSweepCommandError("Missing value for --concurrency <n>");
      }

      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new ParameterSweepCommandError("concurrency must be a positive integer");
      }

      return parsed;
    }
  }

  return undefined;
}

export function parseSummaryPathFromArgv(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--summary") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ParameterSweepCommandError("Missing value for --summary <path>");
      }
      return next;
    }
  }

  return undefined;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
