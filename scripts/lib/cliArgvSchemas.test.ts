import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeBidOnlyCandidateLifecycleArgv,
  normalizeDiscoveryImportConfigsArgv,
  normalizeEventStudyArgv,
  normalizeExecuteExpansionImportArgv,
  normalizeExecutableConfirmationDesignArgv,
  normalizeForwardCaptureReadinessArgv,
  normalizeResearchInspectArgv,
  normalizeStaticParityScanArgv,
  normalizeStrategyEvaluationReadinessArgv,
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

  it("re-injects --include-synthesized when npm consumed the boolean flag", () => {
    vi.stubEnv("npm_config_include_synthesized", "true");

    expect(normalizeStrategySweepArgv(["--all"])).toEqual([
      "--all",
      "--include-synthesized",
    ]);
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

  it("maps stripped selected-run capture paths to --capture-run-dir", () => {
    const captureRunDir = "data/live-capture/forward-quotes/run-a";

    expect(normalizeStaticParityScanArgv([captureRunDir])).toEqual([
      "--capture-run-dir",
      captureRunDir,
    ]);
    expect(normalizeForwardCaptureReadinessArgv([captureRunDir])).toEqual([
      "--capture-run-dir",
      captureRunDir,
    ]);
    expect(
      normalizeForwardCaptureReadinessArgv(["data/reports/custom-forward-readiness.json"]),
    ).toEqual(["--output", "data/reports/custom-forward-readiness.json"]);
    expect(normalizeStrategyEvaluationReadinessArgv([captureRunDir])).toEqual([
      "--capture-run-dir",
      captureRunDir,
    ]);
    expect(normalizeBidOnlyCandidateLifecycleArgv([captureRunDir])).toEqual([
      "--capture-run-dir",
      captureRunDir,
    ]);
    expect(normalizeExecutableConfirmationDesignArgv([captureRunDir])).toEqual([
      "--capture-run-dir",
      captureRunDir,
    ]);
  });

  it("maps stripped selected-run capture plus output positionals", () => {
    const captureRunDir = "data/live-capture/forward-quotes/run-a";
    const outputPath = "data/research-results/custom.json";

    expect(normalizeBidOnlyCandidateLifecycleArgv([captureRunDir, outputPath])).toEqual([
      "--capture-run-dir",
      captureRunDir,
      "--output",
      outputPath,
    ]);
    expect(normalizeExecutableConfirmationDesignArgv([captureRunDir, outputPath])).toEqual([
      "--capture-run-dir",
      captureRunDir,
      "--output",
      outputPath,
    ]);
    expect(normalizeStaticParityScanArgv([captureRunDir, outputPath])).toEqual([
      "--capture-run-dir",
      captureRunDir,
      "--output",
      outputPath,
    ]);
  });

  it("maps stripped static parity output-only positional argv", () => {
    expect(
      normalizeStaticParityScanArgv(["data/reports/custom-static.json"]),
    ).toEqual(["--output", "data/reports/custom-static.json"]);
  });

  it("normalizes execute expansion import max-markets from equals, space, and npm config forms", () => {
    vi.stubEnv("npm_config_max_markets", "10");

    expect(
      normalizeExecuteExpansionImportArgv(["--execute", "--max-markets=10"]),
    ).toEqual(["--execute", "--max-markets", "10"]);

    expect(
      normalizeExecuteExpansionImportArgv(["--execute", "--max-markets", "10"]),
    ).toEqual(["--execute", "--max-markets", "10"]);

    expect(normalizeExecuteExpansionImportArgv(["--execute", "10"])).toEqual([
      "--execute",
      "10",
      "--max-markets",
      "10",
    ]);
  });

  it("maps positional expansion import config paths to --input", () => {
    expect(
      normalizeExecuteExpansionImportArgv([
        "data/import-configs/historical-expansion-config.json",
        "25",
      ]),
    ).toEqual([
      "--input",
      "data/import-configs/historical-expansion-config.json",
      "--max-markets",
      "25",
    ]);
  });
});
