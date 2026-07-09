import { describe, expect, it } from "vitest";

import { runCaptureHealthAuditCommand } from "./buildCaptureHealthAudit";
import {
  parseCaptureRunDirFromArgv,
  parseThresholdOverridesFromArgv,
} from "./buildCaptureHealthAuditTypes";

describe("buildCaptureHealthAudit CLI", () => {
  it("requires capture run dir", () => {
    expect(() => parseCaptureRunDirFromArgv([])).toThrow("--capture-run-dir is required");
  });

  it("parses threshold overrides", () => {
    expect(
      parseThresholdOverridesFromArgv([
        "--min-duration-seconds",
        "120",
        "--max-p90-gap-ms",
        "10000",
      ]),
    ).toEqual({
      minDurationSeconds: 120,
      maxP90TopOfBookGapMs: 10_000,
      minValidBookShare: undefined,
      minBtcJoinCoverageShare: undefined,
      maxZeroSpreadShare: undefined,
      btcJoinMaxDistanceMs: undefined,
    });
  });

  it("runs CLI smoke test against synthetic capture dir", () => {
    const runDir = "data/live-capture/kalshi-ws-spike/cli-smoke";
    const topPath = `${runDir}/top-of-book.jsonl`;
    const files: Record<string, string> = {
      [topPath]: JSON.stringify({
        runId: "run",
        marketTicker: "KXBTC15M-TEST",
        eventTicker: null,
        seriesTicker: "KXBTC15M",
        receivedAtLocal: "2026-07-09T00:00:00.000Z",
        exchangeTimestampMs: Date.parse("2026-07-09T00:00:00.000Z"),
        sequence: 1,
        bookState: "valid",
        yesBestBidCents: 45,
        yesBestAskCents: 50,
        yesSpreadCents: 5,
        noSpreadCents: 5,
        rawMessageType: "orderbook_snapshot",
      }),
      [`${runDir}/capture-health.json`]: JSON.stringify({ config: { durationSeconds: 5 } }),
    };
    const dirs = new Set([runDir]);
    const stdout: string[] = [];

    const exitCode = runCaptureHealthAuditCommand(
      ["--capture-run-dir", runDir, "--output", "tmp/capture-health-audit.json"],
      {
        readFile: (path) => files[path.replaceAll("\\", "/")] ?? "",
        fileExists: (path) => {
          const normalized = path.replaceAll("\\", "/");
          return normalized in files || dirs.has(normalized);
        },
        isDirectory: (path) => dirs.has(path.replaceAll("\\", "/")),
        writeStdout: (text) => {
          stdout.push(text);
        },
        writeStderr: () => {},
        writeFile: (path, data) => {
          files[path.replaceAll("\\", "/")] = data;
        },
        mkdirSync: () => {},
      },
      { generatedAt: "2026-07-09T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("capture-too-short");
    expect(files["tmp/capture-health-audit.json"]).toContain("capture-too-short");
  });
});
