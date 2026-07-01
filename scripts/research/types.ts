import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";
import {
  historicalResearchCliInputSchema,
  type HistoricalResearchCliInputDocument,
} from "@/lib/data/fixtures";
import {
  BUILTIN_STRATEGY_IDS,
  resolveResearchStrategy,
  type BuiltinStrategyId,
} from "@/lib/data/strategies";

export { BUILTIN_STRATEGY_IDS, historicalResearchCliInputSchema };
export type { BuiltinStrategyId, HistoricalResearchCliInputDocument };

export const RESEARCH_OUTPUT_FORMATS = [
  "raw",
  "export",
  "export-summary",
] as const;

export type ResearchOutputFormat =
  (typeof RESEARCH_OUTPUT_FORMATS)[number];

export const DEFAULT_RESEARCH_OUTPUT_FORMAT: ResearchOutputFormat = "raw";

export class HistoricalResearchCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalResearchCommandError";
  }
}

export type HistoricalResearchCommandIo = {
  readFile: (path: string) => string;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile?: (path: string, data: string) => void;
};

export function resolveBuiltinStrategy(
  strategyId: BuiltinStrategyId,
  strategyConfig: unknown = {},
): BacktestStrategy {
  try {
    return resolveResearchStrategy({ strategyId, strategyConfig });
  } catch (error) {
    throw new HistoricalResearchCommandError(
      error instanceof Error ? error.message : "Failed to resolve strategy",
    );
  }
}

export function parseFormatFromArgv(
  argv: readonly string[],
): ResearchOutputFormat {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--format") {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HistoricalResearchCommandError(
          "Missing value for --format <raw|export|export-summary>",
        );
      }

      if (!RESEARCH_OUTPUT_FORMATS.includes(next as ResearchOutputFormat)) {
        throw new HistoricalResearchCommandError(
          `Unsupported --format value "${next}"`,
        );
      }

      return next as ResearchOutputFormat;
    }
  }

  return DEFAULT_RESEARCH_OUTPUT_FORMAT;
}

export function validateExportOutputRequirements(
  document: HistoricalResearchCliInputDocument,
  format: ResearchOutputFormat,
): void {
  if (format === DEFAULT_RESEARCH_OUTPUT_FORMAT) {
    return;
  }

  if (!document.exportId?.trim()) {
    throw new HistoricalResearchCommandError(
      "exportId is required for export output formats",
    );
  }

  if (!document.generatedAt?.trim()) {
    throw new HistoricalResearchCommandError(
      "generatedAt is required for export output formats",
    );
  }
}
