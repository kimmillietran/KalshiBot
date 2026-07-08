export const PNL_FORENSICS_GATE_FILENAME = "pnl-forensics-gate.json";
export const DEFAULT_PNL_FORENSICS_GATE_OUTPUT_PATH =
  "data/research-results/pnl-forensics-gate.json";
export const DEFAULT_PNL_FORENSICS_GATE_HTML_OUTPUT_PATH =
  "data/reports/pnl-forensics-gate.html";

export const DEFAULT_PNL_FORENSICS_TRADE_REPLAY_PATH =
  "data/research-results/hypothesis-trade-replay.json";

export const PnlForensicsGateErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
} as const;

export type PnlForensicsGateErrorCode =
  (typeof PnlForensicsGateErrorCode)[keyof typeof PnlForensicsGateErrorCode];

export class PnlForensicsGateError extends Error {
  readonly code: PnlForensicsGateErrorCode;

  constructor(message: string, code: PnlForensicsGateErrorCode) {
    super(message);
    this.name = "PnlForensicsGateError";
    this.code = code;
  }
}

export type PnlForensicsSideBucket =
  | "yes-buys"
  | "no-buys"
  | "calibration-yes-fade"
  | "calibration-no-fade";

export type PnlForensicsHypothesisVerdict =
  | "passes-forensics"
  | "warning-concentrated-side"
  | "warning-concentrated-day"
  | "warning-concentrated-month"
  | "warning-concentrated-market"
  | "warning-repeated-entry-driven"
  | "warning-regime-concentrated"
  | "fails-forensics"
  | "insufficient-data";

export type PnlForensicsFamilyVerdict =
  | "proceed-to-trade-pnl-oos"
  | "pause-family-concentrated-pnl"
  | "collect-more-data"
  | "insufficient-data";

export const PNL_FORENSICS_RECOMMENDED_NEXT_ACTIONS = [
  "proceed-to-full-m12-oos",
  "investigate-derived-month-pnl",
  "rerun-official-only",
  "rerun-excluding-derived-month",
  "collect-more-official-months",
  "do-not-start-full-m12-yet",
  "tighten-position-model",
] as const;

export type PnlForensicsRecommendedNextAction =
  (typeof PNL_FORENSICS_RECOMMENDED_NEXT_ACTIONS)[number];

export type PnlForensicsGateConfig = {
  topDayMaxShareOfPositivePnl: number;
  top3DayMaxShareOfPositivePnl: number;
  topMarketMaxShareOfTotalPnl: number;
  topMonthMaxShareOfTotalPnl: number;
  maxSideShareOfPositivePnl: number;
  minPositiveCalendarMonths: number;
  minPositiveTradingDays: number;
  repeatedEntryTradesPerMarketWarning: number;
  minFilledTradesForAnalysis: number;
};

export type PnlForensicsGateInputPaths = {
  hypothesisTradeReplayPath: string;
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  oosPowerCorrectionPath: string;
  calibrationFadeFamilyVerdictPath: string;
  regimeTagsPath: string;
  monthRegimeAnalysisPath: string;
};

export type PnlForensicsGateInputStatus = {
  hypothesisTradeReplayPresent: boolean;
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  oosPowerCorrectionPresent: boolean;
  calibrationFadeFamilyVerdictPresent: boolean;
  regimeTagsPresent: boolean;
  monthRegimeAnalysisPresent: boolean;
};

export type PnlForensicsFilledTrade = {
  hypothesisId: string;
  suggestedStrategyFamily: string | null;
  sideBucket: PnlForensicsSideBucket;
  contractSide: "yes" | "no";
  marketTicker: string;
  marketId: string;
  tradingDayUtc: string | null;
  calendarMonth: string | null;
  grossPnlCents: number;
  netPnlCents: number;
  entryPriceCents: number;
  feeCents: number;
  volatilityRegime: string | null;
  trendRegime: string | null;
  marketState: string | null;
};

export type PnlForensicsAggregationMetrics = {
  netPnlCents: number;
  grossPnlCents: number;
  filledTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  averagePnlPerTradeCents: number | null;
  averagePnlPerMarketCents: number | null;
  averagePnlPerMarketDayCents: number | null;
  shareOfFamilyPnl: number | null;
};

export type PnlForensicsSideBreakdownEntry = PnlForensicsAggregationMetrics & {
  sideBucket: PnlForensicsSideBucket;
  dominatesFamilyPnl: boolean;
};

export type PnlForensicsDailyPnlEntry = {
  date: string;
  netPnlCents: number;
  grossPnlCents: number;
  filledTradeCount: number;
  uniqueMarketCount: number;
  hypothesisIds: readonly string[];
  sides: readonly PnlForensicsSideBucket[];
  cumulativeNetPnlCents: number;
};

export type PnlForensicsDailyConcentration = {
  positiveDayCount: number;
  negativeDayCount: number;
  zeroDayCount: number;
  topDayNetPnlCents: number | null;
  topDayShareOfTotalPositivePnl: number | null;
  top3DayShareOfTotalPositivePnl: number | null;
  largestLosingDayCents: number | null;
  dailyWinRate: number | null;
  dailyMeanNetPnlCents: number | null;
  dailyMedianNetPnlCents: number | null;
  dailyStdDevNetPnlCents: number | null;
};

export type PnlForensicsMonthlyPnlEntry = {
  calendarMonth: string;
  netPnlCents: number;
  grossPnlCents: number;
  filledTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  hypothesisIds: readonly string[];
  sides: readonly PnlForensicsSideBucket[];
  shareOfTotalPnl: number | null;
  dominatesTotalPnl: boolean;
};

export type PnlForensicsMarketConcentrationEntry = {
  marketId: string;
  marketTicker: string;
  netPnlCents: number;
  grossPnlCents: number;
  filledTradeCount: number;
  hypothesisIds: readonly string[];
  sides: readonly PnlForensicsSideBucket[];
  tradingDays: readonly string[];
  shareOfTotalPnl: number | null;
};

export type PnlForensicsMarketConcentrationSummary = {
  topMarketShareOfTotalPnl: number | null;
  top5MarketShareOfTotalPnl: number | null;
  maxTradesPerMarket: number;
  averageTradesPerMarket: number | null;
  marketCount: number;
  positiveMarketCount: number;
  negativeMarketCount: number;
};

export type PnlForensicsRegimeBreakdownEntry = {
  volatilityRegime: string | null;
  trendRegime: string | null;
  marketState: string | null;
  netPnlCents: number;
  grossPnlCents: number;
  filledTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  shareOfTotalPnl: number | null;
};

export type PnlForensicsHypothesisReport = {
  hypothesisId: string;
  family: string | null;
  netPnlCents: number;
  grossPnlCents: number;
  filledTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  positiveDayCount: number;
  negativeDayCount: number;
  topDayShare: number | null;
  topMarketShare: number | null;
  sideBreakdown: readonly PnlForensicsSideBreakdownEntry[];
  monthBreakdown: readonly PnlForensicsMonthlyPnlEntry[];
  forensicsVerdict: PnlForensicsHypothesisVerdict;
  warnings: readonly string[];
};

export type PnlForensicsGateSummary = {
  replayedHypothesisCount: number;
  positiveNetHypothesisCount: number;
  filledTradeCount: number;
  stepLevelFilledTradeCount: number;
  uniqueMarketCount: number;
  uniqueTradingDayCount: number;
  familyNetPnlCents: number;
  familyGrossPnlCents: number;
  marketLevelNetPnlCents: number;
  dayLevelNetPnlCents: number;
  familyForensicsVerdict: PnlForensicsFamilyVerdict;
  recommendFullM12: boolean;
  recommendedNextAction: PnlForensicsRecommendedNextAction;
  topMonthShareOfTotalPnl: number | null;
  dominantCalendarMonth: string | null;
  derivedSettlementMonthWarning: string | null;
  regimeBreakdownAvailable: boolean;
  topConcentrationRisks: readonly string[];
};

export type PnlForensicsGateReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: PnlForensicsGateConfig;
  inputPaths: PnlForensicsGateInputPaths;
  inputStatus: PnlForensicsGateInputStatus;
  tradeReplaySummary: {
    filledTradeCount: number;
    positiveNetHypothesisCount: number;
    replayedHypothesisCount: number;
  } | null;
  summary: PnlForensicsGateSummary;
  sideBreakdown: readonly PnlForensicsSideBreakdownEntry[];
  dailyPnl: readonly PnlForensicsDailyPnlEntry[];
  dailyConcentration: PnlForensicsDailyConcentration;
  monthlyPnl: readonly PnlForensicsMonthlyPnlEntry[];
  marketConcentration: readonly PnlForensicsMarketConcentrationEntry[];
  marketConcentrationSummary: PnlForensicsMarketConcentrationSummary;
  regimeBreakdown: readonly PnlForensicsRegimeBreakdownEntry[];
  hypotheses: readonly PnlForensicsHypothesisReport[];
  warnings: readonly string[];
};

export type PnlForensicsGateIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};
