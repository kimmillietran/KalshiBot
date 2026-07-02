import {
  DEFAULT_BID_ASK_AUDIT_INPUT_DIR,
  DEFAULT_BID_ASK_AUDIT_OUTPUT_PATH,
} from "@/lib/data/datasets/validation/audit";

export class AuditBidAskFidelityCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditBidAskFidelityCommandError";
  }
}

export type AuditBidAskFidelityCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export function parseInputDirFromArgv(
  argv: readonly string[],
  defaultDir = DEFAULT_BID_ASK_AUDIT_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new AuditBidAskFidelityCommandError(
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
  defaultPath = DEFAULT_BID_ASK_AUDIT_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new AuditBidAskFidelityCommandError(
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
