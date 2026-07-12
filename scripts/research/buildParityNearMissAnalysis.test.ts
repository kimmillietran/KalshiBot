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

  it("restores existing artifacts when the second artifact publish fails", async () => {
    const reportSpy = vi
      .spyOn(parityNearMissModule, "buildParityNearMissAnalysisReport")
      .mockResolvedValue(minimalReport);
    const reportSerializerSpy = vi
      .spyOn(parityNearMissModule, "serializeParityNearMissAnalysisReport")
      .mockReturnValue("{\"ok\":true}\n");
    const htmlSerializerSpy = vi
      .spyOn(parityNearMissModule, "serializeParityNearMissAnalysisHtml")
      .mockReturnValue("<!doctype html><p>ok</p>");
    const { io, files, getStderr } = createPublishingCommandIo({
      initialFiles: {
        [minimalReport.outputPath]: "previous json",
        [minimalReport.htmlOutputPath]: "previous html",
      },
      failRenameTo: minimalReport.htmlOutputPath,
    });

    const exitCode = await runParityNearMissAnalysisCommand(
      ["--capture-run-dir", "data/live-capture/forward-quotes/run-test"],
      io,
    );

    reportSpy.mockRestore();
    reportSerializerSpy.mockRestore();
    htmlSerializerSpy.mockRestore();
    expect(exitCode).toBe(1);
    expect(getStderr()).toContain(`rename failed for ${minimalReport.htmlOutputPath}`);
    expect(files.get(minimalReport.outputPath)).toBe("previous json");
    expect(files.get(minimalReport.htmlOutputPath)).toBe("previous html");
    expect([...files.keys()].filter((path) => path.includes(`${process.pid}`))).toEqual([]);
  });
});
