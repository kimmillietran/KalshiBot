import { describe, expect, it } from "vitest";

import { UNSUPPORTED_HISTORICAL_MARKET_SKIP_REASON_PREFIX } from "@/lib/data/importJobs/expansionExecutor/classifyUnsupportedHistoricalMarket";

import { initializeExpansionImportCheckpoint, serializeExpansionImportCheckpoint } from "./index";
import {
  buildExpansionImportArtifactPaths,
  classifyExpansionImportFailureForResume,
  healExpansionImportCheckpointForResume,
  planExpansionMarketExecution,
  verifyExpansionImportArtifacts,
} from "./expansionImportResumeSemantics";
import { updateExpansionImportCheckpoint } from "./updateExpansionImportCheckpoint";

const GENERATED_AT = "2026-07-05T04:00:00.000Z";
const INPUT_PATH = "data/import-configs/historical-expansion-config.json";
const CHECKPOINT_PATH = "data/research-results/historical-expansion-import-checkpoint.json";
const JOB_ID = "expansion-KXBTC15M-20260101-20260331";

function createSafety(overrides?: Partial<{
  resume: boolean;
  skipFailed: boolean;
  retryFailed: boolean;
  retryUnsupported: boolean;
  verifyResumeArtifacts: boolean;
  maxRetries: number;
}>) {
  return {
    resume: false,
    skipFailed: false,
    retryFailed: false,
    retryUnsupported: false,
    verifyResumeArtifacts: false,
    forceMarket: null,
    maxRetries: 2,
    ...overrides,
  };
}

function createCheckpointJson(overrides?: {
  completedMarkets?: string[];
  unsupportedSkippedMarkets?: string[];
  failedMarkets?: Array<{
    marketTicker: string;
    retryCount: number;
    lastErrorMessage: string | null;
    lastAttemptAt: string;
  }>;
}) {
  return serializeExpansionImportCheckpoint({
    generatedAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    inputPath: INPUT_PATH,
    checkpointPath: CHECKPOINT_PATH,
    resume: true,
    runStatus: "partial",
    maxRetries: 2,
    jobs: [
      {
        jobId: JOB_ID,
        lastCompletedMarketTicker: overrides?.completedMarkets?.[0] ?? null,
        completedMarkets: overrides?.completedMarkets ?? [],
        unsupportedSkippedMarkets: overrides?.unsupportedSkippedMarkets ?? [],
        failedMarkets: overrides?.failedMarkets ?? [],
      },
    ],
  });
}

describe("expansionImportResumeSemantics", () => {
  it("classifies transient and compatibility failures for resume", () => {
    expect(
      classifyExpansionImportFailureForResume("Kalshi historical API error (429)"),
    ).toBe("transient");
    expect(
      classifyExpansionImportFailureForResume(
        "Kalshi historical market response missing required fields: expiration_value.",
      ),
    ).toBe("compatibility");
  });

  it("skips only verified successful imports on resume", () => {
    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: createCheckpointJson({
        completedMarkets: ["MKT-A"],
      }),
    });

    const artifactPaths = buildExpansionImportArtifactPaths(
      "KXBTC15M",
      "MKT-A",
      {
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
      },
    );

    expect(
      planExpansionMarketExecution({
        safety: createSafety({ resume: true }),
        checkpoint,
        jobId: JOB_ID,
        marketTicker: "MKT-A",
        artifactPaths,
        fileExists: () => true,
      }),
    ).toEqual({
      action: "skip",
      reason: "Successful import already recorded in checkpoint",
      resumeMetric: "resumeSkippedSuccessful",
    });
  });

  it("retries transient failures on resume", () => {
    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: createCheckpointJson({
        failedMarkets: [
          {
            marketTicker: "MKT-B",
            retryCount: 2,
            lastErrorMessage: "Kalshi historical API error (429)",
            lastAttemptAt: GENERATED_AT,
          },
        ],
      }),
    });

    expect(
      planExpansionMarketExecution({
        safety: createSafety({ resume: true }),
        checkpoint,
        jobId: JOB_ID,
        marketTicker: "MKT-B",
      }),
    ).toEqual({
      action: "retry",
      retryCount: 3,
      resumeMetric: "resumeRetriedTransient",
    });
  });

  it("does not skip selected-only checkpoint entries after heal", () => {
    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: createCheckpointJson({
        completedMarkets: ["MKT-PLANNED"],
      }),
    });

    const healed = healExpansionImportCheckpointForResume({
      checkpoint,
      jobs: [
        {
          jobId: JOB_ID,
          priority: 1,
          status: "scheduled",
          seriesTicker: "KXBTC15M",
        } as never,
      ],
      importConfigsDir: "data/import-configs",
      importsDir: "data/imports",
      fileExists: () => false,
    });

    expect(healed.jobs[0]?.completedMarkets).toEqual([]);
    expect(
      planExpansionMarketExecution({
        safety: createSafety({ resume: true }),
        checkpoint: healed,
        jobId: JOB_ID,
        marketTicker: "MKT-PLANNED",
      }),
    ).toEqual({ action: "execute" });
  });

  it("requires import-result verification before skipping when enabled", () => {
    expect(
      verifyExpansionImportArtifacts({
        configPath: "data/import-configs/KXBTC15M/MKT-A/config.json",
        importResultPath: "data/imports/KXBTC15M/MKT-A/import-result.json",
        fileExists: (path) => path.endsWith("config.json"),
      }),
    ).toBe("ambiguous");

    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: createCheckpointJson({
        completedMarkets: ["MKT-A"],
      }),
    });

    const artifactPaths = buildExpansionImportArtifactPaths(
      "KXBTC15M",
      "MKT-A",
      {
        importConfigsDir: "data/import-configs",
        importsDir: "data/imports",
      },
    );

    expect(
      planExpansionMarketExecution({
        safety: createSafety({ resume: true, verifyResumeArtifacts: true }),
        checkpoint,
        jobId: JOB_ID,
        marketTicker: "MKT-A",
        artifactPaths,
        fileExists: (path) => path.endsWith("config.json"),
      }),
    ).toEqual({ action: "execute" });
  });

  it("handles unsupported terminal skips unless retry unsupported is enabled", () => {
    const unsupportedReason = `${UNSUPPORTED_HISTORICAL_MARKET_SKIP_REASON_PREFIX}Missing expiration_value.`;
    let checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: false,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: null,
    });

    checkpoint = updateExpansionImportCheckpoint(
      checkpoint,
      JOB_ID,
      {
        marketTicker: "MKT-U",
        seriesTicker: "KXBTC15M",
        status: "skipped",
        configPath: null,
        importResultPath: null,
        errorMessage: null,
        skipReason: unsupportedReason,
        durationMs: 0,
      },
      GENERATED_AT,
    );

    expect(checkpoint.jobs[0]?.unsupportedSkippedMarkets).toEqual(["MKT-U"]);
    expect(checkpoint.jobs[0]?.completedMarkets).toEqual([]);

    expect(
      planExpansionMarketExecution({
        safety: createSafety({ resume: true }),
        checkpoint,
        jobId: JOB_ID,
        marketTicker: "MKT-U",
      }),
    ).toEqual({
      action: "skip",
      reason: "Unsupported historical market skipped previously",
      resumeMetric: "resumeSkippedUnsupported",
    });

    expect(
      planExpansionMarketExecution({
        safety: createSafety({ resume: true, retryUnsupported: true }),
        checkpoint,
        jobId: JOB_ID,
        marketTicker: "MKT-U",
      }),
    ).toEqual({ action: "execute" });
  });
});
