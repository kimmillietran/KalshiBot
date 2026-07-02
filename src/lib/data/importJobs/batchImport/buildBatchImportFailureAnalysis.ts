import {
  BATCH_IMPORT_FAILURE_CATEGORY,
  RECOVERABLE_BATCH_IMPORT_FAILURE_CATEGORIES,
  type BatchImportFailureAnalysis,
  type BatchImportFailureCategory,
  type BatchImportFailureExample,
  type BatchImportFailureReasonGroup,
  type BuildBatchImportFailureAnalysisInput,
} from "./batchImportFailureAnalysisTypes";
import { categorizeBatchImportFailure } from "./categorizeBatchImportFailure";
import type { BatchImportMarketResult } from "./batchImportTypes";

const DEFAULT_MAX_EXAMPLES = 3;

const CATEGORY_ORDER: readonly BatchImportFailureCategory[] = [
  BATCH_IMPORT_FAILURE_CATEGORY.NO_HISTORICAL_DATA,
  BATCH_IMPORT_FAILURE_CATEGORY.MARKET_NOT_FOUND,
  BATCH_IMPORT_FAILURE_CATEGORY.PROVIDER_UNAVAILABLE,
  BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED,
  BATCH_IMPORT_FAILURE_CATEGORY.MALFORMED_RESPONSE,
  BATCH_IMPORT_FAILURE_CATEGORY.UNSUPPORTED_MARKET,
  BATCH_IMPORT_FAILURE_CATEGORY.INVALID_METADATA,
  BATCH_IMPORT_FAILURE_CATEGORY.NETWORK_FAILURE,
  BATCH_IMPORT_FAILURE_CATEGORY.UNKNOWN,
];

function compareExamples(
  left: BatchImportFailureExample,
  right: BatchImportFailureExample,
): number {
  const tickerCompare = left.marketTicker.localeCompare(right.marketTicker);
  if (tickerCompare !== 0) {
    return tickerCompare;
  }

  const configCompare = left.configPath.localeCompare(right.configPath);
  if (configCompare !== 0) {
    return configCompare;
  }

  return left.errorMessage.localeCompare(right.errorMessage);
}

function compareFailedMarkets(
  left: BatchImportMarketResult,
  right: BatchImportMarketResult,
): number {
  const tickerCompare = left.marketTicker.localeCompare(right.marketTicker);
  if (tickerCompare !== 0) {
    return tickerCompare;
  }

  return left.configPath.localeCompare(right.configPath);
}

function toExample(market: BatchImportMarketResult): BatchImportFailureExample {
  return {
    marketTicker: market.marketTicker,
    configPath: market.configPath,
    errorMessage: market.errorMessage ?? "",
  };
}

function buildRecommendations(
  groups: readonly BatchImportFailureReasonGroup[],
  failedImports: number,
): string[] {
  if (failedImports === 0) {
    return ["No failed imports detected; no remediation required."];
  }

  const recommendations = new Set<string>();
  const topGroup = groups[0];

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED) {
    recommendations.add(
      "Reduce batch concurrency and add retry/backoff for Kalshi and BTC providers.",
    );
  }

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.NETWORK_FAILURE) {
    recommendations.add(
      "Retry failed imports after verifying network connectivity and upstream availability.",
    );
  }

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.PROVIDER_UNAVAILABLE) {
    recommendations.add(
      "Retry when providers recover; consider staggering import windows.",
    );
  }

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.MARKET_NOT_FOUND) {
    recommendations.add(
      "Regenerate import configs from a fresh market discovery pass.",
    );
  }

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.NO_HISTORICAL_DATA) {
    recommendations.add(
      "Exclude markets with no historical candle coverage from the import batch.",
    );
  }

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.INVALID_METADATA) {
    recommendations.add(
      "Fix invalid import config.json files before re-running the batch.",
    );
  }

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.MALFORMED_RESPONSE) {
    recommendations.add(
      "Inspect upstream API responses and importer normalization for malformed payloads.",
    );
  }

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.UNSUPPORTED_MARKET) {
    recommendations.add(
      "Filter discovery output to supported series and market shapes.",
    );
  }

  if (topGroup?.code === BATCH_IMPORT_FAILURE_CATEGORY.UNKNOWN) {
    recommendations.add(
      "Review example error messages and add structured error codes to the batch runner.",
    );
  }

  recommendations.add(
    `Re-run failed markets with: npm run import:batch -- --input-dir <configs> --output-dir data/imports --concurrency 1`,
  );

  return [...recommendations].sort((left, right) => left.localeCompare(right));
}

/** Builds a deterministic failure analysis report from batch import results. */
export function buildBatchImportFailureAnalysis(
  input: BuildBatchImportFailureAnalysisInput,
): BatchImportFailureAnalysis {
  const maxExamples = input.maxExamplesPerReason ?? DEFAULT_MAX_EXAMPLES;
  const failedMarkets = [...input.failedMarkets]
    .filter((market) => market.status === "failed")
    .sort(compareFailedMarkets);

  const grouped = new Map<BatchImportFailureCategory, BatchImportFailureExample[]>();

  for (const market of failedMarkets) {
    const code = categorizeBatchImportFailure(market.errorMessage);
    const examples = grouped.get(code) ?? [];
    examples.push(toExample(market));
    grouped.set(code, examples);
  }

  const failureReasons: BatchImportFailureReasonGroup[] = CATEGORY_ORDER.flatMap(
    (code) => {
      const examples = grouped.get(code);
      if (!examples?.length) {
        return [];
      }

      const sortedExamples = [...examples].sort(compareExamples).slice(0, maxExamples);
      const count = examples.length;
      const percentage =
        input.failedImports > 0 ? (count / input.failedImports) * 100 : 0;

      return [
        {
          code,
          count,
          percentage: Math.round(percentage * 100) / 100,
          examples: sortedExamples,
        },
      ];
    },
  ).sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return left.code.localeCompare(right.code);
  });

  let recoverableFailures = 0;
  let unrecoverableFailures = 0;

  for (const group of failureReasons) {
    if (RECOVERABLE_BATCH_IMPORT_FAILURE_CATEGORIES.has(group.code)) {
      recoverableFailures += group.count;
    } else {
      unrecoverableFailures += group.count;
    }
  }

  return {
    totalConfigs: input.totalConfigs,
    successfulImports: input.successfulImports,
    failedImports: input.failedImports,
    failureReasons,
    recoverableFailures,
    unrecoverableFailures,
    recommendations: buildRecommendations(failureReasons, input.failedImports),
  };
}
