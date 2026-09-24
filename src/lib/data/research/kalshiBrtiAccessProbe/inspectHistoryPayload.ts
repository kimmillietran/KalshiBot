import { parseOfficialNumericString, roundUsdToTwoDecimals } from "./parseOfficialNumericString";
import type {
  CadenceInspection,
  HistoryObservation,
  SettlementMappingSupport,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTimeMs(value: unknown): { raw: string | number | null; timeMs: number | null } {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timeMs = value < 1e10
      ? value * 1000
      : value >= 1e14
        ? value / 1000
        : value;
    return { raw: value, timeMs };
  }
  if (typeof value === "string" && value.trim() !== "") {
    if (/^\d+(\.\d+)?$/.test(value.trim())) {
      return readTimeMs(Number(value));
    }
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
    for (const key of ["values", "value", "points", "observations", "payload", "history", "ticks", "series", "results", "records"]) {
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
    const time = readTimeMs(
      item.time ?? item.timestamp ?? item.ts ?? item.t ?? item.time_ms ?? item.timestamp_ms,
    );
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

export type HistoryPayloadKind =
  | "valid-empty-history"
  | "observations-present"
  | "observations-unrecognized"
  | "response-error-in-200"
  | "unsupported-schema"
  | "ambiguous-schema"
  | "out-of-hour-only"
  | "not-attempted";

export type HistoryPayloadInspection = {
  kind: HistoryPayloadKind;
  topLevelKeys: string[];
  recognizedContainers: string[];
  arrayLengths: Record<string, number>;
  returnedCandidateCount: number;
  parsedObservationCount: number;
  rejectedObservationCount: number;
  inHourCount: number;
  outOfHourCount: number;
  untimedCount: number;
  settlementMinuteCount: number;
  responseError: string | null;
  note: string;
  indexId: string | null;
};

const RECOGNIZED_CONTAINER_KEYS = [
  "values",
  "value",
  "points",
  "observations",
  "payload",
  "history",
  "ticks",
  "series",
  "results",
  "records",
] as const;

function topLevelKeys(body: unknown): string[] {
  return isRecord(body) ? Object.keys(body) : [];
}

function readIndexId(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const data = isRecord(body.data) ? body.data : body;
  const payload = isRecord(data.payload) ? data.payload : data;
  for (const candidate of [payload.id, payload.index_id, data.id, body.id]) {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate;
    }
  }
  return null;
}

function readResponseError(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const record = isRecord(body.data) ? { ...body, ...body.data } : body;
  const error = record.error ?? record.errors;
  if (error == null || error === "" || error === 0 || error === "0") {
    if (typeof record.message === "string" && record.message.trim() !== "" && record.values == null && record.payload == null) {
      return record.message;
    }
    return null;
  }
  if (typeof error === "number") {
    return String(error);
  }
  if (typeof error === "string") {
    return error;
  }
  if (Array.isArray(error)) {
    return error.length === 0 ? null : JSON.stringify(error);
  }
  if (isRecord(error)) {
    const message = typeof error.message === "string" ? error.message : null;
    const code = error.code != null ? String(error.code) : null;
    return [code, message].filter(Boolean).join(": ") || JSON.stringify(error);
  }
  return String(error);
}

function collectRecognizedContainers(body: unknown): Array<{ path: string; items: unknown[] }> {
  const found: Array<{ path: string; items: unknown[] }> = [];
  if (Array.isArray(body)) {
    found.push({ path: "root", items: body });
    return found;
  }
  if (!isRecord(body)) {
    return found;
  }
  const data = isRecord(body.data) ? body.data : body;
  const roots: Array<{ path: string; value: unknown }> = [
    { path: "", value: body },
    { path: "data", value: data },
  ];
  if (isRecord(data) && data.payload !== undefined) {
    roots.push({ path: "data.payload", value: data.payload });
  }
  if (isRecord(body) && body.payload !== undefined && body.payload !== data) {
    roots.push({ path: "payload", value: body.payload });
  }
  for (const root of roots) {
    if (Array.isArray(root.value)) {
      found.push({ path: root.path || "root", items: root.value });
      continue;
    }
    if (!isRecord(root.value)) {
      continue;
    }
    for (const key of RECOGNIZED_CONTAINER_KEYS) {
      const candidate = root.value[key];
      if (Array.isArray(candidate)) {
        const path = root.path ? `${root.path}.${key}` : key;
        found.push({ path, items: candidate });
      }
    }
  }
  const unique = new Map<string, unknown[]>();
  for (const item of found) {
    unique.set(item.path, item.items);
  }
  return [...unique.entries()].map(([path, items]) => ({ path, items }));
}

function looksLikeObservationRecord(item: unknown): boolean {
  if (!isRecord(item)) {
    return false;
  }
  return item.time != null
    || item.timestamp != null
    || item.ts != null
    || item.t != null
    || item.time_ms != null
    || item.timestamp_ms != null
    || item.value != null
    || item.price != null
    || item.index_value != null;
}

export function inspectHistoryPayload(input: {
  body: unknown;
  hourStartMs: number;
  hourEndExclusiveMs: number;
  closeTimeMs: number | null;
}): HistoryPayloadInspection {
  const containers = collectRecognizedContainers(input.body);
  const arrayLengths = Object.fromEntries(
    containers.map((container) => [container.path, container.items.length]),
  );
  const observations = extractHistoryObservations(input.body);
  const parsed = observations.filter((item) => item.timeMs != null && item.value != null);
  const rejected = observations.filter((item) => item.timeMs == null || item.value == null);
  const inHour = parsed.filter((item) => (
    item.timeMs! >= input.hourStartMs && item.timeMs! < input.hourEndExclusiveMs
  ));
  const outOfHour = parsed.filter((item) => (
    item.timeMs! < input.hourStartMs || item.timeMs! >= input.hourEndExclusiveMs
  ));
  const settlementMinuteCount = input.closeTimeMs == null
    ? 0
    : parsed.filter((item) => (
      item.timeMs! > input.closeTimeMs! - 60_000 && item.timeMs! <= input.closeTimeMs!
    )).length;
  const responseError = readResponseError(input.body);
  const recognizedContainers = containers.map((container) => container.path);
  const returnedCandidateCount = containers.reduce((sum, container) => sum + container.items.length, 0);
  const unrecognizedItems = containers.some((container) => (
    container.items.length > 0 && !container.items.some(looksLikeObservationRecord)
  ));
  const indexId = readIndexId(input.body);
  const base = {
    topLevelKeys: topLevelKeys(input.body),
    recognizedContainers,
    arrayLengths,
    returnedCandidateCount,
    parsedObservationCount: parsed.length,
    rejectedObservationCount: rejected.length,
    inHourCount: inHour.length,
    outOfHourCount: outOfHour.length,
    untimedCount: observations.filter((item) => item.timeMs == null).length,
    settlementMinuteCount,
    responseError,
    indexId,
  };

  if (responseError != null && parsed.length === 0) {
    return {
      ...base,
      kind: "response-error-in-200",
      note: `HTTP 200 contains a response-level error: ${responseError}`,
    };
  }
  if (recognizedContainers.length === 0) {
    return {
      ...base,
      kind: "unsupported-schema",
      note: "no recognized historical-value containers; zero extracted observations is not treated as empty provider history",
    };
  }
  if (returnedCandidateCount === 0) {
    return {
      ...base,
      kind: "valid-empty-history",
      note: "recognized historical-value container is present and empty",
    };
  }
  if (parsed.length === 0 && unrecognizedItems) {
    return {
      ...base,
      kind: "observations-unrecognized",
      note: "recognized container has items that are not parseable time/value observations",
    };
  }
  if (parsed.length === 0) {
    return {
      ...base,
      kind: "ambiguous-schema",
      note: "recognized container has items but no parseable timestamps and values",
    };
  }
  if (inHour.length === 0) {
    return {
      ...base,
      kind: "out-of-hour-only",
      note: "observations were parsed but none fall inside the requested hour",
    };
  }
  return {
    ...base,
    kind: "observations-present",
    note: "coverage is only the observations actually returned for this one hour",
  };
}
