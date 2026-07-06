import { describe, expect, it } from "vitest";

import { normalizePlanExpansionBatchArgv } from "../lib/cliArgvSchemas";
import { parsePlanExpansionBatchConfigFromArgv } from "./planExpansionBatchTypes";

describe("parsePlanExpansionBatchConfigFromArgv", () => {
  it("defaults output paths and selection strategy", () => {
    const config = parsePlanExpansionBatchConfigFromArgv(
      normalizePlanExpansionBatchArgv(["--max-markets", "1000"]),
    );

    expect(config.outputPath).toBe("data/research-results/expansion-batch-plan.json");
    expect(config.htmlOutputPath).toBe("data/reports/expansion-batch-plan.html");
    expect(config.maxMarkets).toBe(1000);
    expect(config.selectionStrategy).toBe("research-value");
    expect(config.inputPaths.coveragePlanPath).toBe(
      "data/research-results/historical-coverage-plan.json",
    );
  });

  it("accepts explicit selection strategy and input paths", () => {
    const config = parsePlanExpansionBatchConfigFromArgv(
      normalizePlanExpansionBatchArgv([
        "--max-markets=500",
        "--selection-strategy",
        "temporal-balance",
        "--historical-coverage-plan",
        "custom/coverage-plan.json",
        "--discovery-result",
        "custom/discovery-result.json",
      ]),
    );

    expect(config.maxMarkets).toBe(500);
    expect(config.selectionStrategy).toBe("temporal-balance");
    expect(config.inputPaths.coveragePlanPath).toBe("custom/coverage-plan.json");
    expect(config.inputPaths.discoveryResultPath).toBe("custom/discovery-result.json");
  });
});
