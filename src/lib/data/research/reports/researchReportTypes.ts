import type { ProbabilityCalibrationReport } from "@/lib/data/research/calibration/calibrationTypes";
import type { ParsedStrategyAggregateSummary } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import type { StrategyLeaderboard } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";

export const ResearchReportErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_OUTPUT_DIRECTORY: "missing-output-directory",
} as const;

export type ResearchReportErrorCode =
  (typeof ResearchReportErrorCode)[keyof typeof ResearchReportErrorCode];

export class ResearchReportError extends Error {
  readonly code: ResearchReportErrorCode;

  constructor(message: string, code: ResearchReportErrorCode) {
    super(message);
    this.name = "ResearchReportError";
    this.code = code;
  }
}

export const DEFAULT_RESEARCH_REPORT_INPUT_DIR = "data/research-results";
export const DEFAULT_RESEARCH_REPORT_LEADERBOARD_PATH =
  "data/leaderboards/strategy-leaderboard.json";
export const DEFAULT_RESEARCH_REPORT_OUTPUT_PATH = "data/reports/research-report.html";

export type ResearchReportMarketHighlight = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  totalPnlCents: number;
  winRatePct: number | null;
  tradeCount: number | null;
  fillCount: number | null;
  maxDrawdownPct: number | null;
};

export type ResearchReportStrategySection = {
  strategyId: string;
  marketsTested: number;
  completedMarkets: number;
  totalTrades: number;
  totalFills: number;
  totalPnlCents: number;
  winRatePct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  topMarkets: readonly ResearchReportMarketHighlight[];
  bottomMarkets: readonly ResearchReportMarketHighlight[];
  largestWins: readonly ResearchReportMarketHighlight[];
  largestLosses: readonly ResearchReportMarketHighlight[];
};

export type ResearchReportChartBar = {
  label: string;
  value: number;
  tone: "up" | "down" | "neutral";
};

export type ResearchReportDocument = {
  generatedAt: string;
  inputRoot: string;
  leaderboardPath: string | null;
  hasData: boolean;
  leaderboard: StrategyLeaderboard | null;
  strategySections: readonly ResearchReportStrategySection[];
  calibrationReports: readonly ProbabilityCalibrationReport[];
  pnlChart: readonly ResearchReportChartBar[];
  winRateChart: readonly ResearchReportChartBar[];
  drawdownChart: readonly ResearchReportChartBar[];
  tradeCountChart: readonly ResearchReportChartBar[];
  fillCountChart: readonly ResearchReportChartBar[];
};

export type ResearchReportInputs = {
  inputRoot: string;
  leaderboardPath: string | null;
  leaderboard: StrategyLeaderboard | null;
  strategySummaries: readonly ParsedStrategyAggregateSummary[];
  calibrationReports: readonly ProbabilityCalibrationReport[];
};

export type ResearchReportIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type LoadResearchReportInputsOptions = {
  inputRoot?: string;
  leaderboardPath?: string;
};

export type BuildResearchReportDocumentInput = {
  generatedAt: string;
  inputRoot: string;
  leaderboardPath: string | null;
  inputs: ResearchReportInputs;
};
