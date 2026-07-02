import { describe, expect, it } from "vitest";

import {
  buildResearchPipelineSteps,
} from "./buildResearchPipelineSteps";
import { parseResearchPipelineConfigFromArgv } from "./parseResearchPipelineArgv";
import {
  runResearchPipeline,
  serializeResearchPipelineSummary,
} from "./runResearchPipeline";
import type {
  ResearchPipelineConfig,
  ResearchPipelineRunner,
} from "./researchPipelineTypes";

const GENERATED_AT = "2026-07-02T14:00:00.000Z";

function createConfig(
  overrides: Partial<ResearchPipelineConfig> = {},
): ResearchPipelineConfig {
  return {
    series: "KXBTC15M",
    limit: 500,
    concurrency: 1,
    continueOnError: false,
    discoveryOutputPath: "discovery-result.json",
    summaryOutputPath: "data/research-results/pipeline-summary.json",
    rankBy: "totalPnL",
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
    expect(steps[2]?.args).toContain("--max-retries");
    expect(steps[2]?.args).toContain("5");
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
    expect(summary.steps[1]?.status).toBe("skipped");
    expect(summary.steps).toHaveLength(17);
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
    expect(callCount).toBe(17);
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

    expect(serializeResearchPipelineSummary(first.summary)).toBe(
      serializeResearchPipelineSummary(second.summary),
    );
    expect(first.summary.steps[0]?.command).toContain("discover:markets");
  });
});
