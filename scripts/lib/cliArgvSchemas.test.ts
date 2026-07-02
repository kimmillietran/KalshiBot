import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeDiscoveryImportConfigsArgv,
  normalizeStrategySweepArgv,
} from "./cliArgvSchemas";

describe("cliArgvSchemas", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("normalizes discovery import-configs positional argv", () => {
    expect(
      normalizeDiscoveryImportConfigsArgv([
        "discovery-result.json",
        "data/import-configs",
      ]),
    ).toEqual([
      "--input",
      "discovery-result.json",
      "--output-dir",
      "data/import-configs",
    ]);
  });

  it("normalizes strategy sweep argv stripped to a single strategy id", () => {
    expect(normalizeStrategySweepArgv(["noop"])).toEqual(["--strategy", "noop"]);
  });

  it("re-injects --all when npm consumed the boolean flag", () => {
    vi.stubEnv("npm_config_all", "true");

    expect(normalizeStrategySweepArgv([])).toEqual(["--all"]);
  });
});
