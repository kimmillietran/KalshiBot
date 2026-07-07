import { describe, expect, it } from "vitest";

import { normalizeMonthRegimeAnalysisArgv } from "../lib/cliArgvSchemas";
import { parseMonthRegimeAnalysisConfigFromArgv } from "./buildMonthRegimeAnalysisTypes";

describe("parseMonthRegimeAnalysisConfigFromArgv", () => {
  it("defaults output paths and input artifacts", () => {
    const config = parseMonthRegimeAnalysisConfigFromArgv(
      normalizeMonthRegimeAnalysisArgv([]),
    );

    expect(config.outputPath).toBe("data/research-results/month-regime-analysis.json");
    expect(config.htmlOutputPath).toBe("data/reports/month-regime-analysis.html");
    expect(config.inputPaths.hypothesisValidationPath).toBe(
      "data/research-results/hypothesis-validation.json",
    );
    expect(config.inputPaths.researchResultsDir).toBe("data/research-results");
  });
});
