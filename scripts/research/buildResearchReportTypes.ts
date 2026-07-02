import {
  DEFAULT_RESEARCH_REPORT_INPUT_DIR,
  DEFAULT_RESEARCH_REPORT_LEADERBOARD_PATH,
  DEFAULT_RESEARCH_REPORT_OUTPUT_PATH,
  ResearchReportError,
} from "@/lib/data/research/reports";

export class BuildResearchReportCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BuildResearchReportCommandError";
  }
}

export type BuildResearchReportCommandIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function parseInputDirFromArgv(
  argv: readonly string[],
  defaultDir = DEFAULT_RESEARCH_REPORT_INPUT_DIR,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input-dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BuildResearchReportCommandError(
          "Missing value for --input-dir <path>",
        );
      }
      return next;
    }
  }

  return defaultDir;
}

export function parseLeaderboardPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_RESEARCH_REPORT_LEADERBOARD_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--leaderboard") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BuildResearchReportCommandError(
          "Missing value for --leaderboard <path>",
        );
      }
      return next;
    }
  }

  return defaultPath;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_RESEARCH_REPORT_OUTPUT_PATH,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new BuildResearchReportCommandError(
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

export function mapCommandError(error: unknown): string {
  if (error instanceof BuildResearchReportCommandError) {
    return error.message;
  }

  if (error instanceof ResearchReportError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Research report build failed";
}
