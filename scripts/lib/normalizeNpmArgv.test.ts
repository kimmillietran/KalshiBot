import { afterEach, describe, expect, it, vi } from "vitest";

import {
  expandEqualsStyleFlags,
  mapPositionalToFlags,
  mergeNpmBooleanFlags,
  mergeNpmConfigFlags,
  normalizeNpmScriptArgv,
  NormalizeNpmArgvError,
} from "./normalizeNpmArgv";

describe("normalizeNpmScriptArgv", () => {
  const schema = [
    { flag: "--input" },
    { flag: "--output-dir" },
  ] as const;

  it("preserves explicit flag-based argv", () => {
    const argv = ["--input", "discovery-result.json", "--output-dir", "data/import-configs"];

    expect(normalizeNpmScriptArgv(argv, schema)).toEqual(argv);
  });

  it("maps positional args to expected flags", () => {
    expect(
      normalizeNpmScriptArgv(
        ["discovery-result.json", "data/import-configs"],
        schema,
      ),
    ).toEqual([
      "--input",
      "discovery-result.json",
      "--output-dir",
      "data/import-configs",
    ]);
  });

  it("expands equals-style flags before preserving explicit argv", () => {
    expect(
      normalizeNpmScriptArgv(
        ["--input=discovery-result.json", "--output-dir=data/import-configs"],
        schema,
      ),
    ).toEqual([
      "--input",
      "discovery-result.json",
      "--output-dir",
      "data/import-configs",
    ]);
  });

  it("does not remap argv when any explicit flags are present", () => {
    expect(
      normalizeNpmScriptArgv(
        ["--input", "discovery-result.json", "data/import-configs"],
        schema,
      ),
    ).toEqual(["--input", "discovery-result.json", "data/import-configs"]);
  });

  it("appends extra positional args beyond the schema unchanged", () => {
    expect(
      normalizeNpmScriptArgv(
        ["discovery-result.json", "data/import-configs", "extra-token"],
        schema,
      ),
    ).toEqual([
      "--input",
      "discovery-result.json",
      "--output-dir",
      "data/import-configs",
      "extra-token",
    ]);
  });
});

describe("expandEqualsStyleFlags", () => {
  it("throws when an equals-style flag has no value", () => {
    expect(() => expandEqualsStyleFlags(["--input="])).toThrow(NormalizeNpmArgvError);
  });
});

describe("mapPositionalToFlags", () => {
  it("maps only the provided schema length when argv is shorter", () => {
    expect(
      mapPositionalToFlags(["only-input"], [{ flag: "--input" }, { flag: "--output-dir" }]),
    ).toEqual(["--input", "only-input"]);
  });
});

describe("mergeNpmBooleanFlags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("re-injects boolean flags consumed by npm", () => {
    vi.stubEnv("npm_config_all", "true");

    expect(mergeNpmBooleanFlags([], ["--all"])).toEqual(["--all"]);
  });

  it("does not duplicate explicit boolean flags", () => {
    expect(mergeNpmBooleanFlags(["--all"], ["--all"])).toEqual(["--all"]);
  });
});

describe("mergeNpmConfigFlags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("merges npm_config values when flags were consumed by npm", () => {
    vi.stubEnv("npm_config_series", "KXBTC15M");
    vi.stubEnv("npm_config_limit", "50");

    expect(mergeNpmConfigFlags([], ["--series", "--limit"])).toEqual([
      "--series",
      "KXBTC15M",
      "--limit",
      "50",
    ]);
  });

  it("ignores npm_config boolean placeholders", () => {
    vi.stubEnv("npm_config_input", "true");

    expect(mergeNpmConfigFlags([], ["--input"])).toEqual([]);
  });
});
