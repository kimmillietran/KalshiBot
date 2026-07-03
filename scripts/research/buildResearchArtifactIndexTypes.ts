import type { ArtifactIndexIo } from "@/lib/data/research/artifactIndex";

export class ResearchArtifactIndexCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchArtifactIndexCommandError";
  }
}

export type ResearchArtifactIndexCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  artifactIo?: ArtifactIndexIo;
};

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof ResearchArtifactIndexCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Research artifact index build failed";
}
