import { describe, expect, it, vi } from "vitest";

import { runProbabilityCalibrationReportCommand } from "./buildProbabilityCalibrationReport";
import { createRunnerResearchOutputJson } from "@/lib/data/research/calibration/testFixtures";

const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_TICKER = `${SERIES_TICKER}-MARKET-A`;

function createIo() {
  const inputRoot = "data/research-results";
  const strategyPath = `${inputRoot}/${STRATEGY_ID}`;
  const seriesPath = `${strategyPath}/${SERIES_TICKER}`;
  const marketPath = `${seriesPath}/${MARKET_TICKER}`;
  const researchOutputPath = `${marketPath}/research-output.json`;
  const reportOutputPath =
    `${inputRoot}/${STRATEGY_ID}/${SERIES_TICKER}/calibration-report.json`;
  const writes = new Map<string, string>();
  let stdout = "";
  let stderr = "";

  return {
    io: {
      readFile: (path: string) => {
        if (path === researchOutputPath) {
          return createRunnerResearchOutputJson({
            strategyId: STRATEGY_ID,
            strategyProbabilityUp: 0.65,
          });
        }
        throw new Error(`Missing file: ${path}`);
      },
      writeStdout: (text: string) => {
        stdout += text;
      },
      writeStderr: (text: string) => {
        stderr += text;
      },
      writeFile: (path: string, data: string) => {
        writes.set(path, data);
      },
      mkdirSync: vi.fn(),
      readdir: (path: string) => {
        if (path === inputRoot) {
          return [STRATEGY_ID];
        }
        if (path === strategyPath) {
          return [SERIES_TICKER];
        }
        if (path === seriesPath) {
          return [MARKET_TICKER];
        }
        return [];
      },
      fileExists: (path: string) => path === researchOutputPath,
      isDirectory: (path: string) =>
        path === inputRoot
        || path === strategyPath
        || path === seriesPath
        || path === marketPath,
    },
    writes,
    getStdout: () => stdout,
    getStderr: () => stderr,
    reportOutputPath,
  };
}

describe("runProbabilityCalibrationReportCommand", () => {
  it("writes calibration-report.json per strategy and series", () => {
    const { io, writes, getStdout, reportOutputPath } = createIo();

    const exitCode = runProbabilityCalibrationReportCommand(
      ["--input-dir", "data/research-results", "--output-dir", "data/research-results"],
      io,
      { generatedAt: "2026-06-27T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has(reportOutputPath)).toBe(true);

    const payload = JSON.parse(writes.get(reportOutputPath) ?? "{}");
    expect(payload.strategyId).toBe(STRATEGY_ID);
    expect(payload.seriesTicker).toBe(SERIES_TICKER);
    expect(payload.kalshiImplied.sampleCount).toBeGreaterThan(0);
    expect(payload.strategyFairValue.sampleCount).toBe(1);

    const stdout = JSON.parse(getStdout());
    expect(stdout.reportCount).toBe(1);
    expect(stdout.outputPaths).toEqual([reportOutputPath]);
  });

  it("returns non-zero exit code for empty datasets", () => {
    const { io, getStderr } = createIo();
    io.readdir = () => [];

    const exitCode = runProbabilityCalibrationReportCommand([], io);

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("No research outputs found");
  });
});
