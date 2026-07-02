import {
  ResearchOutputInspectionError,
  type ResearchOutputInspectionIo,
} from "@/lib/data/research/inspect";

export class InspectResearchOutputCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InspectResearchOutputCommandError";
  }
}

export type InspectResearchOutputCommandIo = ResearchOutputInspectionIo & {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
};

export function parseInputPathFromArgv(argv: readonly string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new InspectResearchOutputCommandError(
          "Missing value for --input <path>",
        );
      }
      return next;
    }
  }

  return null;
}

export function parseInputDirFromArgv(
  argv: readonly string[],
): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new InspectResearchOutputCommandError(
          "Missing value for --input-dir <path>",
        );
      }
      return next;
    }
  }

  return null;
}

export function parseStrategyIdFromArgv(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--strategy") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new InspectResearchOutputCommandError(
          "Missing value for --strategy <id>",
        );
      }
      return next;
    }
  }

  return undefined;
}

export function parseLimitFromArgv(argv: readonly string[]): number | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--limit") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new InspectResearchOutputCommandError(
          "Missing value for --limit <count>",
        );
      }

      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new InspectResearchOutputCommandError(
          "--limit must be a non-negative number",
        );
      }

      return Math.trunc(parsed);
    }
  }

  return undefined;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof InspectResearchOutputCommandError) {
    return error.message;
  }

  if (error instanceof ResearchOutputInspectionError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Research output inspection failed";
}
