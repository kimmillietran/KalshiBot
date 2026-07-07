import {
  DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_HTML_PATH,
  DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH,
} from "@/lib/data/research/researchPortfolioAnalytics/researchPortfolioAnalyticsTypes";

export class ResearchPortfolioAnalyticsCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchPortfolioAnalyticsCommandError";
  }
}

export type ResearchPortfolioAnalyticsCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
  fileExists: (path: string) => boolean;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ResearchPortfolioAnalyticsCommandError(`Missing value for ${flag} <path>`);
      }

      return next;
    }
  }

  return undefined;
}

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH,
): string {
  return readFlagValue(argv, "--output") ?? defaultPath;
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_HTML_PATH,
): string {
  return readFlagValue(argv, "--html-output") ?? defaultPath;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}
