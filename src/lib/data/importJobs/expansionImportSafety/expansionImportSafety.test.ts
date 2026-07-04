import { describe, expect, it } from "vitest";

import {
  finalizeExpansionImportRunStatus,
  initializeExpansionImportCheckpoint,
  planExpansionMarketExecution,
  serializeExpansionImportCheckpoint,
  updateExpansionImportCheckpoint,
} from "./index";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";
const INPUT_PATH = "data/import-configs/historical-expansion-config.json";
const CHECKPOINT_PATH = "data/research-results/historical-expansion-import-checkpoint.json";
const JOB_ID = "expansion-KXBTC15M-20260101-20260331";

function createSafety(overrides?: Partial<{
  resume: boolean;
  skipFailed: boolean;
  forceMarket: string | null;
  maxRetries: number;
}>) {
  return {
    resume: false,
    skipFailed: false,
    forceMarket: null,
    checkpointPath: CHECKPOINT_PATH,
    maxRetries: 2,
    summaryInputPath: null,
    ...overrides,
  };
}

describe("initializeExpansionImportCheckpoint", () => {
  it("clears failed markets on a fresh run", () => {
    const existing = serializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: false,
      runStatus: "partial",
      maxRetries: 2,
      jobs: [
        {
          jobId: JOB_ID,
          lastCompletedMarketTicker: "MKT-A",
          completedMarkets: ["MKT-A"],
          failedMarkets: [
            {
              marketTicker: "MKT-B",
              retryCount: 1,
              lastErrorMessage: "boom",
              lastAttemptAt: GENERATED_AT,
            },
          ],
        },
      ],
    });

    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: false,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: existing,
    });

    expect(checkpoint.jobs[0]?.failedMarkets).toEqual([]);
    expect(checkpoint.jobs[0]?.completedMarkets).toEqual(["MKT-A"]);
  });
});

describe("planExpansionMarketExecution", () => {
  it("skips markets already completed in checkpoint", () => {
    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: serializeExpansionImportCheckpoint({
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
            lastCompletedMarketTicker: "MKT-A",
            completedMarkets: ["MKT-A"],
            failedMarkets: [],
          },
        ],
      }),
    });

    const plan = planExpansionMarketExecution({
      safety: createSafety({ resume: true }),
      checkpoint,
      jobId: JOB_ID,
      marketTicker: "MKT-A",
    });

    expect(plan).toEqual({
      action: "skip",
      reason: "Already completed in checkpoint",
    });
  });

  it("retries failed markets until max retries are exhausted", () => {
    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: serializeExpansionImportCheckpoint({
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
            lastCompletedMarketTicker: null,
            completedMarkets: [],
            failedMarkets: [
              {
                marketTicker: "MKT-B",
                retryCount: 2,
                lastErrorMessage: "boom",
                lastAttemptAt: GENERATED_AT,
              },
            ],
          },
        ],
      }),
    });

    expect(
      planExpansionMarketExecution({
        safety: createSafety({ resume: true, maxRetries: 2 }),
        checkpoint,
        jobId: JOB_ID,
        marketTicker: "MKT-B",
      }),
    ).toEqual({
      action: "skip",
      reason: "Retry exhausted (2/2)",
    });
  });
});

describe("updateExpansionImportCheckpoint", () => {
  it("records failed markets with retry counts", () => {
    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: false,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: null,
    });

    const updated = updateExpansionImportCheckpoint(
      checkpoint,
      JOB_ID,
      {
        marketTicker: "MKT-B",
        seriesTicker: "KXBTC15M",
        status: "failed",
        configPath: null,
        importResultPath: null,
        errorMessage: "boom",
        skipReason: null,
        durationMs: 1,
      },
      GENERATED_AT,
    );

    expect(updated.jobs[0]?.failedMarkets).toEqual([
      {
        marketTicker: "MKT-B",
        retryCount: 1,
        lastErrorMessage: "boom",
        lastAttemptAt: GENERATED_AT,
      },
    ]);
  });
});

describe("finalizeExpansionImportRunStatus", () => {
  it("marks interrupted runs", () => {
    const checkpoint = initializeExpansionImportCheckpoint({
      generatedAt: GENERATED_AT,
      inputPath: INPUT_PATH,
      checkpointPath: CHECKPOINT_PATH,
      resume: true,
      maxRetries: 2,
      jobIds: [JOB_ID],
      existingCheckpointJson: null,
    });

    expect(
      finalizeExpansionImportRunStatus({
        interrupted: true,
        checkpoint,
        jobs: [],
        maxRetries: 2,
      }),
    ).toEqual({
      checkpointRunStatus: "interrupted",
      summaryRunStatus: "interrupted",
    });
  });
});
