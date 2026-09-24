import { parseOfficialNumericString, roundUsdToTwoDecimals } from "./parseOfficialNumericString";
import type {
  CadenceInspection,
  HistoryObservation,
  SettlementMappingSupport,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTimeMs(value: unknown): { raw: string | number | null; timeMs: number | null } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timeMs = value < 1e12 ? value * 1000 : value;
    return { raw: value, timeMs };
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    return { raw: value, timeMs: Number.isFinite(parsed) ? parsed : null };
  }
  return { raw: null, timeMs: null };
}

function readValue(record: Record<string, unknown>): { raw: string | null; value: number | null } {
  const candidate = record.value ?? record.price ?? record.index_value;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return { raw: String(candidate), value: candidate };
  }
  if (typeof candidate === "string") {
    const parsed = parseOfficialNumericString(candidate);
    return {
      raw: candidate,
      value: parsed.kind === "ok" ? parsed.value : null,
    };
  }
  return { raw: null, value: null };
}

export function extractHistoryObservations(body: unknown): HistoryObservation[] {
  const bags: unknown[] = [];
  if (Array.isArray(body)) {
    bags.push(...body);
  } else if (isRecord(body)) {
    const data = isRecord(body.data) ? body.data : body;
    const payload = isRecord(data) && isRecord(data.payload) ? data.payload : data;
    for (const key of ["values", "value", "points", "observations", "payload"]) {
      const candidate = isRecord(payload) ? payload[key] : undefined;
      if (Array.isArray(candidate)) {
        bags.push(...candidate);
      }
    }
    if (isRecord(payload) && (payload.value != null || payload.time != null)) {
      bags.push(payload);
    }
  }

  return bags.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const time = readTimeMs(item.time ?? item.timestamp ?? item.ts ?? item.t);
    const value = readValue(item);
    return [{
      timeRaw: time.raw,
      timeMs: time.timeMs,
      valueRaw: value.raw,
      value: value.value,
    }];
  });
}

export function inspectCadence(observations: readonly HistoryObservation[]): CadenceInspection {
  const timed = observations
    .map((observation) => observation.timeMs)
    .filter((time): time is number => time != null)
    .sort((a, b) => a - b);
  const intervals: number[] = [];
  let outOfOrderCount = 0;
  let duplicateTimeCount = 0;
  for (let index = 1; index < timed.length; index += 1) {
    const delta = timed[index]! - timed[index - 1]!;
    if (delta < 0) {
      outOfOrderCount += 1;
    } else if (delta === 0) {
      duplicateTimeCount += 1;
    } else {
      intervals.push(delta);
    }
  }
  const uniqueSecondBuckets = new Set(
    timed.map((time) => Math.floor(time / 1000)),
  ).size;
  const median = intervals.length === 0
    ? null
    : [...intervals].sort((a, b) => a - b)[Math.floor((intervals.length - 1) / 2)] ?? null;
  return {
    observationCount: observations.length,
    uniqueSecondBuckets,
    medianIntervalMs: median,
    minIntervalMs: intervals.length === 0 ? null : Math.min(...intervals),
    maxIntervalMs: intervals.length === 0 ? null : Math.max(...intervals),
    looksOneHz: median != null && median >= 800 && median <= 1200,
    looksFiveHz: median != null && median >= 150 && median <= 250,
    duplicateTimeCount,
    outOfOrderCount,
    missingTimeCount: observations.length - timed.length,
  };
}

export function classifySettlementMapping(input: {
  observations: readonly HistoryObservation[];
  closeTimeMs: number;
}): { mapping: SettlementMappingSupport; windowObservations: HistoryObservation[] } {
  const startExclusive = input.closeTimeMs - 60_000;
  const windowObservations = input.observations.filter((observation) => {
    return observation.timeMs != null
      && observation.timeMs > startExclusive
      && observation.timeMs <= input.closeTimeMs
      && observation.value != null;
  });
  const secondBuckets = new Set(
    windowObservations
      .map((observation) => Math.floor(observation.timeMs! / 1000)),
  );
  return {
    mapping: {
      supported: false,
      reason: windowObservations.length === 0
        ? "no-observations-in-official-window"
        : "bucket-count-is-not-official-sample-mapping",
      observedWindowCount: windowObservations.length,
      uniqueSecondBuckets: secondBuckets.size,
    },
    windowObservations,
  };
}

export function reconstructOfficialAverageIfSupported(input: {
  observations: readonly HistoryObservation[];
  closeTimeMs: number;
  officialExpirationRaw: string | null;
}): {
  mapping: SettlementMappingSupport;
  reconstructedAverage: string | null;
  officialExpirationParsed: ReturnType<typeof parseOfficialNumericString> | null;
  agreement: "agree" | "disagree" | "not-compared";
} {
  const { mapping, windowObservations } = classifySettlementMapping(input);
  const officialExpirationParsed = input.officialExpirationRaw == null
    ? null
    : parseOfficialNumericString(input.officialExpirationRaw);
  if (!mapping.supported) {
    return {
      mapping,
      reconstructedAverage: null,
      officialExpirationParsed,
      agreement: "not-compared",
    };
  }
  const sum = windowObservations.reduce((total, observation) => total + (observation.value ?? 0), 0);
  const reconstructedAverage = roundUsdToTwoDecimals(sum / windowObservations.length);
  let agreement: "agree" | "disagree" | "not-compared" = "not-compared";
  if (officialExpirationParsed?.kind === "ok") {
    agreement = reconstructedAverage === roundUsdToTwoDecimals(officialExpirationParsed.value)
      ? "agree"
      : "disagree";
  }
  return {
    mapping,
    reconstructedAverage,
    officialExpirationParsed,
    agreement,
  };
}
