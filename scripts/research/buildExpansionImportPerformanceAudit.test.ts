import { describe, expect, it } from "vitest";

import { runExpansionImportPerformanceAuditCommand } from "./buildExpansionImportPerformanceAudit";

const GENERATED_AT = "2026-07-05T21:30:00.000Z";
const SUMMARY_PATH = "data/research-results/historical-expansion-import-summary.json";
const CHECKPOINT_PATH = "data/research-results/historical-expansion-import-checkpoint.json";

function createIo() {
  const files: Record<string, string> = {
    [SUMMARY_PATH]: JSON.stringify({
      generatedAt: GENERATED_AT,
      execute: true,
      inputPath: "data/import-configs/historical-expansion-config.json",
      outputPath: SUMMARY_PATH,
      rateLimitDiagnostics: {
        rateLimitedCount: 3,
        backoffDurationMs: 15_000,
        retryCount: 3,
        firstRateLimitedTicker: "KXBTC15M-26JAN151215-00",
        recommendedNextAction: "Resume with higher backoff.",
      },
      summary: {
        jobCount: 1,
        discoveredMarketCount: 10,
        importedCount: 8,
        skippedCount: 1,
        failedCount: 1,
        plannedCount: 9,
        durationMs: 120_000,
      },
      jobs: [
        {
          jobId: "expansion-KXBTC15M-20260101-20260131",
          seriesTicker: "KXBTC15M",
          durationMs: 120_000,
          markets: [
            {
              marketTicker: "KXBTC15M-26JAN151215-00",
              seriesTicker: "KXBTC15M",
              status: "imported",
              durationMs: 1500,
            },
          ],
        },
      ],
    }),
    [CHECKPOINT_PATH]: JSON.stringify({
      generatedAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      inputPath: "data/import-configs/historical-expansion-config.json",
      checkpointPath: CHECKPOINT_PATH,
      resume: false,
      runStatus: "completed",
      maxRetries: 2,
      jobs: [],
    }),
  };

  let stdout = "";
  let stderr = "";

  return {
    files,
    stdout: () => stdout,
    stderr: () => stderr,
    io: {
      readFile: (path: string) => files[path] ?? "",
      fileExists: (path: string) => path in files,
      readdir: () => [] as string[],
      isDirectory: () => false,
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      writeFile: (path: string, data: string) => {
        files[path] = data;
      },
      mkdirSync: () => {},
    },
  };
}

describe("runExpansionImportPerformanceAuditCommand", () => {
  it("writes JSON and HTML audit outputs", () => {
    const mock = createIo();
    const exitCode = runExpansionImportPerformanceAuditCommand([], mock.io, {
      generatedAt: GENERATED_AT,
    });

    expect(exitCode).toBe(0);
    expect(mock.files["data/research-results/expansion-import-performance-audit.json"]).toBeDefined();
    expect(mock.files["data/reports/expansion-import-performance-audit.html"]).toContain(
      "Expansion Import Performance Audit",
    );

    const payload = JSON.parse(mock.stdout().trim()) as {
      totalElapsedMs: number;
      optimizationCount: number;
    };
    expect(payload.totalElapsedMs).toBe(120_000);
    expect(payload.optimizationCount).toBeGreaterThan(0);
  });

  it("returns exit code 1 when expansion import summary is missing", () => {
    const mock = createIo();
    delete mock.files[SUMMARY_PATH];

    const exitCode = runExpansionImportPerformanceAuditCommand([], mock.io, {
      generatedAt: GENERATED_AT,
    });

    expect(exitCode).toBe(1);
    expect(mock.stderr()).toContain("Required input not found");
  });
});
