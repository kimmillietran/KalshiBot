import { extractBidAskCandleQuote } from "@/lib/data/datasets/validation/audit/extractBidAskCandleQuote";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  ReplayPricingDiagnosticWarningCode,
  type ComputeReplayPricingDiagnosticsInput,
  type DecisionPriceSnapshot,
  type ObservedYesPriceRange,
  type ReplayPricingDiagnosticWarning,
  type ReplayPricingDiagnostics,
  type ReplayPricingDiagnosticsRunSummary,
  type SourceKalshiCandlePriceClassification,
} from "./replayPricingDiagnosticsTypes";

const EMPTY_RANGE: ObservedYesPriceRange = {
  minYesBidCents: null,
  maxYesBidCents: null,
  minYesAskCents: null,
  maxYesAskCents: null,
  minYesMidCents: null,
  maxYesMidCents: null,
};

function readDecisionPrice(step: ReplayStepResult): DecisionPriceSnapshot {
  const pricing = step.engineInput.pricing;

  return {
    yesBidCents: pricing?.yesBidCents ?? 0,
    yesAskCents: pricing?.yesAskCents ?? 0,
    yesMidCents: pricing?.yesMidCents ?? 0,
  };
}

function isZeroDecisionPrice(price: DecisionPriceSnapshot): boolean {
  return (
    price.yesBidCents === 0
    && price.yesAskCents === 0
    && price.yesMidCents === 0
  );
}

function isNonZeroDecisionPrice(price: DecisionPriceSnapshot): boolean {
  return (
    price.yesBidCents > 0
    || price.yesAskCents > 0
    || price.yesMidCents > 0
  );
}

function updateRange(
  range: ObservedYesPriceRange,
  price: DecisionPriceSnapshot,
): ObservedYesPriceRange {
  const next = { ...range };

  if (isNonZeroDecisionPrice(price) || isZeroDecisionPrice(price)) {
    next.minYesBidCents = minNullable(next.minYesBidCents, price.yesBidCents);
    next.maxYesBidCents = maxNullable(next.maxYesBidCents, price.yesBidCents);
    next.minYesAskCents = minNullable(next.minYesAskCents, price.yesAskCents);
    next.maxYesAskCents = maxNullable(next.maxYesAskCents, price.yesAskCents);
    next.minYesMidCents = minNullable(next.minYesMidCents, price.yesMidCents);
    next.maxYesMidCents = maxNullable(next.maxYesMidCents, price.yesMidCents);
  }

  return next;
}

function minNullable(current: number | null, value: number): number {
  return current === null ? value : Math.min(current, value);
}

function maxNullable(current: number | null, value: number): number {
  return current === null ? value : Math.max(current, value);
}

function readKalshiCandleRecords(
  bronzeRecords: readonly RawHistoricalRecord[],
): RawHistoricalRecord[] {
  return bronzeRecords.filter(
    (record) => record.contentType === SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
  );
}

function classifySourceKalshiCandles(
  candleRecords: readonly RawHistoricalRecord[],
): {
  classification: SourceKalshiCandlePriceClassification;
  range: ObservedYesPriceRange;
} {
  const classification: SourceKalshiCandlePriceClassification = {
    missingPriceCandleCount: 0,
    synthesizedZeroPriceCandleCount: 0,
    legitimateZeroPriceCandleCount: 0,
    nonZeroPriceCandleCount: 0,
  };
  let range = { ...EMPTY_RANGE };

  for (const record of candleRecords) {
    const quote = extractBidAskCandleQuote(record);
    const yesBidCents = quote.yesBidCents;
    const yesAskCents = quote.yesAskCents;

    if (quote.source === "missing" || yesBidCents === null || yesAskCents === null) {
      classification.missingPriceCandleCount += 1;
      continue;
    }

    const price: DecisionPriceSnapshot = {
      yesBidCents,
      yesAskCents,
      yesMidCents: Math.round((yesBidCents + yesAskCents) / 2),
    };
    range = updateRange(range, price);

    if (yesBidCents > 0 || yesAskCents > 0) {
      classification.nonZeroPriceCandleCount += 1;
      continue;
    }

    if (quote.source === "live-close-only") {
      classification.synthesizedZeroPriceCandleCount += 1;
      continue;
    }

    classification.legitimateZeroPriceCandleCount += 1;
  }

  return { classification, range };
}

function buildWarnings(input: {
  decisionCount: number;
  zeroPriceDecisionCount: number;
  sourceKalshiCandleCount: number;
  sourceClassification: SourceKalshiCandlePriceClassification;
  firstDecisionPrice: DecisionPriceSnapshot | null;
  lastDecisionPrice: DecisionPriceSnapshot | null;
}): ReplayPricingDiagnosticWarning[] {
  const warnings: ReplayPricingDiagnosticWarning[] = [];

  if (input.decisionCount > 0 && input.zeroPriceDecisionCount === input.decisionCount) {
    warnings.push({
      code: ReplayPricingDiagnosticWarningCode.ALL_ZERO_DECISION_PRICES,
      message:
        "Every replay decision used yesBid/yesAsk/yesMid of 0 cents",
      severity: "warning",
    });
  }

  if (
    input.sourceClassification.nonZeroPriceCandleCount > 0
    && input.decisionCount > 0
    && input.zeroPriceDecisionCount === input.decisionCount
  ) {
    warnings.push({
      code: ReplayPricingDiagnosticWarningCode.SOURCE_NONZERO_DECISIONS_ZERO,
      message:
        "Source Kalshi candles contain nonzero YES prices but all replay decisions were priced at 0 cents",
      severity: "warning",
    });
  }

  if (
    input.decisionCount === 1
    && input.sourceKalshiCandleCount > 1
  ) {
    warnings.push({
      code: ReplayPricingDiagnosticWarningCode.SINGLE_DECISION_MULTIPLE_SOURCE_CANDLES,
      message:
        "Only one replay decision was made despite multiple source Kalshi candles",
      severity: "warning",
    });
  }

  if (
    input.sourceClassification.synthesizedZeroPriceCandleCount > 0
    && input.decisionCount > 0
    && input.zeroPriceDecisionCount === input.decisionCount
  ) {
    warnings.push({
      code: ReplayPricingDiagnosticWarningCode.SYNTHESIZED_ZERO_DECISION_FROM_SOURCE,
      message:
        "Replay decisions are all zero while source candles include synthesized zero close-only quotes",
      severity: "warning",
    });
  }

  if (
    input.sourceClassification.missingPriceCandleCount > 0
    && input.decisionCount > 0
    && input.zeroPriceDecisionCount === input.decisionCount
  ) {
    warnings.push({
      code: ReplayPricingDiagnosticWarningCode.MISSING_PRICE_IN_DECISIONS,
      message:
        "Replay decisions are all zero and source candles include missing bid/ask quotes",
      severity: "warning",
    });
  }

  const terminalSourceZero =
    input.sourceClassification.legitimateZeroPriceCandleCount > 0
    || input.sourceClassification.synthesizedZeroPriceCandleCount > 0;
  const historicalSourceNonZero = input.sourceClassification.nonZeroPriceCandleCount > 0;

  if (
    historicalSourceNonZero
    && terminalSourceZero
    && input.lastDecisionPrice
    && isZeroDecisionPrice(input.lastDecisionPrice)
    && input.zeroPriceDecisionCount < input.decisionCount
  ) {
    warnings.push({
      code: ReplayPricingDiagnosticWarningCode.LEGITIMATE_TERMINAL_ZERO_PRICE,
      message:
        "Latest replay decision is zero while earlier source candles had nonzero prices; this may be a legitimate terminal quote",
      severity: "info",
    });
  }

  return warnings.sort((left, right) => left.code.localeCompare(right.code));
}

/** Computes deterministic replay pricing diagnostics from replay steps and bronze source candles. */
export function computeReplayPricingDiagnostics(
  input: ComputeReplayPricingDiagnosticsInput,
): ReplayPricingDiagnostics {
  const decisionPrices = input.replaySteps.map(readDecisionPrice);
  const zeroPriceDecisionCount = decisionPrices.filter(isZeroDecisionPrice).length;
  const nonZeroPriceDecisionCount = decisionPrices.filter(isNonZeroDecisionPrice).length;
  const decisionCount = decisionPrices.length;

  let observedYesPriceRange = { ...EMPTY_RANGE };
  for (const price of decisionPrices) {
    observedYesPriceRange = updateRange(observedYesPriceRange, price);
  }

  const sourceKalshiCandleRecords = readKalshiCandleRecords(input.bronzeRecords);
  const { classification: sourceKalshiCandleClassification, range: sourceSnapshotYesPriceRange } =
    classifySourceKalshiCandles(sourceKalshiCandleRecords);

  const lastStep = input.replaySteps[input.replaySteps.length - 1];
  const currentCandleCount = lastStep
    ? lastStep.sourceSnapshot.kalshiCandles.length
    : null;

  const warnings = buildWarnings({
    decisionCount,
    zeroPriceDecisionCount,
    sourceKalshiCandleCount: sourceKalshiCandleRecords.length,
    sourceClassification: sourceKalshiCandleClassification,
    firstDecisionPrice: decisionPrices[0] ?? null,
    lastDecisionPrice: decisionPrices[decisionCount - 1] ?? null,
  });

  return {
    decisionCount,
    zeroPriceDecisionCount,
    nonZeroPriceDecisionCount,
    percentZeroPriceDecisions:
      decisionCount === 0
        ? 0
        : Number(((zeroPriceDecisionCount / decisionCount) * 100).toFixed(4)),
    firstDecisionPrice: decisionPrices[0] ?? null,
    lastDecisionPrice: decisionPrices[decisionCount - 1] ?? null,
    observedYesPriceRange,
    sourceSnapshotYesPriceRange,
    sourceKalshiCandleCount: sourceKalshiCandleRecords.length,
    currentCandleCount,
    sourceKalshiCandleClassification,
    warnings,
  };
}

export function serializeReplayPricingDiagnostics(
  diagnostics: ReplayPricingDiagnostics,
): ReplayPricingDiagnostics {
  return JSON.parse(stableStringify(diagnostics)) as ReplayPricingDiagnostics;
}

export function summarizeReplayPricingDiagnostics(
  diagnostics: ReplayPricingDiagnostics,
): ReplayPricingDiagnosticsRunSummary {
  return {
    decisionCount: diagnostics.decisionCount,
    zeroPriceDecisionCount: diagnostics.zeroPriceDecisionCount,
    nonZeroPriceDecisionCount: diagnostics.nonZeroPriceDecisionCount,
    percentZeroPriceDecisions: diagnostics.percentZeroPriceDecisions,
    warningCount: diagnostics.warnings.length,
    warningCodes: diagnostics.warnings.map((warning) => warning.code),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads replay pricing diagnostics from a serialized research-output.json document. */
export function parseReplayPricingDiagnosticsFromResearchOutput(
  json: string,
): ReplayPricingDiagnosticsRunSummary | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !isRecord(parsed.diagnostics)) {
    return null;
  }

  const diagnostics = parsed.diagnostics;
  const decisionCount = diagnostics.decisionCount;
  const zeroPriceDecisionCount = diagnostics.zeroPriceDecisionCount;
  const nonZeroPriceDecisionCount = diagnostics.nonZeroPriceDecisionCount;
  const percentZeroPriceDecisions = diagnostics.percentZeroPriceDecisions;
  const warnings = diagnostics.warnings;

  if (
    typeof decisionCount !== "number"
    || typeof zeroPriceDecisionCount !== "number"
    || typeof nonZeroPriceDecisionCount !== "number"
    || typeof percentZeroPriceDecisions !== "number"
    || !Array.isArray(warnings)
  ) {
    return null;
  }

  const warningCodes = warnings
    .map((warning) => (isRecord(warning) ? warning.code : null))
    .filter((code): code is ReplayPricingDiagnosticWarning["code"] => typeof code === "string");

  return {
    decisionCount,
    zeroPriceDecisionCount,
    nonZeroPriceDecisionCount,
    percentZeroPriceDecisions,
    warningCount: warnings.length,
    warningCodes,
  };
}
