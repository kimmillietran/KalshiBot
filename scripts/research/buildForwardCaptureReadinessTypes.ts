export class ForwardCaptureReadinessCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForwardCaptureReadinessCommandError";
  }
}

export type ForwardCaptureReadinessCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof ForwardCaptureReadinessCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Forward capture readiness failed";
}
