export class ResearchRecommendationEngineCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchRecommendationEngineCommandError";
  }
}

export type ResearchRecommendationEngineCommandIo = {
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
  if (error instanceof ResearchRecommendationEngineCommandError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Research recommendation engine failed";
}
