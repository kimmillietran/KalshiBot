import type { StrategySweepRunResult } from "@/lib/data/research/sweep/strategySweepTypes";

import {
  calculateEtaMs,
  formatDurationClock,
  formatProgressBar,
} from "./cliProgressMath";
import {
  createCliProgressRenderer,
  type CliProgressRenderer,
} from "./createCliProgressRenderer";

export type StrategySweepProgressSnapshot = {
  completedJobs: number;
  totalJobs: number;
  totalMarkets: number;
  totalStrategies: number;
  marketsFullyComplete: number;
  successfulJobs: number;
  failedJobs: number;
  outputsWritten: number;
  currentStrategyId: string;
  currentMarketTicker: string;
  elapsedMs: number;
};

export type StrategySweepProgressReporterOptions = {
  totalJobs: number;
  totalMarkets: number;
  strategyIds: readonly string[];
  startedAtMs: number;
  isTty?: boolean;
  nonTtyUpdateEvery?: number;
  write: (message: string) => void;
  now?: () => number;
};

export type StrategySweepProgressReporter = {
  recordJob: (
    result: Pick<
      StrategySweepRunResult,
      "strategyId" | "seriesTicker" | "marketTicker" | "status"
    >,
  ) => void;
  complete: () => void;
};

function marketKey(seriesTicker: string, marketTicker: string): string {
  return `${seriesTicker}/${marketTicker}`;
}

export function formatStrategySweepProgressLines(
  snapshot: StrategySweepProgressSnapshot,
): string[] {
  const etaMs = calculateEtaMs(
    snapshot.elapsedMs,
    snapshot.completedJobs,
    snapshot.totalJobs,
  );

  return [
    "[Sweep]",
    formatProgressBar(snapshot.completedJobs, snapshot.totalJobs),
    "",
    "Markets:",
    `${snapshot.marketsFullyComplete} / ${snapshot.totalMarkets}`,
    "",
    "Strategies:",
    `${snapshot.totalStrategies} / ${snapshot.totalStrategies}`,
    "",
    "Research jobs completed:",
    `${snapshot.completedJobs} / ${snapshot.totalJobs}`,
    "",
    "Current strategy:",
    snapshot.currentStrategyId,
    "",
    "Current market:",
    snapshot.currentMarketTicker,
    "",
    "Elapsed:",
    formatDurationClock(snapshot.elapsedMs),
    "",
    "ETA:",
    etaMs === null ? "--:--" : formatDurationClock(etaMs),
    "",
    "Research outputs written:",
    String(snapshot.outputsWritten),
  ];
}

/** Creates a stderr progress reporter for strategy sweeps. */
export function createStrategySweepProgressReporter(
  options: StrategySweepProgressReporterOptions,
): StrategySweepProgressReporter {
  const now = options.now ?? (() => Date.now());
  const renderer: CliProgressRenderer = createCliProgressRenderer({
    isTty: options.isTty ?? false,
    nonTtyUpdateEvery: options.nonTtyUpdateEvery,
    write: options.write,
  });
  const totalStrategies = options.strategyIds.length;
  const marketCompletion = new Map<string, Set<string>>();

  let completedJobs = 0;
  let successfulJobs = 0;
  let failedJobs = 0;
  let outputsWritten = 0;
  let marketsFullyComplete = 0;
  let currentStrategyId = "";
  let currentMarketTicker = "";

  const buildSnapshot = (): StrategySweepProgressSnapshot => ({
    completedJobs,
    totalJobs: options.totalJobs,
    totalMarkets: options.totalMarkets,
    totalStrategies,
    marketsFullyComplete,
    successfulJobs,
    failedJobs,
    outputsWritten,
    currentStrategyId,
    currentMarketTicker,
    elapsedMs: Math.max(0, now() - options.startedAtMs),
  });

  return {
    recordJob(result) {
      completedJobs += 1;
      currentStrategyId = result.strategyId;
      currentMarketTicker = result.marketTicker;

      if (result.status === "success") {
        successfulJobs += 1;
        outputsWritten += 1;
      } else {
        failedJobs += 1;
      }

      const key = marketKey(result.seriesTicker, result.marketTicker);
      const completedStrategies = marketCompletion.get(key) ?? new Set<string>();
      const previousSize = completedStrategies.size;
      completedStrategies.add(result.strategyId);
      marketCompletion.set(key, completedStrategies);

      if (
        previousSize < totalStrategies
        && completedStrategies.size === totalStrategies
      ) {
        marketsFullyComplete += 1;
      }

      const snapshot = buildSnapshot();
      renderer.render(
        snapshot.completedJobs,
        snapshot.totalJobs,
        formatStrategySweepProgressLines(snapshot),
      );
    },
    complete() {
      renderer.complete(formatStrategySweepProgressLines(buildSnapshot()));
    },
  };
}
