import type { ExpansionImportMarketStatus } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";

import {
  calculateEtaMs,
  formatDurationClock,
  formatProgressBar,
} from "./cliProgressMath";
import {
  createCliProgressRenderer,
  isCliProgressTty,
  type CliProgressRenderer,
} from "./createCliProgressRenderer";

export { isCliProgressTty };

export type ExpansionImportJobHeaderSnapshot = {
  dryRun: boolean;
  resume: boolean;
  maxMarkets: number | null;
  jobIndex: number;
  totalJobs: number;
  jobId: string;
  seriesTicker: string;
  windowLabel: string;
  discoveredCount: number;
  alreadyCoveredCount: number;
  toImportCount: number;
};

export type ExpansionImportMarketProgressSnapshot = {
  dryRun: boolean;
  completedMarkets: number;
  totalMarkets: number;
  currentMarketTicker: string;
  importedCount: number;
  plannedCount: number;
  failedCount: number;
  skippedCount: number;
  dedupedCount: number;
  elapsedMs: number;
};

export type ExpansionImportProgressReporterOptions = {
  startedAtMs: number;
  isTty?: boolean;
  nonTtyUpdateEvery?: number;
  write: (message: string) => void;
  now?: () => number;
};

export type ExpansionImportProgressReporter = {
  reportJobHeader: (snapshot: ExpansionImportJobHeaderSnapshot) => void;
  recordMarket: (status: ExpansionImportMarketStatus, marketTicker: string) => void;
  recordDedupedMarket: (marketTicker: string) => void;
  reportAbortGuard: (lines: readonly string[]) => void;
  completeJob: () => void;
  complete: () => void;
};

function formatModeLabel(dryRun: boolean): string {
  return dryRun ? "[Expansion Import] DRY RUN" : "[Expansion Import]";
}

/** Formats the per-job discovery summary block for expansion imports. */
export function formatExpansionImportJobHeaderLines(
  snapshot: ExpansionImportJobHeaderSnapshot,
): string[] {
  const lines = [
    formatModeLabel(snapshot.dryRun),
    `Job ${snapshot.jobIndex}/${snapshot.totalJobs}: ${snapshot.jobId}`,
    `Window: ${snapshot.windowLabel}`,
    `Discovered: ${snapshot.discoveredCount} markets | Already covered: ${snapshot.alreadyCoveredCount} | To import: ${snapshot.toImportCount}`,
  ];

  if (snapshot.maxMarkets !== null) {
    lines.push(`Import cap: ${snapshot.maxMarkets} markets (--max-markets)`);
  }

  if (snapshot.resume) {
    lines.push(
      "Resume: enabled — skipping markets already present in import configs, fixtures, or research outputs",
    );
  }

  return lines;
}

/** Formats the live market progress block for expansion imports. */
export function formatExpansionImportMarketProgressLines(
  snapshot: ExpansionImportMarketProgressSnapshot,
): string[] {
  const etaMs = calculateEtaMs(
    snapshot.elapsedMs,
    snapshot.completedMarkets,
    snapshot.totalMarkets,
  );
  const outcomeLabel = snapshot.dryRun ? "Planned" : "Imported";
  const outcomeCount = snapshot.dryRun ? snapshot.plannedCount : snapshot.importedCount;

  return [
    "[Expansion Import]",
    `${formatProgressBar(snapshot.completedMarkets, snapshot.totalMarkets)} ${snapshot.completedMarkets}/${snapshot.totalMarkets} markets`,
    `Current: ${snapshot.currentMarketTicker}`,
    `${outcomeLabel}: ${outcomeCount} | Failed: ${snapshot.failedCount} | Skipped: ${snapshot.skippedCount} | Deduped: ${snapshot.dedupedCount}`,
    `Elapsed: ${formatDurationClock(snapshot.elapsedMs)} | ETA: ${
      etaMs === null ? "--:--" : formatDurationClock(etaMs)
    }`,
  ];
}

/** Formats an ISO timestamp pair as a compact calendar window label. */
export function formatExpansionImportWindowLabel(after: string, before: string): string {
  const start = after.slice(0, 10);
  const end = before.slice(0, 10);
  return `${start} → ${end}`;
}

/** Creates a stderr progress reporter for historical expansion imports. */
export function createExpansionImportProgressReporter(
  options: ExpansionImportProgressReporterOptions,
): ExpansionImportProgressReporter {
  const now = options.now ?? (() => Date.now());
  const write = options.write;

  let jobRenderer: CliProgressRenderer | null = null;
  let totalMarkets = 0;
  let completedMarkets = 0;
  let importedCount = 0;
  let plannedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let dedupedCount = 0;
  let currentMarketTicker = "";
  let dryRun = true;

  const buildMarketSnapshot = (): ExpansionImportMarketProgressSnapshot => ({
    dryRun,
    completedMarkets,
    totalMarkets,
    currentMarketTicker,
    importedCount,
    plannedCount,
    failedCount,
    skippedCount,
    dedupedCount,
    elapsedMs: Math.max(0, now() - options.startedAtMs),
  });

  const resetJobCounters = () => {
    jobRenderer = createCliProgressRenderer({
      isTty: options.isTty ?? false,
      nonTtyUpdateEvery: options.nonTtyUpdateEvery,
      write,
    });
    completedMarkets = 0;
    importedCount = 0;
    plannedCount = 0;
    failedCount = 0;
    skippedCount = 0;
    dedupedCount = 0;
    currentMarketTicker = "";
  };

  return {
    reportJobHeader(snapshot) {
      dryRun = snapshot.dryRun;
      totalMarkets = snapshot.toImportCount;
      resetJobCounters();
      write(`${formatExpansionImportJobHeaderLines(snapshot).join("\n")}\n\n`);
    },
    recordMarket(status, marketTicker) {
      if (totalMarkets <= 0) {
        return;
      }

      completedMarkets += 1;
      currentMarketTicker = marketTicker;

      if (status === "imported") {
        importedCount += 1;
      } else if (status === "planned") {
        plannedCount += 1;
      } else if (status === "failed") {
        failedCount += 1;
      } else if (status === "skipped") {
        skippedCount += 1;
      }

      jobRenderer?.render(
        completedMarkets,
        totalMarkets,
        formatExpansionImportMarketProgressLines(buildMarketSnapshot()),
      );
    },
    recordDedupedMarket(marketTicker) {
      dedupedCount += 1;
      currentMarketTicker = marketTicker;
    },
    reportAbortGuard(lines) {
      write(`\n${lines.join("\n")}\n\n`);
    },
    completeJob() {
      if (totalMarkets <= 0 || !jobRenderer) {
        jobRenderer = null;
        return;
      }

      jobRenderer.complete(formatExpansionImportMarketProgressLines(buildMarketSnapshot()));
      jobRenderer = null;
    },
    complete() {
      this.completeJob();
    },
  };
}
