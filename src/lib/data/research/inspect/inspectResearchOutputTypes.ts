import type { ReplayPricingDiagnosticsRunSummary } from "@/lib/data/research/diagnostics";

export const ResearchOutputInspectionErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
} as const;

export type ResearchOutputInspectionErrorCode =
  (typeof ResearchOutputInspectionErrorCode)[keyof typeof ResearchOutputInspectionErrorCode];

export class ResearchOutputInspectionError extends Error {
  readonly code: ResearchOutputInspectionErrorCode;

  constructor(message: string, code: ResearchOutputInspectionErrorCode) {
    super(message);
    this.name = "ResearchOutputInspectionError";
    this.code = code;
  }
}

export type ResearchOutputInspectionFormat = "runner" | "flat";

export type ResearchOutputFillPreview = {
  fillId: string;
  ticker: string;
  side: string;
  action: string;
  priceCents: number;
  quantity: number;
};

export type ResearchOutputRejectedIntentPreview = {
  intentId: string;
  ticker: string;
  side: string;
  action: string;
  quantity: number;
  limitPriceCents: number;
  code: string;
  reason: string;
};

export type ResearchOutputInspectionSummary = {
  inputPath: string | null;
  format: ResearchOutputInspectionFormat;
  runId: string | null;
  strategyId: string | null;
  marketTicker: string | null;
  status: "completed" | "failed" | "unknown";
  durationMs: number | null;
  totalPnlCents: number | null;
  netPnlCents: number | null;
  grossPnlCents: number | null;
  tradeCount: number | null;
  totalFills: number | null;
  acceptedFillCount: number;
  rejectedIntentCount: number;
  replayStepCount: number | null;
  diagnostics: ReplayPricingDiagnosticsRunSummary | null;
  diagnosticsWarnings: readonly string[];
  firstFill: ResearchOutputFillPreview | null;
  lastFill: ResearchOutputFillPreview | null;
  firstRejectedIntent: ResearchOutputRejectedIntentPreview | null;
  lastRejectedIntent: ResearchOutputRejectedIntentPreview | null;
  decisionTracePath: string | null;
  missingFields: readonly string[];
};

export type InspectResearchOutputDocumentOptions = {
  inputPath?: string;
};

export type DiscoverResearchOutputPathsOptions = {
  strategyId?: string;
  limit?: number;
};

export type ResearchOutputInspectionIo = {
  readdir: (path: string) => readonly string[];
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
