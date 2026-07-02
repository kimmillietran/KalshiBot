import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeDiscoveryImportConfigsArgv,
  normalizeEventStudyArgv,
  normalizeResearchInspectArgv,
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

  it("normalizes research inspect equals-style argv", () => {
    expect(
      normalizeResearchInspectArgv([
        "--input=data/research-results/noop/KXBTC15M/MARKET/research-output.json",
      ]),
    ).toEqual([
      "--input",
      "data/research-results/noop/KXBTC15M/MARKET/research-output.json",
    ]);
  });

  it("normalizes event study argv when npm forwards only the events path", () => {
    expect(normalizeEventStudyArgv(["data/events/events.json"])).toEqual([
      "--events",
      "data/events/events.json",
    ]);
  });
});
