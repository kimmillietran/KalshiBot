import {
  ResearchPipelineError,
} from "@/lib/data/research/pipeline";

export class ResearchPipelineCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchPipelineCommandError";
  }
}

export type ResearchPipelineCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  runner?: (
    npmScript: string,
    args: readonly string[],
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
};

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof ResearchPipelineCommandError) {
    return error.message;
  }

  if (error instanceof ResearchPipelineError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Research pipeline failed";
}
