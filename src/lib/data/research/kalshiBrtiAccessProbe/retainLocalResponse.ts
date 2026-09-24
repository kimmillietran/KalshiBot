import { join } from "node:path";

import { DOCUMENTED_HISTORY_TIMESPAN } from "./historicalSemantics";
import type { ProbeIo } from "./runKalshiBrtiAccessProbe";
import { BRTI_INDEX_ID, CFB_HISTORY_SIGN_PATH, type SignedGetResult } from "./types";

const SENSITIVE_HEADER = /authorization|cookie|set-cookie|kalshi-access|x-api-key|private-key|begin private|api[_-]?key/i;
const RESPONSE_HEADER_ALLOWLIST = new Set(["content-type", "content-length", "date"]);

export const RETAINED_HISTORY_RESPONSE_NAME = "historical-brti-hour" as const;

export type RetainedHttpResponse = {
  capturedAtUtc: string;
  name: string;
  url: string;
  signPath: string;
  status: number;
  category: string;
  bodyTextHash: string;
  body: unknown;
  responseHeaders: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeResponseHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADER.test(key) || SENSITIVE_HEADER.test(value)) {
      continue;
    }
    if (RESPONSE_HEADER_ALLOWLIST.has(key.toLowerCase())) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function retainedResponsePath(rawDir: string, name: string = RETAINED_HISTORY_RESPONSE_NAME): string {
  return join(rawDir, "responses", `${name}.json`);
}

export function loadRetainedHttpResponse(input: {
  rawDir: string;
  readFile?: (path: string) => string | null;
  expectedHash?: string;
  name?: string;
}): RetainedHttpResponse | null {
  if (!input.readFile) {
    return null;
  }
  const raw = input.readFile(retainedResponsePath(input.rawDir, input.name));
  if (raw == null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.bodyTextHash !== "string") {
    return null;
  }
  if (input.expectedHash != null && parsed.bodyTextHash !== input.expectedHash) {
    return null;
  }
  return parsed as RetainedHttpResponse;
}

function sameUtcInstant(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

export function retainedHistoryMatchesBoundRequest(input: {
  retained: RetainedHttpResponse;
  hourStartUtc: string;
  expectedHash?: string;
}): { matches: boolean; reason: string | null } {
  if (input.retained.signPath !== CFB_HISTORY_SIGN_PATH) {
    return { matches: false, reason: "retained-sign-path-mismatch" };
  }
  let parsed: URL;
  try {
    parsed = new URL(input.retained.url);
  } catch {
    return { matches: false, reason: "retained-url-unparseable" };
  }
  if (parsed.searchParams.get("id") !== BRTI_INDEX_ID) {
    return { matches: false, reason: "retained-index-mismatch" };
  }
  if (parsed.searchParams.get("timespan") !== DOCUMENTED_HISTORY_TIMESPAN) {
    return { matches: false, reason: "retained-timespan-mismatch" };
  }
  const timestamp = parsed.searchParams.get("timestamp");
  if (timestamp == null || !sameUtcInstant(timestamp, input.hourStartUtc)) {
    return { matches: false, reason: "retained-hour-mismatch" };
  }
  if (input.expectedHash != null && input.retained.bodyTextHash !== input.expectedHash) {
    return { matches: false, reason: "retained-hash-mismatch" };
  }
  return { matches: true, reason: null };
}

export function retainLocalHttpResponse(input: {
  io: ProbeIo;
  rawDir: string;
  name: string;
  result: SignedGetResult;
  capturedAtUtc: string;
  responseHeaders?: Record<string, string>;
}): RetainedHttpResponse {
  const record: RetainedHttpResponse = {
    capturedAtUtc: input.capturedAtUtc,
    name: input.name,
    url: input.result.url,
    signPath: input.result.signPath,
    status: input.result.status,
    category: input.result.category,
    bodyTextHash: input.result.bodyTextHash,
    body: input.result.body,
    responseHeaders: sanitizeResponseHeaders(input.responseHeaders),
  };
  const serialized = `${JSON.stringify(record, null, 2)}\n`;
  if (SENSITIVE_HEADER.test(serialized)) {
    throw new Error("retained-response-refuses-secrets");
  }
  input.io.mkdir(join(input.rawDir, "responses"));
  input.io.writeFile(retainedResponsePath(input.rawDir, input.name), serialized);
  return record;
}

export function buildSanitizedSchemaDiagnostic(input: {
  body: unknown;
  bodyTextHash: string | null;
  status: number | null;
  category: string | null;
  inspection: {
    kind: string;
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
  request: {
    timespan: string;
    timestamp: string;
    ticker: string;
  };
  provenance: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    artifactKind: "sanitized-schema-diagnostic",
    bodyTextHash: input.bodyTextHash,
    httpStatus: input.status,
    category: input.category,
    request: input.request,
    classification: input.inspection.kind,
    topLevelKeys: input.inspection.topLevelKeys,
    recognizedContainers: input.inspection.recognizedContainers,
    arrayLengths: input.inspection.arrayLengths,
    indexId: input.inspection.indexId,
    responseError: input.inspection.responseError,
    observationCounts: {
      returned: input.inspection.returnedCandidateCount,
      parsed: input.inspection.parsedObservationCount,
      rejected: input.inspection.rejectedObservationCount,
      inHour: input.inspection.inHourCount,
      outOfHour: input.inspection.outOfHourCount,
      untimed: input.inspection.untimedCount,
      settlementMinute: input.inspection.settlementMinuteCount,
    },
    note: input.inspection.note,
    provenance: input.provenance,
    schemaShape: summarizeSchemaShape(input.body),
  };
}

export function summarizeSchemaShape(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return { truncated: true };
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      item: value[0] === undefined ? null : summarizeSchemaShape(value[0], depth + 1),
    };
  }
  if (isRecord(value)) {
    const fields: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      fields[key] = summarizeSchemaShape(child, depth + 1);
    }
    return { type: "object", keys: Object.keys(value), fields };
  }
  return { type: value === null ? "null" : typeof value };
}
