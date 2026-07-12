import {
  buildMarketArtifactPath,
  isRecord,
  readString,
  resolveSeriesTicker,
} from "@/lib/data/audit/settlementTrace/settlementTraceUtils";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";

import type {
  ForwardSettlementCoverageIo,
  ParsedSettlementCandidate,
} from "./forwardSettlementCoverageTypes";

export type ImportSettlementState = {
  importResultPath: string | null;
  metadataPath: string | null;
  configPath: string | null;
  importFailed: boolean;
  importErrorMessage: string | null;
  retrievedAt: string | null;
  candidates: readonly ParsedSettlementCandidate[];
  metadataPresent: boolean;
  marketMetadataCloseTime: string | null;
  marketMetadataStatus: string | null;
};

function readSettlementPayload(record: Record<string, unknown>): Record<string, unknown> | null {
  const payload = record.payload;
  if (!isRecord(payload)) {
    return null;
  }

  if (isRecord(payload.market)) {
    return payload.market;
  }

  return payload;
}

function readOutcomeFromPayload(
  payload: Record<string, unknown>,
): "yes" | "no" | null {
  const result = payload.result;
  return result === "yes" || result === "no" ? result : null;
}

function readSettlementTime(payload: Record<string, unknown>): string | null {
  return (
    readString(payload, "settlement_ts", "settlementTs")
    ?? readString(payload, "close_time", "closeTime")
    ?? null
  );
}

function readMarketTimes(payload: Record<string, unknown>): {
  openTime: string | null;
  closeTime: string | null;
  eventTicker: string | null;
} {
  return {
    openTime: readString(payload, "open_time", "openTime") ?? null,
    closeTime: readString(payload, "close_time", "closeTime") ?? null,
    eventTicker: readString(payload, "event_ticker", "eventTicker") ?? null,
  };
}

function extractCandidateFromBronzeRecord(input: {
  record: Record<string, unknown>;
  marketTicker: string;
  importPath: string;
}): ParsedSettlementCandidate | null {
  const contentType = readString(input.record, "contentType");
  const payload = readSettlementPayload(input.record);
  if (!payload) {
    return null;
  }

  const outcome = readOutcomeFromPayload(payload);
  if (!outcome) {
    return null;
  }

  if (
    contentType !== SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT
    && contentType !== SILVER_BRONZE_CONTENT_TYPE.MARKET
  ) {
    return null;
  }

  const ticker = readString(input.record, "ticker") ?? input.marketTicker;
  if (ticker !== input.marketTicker) {
    return null;
  }

  const times = readMarketTimes(payload);
  const retrievedAt =
    readString(input.record, "collectionTime", "observedAt")
    ?? readString(input.record, "observedAt")
    ?? null;

  return {
    settledOutcome: outcome,
    settlementTime: readSettlementTime(payload),
    openTime: times.openTime,
    closeTime: times.closeTime,
    eventTicker: times.eventTicker,
    contentType,
    sourceArtifact: input.importPath,
    retrievedAt,
    joinConfidence:
      contentType === SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT ? "high" : "medium",
  };
}

export function parseAllImportResultSettlements(input: {
  marketTicker: string;
  importPath: string;
  content: string;
}): ParsedSettlementCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.content.replace(/^\uFEFF/, ""));
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.bronzeRecords)) {
    return [];
  }

  const candidates: ParsedSettlementCandidate[] = [];

  for (const record of parsed.bronzeRecords) {
    if (!isRecord(record)) {
      continue;
    }

    const candidate = extractCandidateFromBronzeRecord({
      record,
      marketTicker: input.marketTicker,
      importPath: input.importPath,
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function parseMetadataJson(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content.replace(/^\uFEFF/, ""));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Loads import settlement state for one captured market. */
export function loadMarketImportSettlementState(input: {
  io: ForwardSettlementCoverageIo;
  importsDir: string;
  marketTicker: string;
  seriesTicker: string;
}): ImportSettlementState {
  const importResultPath = buildMarketArtifactPath(
    input.importsDir,
    input.seriesTicker,
    input.marketTicker,
    "import-result.json",
  );
  const metadataPath = buildMarketArtifactPath(
    input.importsDir,
    input.seriesTicker,
    input.marketTicker,
    "metadata.json",
  );
  const configPath = buildMarketArtifactPath(
    input.importsDir,
    input.seriesTicker,
    input.marketTicker,
    "config.json",
  );

  let metadataPresent = false;
  let marketMetadataCloseTime: string | null = null;
  let marketMetadataStatus: string | null = null;
  let importFailed = false;
  let importErrorMessage: string | null = null;
  let retrievedAt: string | null = null;

  if (input.io.fileExists(metadataPath)) {
    metadataPresent = true;
    const metadata = parseMetadataJson(input.io.readFile(metadataPath));
    marketMetadataCloseTime = metadata ? readString(metadata, "closeTime") ?? null : null;
    marketMetadataStatus = metadata ? readString(metadata, "marketStatus", "status") ?? null : null;
    if (metadata?.valid === false) {
      importFailed = true;
      importErrorMessage = "import metadata marks market import invalid";
    }
  }

  if (!input.io.fileExists(importResultPath)) {
    return {
      importResultPath: null,
      metadataPath: metadataPresent ? metadataPath : null,
      configPath: input.io.fileExists(configPath) ? configPath : null,
      importFailed,
      importErrorMessage,
      retrievedAt,
      candidates: [],
      metadataPresent,
      marketMetadataCloseTime,
      marketMetadataStatus,
    };
  }

  const candidates = parseAllImportResultSettlements({
    marketTicker: input.marketTicker,
    importPath: importResultPath,
    content: input.io.readFile(importResultPath),
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.io.readFile(importResultPath).replace(/^\uFEFF/, ""));
  } catch {
    importFailed = true;
    importErrorMessage = "malformed import-result.json";
  }

  if (isRecord(parsed) && isRecord(parsed.metadata)) {
    retrievedAt =
      readString(parsed.metadata, "collectionTime", "observedAt")
      ?? retrievedAt;
    if (parsed.metadata.valid === false) {
      importFailed = true;
      importErrorMessage = importErrorMessage ?? "import-result validation failed";
    }
  }

  if (candidates.length === 0 && metadataPresent) {
    const settlementPresent = isRecord(parsed) && isRecord(parsed.metadata)
      ? parsed.metadata.settlementPresent === true
      : false;
    if (settlementPresent) {
      importFailed = true;
      importErrorMessage = importErrorMessage ?? "metadata claims settlement present but none parsed";
    }
  }

  return {
    importResultPath,
    metadataPath: metadataPresent ? metadataPath : null,
    configPath: input.io.fileExists(configPath) ? configPath : null,
    importFailed,
    importErrorMessage,
    retrievedAt,
    candidates,
    metadataPresent,
    marketMetadataCloseTime,
    marketMetadataStatus,
  };
}

export function choosePreferredSettlementCandidate(
  candidates: readonly ParsedSettlementCandidate[],
): ParsedSettlementCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((left, right) => {
    const confidenceRank = (value: ParsedSettlementCandidate) =>
      value.joinConfidence === "high" ? 2 : 1;
    const confidenceDelta = confidenceRank(right) - confidenceRank(left);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    const leftMs = left.settlementTime ? Date.parse(left.settlementTime) : Number.NEGATIVE_INFINITY;
    const rightMs = right.settlementTime ? Date.parse(right.settlementTime) : Number.NEGATIVE_INFINITY;
    return rightMs - leftMs;
  });

  return sorted[0] ?? null;
}

export function detectSettlementConflicts(
  candidates: readonly ParsedSettlementCandidate[],
): string | null {
  const outcomes = new Set(candidates.map((candidate) => candidate.settledOutcome));
  if (outcomes.size > 1) {
    return `conflicting outcomes: ${[...outcomes].join(", ")}`;
  }

  const settlementTimes = new Set(
    candidates
      .map((candidate) => candidate.settlementTime)
      .filter((value): value is string => value !== null),
  );
  if (outcomes.size === 1 && settlementTimes.size > 1) {
    return "duplicate settlements disagree on settlement timestamp";
  }

  const eventTickers = new Set(
    candidates
      .map((candidate) => candidate.eventTicker)
      .filter((value): value is string => value !== null),
  );
  if (eventTickers.size > 1) {
    return "market metadata disagrees with settlement record event ticker";
  }

  return null;
}

export function resolveSeriesTickerForMarket(marketTicker: string): string {
  return resolveSeriesTicker(marketTicker);
}
