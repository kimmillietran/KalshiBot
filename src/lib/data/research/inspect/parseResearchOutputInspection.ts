import { buildStrategySweepDecisionTracePath } from "@/lib/data/research/decisionTrace";
import { parseReplayPricingDiagnosticsFromResearchOutput } from "@/lib/data/research/diagnostics";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  ResearchOutputInspectionError,
  ResearchOutputInspectionErrorCode,
  type InspectResearchOutputDocumentOptions,
  type ResearchOutputFillPreview,
  type ResearchOutputInspectionSummary,
  type ResearchOutputRejectedIntentPreview,
} from "./inspectResearchOutputTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tryParseJsonValue(value: unknown): unknown | null {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value;
}

function toFillPreview(value: unknown): ResearchOutputFillPreview | null {
  if (!isRecord(value)) {
    return null;
  }

  const fillId = readString(value, "fillId");
  const ticker = readString(value, "ticker");
  const side = readString(value, "side");
  const action = readString(value, "action");
  const priceCents = readFiniteNumber(value, "priceCents");
  const quantity = readFiniteNumber(value, "quantity");

  if (!fillId || !ticker || !side || !action || priceCents === null || quantity === null) {
    return null;
  }

  return { fillId, ticker, side, action, priceCents, quantity };
}

function toRejectedIntentPreview(
  value: unknown,
): ResearchOutputRejectedIntentPreview | null {
  if (!isRecord(value)) {
    return null;
  }

  const intentId = readString(value, "intentId");
  const code = readString(value, "code");
  const reason = readString(value, "reason") ?? "";
  const intent = value.intent;

  if (!intentId || !code || !isRecord(intent)) {
    return null;
  }

  const ticker = readString(intent, "ticker");
  const side = readString(intent, "side");
  const action = readString(intent, "action");
  const quantity = readFiniteNumber(intent, "quantity");
  const limitPriceCents = readFiniteNumber(intent, "limitPriceCents");

  if (!ticker || !side || !action || quantity === null || limitPriceCents === null) {
    return null;
  }

  return {
    intentId,
    ticker,
    side,
    action,
    quantity,
    limitPriceCents,
    code,
    reason,
  };
}

function collectFillsAndRejections(backtestResult: Record<string, unknown>): {
  fills: ResearchOutputFillPreview[];
  rejections: ResearchOutputRejectedIntentPreview[];
  missingFields: string[];
} {
  const strategyRun = backtestResult.strategyRun;
  if (!isRecord(strategyRun) || !Array.isArray(strategyRun.steps)) {
    return {
      fills: [],
      rejections: [],
      missingFields: ["backtestResult.strategyRun.steps"],
    };
  }

  const fills: ResearchOutputFillPreview[] = [];
  const rejections: ResearchOutputRejectedIntentPreview[] = [];

  for (const step of strategyRun.steps) {
    if (!isRecord(step)) {
      continue;
    }

    if (Array.isArray(step.acceptedFills)) {
      for (const fill of step.acceptedFills) {
        const preview = toFillPreview(fill);
        if (preview) {
          fills.push(preview);
        }
      }
    }

    if (Array.isArray(step.rejectedIntents)) {
      for (const rejection of step.rejectedIntents) {
        const preview = toRejectedIntentPreview(rejection);
        if (preview) {
          rejections.push(preview);
        }
      }
    }
  }

  return { fills, rejections, missingFields: [] };
}

function readReplayStepCount(backtestResult: Record<string, unknown>): {
  replayStepCount: number | null;
  missingFields: string[];
} {
  const replayResult = tryParseJsonValue(backtestResult.replayResult);
  if (!isRecord(replayResult) || !Array.isArray(replayResult.results)) {
    const nestedReplayResult = backtestResult.replayResult;
    if (isRecord(nestedReplayResult) && Array.isArray(nestedReplayResult.results)) {
      return { replayStepCount: nestedReplayResult.results.length, missingFields: [] };
    }

    return {
      replayStepCount: null,
      missingFields: ["backtestResult.replayResult.results"],
    };
  }

  return { replayStepCount: replayResult.results.length, missingFields: [] };
}

function readMarketTickerFromDataset(dataset: unknown): string | null {
  const parsedDataset = tryParseJsonValue(dataset);
  if (!isRecord(parsedDataset)) {
    return null;
  }

  if (isRecord(parsedDataset.metadata)) {
    const tickers = parsedDataset.metadata.marketTickers;
    if (Array.isArray(tickers) && typeof tickers[0] === "string" && tickers[0].trim()) {
      return tickers[0].trim();
    }
  }

  if (Array.isArray(parsedDataset.snapshots) && isRecord(parsedDataset.snapshots[0])) {
    const snapshot = parsedDataset.snapshots[0];
    const ticker = readString(snapshot, "ticker");
    if (ticker) {
      return ticker;
    }

    if (isRecord(snapshot.marketWindow)) {
      return readString(snapshot.marketWindow, "ticker");
    }
  }

  return null;
}

function inspectFlatDocument(
  parsed: Record<string, unknown>,
  options: InspectResearchOutputDocumentOptions,
): ResearchOutputInspectionSummary {
  const missingFields: string[] = [];
  const marketTicker = readString(parsed, "marketTicker");
  if (!marketTicker) {
    missingFields.push("marketTicker");
  }

  const statusValue = readString(parsed, "status");
  const status =
    statusValue === "completed" || statusValue === "failed" ? statusValue : "unknown";
  if (!statusValue) {
    missingFields.push("status");
  }

  const metrics = isRecord(parsed.metrics) ? parsed.metrics : null;
  if (!metrics && status === "completed") {
    missingFields.push("metrics");
  }

  const inputPath = options.inputPath ?? null;
  const decisionTracePath = inputPath ? buildStrategySweepDecisionTracePath(inputPath) : null;

  return {
    inputPath,
    format: "flat",
    runId: null,
    strategyId: null,
    marketTicker,
    status,
    durationMs: readFiniteNumber(parsed, "durationMs"),
    totalPnlCents: metrics ? readFiniteNumber(metrics, "totalPnlCents") : null,
    netPnlCents: metrics ? readFiniteNumber(metrics, "netPnlCents") : null,
    grossPnlCents: metrics ? readFiniteNumber(metrics, "grossPnlCents") : null,
    tradeCount: metrics ? readFiniteNumber(metrics, "tradeCount") : null,
    totalFills: metrics ? readFiniteNumber(metrics, "tradeCount") : null,
    acceptedFillCount: 0,
    rejectedIntentCount: 0,
    replayStepCount: null,
    diagnostics: parseReplayPricingDiagnosticsFromResearchOutput(JSON.stringify(parsed)),
    diagnosticsWarnings: [],
    firstFill: null,
    lastFill: null,
    firstRejectedIntent: null,
    lastRejectedIntent: null,
    decisionTracePath,
    missingFields,
  };
}

function inspectRunnerDocument(
  parsed: Record<string, unknown>,
  options: InspectResearchOutputDocumentOptions,
): ResearchOutputInspectionSummary {
  const missingFields: string[] = [];
  const metadata = isRecord(parsed.metadata) ? parsed.metadata : null;
  if (!metadata) {
    missingFields.push("metadata");
  }

  const researchRun = tryParseJsonValue(parsed.researchRun);
  if (!isRecord(researchRun)) {
    missingFields.push("researchRun");
  }

  const researchRunRecord = isRecord(researchRun) ? researchRun : null;
  const config = isRecord(researchRunRecord?.config) ? researchRunRecord.config : null;
  const backtestResult = tryParseJsonValue(researchRunRecord?.backtestResult);
  const backtestRecord = isRecord(backtestResult) ? backtestResult : null;
  if (!backtestRecord) {
    missingFields.push("researchRun.backtestResult");
  }

  const runId =
    readString(metadata ?? {}, "runId")
    ?? readString(config ?? {}, "runId");
  if (!runId) {
    missingFields.push("runId");
  }

  const strategyId =
    readString(metadata ?? {}, "strategyId")
    ?? readString(config ?? {}, "strategyId")
    ?? (isRecord(backtestRecord?.metadata)
      ? readString(backtestRecord.metadata, "strategyId")
      : null)
    ?? (isRecord(backtestRecord?.strategyRun)
      ? readString(backtestRecord.strategyRun, "strategyId")
      : null);
  if (!strategyId) {
    missingFields.push("strategyId");
  }

  const marketTicker =
    readMarketTickerFromDataset(parsed.dataset)
    ?? (isRecord(backtestRecord?.metadata)
      ? readString(backtestRecord.metadata, "marketTicker")
      : null);
  if (!marketTicker) {
    missingFields.push("marketTicker");
  }

  const statusValue = readString(parsed, "status");
  const status =
    statusValue === "failed"
      ? "failed"
      : backtestRecord?.metrics
        ? "completed"
        : statusValue === "completed"
          ? "completed"
          : "unknown";

  const metrics = isRecord(backtestRecord?.metrics) ? backtestRecord.metrics : null;
  if (!metrics) {
    missingFields.push("backtestResult.metrics");
  }

  const fillData = backtestRecord
    ? collectFillsAndRejections(backtestRecord)
    : { fills: [], rejections: [], missingFields: ["backtestResult.strategyRun.steps"] };
  missingFields.push(...fillData.missingFields);

  const replayData = backtestRecord
    ? readReplayStepCount(backtestRecord)
    : { replayStepCount: null, missingFields: ["backtestResult.replayResult.results"] };
  missingFields.push(...replayData.missingFields);

  const diagnostics = parseReplayPricingDiagnosticsFromResearchOutput(JSON.stringify(parsed));
  const diagnosticsWarnings = diagnostics?.warningCodes ?? [];

  const inputPath = options.inputPath ?? null;
  const decisionTracePath = inputPath ? buildStrategySweepDecisionTracePath(inputPath) : null;

  return {
    inputPath,
    format: "runner",
    runId,
    strategyId,
    marketTicker,
    status,
    durationMs:
      readFiniteNumber(researchRunRecord ?? {}, "durationMs")
      ?? readFiniteNumber(metadata ?? {}, "durationMs"),
    totalPnlCents: metrics ? readFiniteNumber(metrics, "totalPnlCents") : null,
    netPnlCents: metrics ? readFiniteNumber(metrics, "netPnlCents") : null,
    grossPnlCents: metrics ? readFiniteNumber(metrics, "grossPnlCents") : null,
    tradeCount: metrics ? readFiniteNumber(metrics, "tradeCount") : null,
    totalFills: fillData.fills.length > 0 ? fillData.fills.length : null,
    acceptedFillCount: fillData.fills.length,
    rejectedIntentCount: fillData.rejections.length,
    replayStepCount: replayData.replayStepCount,
    diagnostics,
    diagnosticsWarnings,
    firstFill: fillData.fills[0] ?? null,
    lastFill: fillData.fills[fillData.fills.length - 1] ?? null,
    firstRejectedIntent: fillData.rejections[0] ?? null,
    lastRejectedIntent: fillData.rejections[fillData.rejections.length - 1] ?? null,
    decisionTracePath,
    missingFields: [...new Set(missingFields)],
  };
}

/** Parses a research-output.json document into a compact inspection summary. */
export function inspectResearchOutputDocument(
  json: string,
  options: InspectResearchOutputDocumentOptions = {},
): ResearchOutputInspectionSummary {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ResearchOutputInspectionError(
      "research-output.json contains invalid JSON",
      ResearchOutputInspectionErrorCode.INVALID_JSON,
    );
  }

  if (!isRecord(parsed)) {
    throw new ResearchOutputInspectionError(
      "research-output.json must be a plain object",
      ResearchOutputInspectionErrorCode.INVALID_DOCUMENT,
    );
  }

  if ("dataset" in parsed && "researchRun" in parsed) {
    return inspectRunnerDocument(parsed, options);
  }

  return inspectFlatDocument(parsed, options);
}

/** Serializes one or more inspection summaries deterministically. */
export function serializeResearchOutputInspectionSummaries(
  summaries:
    | ResearchOutputInspectionSummary
    | readonly ResearchOutputInspectionSummary[],
): string {
  return stableStringify(summaries);
}

export function serializeResearchOutputInspectionSummary(
  summary: ResearchOutputInspectionSummary,
): string {
  return serializeResearchOutputInspectionSummaries(summary);
}
