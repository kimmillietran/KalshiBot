import { describe, expect, it } from "vitest";

import { runSettlementTraceCommand } from "./traceSettlement";

const GENERATED_AT = "2026-07-02T18:00:00.000Z";
const MARKET_TICKER = "KXBTC15M-26MAY020515-15";
const OUTPUT_PATH = "data/audits/settlement-trace-KXBTC15M-26MAY020515-15.json";

describe("runSettlementTraceCommand", () => {
  it("writes settlement trace JSON and prints a console summary", () => {
    const writes = new Map<string, string>();
    let stdout = "";

    const exitCode = runSettlementTraceCommand(
      ["--ticker", MARKET_TICKER, "--output", OUTPUT_PATH],
      {
        readFile: () => {
          throw new Error("ENOENT");
        },
        fileExists: () => false,
        readdir: () => [],
        isDirectory: () => false,
        writeStdout: (text) => {
          stdout += text;
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
      { generatedAt: GENERATED_AT },
    );

    expect(exitCode).toBe(0);
    expect(writes.get(OUTPUT_PATH)).toBeDefined();

    const parsed = JSON.parse(writes.get(OUTPUT_PATH)!);
    expect(parsed.generatedAt).toBe(GENERATED_AT);
    expect(parsed.marketTicker).toBe(MARKET_TICKER);
    expect(parsed.stages).toHaveLength(9);
    expect(stdout).toContain("Settlement trace:");
    expect(stdout).toContain(MARKET_TICKER);
  });

  it("returns exit code 1 when ticker is missing", () => {
    let stderr = "";

    const exitCode = runSettlementTraceCommand([], {
      readFile: () => "",
      fileExists: () => false,
      readdir: () => [],
      isDirectory: () => false,
      writeStdout: () => {},
      writeStderr: (text) => {
        stderr += text;
      },
      writeFile: () => {},
      mkdirSync: () => {},
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("--ticker");
  });
});
