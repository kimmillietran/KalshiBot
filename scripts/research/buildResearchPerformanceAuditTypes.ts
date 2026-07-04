import { PerformanceAuditError } from "@/lib/data/research/performanceAudit";
import { CoveragePlannerError } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";

export class ResearchPerformanceAuditCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchPerformanceAuditCommandError";
  }
}

export type ResearchPerformanceAuditCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof PerformanceAuditError) {
    return `${error.name}: ${error.message}`;
  }
  if (error instanceof CoveragePlannerError) {
    return `${error.name}: ${error.message}`;
  }
  if (error instanceof ResearchPerformanceAuditCommandError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}
