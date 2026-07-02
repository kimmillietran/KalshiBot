export const EVENT_STUDY_FILENAME = "event-study.json";
export const DEFAULT_EVENT_STUDY_INPUT_DIR = "data/research-results";
export const DEFAULT_EVENT_STUDY_OUTPUT_PATH =
  "data/research-results/event-study.json";
export const DEFAULT_EVENTS_FILE_PATH = "data/events/events.json";

export const DEFAULT_EVENT_BEFORE_WINDOW_MS = 15 * 60 * 1_000;
export const DEFAULT_EVENT_DURING_WINDOW_MS = 5 * 60 * 1_000;
export const DEFAULT_EVENT_AFTER_WINDOW_MS = 15 * 60 * 1_000;

export const EventStudyErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  INVALID_EVENTS: "invalid-events",
  MISSING_EVENTS_FILE: "missing-events-file",
} as const;

export type EventStudyErrorCode =
  (typeof EventStudyErrorCode)[keyof typeof EventStudyErrorCode];

export class EventStudyError extends Error {
  readonly code: EventStudyErrorCode;

  constructor(message: string, code: EventStudyErrorCode) {
    super(message);
    this.name = "EventStudyError";
    this.code = code;
  }
}

export type EventStudyWindowName = "before" | "during" | "after";

export type EventDefinition = {
  eventId: string;
  timestamp: string;
  type: string;
  timestampMs: number;
};

export type EventStudyWindowConfig = {
  beforeWindowMs: number;
  duringWindowMs: number;
  afterWindowMs: number;
};

export type EventStudyStepPoint = {
  stepIndex: number;
  timestampMs: number;
  impliedProbability: number;
  maxSpreadPercent: number | null;
  annualizedVolatility: number | null;
  observedOutcome: 0 | 1 | null;
};

export type EventStudyMarketData = {
  joinKey: string;
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  marketOpenMs: number | null;
  marketCloseMs: number | null;
  totalPnlCents: number | null;
  steps: readonly EventStudyStepPoint[];
};

export type EventStudyMarketWindowResult = {
  joinKey: string;
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  stepCount: number;
  totalPnlCents: number | null;
  averageSpreadPercent: number | null;
  averageRealizedVolatilityAnnualized: number | null;
  brierScore: number | null;
  calibrationError: number | null;
};

export type EventStudyWindowMetrics = {
  window: EventStudyWindowName;
  marketCount: number;
  observationCount: number;
  averageSpreadPercent: number | null;
  averageRealizedVolatilityAnnualized: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  totalPnlCents: number;
  averagePnlCents: number | null;
  markets: readonly EventStudyMarketWindowResult[];
};

export type EventStudyShiftMetrics = {
  volatilityShift: number | null;
  spreadShift: number | null;
  calibrationShift: number | null;
  pnlShiftCents: number | null;
};

export type EventStudyEventResult = {
  eventId: string;
  type: string;
  timestamp: string;
  timestampMs: number;
  overlappingMarketCount: number;
  windows: readonly EventStudyWindowMetrics[];
  shifts: {
    beforeToDuring: EventStudyShiftMetrics;
    duringToAfter: EventStudyShiftMetrics;
    beforeToAfter: EventStudyShiftMetrics;
  };
};

export type EventStudySampleCounts = {
  eventCount: number;
  scannedMarketCount: number;
  analyzedMarketCount: number;
  skippedMarkets: number;
};

export type EventStudyWarning = {
  code: string;
  message: string;
  eventId?: string;
  marketTicker?: string;
};

export type EventStudyReport = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  eventsPath: string;
  windowConfig: EventStudyWindowConfig;
  sampleCounts: EventStudySampleCounts;
  events: readonly EventStudyEventResult[];
  warnings: readonly EventStudyWarning[];
};

export type BuildEventStudyReportInput = {
  inputRoot: string;
  outputPath: string;
  eventsPath: string;
  generatedAt: string;
  events: readonly EventDefinition[];
  windowConfig?: Partial<EventStudyWindowConfig>;
  scanned: readonly import("@/lib/data/research/calibration/calibrationTypes").ScannedCalibrationResearchOutput[];
};

export type EventStudyIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
