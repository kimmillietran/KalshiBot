import { describe, expect, it, vi } from "vitest";

import { runRegisterExperimentsCommand } from "./registerExperiments";
import { createRunnerResearchOutputJson } from "@/lib/data/research/calibration/testFixtures";
import { buildExperimentId } from "@/lib/data/research/experiment-registry/hashExperimentIdentity";
import { parseExperimentResearchDocument } from "@/lib/data/research/experiment-registry/parseExperimentResearchOutput";

const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_TICKER = `${SERIES_TICKER}-MARKET-A`;

function createIo() {
  const researchRoot = "data/research-results";
  const experimentsRoot = "data/experiments";
  const researchOutputPath =
    `${researchRoot}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_TICKER}/research-output.json`;
  const writes = new Map<string, string>();
  let stdout = "";
  let stderr = "";

  const document = parseExperimentResearchDocument(
    createRunnerResearchOutputJson({ strategyId: STRATEGY_ID }),
    researchOutputPath,
    {
      strategyId: STRATEGY_ID,
      seriesTicker: SERIES_TICKER,
      marketTicker: MARKET_TICKER,
    },
  );
  const experimentId = buildExperimentId({
    strategyId: document.strategyId,
    strategyConfig: document.strategyConfig,
    costModelConfig: document.costModelConfig,
    datasetHash: document.datasetHash,
    fixtureHash: null,
    engineVersion: document.engineVersion,
  });
  const experimentPath = `${experimentsRoot}/${experimentId}/experiment.json`;

  return {
    io: {
      readFile: (path: string) => {
        if (path === researchOutputPath) {
          return createRunnerResearchOutputJson({ strategyId: STRATEGY_ID });
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
        if (path === researchRoot) {
          return [STRATEGY_ID];
        }
        if (path === `${researchRoot}/${STRATEGY_ID}`) {
          return [SERIES_TICKER];
        }
        if (path === `${researchRoot}/${STRATEGY_ID}/${SERIES_TICKER}`) {
          return [MARKET_TICKER];
        }
        return [];
      },
      fileExists: (path: string) =>
        path === researchOutputPath
        || path === researchRoot
        || path === `${researchRoot}/${STRATEGY_ID}`
        || path === `${researchRoot}/${STRATEGY_ID}/${SERIES_TICKER}`
        || path === `${researchRoot}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_TICKER}`,
      isDirectory: (path: string) =>
        path === researchRoot
        || path === `${researchRoot}/${STRATEGY_ID}`
        || path === `${researchRoot}/${STRATEGY_ID}/${SERIES_TICKER}`
        || path === `${researchRoot}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_TICKER}`,
      resolveGitCommit: () => "deadbeef",
    },
    writes,
    getStdout: () => stdout,
    getStderr: () => stderr,
    experimentPath,
  };
}

describe("runRegisterExperimentsCommand", () => {
  it("writes experiment.json records under data/experiments", () => {
    const { io, writes, getStdout, experimentPath } = createIo();

    const exitCode = runRegisterExperimentsCommand([], io, {
      registeredAt: "2026-06-27T00:00:00.000Z",
    });

    expect(exitCode).toBe(0);
    expect(writes.has(experimentPath)).toBe(true);

    const payload = JSON.parse(getStdout());
    expect(payload.registeredCount).toBe(1);
    expect(payload.outputPaths).toEqual([experimentPath]);
  });

  it("accepts npm-stripped positional research, experiments, and fixtures roots", () => {
    const { io, writes, getStdout, experimentPath } = createIo();

    const exitCode = runRegisterExperimentsCommand(
      ["data/research-results", "data/experiments", "data/fixtures"],
      io,
      { registeredAt: "2026-06-27T00:00:00.000Z" },
    );

    expect(exitCode).toBe(0);
    expect(writes.has(experimentPath)).toBe(true);
    expect(JSON.parse(getStdout())).toMatchObject({
      researchRoot: "data/research-results",
      experimentsRoot: "data/experiments",
      fixturesRoot: "data/fixtures",
    });
  });

  it("returns non-zero exit code for empty datasets", () => {
    const { io, getStderr } = createIo();
    io.readdir = () => [];

    const exitCode = runRegisterExperimentsCommand([], io);

    expect(exitCode).toBe(1);
    expect(getStderr()).toContain("No research outputs found");
  });
});
