import { describe, expect, it } from "vitest";

import { normalizeStrategySynthesisDebugArgv } from "../lib/cliArgvSchemas";
import { parseStrategySynthesisDebugConfigFromArgv } from "./buildStrategySynthesisDebugTypes";

describe("parseStrategySynthesisDebugConfigFromArgv", () => {
  it("defaults output paths and synthesis inputs", () => {
    const config = parseStrategySynthesisDebugConfigFromArgv(
      normalizeStrategySynthesisDebugArgv([]),
    );

    expect(config.outputPath).toBe("data/research-results/strategy-synthesis-debug.json");
    expect(config.htmlOutputPath).toBe("data/reports/strategy-synthesis-debug.html");
    expect(config.inputPaths.strategySynthesisPath).toBe(
      "data/research-results/strategy-synthesis-candidates.json",
    );
    expect(config.inputPaths.harnessSummaryPath).toBe(
      "data/research-results/harness/strategy-harness-summary.json",
    );
  });
});
