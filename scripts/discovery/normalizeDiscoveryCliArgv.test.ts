import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeDiscoveryCliArgv } from "./normalizeDiscoveryCliArgv";
import {
  parseOutputPathFromArgv,
  parseRateLimitOptionsFromArgv,
  parseSamplingOptionsFromArgv,
  parseSeriesFromArgv,
} from "./types";

describe("normalizeDiscoveryCliArgv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preserves explicit flag-based argv", () => {
    const argv = [
      "--series",
      "KXBTC15M",
      "--limit",
      "50",
      "--request-delay-ms",
      "1000",
      "--max-retries",
      "5",
      "--retry-base-delay-ms",
      "2000",
      "--output",
      "discovery-result.json",
    ];

    expect(normalizeDiscoveryCliArgv(argv)).toEqual(argv);
    expect(parseSamplingOptionsFromArgv(normalizeDiscoveryCliArgv(argv))).toEqual({
      limit: 50,
    });
    expect(parseRateLimitOptionsFromArgv(normalizeDiscoveryCliArgv(argv))).toEqual({
      requestDelayMs: 1000,
      maxRetries: 5,
      retryBaseDelayMs: 2000,
    });
    expect(parseOutputPathFromArgv(normalizeDiscoveryCliArgv(argv))).toBe(
      "discovery-result.json",
    );
  });

  it("expands equals-style flags", () => {
    expect(
      normalizeDiscoveryCliArgv([
        "--series=KXBTC15M",
        "--limit=50",
        "--output=discovery-result.json",
      ]),
    ).toEqual([
      "--series",
      "KXBTC15M",
      "--limit",
      "50",
      "--output",
      "discovery-result.json",
    ]);
  });

  it("maps npm-stripped positional argv to flags", () => {
    const normalized = normalizeDiscoveryCliArgv([
      "KXBTC15M",
      "50",
      "1000",
      "5",
      "2000",
      "discovery-result.json",
    ]);

    expect(normalized).toEqual([
      "--series",
      "KXBTC15M",
      "--limit",
      "50",
      "--request-delay-ms",
      "1000",
      "--max-retries",
      "5",
      "--retry-base-delay-ms",
      "2000",
      "--output",
      "discovery-result.json",
    ]);
    expect(parseSeriesFromArgv(normalized)).toBe("KXBTC15M");
    expect(parseSamplingOptionsFromArgv(normalized)).toEqual({ limit: 50 });
    expect(parseRateLimitOptionsFromArgv(normalized)).toEqual({
      requestDelayMs: 1000,
      maxRetries: 5,
      retryBaseDelayMs: 2000,
    });
    expect(parseOutputPathFromArgv(normalized)).toBe("discovery-result.json");
  });

  it("supports legacy positional series and output only", () => {
    const normalized = normalizeDiscoveryCliArgv([
      "KXBTC15M",
      "custom-discovery.json",
    ]);

    expect(normalized).toEqual([
      "--series",
      "KXBTC15M",
      "--output",
      "custom-discovery.json",
    ]);
  });

  it("supports legacy positional series and limit", () => {
    const normalized = normalizeDiscoveryCliArgv(["KXBTC15M", "25"]);

    expect(normalized).toEqual(["--series", "KXBTC15M", "--limit", "25"]);
  });

  it("merges npm_config values when flags were consumed by npm", () => {
    vi.stubEnv("npm_config_series", "KXBTC15M");
    vi.stubEnv("npm_config_limit", "50");
    vi.stubEnv("npm_config_output", "discovery-result.json");

    const normalized = normalizeDiscoveryCliArgv([]);

    expect(normalized).toEqual([
      "--series",
      "KXBTC15M",
      "--limit",
      "50",
      "--output",
      "discovery-result.json",
    ]);
  });
});
