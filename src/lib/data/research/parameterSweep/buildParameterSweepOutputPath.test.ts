import { describe, expect, it } from "vitest";

import {
  buildParameterSweepOutputPath,
  buildParameterSweepSetRootPath,
} from "./buildParameterSweepOutputPath";

describe("buildParameterSweepOutputPath", () => {
  it("maps strategy, parameter set, series, and market to research-output.json", () => {
    expect(
      buildParameterSweepOutputPath(
        "data/research-results",
        "fair-value-diffusion",
        "ps-0001",
        "KXBTC15M",
        "KXBTC15M-MARKET-A",
      ),
    ).toBe(
      "data/research-results/fair-value-diffusion/ps-0001/KXBTC15M/KXBTC15M-MARKET-A/research-output.json",
    );
  });
});

describe("buildParameterSweepSetRootPath", () => {
  it("maps strategy and parameter set to the output root", () => {
    expect(
      buildParameterSweepSetRootPath(
        "data/research-results",
        "fair-value-diffusion",
        "ps-0002",
      ),
    ).toBe("data/research-results/fair-value-diffusion/ps-0002");
  });
});
