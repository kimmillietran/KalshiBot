import { ParityNearMissAnalysisError } from "@/lib/data/research/parityNearMissAnalysis";

export type ParityNearMissAnalysisCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  fileExists: (path: string) => boolean;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

export function formatCommandError(error: unknown): string {
  if (error instanceof ParityNearMissAnalysisError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return "Parity near-miss analysis failed.";
}
