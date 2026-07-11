import { describe, expect, it } from "vitest";

import { createMemoryJsonlIo } from "@/lib/data/research/jsonl";

import { runCaptureHealthAuditCommand } from "./buildCaptureHealthAudit";
import {
  parseCaptureRunDirFromArgv,
  parseThresholdOverridesFromArgv,
} from "./buildCaptureHealthAuditTypes";

function createCaptureHealthCommandIo(
  files: Record<string, string>,
  dirs: string[],
) {
  const dirSet = new Set(dirs.map((dir) => dir.replaceAll("\\", "/")));
  const jsonl = createMemoryJsonlIo(files);

  return {
    ...jsonl,
    fileExists: (path: string) => {
      const normalized = path.replaceAll("\\", "/");
      return jsonl.fileExists(path) || dirSet.has(normalized);
    },
    isDirectory: (path: string) => dirSet.has(path.replaceAll("\\", "/")),
    writeStdout: () => {},
    writeStderr: () => {},
    writeFile: (path: string, data: string) => {
      files[path.replaceAll("\\", "/")] = data;
    },
    mkdirSync: () => {},
  };
}

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

  it("runs CLI smoke test against synthetic capture dir", async () => {
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
    const stdout: string[] = [];
    const io = createCaptureHealthCommandIo(files, [runDir]);
    io.writeStdout = (text) => {
      stdout.push(text);
    };

    const exitCode = await runCaptureHealthAuditCommand(
      ["--capture-run-dir", runDir, "--output", "tmp/capture-health-audit.json"],
      io,
      { generatedAt: "2026-07-09T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("capture-too-short");
    expect(files["tmp/capture-health-audit.json"]).toContain("capture-too-short");
  });
});
