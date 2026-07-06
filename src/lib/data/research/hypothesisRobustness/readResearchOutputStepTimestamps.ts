function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Reads replay step timestamps from a serialized research output payload. */
export function readResearchOutputStepTimestamps(outputJson: string): Map<number, number> {
  const timestamps = new Map<number, number>();

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputJson);
  } catch {
    return timestamps;
  }

  if (!isRecord(parsed)) {
    return timestamps;
  }

  try {
    const researchRun = parseJsonValue(parsed.researchRun);
    if (!isRecord(researchRun)) {
      return timestamps;
    }

    const backtestResult = parseJsonValue(researchRun.backtestResult);
    if (!isRecord(backtestResult)) {
      return timestamps;
    }

    const replayResult = backtestResult.replayResult;
    const replay = isRecord(replayResult)
      ? replayResult
      : parseJsonValue(replayResult);

    if (!isRecord(replay) || !Array.isArray(replay.results)) {
      return timestamps;
    }

    replay.results.forEach((step, stepIndex) => {
      if (!isRecord(step) || !isRecord(step.engineInput)) {
        return;
      }

      const evaluatedAt = readString(step.engineInput, "evaluatedAt");
      if (!evaluatedAt) {
        return;
      }

      const timestampMs = Date.parse(evaluatedAt);
      if (Number.isFinite(timestampMs)) {
        timestamps.set(stepIndex, timestampMs);
      }
    });
  } catch {
    return timestamps;
  }

  return timestamps;
}

function toTradingDayUtc(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function toCalendarMonth(timestampMs: number): string {
  const date = new Date(timestampMs);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

function toCalendarQuarter(timestampMs: number): string {
  const date = new Date(timestampMs);
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

export function enrichObservationTimestamps(timestampMs: number | null): {
  tradingDayUtc: string | null;
  calendarMonth: string | null;
  calendarQuarter: string | null;
} {
  if (timestampMs === null) {
    return {
      tradingDayUtc: null,
      calendarMonth: null,
      calendarQuarter: null,
    };
  }

  return {
    tradingDayUtc: toTradingDayUtc(timestampMs),
    calendarMonth: toCalendarMonth(timestampMs),
    calendarQuarter: toCalendarQuarter(timestampMs),
  };
}
