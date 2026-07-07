import { describe, expect, it } from "vitest";

import { normalizeDimensionInteractionAnalyticsArgv } from "../lib/cliArgvSchemas";
import { parseDimensionInteractionAnalyticsConfigFromArgv } from "./buildDimensionInteractionAnalyticsTypes";

describe("parseDimensionInteractionAnalyticsConfigFromArgv", () => {
  it("defaults output paths and input artifacts", () => {
    const config = parseDimensionInteractionAnalyticsConfigFromArgv(
      normalizeDimensionInteractionAnalyticsArgv([]),
    );

    expect(config.outputPath).toBe("data/research-results/research-interaction-analysis.json");
    expect(config.htmlOutputPath).toBe("data/reports/research-interaction-analysis.html");
    expect(config.inputPaths.hypothesisValidationPath).toBe(
      "data/research-results/hypothesis-validation.json",
    );
    expect(config.inputPaths.mispricingAtlasPath).toBe(
      "data/research-results/mispricing-atlas.json",
    );
    expect(config.inputPaths.hypothesisFailureAnalysisPath).toBe(
      "data/research-results/hypothesis-failure-analysis.json",
    );
  });
});
