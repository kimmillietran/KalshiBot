import { describe, expect, it } from "vitest";

import { CAPTURE_HEALTH_AUDIT_FILENAME } from "@/lib/data/research/captureHealthAudit";
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
  const tempFiles = new Set<string>();

  return {
    ...jsonl,
    fileExists: (path: string) => {
      const normalized = path.replaceAll("\\", "/");
      return jsonl.fileExists(path) || dirSet.has(normalized) || tempFiles.has(normalized);
    },
    isDirectory: (path: string) => dirSet.has(path.replaceAll("\\", "/")),
    writeStdout: () => {},
    writeStderr: () => {},
    writeFile: (path: string, data: string) => {
      const normalized = path.replaceAll("\\", "/");
      files[normalized] = data;
      if (normalized.endsWith(".tmp")) {
        tempFiles.add(normalized);
      }
    },
    mkdirSync: () => {},
    unlinkFile: (path: string) => {
      delete files[path.replaceAll("\\", "/")];
      tempFiles.delete(path.replaceAll("\\", "/"));
    },
    renameFile: (from: string, to: string) => {
      const fromPath = from.replaceAll("\\", "/");
      const toPath = to.replaceAll("\\", "/");
      const data = files[fromPath];
      if (data !== undefined) {
        files[toPath] = data;
        delete files[fromPath];
      }
      tempFiles.delete(fromPath);
    },
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
    const stderr: string[] = [];
    const io = createCaptureHealthCommandIo(files, [runDir]);
    io.writeStdout = (text) => {
      stdout.push(text);
    };
    io.writeStderr = (text) => {
      stderr.push(text);
    };

    const exitCode = await runCaptureHealthAuditCommand(
      ["--capture-run-dir", runDir, "--output", "tmp/capture-health-audit.json"],
      io,
      { generatedAt: "2026-07-09T00:00:00.000Z" },
    );

    expect(exitCode).toBe(1);
    expect(stderr.join("")).toContain("capture-too-short");
    expect(files["tmp/capture-health-audit.json"]).toContain("capture-too-short");
  });

  it("writes run-scoped audit with exact run identity", async () => {
    const runDir = "data/live-capture/forward-quotes/run-scoped-audit";
    const runId = "run-scoped-audit";
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
    const io = createCaptureHealthCommandIo(files, [runDir]);

    const exitCode = await runCaptureHealthAuditCommand(
      ["--capture-run-dir", runDir, "--output", "tmp/capture-health-audit.json"],
      io,
      { generatedAt: "2026-07-09T00:00:00.000Z" },
    );

    const runScopedPath = `${runDir}/${CAPTURE_HEALTH_AUDIT_FILENAME}`;
    expect(files[runScopedPath]).toBeDefined();
    const runScoped = JSON.parse(files[runScopedPath] ?? "{}") as {
      selectedRunId: string;
      captureRunDir: string;
      sourceRunIds: string[];
      summary: { verdict: string };
    };
    expect(runScoped.selectedRunId).toBe(runId);
    expect(runScoped.captureRunDir).toBe(runDir);
    expect(runScoped.sourceRunIds).toEqual([runId]);

    const aggregate = JSON.parse(files["tmp/capture-health-audit.json"] ?? "{}") as {
      selectedRunId: string;
      summary: { verdict: string };
    };
    expect(aggregate.selectedRunId).toBe(runId);
    expect(aggregate.summary.verdict).toBe(runScoped.summary.verdict);
    expect(exitCode).toBe(1);
  });

  it("does not leave partial run-scoped artifact when command fails before publication", async () => {
    const runDir = "data/live-capture/forward-quotes/missing-top";
    const files: Record<string, string> = {};
    const io = createCaptureHealthCommandIo(files, []);

    const exitCode = await runCaptureHealthAuditCommand(
      ["--capture-run-dir", runDir, "--output", "tmp/capture-health-audit.json"],
      io,
      { generatedAt: "2026-07-09T00:00:00.000Z" },
    );

    expect(exitCode).toBe(1);
    expect(files[`${runDir}/${CAPTURE_HEALTH_AUDIT_FILENAME}`]).toBeUndefined();
    expect(files["tmp/capture-health-audit.json"]).toBeUndefined();
  });
});
