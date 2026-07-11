import {
  buildMarketArtifactPath,
  findBronzeSettlementRecords,
  isRecord,
  readString,
  resolveSeriesTicker,
} from "@/lib/data/audit/settlementTrace/settlementTraceUtils";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";

import type {
  CandidateLifecycleEpisodeInput,
  ForwardSettlementJoinIo,
  KnownSettlementRecord,
} from "./forwardSettlementJoinTypes";

export type LoadedSettlementSource = {
  importsDirPresent: boolean;
  settlementsByMarket: ReadonlyMap<string, KnownSettlementRecord>;
  sourceArtifacts: readonly string[];
  warnings: readonly string[];
};

export type LoadedCandidateEpisodes = {
  episodes: readonly CandidateLifecycleEpisodeInput[];
  sourceArtifact: string | null;
  warnings: readonly string[];
};

export type ForwardSettlementJoinLoadedInputs = {
  settlements: LoadedSettlementSource;
  episodes: LoadedCandidateEpisodes;
  missingArtifacts: string[];
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

function extractSettlementFromBronzeRecord(record: Record<string, unknown>): {
  outcome: "yes" | "no";
  payload: Record<string, unknown>;
  contentType: string | null;
} | null {
  const contentType = readString(record, "contentType");
  const payload = readSettlementPayload(record);
  if (!payload) {
    return null;
  }

  const outcome = readOutcomeFromPayload(payload);
  if (!outcome) {
    return null;
  }

  if (
    contentType === SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT
    || contentType === SILVER_BRONZE_CONTENT_TYPE.MARKET
  ) {
    return { outcome, payload, contentType };
  }

  return null;
}

function parseImportResultSettlement(input: {
  marketTicker: string;
  importPath: string;
  content: string;
}): KnownSettlementRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.content.replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.bronzeRecords)) {
    return null;
  }

  let chosen: KnownSettlementRecord | null = null;

  for (const record of parsed.bronzeRecords) {
    if (!isRecord(record)) {
      continue;
    }

    const ticker = readString(record, "ticker") ?? input.marketTicker;
    if (ticker !== input.marketTicker) {
      continue;
    }

    const extracted = extractSettlementFromBronzeRecord(record);
    if (!extracted) {
      continue;
    }

    const times = readMarketTimes(extracted.payload);
    const settlementTime = readSettlementTime(extracted.payload);
    const joinConfidence =
      extracted.contentType === SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT
        ? "high"
        : "medium";

    const candidate: KnownSettlementRecord = {
      marketTicker: input.marketTicker,
      settledOutcome: extracted.outcome,
      settlementTime,
      openTime: times.openTime,
      closeTime: times.closeTime,
      eventTicker: times.eventTicker,
      seriesTicker: resolveSeriesTicker(input.marketTicker),
      sourceArtifact: input.importPath,
      joinConfidence,
      settlementStatus: "known",
    };

    if (!chosen) {
      chosen = candidate;
      continue;
    }

    const chosenMs = chosen.settlementTime
      ? Date.parse(chosen.settlementTime)
      : Number.NEGATIVE_INFINITY;
    const candidateMs = settlementTime
      ? Date.parse(settlementTime)
      : Number.NEGATIVE_INFINITY;
    if (candidateMs >= chosenMs) {
      chosen = candidate;
    }
  }

  const bronzeMatches = findBronzeSettlementRecords(parsed.bronzeRecords);
  if (!chosen) {
    for (const match of bronzeMatches) {
      const record = parsed.bronzeRecords[match.index];
      if (!isRecord(record)) {
        continue;
      }

      const ticker = readString(record, "ticker") ?? input.marketTicker;
      if (ticker !== input.marketTicker) {
        continue;
      }

      const payload = readSettlementPayload(record);
      if (!payload) {
        continue;
      }

      const outcome = readOutcomeFromPayload(payload);
      if (!outcome) {
        continue;
      }

      const times = readMarketTimes(payload);
      chosen = {
        marketTicker: input.marketTicker,
        settledOutcome: outcome,
        settlementTime: readSettlementTime(payload),
        openTime: times.openTime,
        closeTime: times.closeTime,
        eventTicker: times.eventTicker,
        seriesTicker: resolveSeriesTicker(input.marketTicker),
        sourceArtifact: input.importPath,
        joinConfidence: "high",
        settlementStatus: "known",
      };
      break;
    }
  }

  return chosen;
}

/** Loads known settlements from import-result.json artifacts keyed by marketTicker. */
export function loadKnownSettlementsFromImports(input: {
  io: ForwardSettlementJoinIo;
  importsDir: string;
  marketTickers: readonly string[];
}): LoadedSettlementSource {
  const settlementsByMarket = new Map<string, KnownSettlementRecord>();
  const sourceArtifacts: string[] = [];
  const warnings: string[] = [];

  if (!input.io.fileExists(input.importsDir)) {
    warnings.push(`Imports directory not found: ${input.importsDir}`);
    return {
      importsDirPresent: false,
      settlementsByMarket,
      sourceArtifacts,
      warnings,
    };
  }

  sourceArtifacts.push(input.importsDir);

  for (const marketTicker of input.marketTickers) {
    const seriesTicker = resolveSeriesTicker(marketTicker);
    const importPath = buildMarketArtifactPath(
      input.importsDir,
      seriesTicker,
      marketTicker,
      "import-result.json",
    );

    if (!input.io.fileExists(importPath)) {
      continue;
    }

    sourceArtifacts.push(importPath);
    const settlement = parseImportResultSettlement({
      marketTicker,
      importPath,
      content: input.io.readFile(importPath),
    });

    if (settlement) {
      const existing = settlementsByMarket.get(marketTicker);
      if (!existing) {
        settlementsByMarket.set(marketTicker, settlement);
        continue;
      }

      const existingMs = existing.settlementTime
        ? Date.parse(existing.settlementTime)
        : Number.NEGATIVE_INFINITY;
      const candidateMs = settlement.settlementTime
        ? Date.parse(settlement.settlementTime)
        : Number.NEGATIVE_INFINITY;

      if (candidateMs >= existingMs) {
        settlementsByMarket.set(marketTicker, settlement);
      }
    }
  }

  return {
    importsDirPresent: true,
    settlementsByMarket,
    sourceArtifacts,
    warnings,
  };
}

function parseLifecycleEpisode(
  value: unknown,
  index: number,
): CandidateLifecycleEpisodeInput | null {
  if (!isRecord(value)) {
    return null;
  }

  const marketTicker = readString(value, "marketTicker");
  const episodeStart = readString(value, "startedAt", "episodeStart");
  const episodeEnd = readString(value, "endedAt", "episodeEnd");
  if (!marketTicker || !episodeStart || !episodeEnd) {
    return null;
  }

  return {
    episodeId: readString(value, "episodeId") ?? `episode-${index + 1}`,
    marketTicker,
    episodeStart,
    episodeEnd,
    episodeClassification:
      readString(value, "episodeClassification", "classification") ?? "unknown",
  };
}

/** Loads candidate lifecycle episodes from the bid-only lifecycle artifact. */
export function loadCandidateLifecycleEpisodes(input: {
  io: ForwardSettlementJoinIo;
  lifecyclePath: string | null;
}): LoadedCandidateEpisodes {
  if (!input.lifecyclePath) {
    return {
      episodes: [],
      sourceArtifact: null,
      warnings: ["No bid-only-candidate-lifecycle path configured."],
    };
  }

  if (!input.io.fileExists(input.lifecyclePath)) {
    return {
      episodes: [],
      sourceArtifact: null,
      warnings: [`Candidate lifecycle artifact not found: ${input.lifecyclePath}`],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.io.readFile(input.lifecyclePath).replace(/^\uFEFF/, ""));
  } catch {
    return {
      episodes: [],
      sourceArtifact: input.lifecyclePath,
      warnings: [`Malformed candidate lifecycle JSON: ${input.lifecyclePath}`],
    };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.episodes)) {
    return {
      episodes: [],
      sourceArtifact: input.lifecyclePath,
      warnings: [`Candidate lifecycle artifact missing episodes[]: ${input.lifecyclePath}`],
    };
  }

  const episodes = parsed.episodes
    .map((episode, index) => parseLifecycleEpisode(episode, index))
    .filter((episode): episode is CandidateLifecycleEpisodeInput => episode !== null);

  return {
    episodes,
    sourceArtifact: input.lifecyclePath,
    warnings: [],
  };
}

export function loadForwardSettlementJoinInputs(input: {
  io: ForwardSettlementJoinIo;
  importsDir: string;
  lifecyclePath: string | null;
  marketTickers: readonly string[];
  missingArtifactPaths: readonly string[];
}): ForwardSettlementJoinLoadedInputs {
  return {
    settlements: loadKnownSettlementsFromImports({
      io: input.io,
      importsDir: input.importsDir,
      marketTickers: input.marketTickers,
    }),
    episodes: loadCandidateLifecycleEpisodes({
      io: input.io,
      lifecyclePath: input.lifecyclePath,
    }),
    missingArtifacts: [...input.missingArtifactPaths],
  };
}
