import { describe, expect, it } from "vitest";

import { normalizeOosPowerCorrectionArgv } from "../lib/cliArgvSchemas";
import { parseOosPowerCorrectionConfigFromArgv } from "./buildOosPowerCorrectionTypes";

describe("parseOosPowerCorrectionConfigFromArgv", () => {
  it("defaults output paths and input artifacts", () => {
    const config = parseOosPowerCorrectionConfigFromArgv(
      normalizeOosPowerCorrectionArgv([]),
    );

    expect(config.outputPath).toBe("data/research-results/oos-power-correction.json");
    expect(config.htmlOutputPath).toBe("data/reports/oos-power-correction.html");
    expect(config.inputPaths.hypothesisCandidatesPath).toBe(
      "data/research-results/hypothesis-candidates.json",
    );
    expect(config.config.correctionMethod).toBe("benjaminiYekutieli");
  });
});
