import { ExpansionImportPerformanceAuditError } from "@/lib/data/research/expansionImportPerformanceAudit";

export class ExpansionImportPerformanceAuditCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpansionImportPerformanceAuditCommandError";
  }
}

export type ExpansionImportPerformanceAuditCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function formatStdoutOutput(jsonLine: string): string {
  return `${jsonLine}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof ExpansionImportPerformanceAuditError) {
    return error.message;
  }

  if (error instanceof ExpansionImportPerformanceAuditCommandError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Expansion import performance audit failed.";
}
