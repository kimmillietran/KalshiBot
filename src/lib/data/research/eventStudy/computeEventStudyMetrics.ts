import {
  computeBrierScore,
  computeExpectedCalibrationError,
  buildCalibrationBins,
} from "@/lib/data/research/calibration/computeCalibrationMetrics";

import {
  filterStepsForEventWindow,
  marketOverlapsEventStudySpan,
} from "./assignEventWindows";
import type {
  EventDefinition,
  EventStudyEventResult,
  EventStudyMarketData,
  EventStudyMarketWindowResult,
  EventStudyShiftMetrics,
  EventStudyStepPoint,
  EventStudyWindowConfig,
  EventStudyWindowMetrics,
  EventStudyWindowName,
} from "./eventStudyTypes";

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function computeShift(
  fromValue: number | null,
  toValue: number | null,
): number | null {
  if (fromValue === null || toValue === null) {
    return null;
  }

  return roundMetric(toValue - fromValue);
}

function buildShiftMetrics(
  fromWindow: EventStudyWindowMetrics | undefined,
  toWindow: EventStudyWindowMetrics | undefined,
): EventStudyShiftMetrics {
  return {
    volatilityShift: computeShift(
      fromWindow?.averageRealizedVolatilityAnnualized ?? null,
      toWindow?.averageRealizedVolatilityAnnualized ?? null,
    ),
    spreadShift: computeShift(
      fromWindow?.averageSpreadPercent ?? null,
      toWindow?.averageSpreadPercent ?? null,
    ),
    calibrationShift: computeShift(
      fromWindow?.brierScore ?? null,
      toWindow?.brierScore ?? null,
    ),
    pnlShiftCents:
      fromWindow === undefined || toWindow === undefined
        ? null
        : roundMetric(toWindow.totalPnlCents - fromWindow.totalPnlCents),
  };
}

function buildCalibrationMetrics(steps: readonly EventStudyStepPoint[]): {
  brierScore: number | null;
  calibrationError: number | null;
} {
  const observations = steps
    .filter(
      (step): step is EventStudyStepPoint & { observedOutcome: 0 | 1 } =>
        step.observedOutcome !== null,
    )
    .map((step) => ({
      predictedProbability: step.impliedProbability,
      observedOutcome: step.observedOutcome,
    }));

  if (observations.length === 0) {
    return { brierScore: null, calibrationError: null };
  }

  const bins = buildCalibrationBins(observations);
  return {
    brierScore: computeBrierScore(observations),
    calibrationError: computeExpectedCalibrationError(bins, observations.length),
  };
}

function buildMarketWindowResult(
  market: EventStudyMarketData,
  steps: readonly EventStudyStepPoint[],
): EventStudyMarketWindowResult {
  const spreadValues = steps
    .map((step) => step.maxSpreadPercent)
    .filter((value): value is number => value !== null);
  const volatilityValues = steps
    .map((step) => step.annualizedVolatility)
    .filter((value): value is number => value !== null);
  const calibration = buildCalibrationMetrics(steps);

  return {
    joinKey: market.joinKey,
    strategyId: market.strategyId,
    seriesTicker: market.seriesTicker,
    marketTicker: market.marketTicker,
    outputPath: market.outputPath,
    stepCount: steps.length,
    totalPnlCents: market.totalPnlCents,
    averageSpreadPercent: average(spreadValues),
    averageRealizedVolatilityAnnualized: average(volatilityValues),
    brierScore: calibration.brierScore,
    calibrationError: calibration.calibrationError,
  };
}

function buildWindowMetrics(input: {
  window: EventStudyWindowName;
  marketResults: readonly EventStudyMarketWindowResult[];
  allSteps: readonly EventStudyStepPoint[];
}): EventStudyWindowMetrics {
  const spreadValues = input.allSteps
    .map((step) => step.maxSpreadPercent)
    .filter((value): value is number => value !== null);
  const volatilityValues = input.allSteps
    .map((step) => step.annualizedVolatility)
    .filter((value): value is number => value !== null);
  const calibration = buildCalibrationMetrics(input.allSteps);

  const pnlValues = input.marketResults
    .map((market) => market.totalPnlCents)
    .filter((value): value is number => value !== null);

  return {
    window: input.window,
    marketCount: input.marketResults.length,
    observationCount: input.allSteps.length,
    averageSpreadPercent: average(spreadValues),
    averageRealizedVolatilityAnnualized: average(volatilityValues),
    brierScore: calibration.brierScore,
    calibrationError: calibration.calibrationError,
    totalPnlCents: pnlValues.reduce((sum, value) => sum + value, 0),
    averagePnlCents: average(pnlValues),
    markets: [...input.marketResults].sort((left, right) =>
      left.marketTicker.localeCompare(right.marketTicker),
    ),
  };
}

const WINDOW_ORDER: readonly EventStudyWindowName[] = ["before", "during", "after"];

/** Computes per-event window metrics and shifts for one external event. */
export function computeEventStudyEventResult(input: {
  event: EventDefinition;
  markets: readonly EventStudyMarketData[];
  windowConfig: EventStudyWindowConfig;
}): EventStudyEventResult {
  const overlappingMarkets = input.markets.filter((market) =>
    marketOverlapsEventStudySpan({
      marketOpenMs: market.marketOpenMs,
      marketCloseMs: market.marketCloseMs,
      eventTimeMs: input.event.timestampMs,
      windowConfig: input.windowConfig,
    }),
  );

  const windows = WINDOW_ORDER.map((window) => {
    const marketResults: EventStudyMarketWindowResult[] = [];
    const allSteps: EventStudyStepPoint[] = [];

    for (const market of overlappingMarkets) {
      const steps = filterStepsForEventWindow({
        steps: market.steps,
        event: input.event,
        window,
        windowConfig: input.windowConfig,
      });

      if (steps.length === 0) {
        continue;
      }

      marketResults.push(buildMarketWindowResult(market, steps));
      allSteps.push(...steps);
    }

    return buildWindowMetrics({ window, marketResults, allSteps });
  });

  const windowByName = Object.fromEntries(
    windows.map((windowMetrics) => [windowMetrics.window, windowMetrics]),
  ) as Record<EventStudyWindowName, EventStudyWindowMetrics>;

  return {
    eventId: input.event.eventId,
    type: input.event.type,
    timestamp: input.event.timestamp,
    timestampMs: input.event.timestampMs,
    overlappingMarketCount: overlappingMarkets.length,
    windows,
    shifts: {
      beforeToDuring: buildShiftMetrics(windowByName.before, windowByName.during),
      duringToAfter: buildShiftMetrics(windowByName.during, windowByName.after),
      beforeToAfter: buildShiftMetrics(windowByName.before, windowByName.after),
    },
  };
}
