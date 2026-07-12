import { describe, expect, it, vi } from "vitest";

import {
  BtcKalshiLeadLagAnalysisError,
  type BtcKalshiLeadLagAnalysisReport,
} from "@/lib/data/research/btcKalshiLeadLagAnalysis";
import * as leadLagModule from "@/lib/data/research/btcKalshiLeadLagAnalysis";

import { formatCommandError } from "./buildBtcKalshiLeadLagAnalysisTypes";
import { runBtcKalshiLeadLagAnalysisCommand } from "./buildBtcKalshiLeadLagAnalysis";

const minimalReport = {
  outputPath: "data/research-results/btc-kalshi-lead-lag-analysis.json",
  htmlOutputPath: "data/reports/btc-kalshi-lead-lag-analysis.html",
  eventsOutputPath: "data/research-results/btc-kalshi-lead-lag-events.jsonl",
  analysisScope: "selected-run",
  selectedRunId: "run-test",
  recordsScanned: 1,
  btcRecordsScanned: 1,
  triggerCount: 1,
  eligibleTriggerCount: 1,
  summary: {
    interpretationClassification: "insufficient-data",
    recommendedNextAction: "run-forward-capture-then-rebuild-lead-lag-analysis",
    classificationRationale: "test",
  },
  configurationHash: "btc-kalshi-lead-lag-v1-test",
  warnings: [],
} as BtcKalshiLeadLagAnalysisReport;

function createPublishingCommandIo(options?: {
  initialFiles?: Record<string, string>;
  failRenameTo?: string;
}) {
  const files = new Map(Object.entries(options?.initialFiles ?? {}));
  let stderr = "";

  const io = {
    writeStdout: () => {},
    writeStderr: (text: string) => {
      stderr += text;
    },
    writeFile: (path: string, data: string) => {
      files.set(path, data);
    },
    mkdirSync: () => {},
    fileExists: (path: string) => files.has(path),
    unlinkFile: (path: string) => {
      files.delete(path);
    },
    renameFile: (from: string, to: string) => {
      if (to === options?.failRenameTo && from.endsWith(".tmp")) {
        throw new Error(`rename failed for ${to}`);
      }

      const data = files.get(from);
      if (data === undefined) {
        throw new Error(`missing source ${from}`);
      }

      files.delete(from);
      files.set(to, data);
    },
  };

  return { io, files, getStderr: () => stderr };
}

describe("formatCommandError", () => {
  it("returns message only for expected lead-lag analysis errors", () => {
    expect(formatCommandError(new BtcKalshiLeadLagAnalysisError("expected failure"))).toBe(
      "expected failure",
    );
  });
});

describe("runBtcKalshiLeadLagAnalysisCommand", () => {
  it("exits nonzero for argv validation failures without writing artifacts", async () => {
    const { io, files, getStderr } = createPublishingCommandIo();

    const exitCode = await runBtcKalshiLeadLagAnalysisCommand([], io);

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("Missing required --capture-run-dir.");
    expect([...files.keys()]).toEqual([]);
  });

  it("restores prior JSON and HTML artifacts when the second publish step fails", async () => {
    const reportSpy = vi
      .spyOn(leadLagModule, "buildBtcKalshiLeadLagAnalysisReport")
      .mockResolvedValue(minimalReport);

    const { io, files } = createPublishingCommandIo({
      initialFiles: {
        "data/research-results/btc-kalshi-lead-lag-analysis.json": '{"prior":"json"}',
        "data/reports/btc-kalshi-lead-lag-analysis.html": "<html>prior</html>",
      },
      failRenameTo: "data/reports/btc-kalshi-lead-lag-analysis.html",
    });

    const exitCode = await runBtcKalshiLeadLagAnalysisCommand(
      ["--capture-run-dir", "data/live-capture/forward-quotes/run-test"],
      io,
    );

    expect(exitCode).toBe(1);
    expect(files.get("data/research-results/btc-kalshi-lead-lag-analysis.json")).toBe('{"prior":"json"}');
    expect(files.get("data/reports/btc-kalshi-lead-lag-analysis.html")).toBe("<html>prior</html>");
    expect([...files.keys()].some((path) => path.endsWith(".tmp"))).toBe(false);
    expect([...files.keys()].some((path) => path.endsWith(".bak"))).toBe(false);

    reportSpy.mockRestore();
  });
});
