import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { LeadLagAnalysis } from "@/lib/data/research/leadLag/leadLagTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";
import type { StatisticalSignificanceReport } from "@/lib/data/research/statisticalSignificance/statisticalSignificanceTypes";

import type { HypothesisExampleMarket } from "./hypothesisEvidenceTypes";
import { observationMatchesAtlasBucket } from "./observationMatchesAtlasBucket";
import {
  parseAtlasCandidateReference,
  parseLeadLagCandidateReference,
} from "./parseAtlasCandidateReference";
import { readResearchOutputMarketContext } from "./readResearchOutputMarketContext";

const MAX_EXAMPLE_MARKETS = 10;

type MarketAccumulator = {
  ticker: string;
  closeTime: string | null;
  closeTimeMs: number;
  settlement: "yes" | "no" | null;
  impliedProbability: number;
  realizedOutcome: 0 | 1;
  stepIndex: number;
};

function settlementLabel(outcome: 0 | 1): "yes" | "no" {
  return outcome === 1 ? "yes" : "no";
}

function buildExampleMarket(accumulator: MarketAccumulator): HypothesisExampleMarket {
  return {
    ticker: accumulator.ticker,
    closeTime: accumulator.closeTime,
    settlement: accumulator.settlement,
    impliedProbability: accumulator.impliedProbability,
    realizedOutcome: accumulator.realizedOutcome,
  };
}

function collectAtlasExampleMarkets(input: {
  candidate: HypothesisCandidate;
  atlas: MispricingAtlas;
  researchOutputPaths: readonly string[];
  readFile: (path: string) => string;
}): HypothesisExampleMarket[] {
  const reference = parseAtlasCandidateReference(input.candidate.candidateId);
  if (!reference) {
    return [];
  }

  const byMarket = new Map<string, MarketAccumulator>();

  for (const outputPath of input.researchOutputPaths) {
    const json = input.readFile(outputPath);
    const context = readResearchOutputMarketContext(json);
    const extracted = extractMispricingObservationsFromResearchOutput(
      json,
      outputPath,
    );

    for (const observation of extracted.observations) {
      if (
        !observationMatchesAtlasBucket(
          reference.groupId,
          reference.bucketId,
          observation,
        )
      ) {
        continue;
      }

      const key = `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`;
      const existing = byMarket.get(key);
      const closeTimeMs = context?.closeTimeMs ?? 0;

      if (
        !existing
        || closeTimeMs > existing.closeTimeMs
        || (closeTimeMs === existing.closeTimeMs && observation.stepIndex > existing.stepIndex)
      ) {
        byMarket.set(key, {
          ticker: observation.marketTicker,
          closeTime: context?.closeTime ?? null,
          closeTimeMs,
          settlement: context?.settlement ?? settlementLabel(observation.observedOutcome),
          impliedProbability: observation.predictedProbability,
          realizedOutcome: observation.observedOutcome,
          stepIndex: observation.stepIndex,
        });
      }
    }
  }

  return [...byMarket.values()]
    .sort((left, right) => {
      const timeCompare = right.closeTimeMs - left.closeTimeMs;
      if (timeCompare !== 0) {
        return timeCompare;
      }

      return left.ticker.localeCompare(right.ticker);
    })
    .slice(0, MAX_EXAMPLE_MARKETS)
    .map(buildExampleMarket);
}

function collectLeadLagExampleMarkets(input: {
  candidate: HypothesisCandidate;
  leadLagAnalysis: LeadLagAnalysis;
  readFile: (path: string) => string;
}): HypothesisExampleMarket[] {
  const reference = parseLeadLagCandidateReference(input.candidate.candidateId);
  if (!reference) {
    return [];
  }

  return [...input.leadLagAnalysis.markets]
    .filter((market) => market.bestLag === reference.lag)
    .sort((left, right) => right.candleCount - left.candleCount)
    .slice(0, MAX_EXAMPLE_MARKETS)
    .map((market) => {
      let impliedProbability = 0;
      let realizedOutcome: 0 | 1 = 0;
      let closeTime: string | null = null;
      let settlement: "yes" | "no" | null = null;

      try {
        const context = readResearchOutputMarketContext(input.readFile(market.outputPath));
        if (context) {
          closeTime = context.closeTime;
          settlement = context.settlement;
        }

        const extracted = extractMispricingObservationsFromResearchOutput(
          input.readFile(market.outputPath),
          market.outputPath,
        );
        const lastObservation = extracted.observations.at(-1);
        if (lastObservation) {
          impliedProbability = lastObservation.predictedProbability;
          realizedOutcome = lastObservation.observedOutcome;
        }
      } catch {
        // Leave defaults when research output cannot be read.
      }

      return {
        ticker: market.marketTicker,
        closeTime,
        settlement,
        impliedProbability,
        realizedOutcome,
      };
    });
}

/** Collects representative example markets for a hypothesis candidate. */
export function collectHypothesisExampleMarkets(input: {
  candidate: HypothesisCandidate;
  mispricingAtlas: MispricingAtlas | null;
  leadLagAnalysis: LeadLagAnalysis | null;
  researchOutputPaths: readonly string[];
  readFile: (path: string) => string;
}): HypothesisExampleMarket[] {
  if (input.candidate.sourceArtifact === "mispricing-atlas.json" && input.mispricingAtlas) {
    return collectAtlasExampleMarkets({
      candidate: input.candidate,
      atlas: input.mispricingAtlas,
      researchOutputPaths: input.researchOutputPaths,
      readFile: input.readFile,
    });
  }

  if (input.candidate.sourceArtifact === "lead-lag-analysis.json" && input.leadLagAnalysis) {
    return collectLeadLagExampleMarkets({
      candidate: input.candidate,
      leadLagAnalysis: input.leadLagAnalysis,
      readFile: input.readFile,
    });
  }

  return [];
}

export function countUniqueTradingDays(
  exampleMarkets: readonly HypothesisExampleMarket[],
): number {
  const days = new Set<string>();

  for (const market of exampleMarkets) {
    if (!market.closeTime) {
      continue;
    }

    const parsed = Date.parse(market.closeTime);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    days.add(new Date(parsed).toISOString().slice(0, 10));
  }

  return days.size;
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

function countAtlasUniqueTradingDays(input: {
  candidate: HypothesisCandidate;
  researchOutputPaths: readonly string[];
  readFile: (path: string) => string;
}): number {
  const reference = parseAtlasCandidateReference(input.candidate.candidateId);
  if (!reference) {
    return 0;
  }

  const days = new Set<string>();

  for (const outputPath of input.researchOutputPaths) {
    const json = input.readFile(outputPath);
    const context = readResearchOutputMarketContext(json);
    const extracted = extractMispricingObservationsFromResearchOutput(
      json,
      outputPath,
    );

    const hasMatch = extracted.observations.some((observation) =>
      observationMatchesAtlasBucket(
        reference.groupId,
        reference.bucketId,
        observation,
      ),
    );

    if (hasMatch) {
      addTradingDay(days, context?.closeTime ?? null);
    }
  }

  return days.size;
}

function countLeadLagUniqueTradingDays(input: {
  candidate: HypothesisCandidate;
  leadLagAnalysis: LeadLagAnalysis;
  readFile: (path: string) => string;
}): number {
  const reference = parseLeadLagCandidateReference(input.candidate.candidateId);
  if (!reference) {
    return 0;
  }

  const days = new Set<string>();

  for (const market of input.leadLagAnalysis.markets) {
    if (market.bestLag !== reference.lag) {
      continue;
    }

    try {
      const context = readResearchOutputMarketContext(
        input.readFile(market.outputPath),
      );
      addTradingDay(days, context?.closeTime ?? null);
    } catch {
      // Skip unreadable outputs.
    }
  }

  return days.size;
}

/** Counts unique trading days contributing to a hypothesis candidate. */
export function countUniqueTradingDaysForCandidate(input: {
  candidate: HypothesisCandidate;
  mispricingAtlas: MispricingAtlas | null;
  leadLagAnalysis: LeadLagAnalysis | null;
  researchOutputPaths: readonly string[];
  readFile: (path: string) => string;
}): number {
  if (input.candidate.sourceArtifact === "mispricing-atlas.json") {
    return countAtlasUniqueTradingDays({
      candidate: input.candidate,
      researchOutputPaths: input.researchOutputPaths,
      readFile: input.readFile,
    });
  }

  if (
    input.candidate.sourceArtifact === "lead-lag-analysis.json"
    && input.leadLagAnalysis
  ) {
    return countLeadLagUniqueTradingDays({
      candidate: input.candidate,
      leadLagAnalysis: input.leadLagAnalysis,
      readFile: input.readFile,
    });
  }

  return 0;
}

export function hasStatisticallySignificantStrategy(
  report: StatisticalSignificanceReport | null,
): boolean {
  return (
    report !== null
    && report.strategies.some((strategy) => strategy.statisticallySignificant)
  );
}

/** Builds a short human-readable confidence summary for a hypothesis card. */
export function buildHypothesisConfidenceSummary(input: {
  sampleSize: number;
  uniqueTradingDays: number;
  calibrationError: number | null;
  statisticalSignificance: StatisticalSignificanceReport | null;
  confidenceLevel: HypothesisCandidate["confidence"];
}): string {
  const sentences: string[] = [];

  if (input.sampleSize > 0) {
    const dayClause =
      input.uniqueTradingDays > 0
        ? ` spanning ${input.uniqueTradingDays} unique trading day${input.uniqueTradingDays === 1 ? "" : "s"}`
        : "";

    sentences.push(
      `This hypothesis is based on ${input.sampleSize} historical observation${input.sampleSize === 1 ? "" : "s"}${dayClause}.`,
    );
  } else {
    sentences.push("This hypothesis has no linked historical observations in the current research corpus.");
  }

  if (input.calibrationError !== null) {
    sentences.push(
      `Observed calibration error is ${(Math.abs(input.calibrationError) * 100).toFixed(1)} percentage points.`,
    );
  }

  if (!hasStatisticallySignificantStrategy(input.statisticalSignificance)) {
    sentences.push(
      "Evidence is exploratory because no statistically significant production strategy currently exists.",
    );
  } else if (input.confidenceLevel === "low") {
    sentences.push(
      "Confidence is capped at low until additional out-of-sample validation is completed.",
    );
  }

  return sentences.join(" ");
}

export type { MispricingObservation };
