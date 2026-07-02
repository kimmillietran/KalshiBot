import { buildCalibrationMarketKey } from "@/lib/data/research/calibration/calibrationPaths";
import { parseResearchOutputJson } from "@/lib/data/research/aggregation/parseResearchOutputJson";
import { extractMispricingObservationsFromResearchOutput } from "@/lib/data/research/mispricingAtlas/parseMispricingObservations";
import { extractRegimeStepsFromResearchOutput } from "@/lib/data/research/regimeTagging/parseRegimeSteps";

import {
  EventStudyError,
  EventStudyErrorCode,
  type EventStudyMarketData,
  type EventStudyStepPoint,
  type EventStudyWarning,
} from "./eventStudyTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new EventStudyError(
        `${label} contains invalid JSON`,
        EventStudyErrorCode.INVALID_DOCUMENT,
      );
    }
  }

  return value;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readMarketWindowTimes(snapshot: Record<string, unknown>): {
  marketOpenMs: number | null;
  marketCloseMs: number | null;
} {
  const marketWindow = isRecord(snapshot.marketWindow) ? snapshot.marketWindow : null;
  if (!marketWindow) {
    return { marketOpenMs: null, marketCloseMs: null };
  }

  const openTime = readString(marketWindow, "openTime");
  const closeTime = readString(marketWindow, "closeTime");

  return {
    marketOpenMs: openTime ? Date.parse(openTime) : null,
    marketCloseMs: closeTime ? Date.parse(closeTime) : null,
  };
}

function mergeSteps(input: {
  regimeSteps: ReturnType<typeof extractRegimeStepsFromResearchOutput>["steps"];
  mispricingObservations: ReturnType<
    typeof extractMispricingObservationsFromResearchOutput
  >["observations"];
  observedOutcome: 0 | 1 | null;
}): EventStudyStepPoint[] {
  const mispricingByStep = new Map(
    input.mispricingObservations.map((observation) => [
      observation.stepIndex,
      observation,
    ]),
  );

  return input.regimeSteps.map((step) => {
    const mispricing = mispricingByStep.get(step.stepIndex);

    return {
      stepIndex: step.stepIndex,
      timestampMs: step.timestampMs,
      impliedProbability: step.impliedProbability,
      maxSpreadPercent: step.maxSpreadPercent,
      annualizedVolatility: mispricing?.annualizedVolatility ?? null,
      observedOutcome: mispricing?.observedOutcome ?? input.observedOutcome,
    };
  });
}

export type ExtractedEventStudyMarketData = {
  market: EventStudyMarketData | null;
  warnings: readonly EventStudyWarning[];
};

/** Parses runner-format research output into event-study market data. */
export function extractEventStudyMarketFromResearchOutput(
  json: string,
  outputPath: string,
  pathContext?: {
    strategyId?: string;
    seriesTicker?: string;
    marketTicker?: string;
  },
): ExtractedEventStudyMarketData {
  const regime = extractRegimeStepsFromResearchOutput(json, outputPath, pathContext);
  const mispricing = extractMispricingObservationsFromResearchOutput(
    json,
    outputPath,
    pathContext,
  );

  const warnings: EventStudyWarning[] = [
    ...regime.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      marketTicker: warning.marketTicker,
    })),
    ...mispricing.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      marketTicker: warning.marketTicker,
    })),
  ];

  if (regime.steps.length === 0) {
    return { market: null, warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new EventStudyError(
      "research-output.json contains invalid JSON",
      EventStudyErrorCode.INVALID_JSON,
    );
  }

  const dataset = isRecord(parsed) ? parseJsonValue(parsed.dataset, "dataset") : null;
  const snapshot =
    isRecord(dataset) && Array.isArray(dataset.snapshots)
      ? dataset.snapshots.find((entry) => isRecord(entry))
      : null;

  const windowTimes = snapshot && isRecord(snapshot)
    ? readMarketWindowTimes(snapshot)
    : { marketOpenMs: null, marketCloseMs: null };

  const observedOutcome =
    mispricing.observations[0]?.observedOutcome
    ?? null;

  let totalPnlCents: number | null = null;
  try {
    const researchOutput = parseResearchOutputJson(json, outputPath);
    if (researchOutput.status === "completed" && researchOutput.metrics) {
      totalPnlCents = researchOutput.metrics.totalPnlCents;
    }
  } catch {
    warnings.push({
      code: "missing-pnl",
      message: `Unable to parse strategy PnL for market ${regime.marketTicker}`,
      marketTicker: regime.marketTicker,
    });
  }

  const steps = mergeSteps({
    regimeSteps: regime.steps,
    mispricingObservations: mispricing.observations,
    observedOutcome,
  });

  return {
    market: {
      joinKey: buildCalibrationMarketKey(
        regime.strategyId,
        regime.seriesTicker,
        regime.marketTicker,
      ),
      strategyId: regime.strategyId,
      seriesTicker: regime.seriesTicker,
      marketTicker: regime.marketTicker,
      outputPath,
      marketOpenMs: Number.isFinite(windowTimes.marketOpenMs ?? Number.NaN)
        ? windowTimes.marketOpenMs
        : null,
      marketCloseMs: Number.isFinite(windowTimes.marketCloseMs ?? Number.NaN)
        ? windowTimes.marketCloseMs
        : null,
      totalPnlCents,
      steps,
    },
    warnings,
  };
}
