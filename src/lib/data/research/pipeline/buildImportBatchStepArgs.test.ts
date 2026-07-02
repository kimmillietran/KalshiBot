import { describe, expect, it } from "vitest";

import { buildImportBatchStepArgs } from "./buildImportBatchStepArgs";
import { parseResearchPipelineConfigFromArgv } from "./parseResearchPipelineArgv";
import { parseResearchPipelineImportThrottleFromArgv } from "./parseResearchPipelineImportThrottle";
import type { ResearchPipelineConfig } from "./researchPipelineTypes";

function createConfig(
  overrides: Partial<ResearchPipelineConfig> = {},
): ResearchPipelineConfig {
  return {
    ...parseResearchPipelineConfigFromArgv([]),
    ...overrides,
  };
}

describe("parseResearchPipelineImportThrottleFromArgv", () => {
  it("defaults to adaptive throttling", () => {
    expect(parseResearchPipelineImportThrottleFromArgv([])).toEqual({
      adaptiveThrottleEnabled: true,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      fixedRequestDelayMs: null,
    });
  });

  it("uses fixed delay when --request-delay-ms is provided", () => {
    expect(parseResearchPipelineImportThrottleFromArgv(["--request-delay-ms", "750"])).toEqual({
      adaptiveThrottleEnabled: false,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      fixedRequestDelayMs: 750,
    });
  });

  it("uses fixed delay when --no-adaptive-throttle is provided", () => {
    expect(parseResearchPipelineImportThrottleFromArgv(["--no-adaptive-throttle"])).toEqual({
      adaptiveThrottleEnabled: false,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      fixedRequestDelayMs: 1000,
    });
  });

  it("rejects conflicting throttle flags", () => {
    expect(() =>
      parseResearchPipelineImportThrottleFromArgv([
        "--adaptive-throttle",
        "--no-adaptive-throttle",
      ]),
    ).toThrow(/Cannot combine/);
    expect(() =>
      parseResearchPipelineImportThrottleFromArgv([
        "--adaptive-throttle",
        "--request-delay-ms",
        "500",
      ]),
    ).toThrow(/Cannot combine/);
  });
});

describe("buildImportBatchStepArgs", () => {
  it("uses adaptive throttling by default", () => {
    expect(buildImportBatchStepArgs(createConfig({ concurrency: 2 }))).toEqual([
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
  });

  it("uses fixed delay when configured", () => {
    expect(
      buildImportBatchStepArgs(
        createConfig({
          importThrottle: {
            adaptiveThrottleEnabled: false,
            minRequestDelayMs: 100,
            maxRequestDelayMs: 3000,
            fixedRequestDelayMs: 500,
          },
        }),
      ),
    ).toEqual([
      "--input-dir",
      "data/import-configs",
      "--output-dir",
      "data/imports",
      "--concurrency",
      "1",
      "--max-retries",
      "5",
      "--retry-base-delay-ms",
      "2000",
      "--request-delay-ms",
      "500",
    ]);
  });
});
