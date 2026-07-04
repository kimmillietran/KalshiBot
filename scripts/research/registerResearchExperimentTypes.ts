export class ResearchExperimentCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchExperimentCommandError";
  }
}

export type ResearchExperimentCommandIo = {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  resolveGitCommit?: () => string | null;
};

export function formatStdoutOutput(payload: string): string {
  return `${payload}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "help") {
      return [
        "Usage: npm run research:experiments [-- options]",
        "",
        "Options:",
        "  --experiments-dir <path>",
        "  --index-output <path>",
        "  --html-output <path>",
        "  --pipeline-summary <path>",
        "  --full-research-summary <path>",
        "  --hypothesis-candidates <path>",
        "  --hypothesis-validation <path>",
        "  --strategy-synthesis <path>",
        "  --harness-results <path>",
        "  --candidate-promotions <path>",
        "  --artifact-index <path>",
      ].join("\n");
    }

    return error.message;
  }

  return String(error);
}
