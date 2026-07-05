import { posix } from "node:path";

import { classifyExpansionImportFailure } from "@/lib/data/importJobs/expansionExecutor/expansionImportCircuitBreaker";
import { isUnsupportedHistoricalMarketSkipReason } from "@/lib/data/importJobs/expansionExecutor/classifyUnsupportedHistoricalMarket";
import { buildExpansionMarketImportArtifacts } from "@/lib/data/importJobs/expansionExecutor/buildExpansionMarketImportConfig";
import {
  BATCH_IMPORT_CONFIG_FILENAME,
  BATCH_IMPORT_RESULT_FILENAME,
} from "@/lib/data/importJobs/batchImport/batchImportTypes";
import type { HistoricalExpansionImportJob } from "@/lib/data/importJobs/expansionConfig";
import type { ExpansionDiscoveredMarket } from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";

import type {
  ExpansionImportFailedMarketCheckpoint,
  ExpansionImportJobCheckpoint,
  HistoricalExpansionImportCheckpoint,
} from "./expansionImportSafetyTypes";

export type ExpansionImportResumeFailureClass = "transient" | "compatibility" | "other";

export type ExpansionImportResumeDiagnostics = {
  resumeSkippedSuccessful: number;
  resumeSkippedUnsupported: number;
  resumeRetriedFailed: number;
  resumeRetriedTransient: number;
  resumeAmbiguousStateCount: number;
};

export function createExpansionImportResumeDiagnostics(): ExpansionImportResumeDiagnostics {
  return {
    resumeSkippedSuccessful: 0,
    resumeSkippedUnsupported: 0,
    resumeRetriedFailed: 0,
    resumeRetriedTransient: 0,
    resumeAmbiguousStateCount: 0,
  };
}

export function classifyExpansionImportFailureForResume(
  errorMessage: string | null,
): ExpansionImportResumeFailureClass {
  if (!errorMessage) {
    return "other";
  }

  const failureClass = classifyExpansionImportFailure(errorMessage);
  if (failureClass === "rate-limit") {
    return "transient";
  }

  if (failureClass === "import-compatibility") {
    return "compatibility";
  }

  return "other";
}

export function buildExpansionImportArtifactPaths(
  seriesTicker: string,
  marketTicker: string,
  paths: { importConfigsDir: string; importsDir: string },
): { configPath: string; importResultPath: string } {
  const safeSeries = seriesTicker.replace(/\\/g, "/");
  const safeMarket = marketTicker.replace(/\\/g, "/");

  return {
    configPath: posix.join(
      paths.importConfigsDir.replace(/\\/g, "/"),
      safeSeries,
      safeMarket,
      BATCH_IMPORT_CONFIG_FILENAME,
    ),
    importResultPath: posix.join(
      paths.importsDir.replace(/\\/g, "/"),
      safeSeries,
      safeMarket,
      BATCH_IMPORT_RESULT_FILENAME,
    ),
  };
}

export function resolveExpansionImportArtifactPaths(
  job: HistoricalExpansionImportJob,
  market: Pick<ExpansionDiscoveredMarket, "marketTicker" | "seriesTicker" | "eventTicker" | "status" | "openTime" | "closeTime" | "settlementTime" | "expirationValue" | "title" | "subtitle" | "provenance" | "listMarketWire">,
  paths: { importConfigsDir: string; importsDir: string },
): { configPath: string; importResultPath: string } {
  const artifacts = buildExpansionMarketImportArtifacts(job, market, paths);
  return {
    configPath: artifacts.configPath,
    importResultPath: artifacts.importResultPath,
  };
}

export type ExpansionImportArtifactVerification = "verified" | "ambiguous" | "missing";

/** Verifies that a successful import has a matching import-result artifact. */
export function verifyExpansionImportArtifacts(input: {
  configPath: string;
  importResultPath: string;
  fileExists: (path: string) => boolean;
}): ExpansionImportArtifactVerification {
  const hasConfig = input.fileExists(input.configPath);
  const hasImportResult = input.fileExists(input.importResultPath);

  if (hasImportResult) {
    return "verified";
  }

  if (hasConfig) {
    return "ambiguous";
  }

  return "missing";
}

function findJobCheckpoint(
  checkpoint: HistoricalExpansionImportCheckpoint,
  jobId: string,
): ExpansionImportJobCheckpoint | null {
  return checkpoint.jobs.find((job) => job.jobId === jobId) ?? null;
}

export function healExpansionImportCheckpointForResume(input: {
  checkpoint: HistoricalExpansionImportCheckpoint;
  jobs: readonly HistoricalExpansionImportJob[];
  importConfigsDir: string;
  importsDir: string;
  fileExists: (path: string) => boolean;
}): HistoricalExpansionImportCheckpoint {
  const jobById = new Map(input.jobs.map((job) => [job.jobId, job]));

  return {
    ...input.checkpoint,
    jobs: input.checkpoint.jobs.map((jobCheckpoint) => {
      const job = jobById.get(jobCheckpoint.jobId);
      if (!job) {
        return jobCheckpoint;
      }

      const completedMarkets = jobCheckpoint.completedMarkets.filter((marketTicker) => {
        const paths = buildExpansionImportArtifactPaths(
          job.seriesTicker,
          marketTicker,
          {
            importConfigsDir: input.importConfigsDir,
            importsDir: input.importsDir,
          },
        );

        return (
          verifyExpansionImportArtifacts({
            ...paths,
            fileExists: input.fileExists,
          }) === "verified"
        );
      });

      return {
        ...jobCheckpoint,
        completedMarkets: [...completedMarkets].sort(),
      };
    }),
  };
}

export type ExpansionMarketExecutionPlan =
  | { action: "execute" }
  | {
      action: "skip";
      reason: string;
      resumeMetric?: keyof ExpansionImportResumeDiagnostics;
    }
  | {
      action: "retry";
      retryCount: number;
      resumeMetric: "resumeRetriedFailed" | "resumeRetriedTransient";
    };

export function planExpansionMarketExecution(input: {
  safety: {
    resume: boolean;
    skipFailed: boolean;
    retryFailed: boolean;
    retryUnsupported: boolean;
    verifyResumeArtifacts: boolean;
    forceMarket: string | null;
    maxRetries: number;
  };
  checkpoint: HistoricalExpansionImportCheckpoint;
  jobId: string;
  marketTicker: string;
  artifactPaths?: { configPath: string; importResultPath: string };
  fileExists?: (path: string) => boolean;
}): ExpansionMarketExecutionPlan {
  if (
    input.safety.forceMarket !== null
    && input.marketTicker !== input.safety.forceMarket
  ) {
    return {
      action: "skip",
      reason: `Not target of --force-market (${input.safety.forceMarket})`,
    };
  }

  const jobCheckpoint = findJobCheckpoint(input.checkpoint, input.jobId);
  if (!jobCheckpoint || !input.safety.resume) {
    return { action: "execute" };
  }

  if (jobCheckpoint.unsupportedSkippedMarkets.includes(input.marketTicker)) {
    if (input.safety.retryUnsupported) {
      return { action: "execute" };
    }

    return {
      action: "skip",
      reason: "Unsupported historical market skipped previously",
      resumeMetric: "resumeSkippedUnsupported",
    };
  }

  if (jobCheckpoint.completedMarkets.includes(input.marketTicker)) {
    if (
      input.safety.verifyResumeArtifacts
      && input.artifactPaths
      && input.fileExists
    ) {
      const verification = verifyExpansionImportArtifacts({
        ...input.artifactPaths,
        fileExists: input.fileExists,
      });

      if (verification === "ambiguous") {
        return { action: "execute" };
      }

      if (verification === "missing") {
        return { action: "execute" };
      }
    }

    return {
      action: "skip",
      reason: "Successful import already recorded in checkpoint",
      resumeMetric: "resumeSkippedSuccessful",
    };
  }

  const failedEntry = jobCheckpoint.failedMarkets.find(
    (entry) => entry.marketTicker === input.marketTicker,
  );

  if (failedEntry) {
    return planFailedMarketResume(input.safety, failedEntry);
  }

  return { action: "execute" };
}

function planFailedMarketResume(
  safety: {
    skipFailed: boolean;
    retryFailed: boolean;
    maxRetries: number;
  },
  failedEntry: ExpansionImportFailedMarketCheckpoint,
): ExpansionMarketExecutionPlan {
  const failureClass = classifyExpansionImportFailureForResume(
    failedEntry.lastErrorMessage,
  );

  if (failureClass === "transient") {
    return {
      action: "retry",
      retryCount: failedEntry.retryCount + 1,
      resumeMetric: "resumeRetriedTransient",
    };
  }

  if (failureClass === "compatibility") {
    if (safety.retryFailed) {
      return {
        action: "retry",
        retryCount: failedEntry.retryCount + 1,
        resumeMetric: "resumeRetriedFailed",
      };
    }

    return {
      action: "skip",
      reason: "Skipped parser/compatibility failure on resume",
    };
  }

  if (safety.skipFailed) {
    return {
      action: "skip",
      reason: "Skipped failed market (--skip-failed)",
    };
  }

  if (failedEntry.retryCount >= safety.maxRetries) {
    return {
      action: "skip",
      reason: `Retry exhausted (${failedEntry.retryCount}/${safety.maxRetries})`,
    };
  }

  return {
    action: "retry",
    retryCount: failedEntry.retryCount + 1,
    resumeMetric: "resumeRetriedFailed",
  };
}

export function recordExpansionImportResumePlanMetric(
  metrics: ExpansionImportResumeDiagnostics,
  plan: ExpansionMarketExecutionPlan,
  options?: { ambiguousArtifact?: boolean },
): void {
  if (options?.ambiguousArtifact) {
    metrics.resumeAmbiguousStateCount += 1;
    return;
  }

  if (plan.action === "skip" && plan.resumeMetric) {
    metrics[plan.resumeMetric] += 1;
    return;
  }

  if (plan.action === "retry" && plan.resumeMetric) {
    metrics[plan.resumeMetric] += 1;
  }
}

export function shouldPersistResumeSkipToCheckpoint(reason: string): boolean {
  return !reason.startsWith("Successful import already recorded")
    && !reason.startsWith("Unsupported historical market skipped previously")
    && !reason.startsWith("Skipped parser/compatibility failure on resume")
    && !reason.startsWith("Skipped failed market")
    && !reason.startsWith("Retry exhausted");
}

export function isTerminalUnsupportedSkipReason(skipReason: string | null): boolean {
  return isUnsupportedHistoricalMarketSkipReason(skipReason);
}
