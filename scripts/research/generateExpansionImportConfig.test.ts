import { describe, expect, it } from "vitest";

import { runGenerateExpansionImportConfigCommand } from "./generateExpansionImportConfig";
import { parseHistoricalExpansionImportConfigJson } from "@/lib/data/importJobs/expansionConfig";

const GENERATED_AT = "2026-07-04T03:42:22.603Z";
const PLAN_PATH = "data/research-results/historical-coverage-plan.json";
const OUTPUT_PATH = "data/import-configs/historical-expansion-config.json";
const HTML_PATH = "data/reports/historical-expansion-config.html";

function createM91CoveragePlanJson(): string {
  return JSON.stringify({
    generatedAt: GENERATED_AT,
    outputPath: PLAN_PATH,
    htmlOutputPath: "data/reports/historical-coverage-plan.html",
    snapshot: {
      marketCount: 500,
      uniqueTradingDays: 6,
      monthCoverage: [
        { month: "2026-04", marketCount: 309, tradingDayCount: 4 },
        { month: "2026-05", marketCount: 192, tradingDayCount: 2 },
      ],
      missingMonths: [],
      coverageHorizon: {
        earliestMonth: "2026-04",
        latestMonth: "2026-05",
      },
    },
    recommendations: [
      {
        recommendationId: "coverage-import-1",
        seriesTicker: "KXBTC15M",
        startMonth: "2026-01",
        endMonth: "2026-03",
        missingMonths: ["2026-01", "2026-02", "2026-03"],
        priorityScore: 71,
        rationale:
          "Import KXBTC15M markets for 2026-01 through 2026-03 because current hypotheses fail month-stability checks (monthPersistenceRate < 0.67) and 2026-Q1 coverage is absent.",
        expectedResearchBenefit:
          "Adds 3 missing calendar month(s) for KXBTC15M. Supports month-stability validation for 3 hypothesis candidate(s).",
      },
    ],
    plannerNotes: ["Read-only planner"],
  });
}

describe("runGenerateExpansionImportConfigCommand", () => {
  it("writes import jobs by default without --dry-run", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runGenerateExpansionImportConfigCommand([], {
      readFile: (path) => (path === PLAN_PATH ? createM91CoveragePlanJson() : ""),
      fileExists: (path) => path === PLAN_PATH,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: (text) => {
        stdout += text;
      },
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout).dryRun).toBe(false);
    expect(writes.has(OUTPUT_PATH)).toBe(true);
    expect(writes.has(HTML_PATH)).toBe(true);

    const parsed = parseHistoricalExpansionImportConfigJson(
      OUTPUT_PATH,
      writes.get(OUTPUT_PATH)!,
    );

    expect(parsed.outputPath).toBe(OUTPUT_PATH);
    expect(parsed.jobs).toHaveLength(1);
    expect(parsed.jobs[0]?.status).toBe("scheduled");
    expect(parsed.jobs[0]?.jobId).toBe("expansion-KXBTC15M-20260101-20260331");
    expect(parsed.jobs[0]?.importDefaults.btc.provider).toBe("coinbase-spot");
    expect(parsed).not.toHaveProperty("recommendations");
    expect(parsed).not.toHaveProperty("snapshot");
    expect(parsed).not.toHaveProperty("plannerNotes");
  });

  it("does not write output files when --dry-run is passed", () => {
    const writes = new Map<string, string>();

    const exitCode = runGenerateExpansionImportConfigCommand(["--dry-run"], {
      readFile: (path) => (path === PLAN_PATH ? createM91CoveragePlanJson() : ""),
      fileExists: (path) => path === PLAN_PATH,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: () => {},
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    expect(exitCode).toBe(0);
    expect(writes.size).toBe(0);
  });

  it("converts recommendation coverage-import-1 into a concrete scheduled import job", () => {
    const writes = new Map<string, string>();

    runGenerateExpansionImportConfigCommand([], {
      readFile: (path) => (path === PLAN_PATH ? createM91CoveragePlanJson() : ""),
      fileExists: (path) => path === PLAN_PATH,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: () => {},
      writeStderr: () => {},
      writeFile: (path, data) => {
        writes.set(path, data);
      },
      mkdirSync: () => {},
    }, { generatedAt: GENERATED_AT });

    const parsed = parseHistoricalExpansionImportConfigJson(
      OUTPUT_PATH,
      writes.get(OUTPUT_PATH)!,
    );

    expect(parsed.summary.scheduledJobCount).toBe(1);
    expect(parsed.jobs[0]?.seriesTicker).toBe("KXBTC15M");
    expect(parsed.jobs[0]?.windowStart).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.jobs[0]?.windowEnd).toBe("2026-03-31T23:59:59.999Z");
    expect(parsed.jobs[0]?.discovery.sampling.afterDate).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });

  it("returns non-zero when the coverage plan is missing", () => {
    let stderr = "";

    const exitCode = runGenerateExpansionImportConfigCommand([], {
      readFile: () => "",
      fileExists: () => false,
      isDirectory: () => false,
      readdir: () => [],
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Missing historical coverage plan");
  });
});
