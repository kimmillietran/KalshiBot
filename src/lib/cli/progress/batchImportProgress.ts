import type { BatchImportMarketResult } from "@/lib/data/importJobs/batchImport/batchImportTypes";

import {
  calculateEtaMs,
  formatCompletionPercent,
  formatDurationClock,
  formatProgressBar,
} from "./cliProgressMath";
import {
  createCliProgressRenderer,
  type CliProgressRenderer,
} from "./createCliProgressRenderer";

export type BatchImportProgressSnapshot = {
  completedMarkets: number;
  totalMarkets: number;
  currentMarketTicker: string;
  successCount: number;
  recoveredCount: number;
  failedCount: number;
  skippedCount: number;
  rateLimitCount: number;
  currentDelayMs: number;
  elapsedMs: number;
};

export type BatchImportProgressReporterOptions = {
  totalMarkets: number;
  startedAtMs: number;
  isTty?: boolean;
  nonTtyUpdateEvery?: number;
  write: (message: string) => void;
  now?: () => number;
};

export type BatchImportProgressReporter = {
  recordMarket: (
    result: Pick<
      BatchImportMarketResult,
      "status" | "retryCount" | "rateLimited"
    >,
    marketTicker: string,
    currentDelayMs: number,
  ) => void;
  complete: () => void;
};

export function formatBatchImportProgressLines(
  snapshot: BatchImportProgressSnapshot,
): string[] {
  const percent = formatCompletionPercent(
    snapshot.completedMarkets,
    snapshot.totalMarkets,
  );
  const etaMs = calculateEtaMs(
    snapshot.elapsedMs,
    snapshot.completedMarkets,
    snapshot.totalMarkets,
  );

  return [
    "[Import]",
    `${formatProgressBar(snapshot.completedMarkets, snapshot.totalMarkets)} ${snapshot.completedMarkets} / ${snapshot.totalMarkets} (${percent}%)`,
    "",
    `Current:\n${snapshot.currentMarketTicker}`,
    "",
    `Success: ${snapshot.successCount}`,
    `Recovered: ${snapshot.recoveredCount}`,
    `Failed: ${snapshot.failedCount}`,
    `Skipped: ${snapshot.skippedCount}`,
    `429s: ${snapshot.rateLimitCount}`,
    "",
    `Elapsed: ${formatDurationClock(snapshot.elapsedMs)}`,
    `ETA: ${etaMs === null ? "--:--" : formatDurationClock(etaMs)}`,
    "",
    `Current delay: ${snapshot.currentDelayMs} ms`,
  ];
}

/** Creates a stderr progress reporter for batch historical imports. */
export function createBatchImportProgressReporter(
  options: BatchImportProgressReporterOptions,
): BatchImportProgressReporter {
  const now = options.now ?? (() => Date.now());
  const renderer: CliProgressRenderer = createCliProgressRenderer({
    isTty: options.isTty ?? false,
    nonTtyUpdateEvery: options.nonTtyUpdateEvery,
    write: options.write,
  });

  let completedMarkets = 0;
  let successCount = 0;
  let recoveredCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let rateLimitCount = 0;
  let currentMarketTicker = "";
  let currentDelayMs = 0;

  const buildSnapshot = (): BatchImportProgressSnapshot => ({
    completedMarkets,
    totalMarkets: options.totalMarkets,
    currentMarketTicker,
    successCount,
    recoveredCount,
    failedCount,
    skippedCount,
    rateLimitCount,
    currentDelayMs,
    elapsedMs: Math.max(0, now() - options.startedAtMs),
  });

  return {
    recordMarket(result, marketTicker, delayMs) {
      completedMarkets += 1;
      currentMarketTicker = marketTicker;
      currentDelayMs = delayMs;

      if (result.status === "success") {
        successCount += 1;
        if ((result.retryCount ?? 0) > 0) {
          recoveredCount += 1;
        }
      } else if (result.status === "failed") {
        failedCount += 1;
      } else if (result.status === "skipped") {
        skippedCount += 1;
      }

      if (result.rateLimited) {
        rateLimitCount += 1;
      }

      const snapshot = buildSnapshot();
      renderer.render(
        snapshot.completedMarkets,
        snapshot.totalMarkets,
        formatBatchImportProgressLines(snapshot),
      );
    },
    complete() {
      renderer.complete(formatBatchImportProgressLines(buildSnapshot()));
    },
  };
}
