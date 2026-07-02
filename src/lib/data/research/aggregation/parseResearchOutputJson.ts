import { z } from "zod";

import type { BacktestMetricsSummary } from "@/lib/data/backtesting/metricsTypes";

import {
  ResearchAggregateError,
  ResearchAggregateErrorCode,
  type ParsedResearchOutput,
  type ResearchOutputMetrics,
} from "./researchAggregateTypes";

const researchOutputMetricsSchema = z.object({
  totalPnlCents: z.number().finite(),
  totalReturnPct: z.number().finite(),
  maxDrawdownPct: z.number().finite().nonnegative(),
  sharpeRatio: z.number().finite().nullable(),
  winRatePct: z.number().finite().nonnegative(),
  lossRatePct: z.number().finite().nonnegative(),
  tradeCount: z.number().finite().int().nonnegative(),
  winningTradeCount: z.number().finite().int().nonnegative().optional(),
  losingTradeCount: z.number().finite().int().nonnegative().optional(),
});

const batchResearchOutputSchema = z
  .object({
    marketTicker: z.string().trim().min(1),
    status: z.enum(["completed", "failed"]),
    durationMs: z.number().finite().nonnegative(),
    metrics: researchOutputMetricsSchema.optional(),
    error: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "completed" && value.metrics === undefined) {
      context.addIssue({
        code: "custom",
        message: "metrics are required for completed research outputs",
      });
    }
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonValue(value: unknown, label: string, marketTicker?: string): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new ResearchAggregateError(
        `${label} contains invalid JSON`,
        ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
        marketTicker,
      );
    }
  }

  return value;
}

function readFiniteNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metricsFromBacktestSummary(
  metrics: Pick<
    BacktestMetricsSummary,
    | "totalPnlCents"
    | "totalReturnPct"
    | "maxDrawdownPct"
    | "sharpeRatio"
    | "winRatePct"
    | "lossRatePct"
    | "tradeCount"
    | "winningTradeCount"
    | "losingTradeCount"
  >,
): ResearchOutputMetrics {
  return {
    totalPnlCents: metrics.totalPnlCents,
    totalReturnPct: metrics.totalReturnPct,
    maxDrawdownPct: metrics.maxDrawdownPct,
    sharpeRatio: metrics.sharpeRatio,
    winRatePct: metrics.winRatePct,
    lossRatePct: metrics.lossRatePct,
    tradeCount: metrics.tradeCount,
    winningTradeCount: metrics.winningTradeCount,
    losingTradeCount: metrics.losingTradeCount,
  };
}

function normalizeBatchMetrics(
  metrics: z.infer<typeof researchOutputMetricsSchema>,
): ResearchOutputMetrics {
  const winningTradeCount =
    metrics.winningTradeCount
    ?? Math.round((metrics.winRatePct / 100) * metrics.tradeCount);
  const losingTradeCount =
    metrics.losingTradeCount
    ?? Math.max(metrics.tradeCount - winningTradeCount, 0);

  return {
    totalPnlCents: metrics.totalPnlCents,
    totalReturnPct: metrics.totalReturnPct,
    maxDrawdownPct: metrics.maxDrawdownPct,
    sharpeRatio: metrics.sharpeRatio,
    winRatePct: metrics.winRatePct,
    lossRatePct: metrics.lossRatePct,
    tradeCount: metrics.tradeCount,
    winningTradeCount,
    losingTradeCount,
  };
}

function parseRunnerFormat(
  parsed: Record<string, unknown>,
  fallbackMarketTicker: string | undefined,
): ParsedResearchOutput {
  const metadata = parsed.metadata;
  if (!isRecord(metadata)) {
    throw new ResearchAggregateError(
      "research-output.json metadata must be a plain object",
      ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      fallbackMarketTicker,
    );
  }

  const researchRun = parseJsonValue(parsed.researchRun, "researchRun", fallbackMarketTicker);
  if (!isRecord(researchRun)) {
    throw new ResearchAggregateError(
      "researchRun must be a plain object",
      ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      fallbackMarketTicker,
    );
  }

  const dataset = parseJsonValue(parsed.dataset, "dataset", fallbackMarketTicker);
  let marketTicker = fallbackMarketTicker?.trim() ?? "";

  if (isRecord(dataset) && isRecord(dataset.metadata)) {
    const tickers = dataset.metadata.marketTickers;
    if (Array.isArray(tickers) && typeof tickers[0] === "string" && tickers[0].trim()) {
      marketTicker = tickers[0].trim();
    }
  }

  if (!marketTicker) {
    throw new ResearchAggregateError(
      "Unable to resolve marketTicker from research output",
      ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      fallbackMarketTicker,
    );
  }

  if (typeof parsed.status === "string" && parsed.status === "failed") {
    return {
      marketTicker,
      status: "failed",
      durationMs: readFiniteNumber(metadata, "durationMs") ?? 0,
      metrics: null,
      error:
        typeof parsed.error === "string" && parsed.error.trim()
          ? parsed.error.trim()
          : "Research run failed",
    };
  }

  const backtestResult = parseJsonValue(
    researchRun.backtestResult,
    "backtestResult",
    marketTicker,
  );
  if (!isRecord(backtestResult) || !isRecord(backtestResult.metrics)) {
    throw new ResearchAggregateError(
      "researchRun backtestResult.metrics are required",
      ResearchAggregateErrorCode.MISSING_METRICS,
      marketTicker,
    );
  }

  const metricsRecord = backtestResult.metrics;
  const requiredKeys = [
    "totalPnlCents",
    "totalReturnPct",
    "maxDrawdownPct",
    "winRatePct",
    "lossRatePct",
    "tradeCount",
    "winningTradeCount",
    "losingTradeCount",
  ] as const;

  for (const key of requiredKeys) {
    if (readFiniteNumber(metricsRecord, key) === undefined) {
      throw new ResearchAggregateError(
        `Missing backtest metric: ${key}`,
        ResearchAggregateErrorCode.MISSING_METRICS,
        marketTicker,
      );
    }
  }

  const sharpeRatio = metricsRecord.sharpeRatio;
  const durationMs =
    readFiniteNumber(researchRun, "durationMs")
    ?? readFiniteNumber(metadata, "durationMs")
    ?? 0;

  return {
    marketTicker,
    status: "completed",
    durationMs,
    metrics: metricsFromBacktestSummary({
      totalPnlCents: metricsRecord.totalPnlCents as number,
      totalReturnPct: metricsRecord.totalReturnPct as number,
      maxDrawdownPct: metricsRecord.maxDrawdownPct as number,
      winRatePct: metricsRecord.winRatePct as number,
      lossRatePct: metricsRecord.lossRatePct as number,
      tradeCount: metricsRecord.tradeCount as number,
      winningTradeCount: metricsRecord.winningTradeCount as number,
      losingTradeCount: metricsRecord.losingTradeCount as number,
      sharpeRatio:
        sharpeRatio === null
          ? null
          : typeof sharpeRatio === "number" && Number.isFinite(sharpeRatio)
            ? sharpeRatio
            : null,
    }),
    error: null,
  };
}

/** Parses and validates a research output JSON document. */
export function parseResearchOutputJson(
  json: string,
  fallbackMarketTicker?: string,
): ParsedResearchOutput {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ResearchAggregateError(
      "research-output.json contains invalid JSON",
      ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      fallbackMarketTicker,
    );
  }

  if (!isRecord(parsed)) {
    throw new ResearchAggregateError(
      "research-output.json must be a plain object",
      ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      fallbackMarketTicker,
    );
  }

  if ("dataset" in parsed && "researchRun" in parsed) {
    return parseRunnerFormat(parsed, fallbackMarketTicker);
  }

  const batchResult = batchResearchOutputSchema.safeParse(parsed);
  if (!batchResult.success) {
    const issue = batchResult.error.issues[0];
    throw new ResearchAggregateError(
      issue?.message ?? "research-output.json failed validation",
      ResearchAggregateErrorCode.INVALID_OUTPUT_SCHEMA,
      fallbackMarketTicker,
    );
  }

  const document = batchResult.data;

  return {
    marketTicker: document.marketTicker,
    status: document.status,
    durationMs: document.durationMs,
    metrics:
      document.status === "completed" && document.metrics
        ? normalizeBatchMetrics(document.metrics)
        : null,
    error:
      document.status === "failed"
        ? document.error?.trim() || "Research run failed"
        : null,
  };
}
