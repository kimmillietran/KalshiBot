import { describe, expect, it, vi } from "vitest";

import {
  ParityNearMissAnalysisError,
  type ParityNearMissAnalysisReport,
} from "@/lib/data/research/parityNearMissAnalysis";
import * as parityNearMissModule from "@/lib/data/research/parityNearMissAnalysis";

import { formatCommandError } from "./buildParityNearMissAnalysisTypes";
import { runParityNearMissAnalysisCommand } from "./buildParityNearMissAnalysis";

const minimalReport = {
  outputPath: "data/research-results/parity-near-miss-analysis.json",
  htmlOutputPath: "data/reports/parity-near-miss-analysis.html",
  analysisScope: "selected-run",
  selectedRunId: "run-test",
  recordsScanned: 1,
  summary: {
    interpretationClassification: "insufficient-data",
    recommendedNextAction: "run-forward-capture-then-rebuild-near-miss-analysis",
    classificationRationale: "test",
    closestGrossNearMissCents: null,
    closestFeeAdjustedNearMissCents: null,
    closestBufferNearMissCents: null,
    candidateCount: 0,
    grossNearMissCount: 0,
    feeAdjustedNearMissCount: 0,
    bufferNearMissCount: 0,
  },
  ruleConfigurationHash: "parity-near-miss-v1-test",
  warnings: [],
} as ParityNearMissAnalysisReport;

function createCommandIo() {
  const writes: Array<{ path: string; data: string }> = [];
  let stderr = "";

  const io = {
    writeStdout: () => {},
    writeStderr: (text: string) => {
      stderr += text;
    },
    writeFile: (path: string, data: string) => {
      writes.push({ path, data });
    },
    mkdirSync: () => {},
    fileExists: () => false,
    unlinkFile: () => {},
    renameFile: () => {},
  };

  return { io, writes, getStderr: () => stderr };
}

describe("formatCommandError", () => {
  it("returns message only for expected parity analysis errors", () => {
    expect(formatCommandError(new ParityNearMissAnalysisError("expected failure"))).toBe(
      "expected failure",
    );
  });

  it("includes stack trace for unexpected errors", () => {
    const error = new Error("boom");
    expect(formatCommandError(error)).toContain("boom");
    expect(formatCommandError(error)).toContain("Error: boom");
  });
});

describe("runParityNearMissAnalysisCommand", () => {
  it("exits nonzero for argv validation failures without writing artifacts", async () => {
    const { io, writes, getStderr } = createCommandIo();

    const exitCode = await runParityNearMissAnalysisCommand([], io);

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("Missing required --capture-run-dir.");
    expect(writes).toEqual([]);
  });

  it("prints stack trace for unexpected failures after argv parsing", async () => {
    const reportSpy = vi
      .spyOn(parityNearMissModule, "buildParityNearMissAnalysisReport")
      .mockRejectedValue(new Error("unexpected boom"));

    const { io, writes, getStderr } = createCommandIo();
    const exitCode = await runParityNearMissAnalysisCommand(
      ["--capture-run-dir", "data/live-capture/forward-quotes/run-test"],
      io,
    );

    reportSpy.mockRestore();
    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("unexpected boom");
    expect(getStderr()).toContain("Error: unexpected boom");
    expect(writes).toEqual([]);
  });

  it("does not write artifacts when serialization fails after analysis", async () => {
    const reportSpy = vi
      .spyOn(parityNearMissModule, "buildParityNearMissAnalysisReport")
      .mockResolvedValue(minimalReport);
    const htmlSpy = vi
      .spyOn(parityNearMissModule, "serializeParityNearMissAnalysisHtml")
      .mockImplementation(() => {
        throw new Error("html serialization failed");
      });

    const { io, writes } = createCommandIo();
    const exitCode = await runParityNearMissAnalysisCommand(
      ["--capture-run-dir", "data/live-capture/forward-quotes/run-test"],
      io,
    );

    reportSpy.mockRestore();
    htmlSpy.mockRestore();
    expect(exitCode).toBe(1);
    expect(writes).toEqual([]);
  });
});
