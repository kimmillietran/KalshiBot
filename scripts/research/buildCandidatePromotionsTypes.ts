export class CandidatePromotionCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidatePromotionCommandError";
  }
}

export type CandidatePromotionCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof CandidatePromotionCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Candidate promotion build failed";
}
