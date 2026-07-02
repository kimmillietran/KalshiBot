import { describe, expect, it } from "vitest";

import {
  buildResearchPipelineSteps,
} from "./buildResearchPipelineSteps";
import { parseResearchPipelineConfigFromArgv } from "./parseResearchPipelineArgv";
import {
  formatPipelineSpawnError,
} from "./spawnNpmScript";
import {
  runResearchPipeline,
  serializeResearchPipelineSummary,
} from "./runResearchPipeline";
import type {
  ResearchPipelineConfig,
  ResearchPipelineRunner,
} from "./researchPipelineTypes";
import type { ResearchDependencyIo } from "@/lib/data/research/dependencyValidation";

const GENERATED_AT = "2026-07-02T14:00:00.000Z";

function createConfig(
  overrides: Partial<ResearchPipelineConfig> = {},
): ResearchPipelineConfig {
  return {
    series: "KXBTC15M",
    limit: 500,
    concurrency: 1,
    continueOnError: false,
    strictDependencies: false,
    discoveryOutputPath: "discovery-result.json",
    summaryOutputPath: "data/research-results/pipeline-summary.json",
    rankBy: "totalPnL",
    importThrottle: {
      adaptiveThrottleEnabled: true,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      fixedRequestDelayMs: null,
    },
    ...overrides,
  };
}

describe("buildResearchPipelineSteps", () => {
  it("returns steps in the official pipeline order", () => {
    const steps = buildResearchPipelineSteps(createConfig());

    expect(steps.map((step) => step.id)).toEqual([
      "discover",
      "import-configs",
      "import-batch",
      "analyze-failures",
      "fixtures",
      "registry",
      "sweep",
      "aggregate",
      "leaderboard",
      "calibration",
      "report",
      "lead-lag",
      "significance",
      "power-analysis",
      "overfitting-diagnostics",
      "regime-tags",
      "mispricing-atlas",
      "hypotheses",
    ]);
  });

  it("threads series, limit, and retry flags into discover and import steps", () => {
    const steps = buildResearchPipelineSteps(
      createConfig({ series: "KXETH15M", limit: 25, concurrency: 2 }),
    );

    expect(steps[0]?.args).toEqual([
      "--series",
      "KXETH15M",
      "--limit",
      "25",
      "--request-delay-ms",
      "250",
      "--max-retries",
      "5",
      "--retry-base-delay-ms",
      "2000",
      "--output",
      "discovery-result.json",
    ]);
    expect(steps[2]?.args).toEqual([
      "--input-dir",
      "data/import-configs",
      "--output-dir",
      "data/imports",
      "--concurrency",
      "2",
      "--max-retries",
      "5",
      "--retry-base-delay-ms",
      "2000",
      "--adaptive-throttle",
      "--min-request-delay-ms",
      "100",
      "--max-request-delay-ms",
      "3000",
    ]);
    expect(steps[6]?.args).toContain("--concurrency");
    expect(steps[6]?.args).toContain("2");
  });
});

describe("parseResearchPipelineConfigFromArgv", () => {
  it("parses series, limit, and continue-on-error", () => {
    const config = parseResearchPipelineConfigFromArgv([
      "--series",
      "KXBTC15M",
      "--limit",
      "500",
      "--continue-on-error",
    ]);

    expect(config.series).toBe("KXBTC15M");
    expect(config.limit).toBe(500);
    expect(config.continueOnError).toBe(true);
  });

  it("rejects invalid limits", () => {
    expect(() =>
      parseResearchPipelineConfigFromArgv(["--limit", "0"]),
    ).toThrow(/Invalid --limit/);
  });

  it("defaults import batch step to adaptive throttling", () => {
    const config = parseResearchPipelineConfigFromArgv([]);

    expect(config.importThrottle).toEqual({
      adaptiveThrottleEnabled: true,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      fixedRequestDelayMs: null,
    });
  });

  it("uses fixed delay when --request-delay-ms is provided", () => {
    const config = parseResearchPipelineConfigFromArgv(["--request-delay-ms", "750"]);

    expect(config.importThrottle).toEqual({
      adaptiveThrottleEnabled: false,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      fixedRequestDelayMs: 750,
    });
  });

  it("parses strict-dependencies", () => {
    const config = parseResearchPipelineConfigFromArgv(["--strict-dependencies"]);

    expect(config.strictDependencies).toBe(true);
  });
});

describe("runResearchPipeline", () => {
  it("fails fast and marks remaining steps as skipped", async () => {
    const runner: ResearchPipelineRunner = async (npmScript) => {
      if (npmScript === "discover:markets") {
        return { exitCode: 1, stdout: "", stderr: "discover failed" };
      }

      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const { summary, exitCode } = await runResearchPipeline({
      config: createConfig(),
      generatedAt: GENERATED_AT,
      runner,
    });

    expect(exitCode).toBe(1);
    expect(summary.status).toBe("failed");
    expect(summary.steps[0]?.status).toBe("failed");
    expect(summary.steps[0]?.errorMessage).toBe("discover failed");
    expect(summary.steps[1]?.status).toBe("skipped");
    expect(summary.steps).toHaveLength(18);
  });

  it("continues after failures when configured", async () => {
    let callCount = 0;
    const runner: ResearchPipelineRunner = async () => {
      callCount += 1;
      return {
        exitCode: callCount === 1 ? 1 : 0,
        stdout: "",
        stderr: callCount === 1 ? "first failure" : "",
      };
    };

    const { summary } = await runResearchPipeline({
      config: createConfig({ continueOnError: true }),
      generatedAt: GENERATED_AT,
      runner,
    });

    expect(summary.status).toBe("partial");
    expect(summary.steps[0]?.status).toBe("failed");
    expect(summary.steps[1]?.status).toBe("succeeded");
    expect(callCount).toBe(18);
  });

  it("serializes pipeline summaries deterministically", async () => {
    const runner: ResearchPipelineRunner = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });

    const first = await runResearchPipeline({
      config: createConfig(),
      generatedAt: GENERATED_AT,
      runner,
    });
    const second = await runResearchPipeline({
      config: createConfig(),
      generatedAt: GENERATED_AT,
      runner,
    });

    const normalizeSummary = (summary: typeof first.summary) => ({
      ...summary,
      steps: summary.steps.map((step) => ({ ...step, durationMs: 0 })),
    });

    expect(
      serializeResearchPipelineSummary(normalizeSummary(first.summary)),
    ).toBe(serializeResearchPipelineSummary(normalizeSummary(second.summary)));
    expect(first.summary.steps[0]?.command).toContain("discover:markets");
    expect(first.summary.config.importThrottle).toEqual({
      adaptiveThrottleEnabled: true,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      fixedRequestDelayMs: null,
    });
  });

  it("records stdout and stderr tails for failed steps", async () => {
    const runner: ResearchPipelineRunner = async () => ({
      exitCode: 1,
      stdout: "stdout failure details",
      stderr: "stderr failure details",
    });

    const { summary } = await runResearchPipeline({
      config: createConfig(),
      generatedAt: GENERATED_AT,
      runner,
    });

    expect(summary.steps[0]?.stdoutTail).toBe("stdout failure details");
    expect(summary.steps[0]?.stderrTail).toBe("stderr failure details");
    expect(summary.steps[0]?.errorMessage).toBe(
      "stderr failure details\nstdout failure details",
    );
  });

  it("records spawn failures with useful error messages", async () => {
    const spawnError = Object.assign(new Error("spawn EINVAL"), { code: "EINVAL" });
    const runner: ResearchPipelineRunner = async () => {
      throw spawnError;
    };

    const { summary } = await runResearchPipeline({
      config: createConfig({ series: "KXBTC15M" }),
      generatedAt: GENERATED_AT,
      runner,
    });

    expect(summary.steps[0]?.exitCode).toBeNull();
    expect(summary.steps[0]?.errorMessage).toBe(
      formatPipelineSpawnError(spawnError, summary.steps[0]!.command),
    );
  });

  it("fails a step before running npm when required dependencies are missing", async () => {
    const runner: ResearchPipelineRunner = async () => ({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    const dependencyIo: ResearchDependencyIo = {
      fileExists: () => false,
      isDirectory: () => false,
      getModifiedTimeMs: () => null,
      countFilesNamedUnder: () => 0,
    };

    const { summary, exitCode } = await runResearchPipeline({
      config: createConfig(),
      generatedAt: GENERATED_AT,
      runner,
      dependencyIo,
    });

    expect(exitCode).toBe(1);
    expect(summary.steps[1]?.status).toBe("failed");
    expect(summary.steps[1]?.dependencyStatus).toBe("failed");
    expect(summary.steps[1]?.missingDependencies.length).toBeGreaterThan(0);
    expect(summary.steps[1]?.exitCode).toBeNull();
  });

  it("includes dependency validation fields in serialized summaries", async () => {
    const dependencyIo: ResearchDependencyIo = {
      fileExists: () => true,
      isDirectory: () => true,
      getModifiedTimeMs: () => 100,
      countFilesNamedUnder: () => 1,
    };

    const { summary } = await runResearchPipeline({
      config: createConfig(),
      generatedAt: GENERATED_AT,
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      dependencyIo,
    });

    const serialized = serializeResearchPipelineSummary({
      ...summary,
      steps: summary.steps.map((step) => ({ ...step, durationMs: 0 })),
    });

    const parsed = JSON.parse(serialized);
    expect(parsed.steps[0].dependencyStatus).toBe("passed");
    expect(parsed.steps[0].missingDependencies).toEqual([]);
    expect(parsed.steps[0].staleDependencies).toEqual([]);
    expect(parsed.steps[0].warnings).toEqual([]);
  });
});
