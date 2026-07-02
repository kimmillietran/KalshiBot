import {
  CalibrationError,
  CalibrationErrorCode,
  type ParsedCalibrationResearchDocument,
} from "./calibrationTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string, marketTicker?: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new CalibrationError(
        `${label} contains invalid JSON`,
        CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
        marketTicker,
      );
    }
  }

  return value;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function midProbability(yesBidCents: number, yesAskCents: number): number {
  return (yesBidCents + yesAskCents) / 2 / 100;
}

function readSettlementOutcome(value: unknown): 0 | 1 | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.result === "yes") {
    return 1;
  }

  if (value.result === "no") {
    return 0;
  }

  return null;
}

function extractKalshiProbabilities(snapshot: Record<string, unknown>): number[] {
  const candles = snapshot.kalshiCandles;
  if (!Array.isArray(candles)) {
    return [];
  }

  const probabilities: number[] = [];

  for (const candle of candles) {
    if (!isRecord(candle)) {
      continue;
    }

    const yesBidCents = readFiniteNumber(candle, "yesBidCents");
    const yesAskCents = readFiniteNumber(candle, "yesAskCents");
    if (yesBidCents === undefined || yesAskCents === undefined) {
      continue;
    }

    probabilities.push(midProbability(yesBidCents, yesAskCents));
  }

  return probabilities;
}

function extractStrategyProbabilities(backtestResult: Record<string, unknown>): number[] {
  const replayResult = parseJsonValue(backtestResult.replayResult, "replayResult");
  if (!isRecord(replayResult) || !Array.isArray(replayResult.results)) {
    return [];
  }

  const probabilities: number[] = [];

  for (const step of replayResult.results) {
    if (!isRecord(step) || !isRecord(step.engineOutput)) {
      continue;
    }

    const probability = step.engineOutput.probability;
    if (!isRecord(probability)) {
      continue;
    }

    const probabilityUp = readFiniteNumber(probability, "probabilityUp");
    if (probabilityUp !== undefined) {
      probabilities.push(probabilityUp);
    }
  }

  return probabilities;
}

/** Parses a runner-format research output into calibration inputs. */
export function parseCalibrationResearchDocument(
  json: string,
  outputPath: string,
  pathContext?: {
    strategyId?: string;
    seriesTicker?: string;
    marketTicker?: string;
  },
): ParsedCalibrationResearchDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new CalibrationError(
      "research-output.json contains invalid JSON",
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      pathContext?.marketTicker,
    );
  }

  if (!isRecord(parsed) || !("dataset" in parsed) || !("researchRun" in parsed)) {
    throw new CalibrationError(
      "research-output.json must use runner format with dataset and researchRun",
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      pathContext?.marketTicker,
    );
  }

  const metadata = parsed.metadata;
  if (!isRecord(metadata)) {
    throw new CalibrationError(
      "research-output.json metadata must be a plain object",
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      pathContext?.marketTicker,
    );
  }

  const researchRun = parseJsonValue(
    parsed.researchRun,
    "researchRun",
    pathContext?.marketTicker,
  );
  if (!isRecord(researchRun)) {
    throw new CalibrationError(
      "researchRun must be a plain object",
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      pathContext?.marketTicker,
    );
  }

  const dataset = parseJsonValue(parsed.dataset, "dataset", pathContext?.marketTicker);
  if (!isRecord(dataset) || !Array.isArray(dataset.snapshots) || dataset.snapshots.length === 0) {
    throw new CalibrationError(
      "dataset.snapshots must contain at least one snapshot",
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      pathContext?.marketTicker,
    );
  }

  const snapshot = dataset.snapshots[0];
  if (!isRecord(snapshot)) {
    throw new CalibrationError(
      "dataset snapshot must be a plain object",
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      pathContext?.marketTicker,
    );
  }

  const marketWindow = isRecord(snapshot.marketWindow) ? snapshot.marketWindow : null;
  const marketTicker =
    (typeof snapshot.ticker === "string" ? snapshot.ticker.trim() : "")
    || pathContext?.marketTicker?.trim()
    || (marketWindow && typeof marketWindow.ticker === "string"
      ? marketWindow.ticker.trim()
      : "");

  if (!marketTicker) {
    throw new CalibrationError(
      "Unable to resolve marketTicker from research output",
      CalibrationErrorCode.INVALID_OUTPUT_SCHEMA,
      pathContext?.marketTicker,
    );
  }

  const seriesTicker =
    pathContext?.seriesTicker?.trim()
    || (marketWindow && typeof marketWindow.seriesTicker === "string"
      ? marketWindow.seriesTicker.trim()
      : "")
    || marketTicker.split("-")[0]
    || marketTicker;

  const strategyId =
    pathContext?.strategyId?.trim()
    || (typeof metadata.strategyId === "string" ? metadata.strategyId.trim() : "")
    || (isRecord(researchRun.config) && typeof researchRun.config.strategyId === "string"
      ? researchRun.config.strategyId.trim()
      : "")
    || "unknown";

  const settlementOutcome = readSettlementOutcome(snapshot.settlement);
  const kalshiImpliedProbabilities = extractKalshiProbabilities(snapshot);

  const backtestResult = parseJsonValue(
    researchRun.backtestResult,
    "backtestResult",
    marketTicker,
  );
  const strategyFairValueProbabilities = isRecord(backtestResult)
    ? extractStrategyProbabilities(backtestResult)
    : [];

  return {
    strategyId,
    seriesTicker,
    marketTicker,
    settlementOutcome,
    kalshiImpliedProbabilities,
    strategyFairValueProbabilities,
  };
}
