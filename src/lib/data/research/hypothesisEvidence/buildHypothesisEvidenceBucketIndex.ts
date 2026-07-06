import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";

import type { HypothesisExampleMarket } from "./hypothesisEvidenceTypes";
import type { HypothesisEvidenceMemoryDiagnostics } from "./hypothesisEvidenceMemoryTypes";
import {
  observationMatchesAtlasBucket,
  type RegimeVolatilityByMarketKey,
} from "./observationMatchesAtlasBucket";
import {
  parseAtlasCandidateReference,
  type AtlasCandidateGroupId,
} from "./parseAtlasCandidateReference";
import { readResearchOutputMarketContext } from "./readResearchOutputMarketContext";

const MAX_EXAMPLE_MARKETS = 10;
const MAX_TRACKED_EXAMPLE_MARKETS = MAX_EXAMPLE_MARKETS;

export type AtlasBucketReference = {
  groupId: AtlasCandidateGroupId;
  bucketId: string;
};

type MarketAccumulator = {
  ticker: string;
  closeTime: string | null;
  closeTimeMs: number;
  settlement: "yes" | "no" | null;
  impliedProbability: number;
  realizedOutcome: 0 | 1;
  stepIndex: number;
};

type BucketAccumulatorState = {
  markets: Map<string, MarketAccumulator>;
  tradingDays: Set<string>;
};

function readHeapUsedBytes(): number | null {
  if (typeof process === "undefined" || typeof process.memoryUsage !== "function") {
    return null;
  }

  return process.memoryUsage().heapUsed;
}

function bucketRefKey(reference: AtlasBucketReference): string {
  return `${reference.groupId}::${reference.bucketId}`;
}

function settlementLabel(outcome: 0 | 1): "yes" | "no" {
  return outcome === 1 ? "yes" : "no";
}

function addTradingDay(days: Set<string>, closeTime: string | null): void {
  if (!closeTime) {
    return;
  }

  const parsed = Date.parse(closeTime);
  if (!Number.isFinite(parsed)) {
    return;
  }

  days.add(new Date(parsed).toISOString().slice(0, 10));
}

function pruneMarketAccumulators(
  markets: Map<string, MarketAccumulator>,
  maxSize: number,
): void {
  if (markets.size <= maxSize) {
    return;
  }

  const retainedKeys = new Set(
    [...markets.entries()]
      .sort((left, right) => {
        const timeCompare = right[1].closeTimeMs - left[1].closeTimeMs;
        if (timeCompare !== 0) {
          return timeCompare;
        }

        return left[1].ticker.localeCompare(right[1].ticker);
      })
      .slice(0, maxSize)
      .map(([key]) => key),
  );

  for (const key of [...markets.keys()]) {
    if (!retainedKeys.has(key)) {
      markets.delete(key);
    }
  }
}

function updateMarketAccumulator(
  markets: Map<string, MarketAccumulator>,
  observation: {
    strategyId: string;
    seriesTicker: string;
    marketTicker: string;
    predictedProbability: number;
    observedOutcome: 0 | 1;
    stepIndex: number;
  },
  context: {
    closeTime: string | null;
    closeTimeMs: number;
    settlement: "yes" | "no" | null;
  },
): void {
  const key = `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`;
  const existing = markets.get(key);

  if (
    !existing
    || context.closeTimeMs > existing.closeTimeMs
    || (context.closeTimeMs === existing.closeTimeMs
      && observation.stepIndex > existing.stepIndex)
  ) {
    markets.set(key, {
      ticker: observation.marketTicker,
      closeTime: context.closeTime,
      closeTimeMs: context.closeTimeMs,
      settlement: context.settlement ?? settlementLabel(observation.observedOutcome),
      impliedProbability: observation.predictedProbability,
      realizedOutcome: observation.observedOutcome,
      stepIndex: observation.stepIndex,
    });
  }

  pruneMarketAccumulators(markets, MAX_TRACKED_EXAMPLE_MARKETS);
}

function finalizeExampleMarkets(
  markets: Map<string, MarketAccumulator>,
): HypothesisExampleMarket[] {
  return [...markets.values()]
    .sort((left, right) => {
      const timeCompare = right.closeTimeMs - left.closeTimeMs;
      if (timeCompare !== 0) {
        return timeCompare;
      }

      return left.ticker.localeCompare(right.ticker);
    })
    .slice(0, MAX_EXAMPLE_MARKETS)
    .map((market) => ({
      ticker: market.ticker,
      closeTime: market.closeTime,
      settlement: market.settlement,
      impliedProbability: market.impliedProbability,
      realizedOutcome: market.realizedOutcome,
    }));
}

/** Collects unique atlas bucket references required by hypothesis candidates. */
export function collectAtlasBucketReferences(
  candidates: readonly HypothesisCandidate[],
): AtlasBucketReference[] {
  const seen = new Set<string>();
  const references: AtlasBucketReference[] = [];

  for (const candidate of candidates) {
    const reference = parseAtlasCandidateReference(candidate.candidateId);
    if (!reference) {
      continue;
    }

    const key = bucketRefKey(reference);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    references.push({
      groupId: reference.groupId,
      bucketId: reference.bucketId,
    });
  }

  return references;
}

export type HypothesisEvidenceBucketIndex = {
  getExampleMarkets: (reference: AtlasBucketReference) => readonly HypothesisExampleMarket[];
  getUniqueTradingDays: (reference: AtlasBucketReference) => number;
  memoryDiagnostics: HypothesisEvidenceMemoryDiagnostics;
};

/** Scans research outputs once and indexes compact evidence per atlas bucket. */
export function buildHypothesisEvidenceBucketIndex(input: {
  references: readonly AtlasBucketReference[];
  researchOutputPaths: readonly string[];
  readFile: (path: string) => string;
  regimeVolatilityByMarket?: RegimeVolatilityByMarketKey;
  memoryReport?: boolean;
}): HypothesisEvidenceBucketIndex {
  const states = new Map<string, BucketAccumulatorState>();

  for (const reference of input.references) {
    states.set(bucketRefKey(reference), {
      markets: new Map(),
      tradingDays: new Set(),
    });
  }

  let filesProcessed = 0;
  let observationsProcessed = 0;
  let largestFileBytes = 0;
  let largestFilePath: string | null = null;
  let peakHeapUsedBytes = input.memoryReport ? readHeapUsedBytes() : null;

  for (const outputPath of input.researchOutputPaths) {
    const json = input.readFile(outputPath);
    filesProcessed += 1;

    if (json.length > largestFileBytes) {
      largestFileBytes = json.length;
      largestFilePath = outputPath;
    }

    const context = readResearchOutputMarketContext(json);
    const extracted = extractMispricingObservationsFromResearchOutput(
      json,
      outputPath,
    );

    for (const observation of extracted.observations) {
      observationsProcessed += 1;

      for (const reference of input.references) {
        if (
          !observationMatchesAtlasBucket(
            reference.groupId,
            reference.bucketId,
            observation,
            input.regimeVolatilityByMarket,
          )
        ) {
          continue;
        }

        const state = states.get(bucketRefKey(reference));
        if (!state) {
          continue;
        }

        updateMarketAccumulator(
          state.markets,
          observation,
          {
            closeTime: context?.closeTime ?? null,
            closeTimeMs: context?.closeTimeMs ?? 0,
            settlement: context?.settlement ?? null,
          },
        );
        addTradingDay(state.tradingDays, context?.closeTime ?? null);
      }
    }

    if (input.memoryReport) {
      const heapUsed = readHeapUsedBytes();
      if (heapUsed !== null) {
        peakHeapUsedBytes =
          peakHeapUsedBytes === null
            ? heapUsed
            : Math.max(peakHeapUsedBytes, heapUsed);
      }
    }
  }

  const memoryDiagnostics: HypothesisEvidenceMemoryDiagnostics = {
    researchOutputFilesScanned: filesProcessed,
    atlasBucketReferenceCount: input.references.length,
    observationsProcessed,
    peakHeapUsedBytes,
    largestFileBytes,
    largestFilePath,
    largestIntermediateCollection: "hypothesis-evidence-bucket-index",
  };

  return {
    getExampleMarkets(reference) {
      const state = states.get(bucketRefKey(reference));
      if (!state) {
        return [];
      }

      return finalizeExampleMarkets(state.markets);
    },
    getUniqueTradingDays(reference) {
      return states.get(bucketRefKey(reference))?.tradingDays.size ?? 0;
    },
    memoryDiagnostics,
  };
}
