import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeRootPath } from "../aggregation/researchAggregatePaths";

import {
  computeActionBuckets,
  computeBtcReturnBuckets,
  computeRegimeTagBuckets,
  computeStrategyBuckets,
  computeTimeRemainingBuckets,
  computeYesMidBuckets,
} from "./computeAttributionBucketMetrics";
import { discoverDecisionTraces } from "./discoverDecisionTraces";
import { extractAttributionObservations } from "./parseDecisionTraceAttribution";
import type {
  AttributionObservation,
  AttributionSampleCounts,
  AttributionWarning,
  BuildDecisionTraceAttributionInput,
  DecisionTraceAttributionIo,
  DecisionTraceAttributionReport,
} from "./decisionTraceAttributionTypes";

function sortObservations(
  observations: readonly AttributionObservation[],
): AttributionObservation[] {
  return [...observations].sort((left, right) => {
    const traceCompare = left.tracePath.localeCompare(right.tracePath);
    if (traceCompare !== 0) {
      return traceCompare;
    }
    return left.candleIndex - right.candleIndex;
  });
}

function sortWarnings(warnings: readonly AttributionWarning[]): AttributionWarning[] {
  return [...warnings].sort((left, right) => {
    const traceCompare = (left.tracePath ?? "").localeCompare(right.tracePath ?? "");
    if (traceCompare !== 0) {
      return traceCompare;
    }
    return left.message.localeCompare(right.message);
  });
}

function buildSampleCounts(input: {
  observations: readonly AttributionObservation[];
  traceDocumentCount: number;
  marketKeys: ReadonlySet<string>;
  skippedMissingResearchOutput: number;
  skippedMissingFills: number;
}): AttributionSampleCounts {
  return {
    totalObservations: input.observations.length,
    traceDocumentCount: input.traceDocumentCount,
    marketCount: input.marketKeys.size,
    skippedMissingResearchOutput: input.skippedMissingResearchOutput,
    skippedMissingFills: input.skippedMissingFills,
  };
}

/** Builds a deterministic decision trace attribution report. */
export function buildDecisionTraceAttribution(
  input: BuildDecisionTraceAttributionInput,
): DecisionTraceAttributionReport {
  const observations: AttributionObservation[] = [];
  const warnings: AttributionWarning[] = [];
  const marketKeys = new Set<string>();
  let skippedMissingResearchOutput = 0;
  let skippedMissingFills = 0;

  for (const scanned of input.scanned) {
    marketKeys.add(`${scanned.strategyId}/${scanned.seriesTicker}/${scanned.marketTicker}`);

    if (scanned.researchOutputJson === null || scanned.researchOutputJson === undefined) {
      skippedMissingResearchOutput += 1;
      warnings.push({
        code: "missing-research-output",
        message: `Missing sibling research output: ${scanned.researchOutputPath}`,
        tracePath: scanned.tracePath,
        marketTicker: scanned.marketTicker,
      });
      continue;
    }

    const extracted = extractAttributionObservations(
      scanned,
      scanned.researchOutputJson,
    );
    warnings.push(...extracted.warnings);

    if (extracted.warnings.some((warning) => warning.code === "missing-fills")) {
      skippedMissingFills += 1;
    }

    observations.push(...extracted.observations);
  }

  const sortedObservations = sortObservations(observations);
  const sortedWarnings = sortWarnings(warnings);

  return {
    generatedAt: input.generatedAt,
    inputRoot: normalizeRootPath(input.inputRoot),
    outputPath: normalizeRootPath(input.outputPath),
    sampleCounts: buildSampleCounts({
      observations: sortedObservations,
      traceDocumentCount: input.scanned.length,
      marketKeys,
      skippedMissingResearchOutput,
      skippedMissingFills,
    }),
    actionBuckets: computeActionBuckets(sortedObservations),
    yesMidBuckets: computeYesMidBuckets(sortedObservations),
    timeRemainingBuckets: computeTimeRemainingBuckets(sortedObservations),
    btcReturnBuckets: computeBtcReturnBuckets(sortedObservations),
    regimeTagBuckets: computeRegimeTagBuckets(sortedObservations),
    strategyBuckets: computeStrategyBuckets(sortedObservations),
    warnings: sortedWarnings,
  };
}

export function buildDecisionTraceAttributionFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: DecisionTraceAttributionIo,
  options: { generatedAt: string },
): DecisionTraceAttributionReport {
  const scanned = discoverDecisionTraces(inputRoot, io).map((entry) => ({
    ...entry,
    researchOutputJson: io.fileExists(entry.researchOutputPath)
      ? io.readFile(entry.researchOutputPath)
      : null,
  }));

  return buildDecisionTraceAttribution({
    inputRoot,
    outputPath,
    generatedAt: options.generatedAt,
    scanned,
  });
}

export function serializeDecisionTraceAttributionReport(
  report: DecisionTraceAttributionReport,
): string {
  return stableStringify(report);
}
