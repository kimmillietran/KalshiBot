import { describe, expect, it } from "vitest";

import { createRunnerResearchOutputJson } from "@/lib/data/research/calibration/testFixtures";

import { buildExperimentId, hashFixtureContent } from "./hashExperimentIdentity";
import { parseExperimentResearchDocument } from "./parseExperimentResearchOutput";
import { registerExperiments, serializeExperimentRecord } from "./registerExperiments";
import {
  ExperimentRegistryError,
  ExperimentRegistryErrorCode,
} from "./experimentRegistryTypes";

const STRATEGY_ID = "noop";
const SERIES_TICKER = "KXBTC15M";
const MARKET_TICKER = `${SERIES_TICKER}-MARKET-A`;
const RESEARCH_ROOT = "data/research-results";
const EXPERIMENTS_ROOT = "data/experiments";
const FIXTURES_ROOT = "data/fixtures";

function createResearchOutputJson() {
  return createRunnerResearchOutputJson({
    strategyId: STRATEGY_ID,
    strategyProbabilityUp: 0.65,
  });
}

function createIo(options?: {
  existingRecord?: string;
  fixtureJson?: string;
  calibrationExists?: boolean;
  aggregateJson?: string;
}) {
  const researchOutputPath =
    `${RESEARCH_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_TICKER}/research-output.json`;
  const fixturePath = `${FIXTURES_ROOT}/${SERIES_TICKER}/${MARKET_TICKER}/fixture.json`;
  const calibrationPath =
    `${RESEARCH_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/calibration-report.json`;
  const aggregatePath = `${RESEARCH_ROOT}/${SERIES_TICKER}/aggregate-summary.json`;
  const writes = new Map<string, string>();

  const document = parseExperimentResearchDocument(createResearchOutputJson(), researchOutputPath, {
    strategyId: STRATEGY_ID,
    seriesTicker: SERIES_TICKER,
    marketTicker: MARKET_TICKER,
  });
  const fixtureHash = options?.fixtureJson
    ? hashFixtureContent(options.fixtureJson)
    : null;
  const experimentId = buildExperimentId({
    strategyId: document.strategyId,
    strategyConfig: document.strategyConfig,
    costModelConfig: document.costModelConfig,
    datasetHash: document.datasetHash,
    fixtureHash,
    engineVersion: document.engineVersion,
  });
  const experimentPath = `${EXPERIMENTS_ROOT}/${experimentId}/experiment.json`;

  return {
    io: {
      readdir: (path: string) => {
        if (path === RESEARCH_ROOT) {
          return [STRATEGY_ID];
        }
        if (path === `${RESEARCH_ROOT}/${STRATEGY_ID}`) {
          return [SERIES_TICKER];
        }
        if (path === `${RESEARCH_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}`) {
          return [MARKET_TICKER];
        }
        if (path === `${FIXTURES_ROOT}/${SERIES_TICKER}`) {
          return [MARKET_TICKER];
        }
        return [];
      },
      readFile: (path: string) => {
        if (path === researchOutputPath) {
          return createResearchOutputJson();
        }
        if (path === fixturePath && options?.fixtureJson) {
          return options.fixtureJson;
        }
        if (path === experimentPath && options?.existingRecord) {
          return options.existingRecord;
        }
        if (path === calibrationPath && options?.calibrationExists) {
          return "{}";
        }
        if (path === aggregatePath && options?.aggregateJson) {
          return options.aggregateJson;
        }
        throw new Error(`Missing file: ${path}`);
      },
      writeFile: (path: string, data: string) => {
        writes.set(path, data);
      },
      fileExists: (path: string) => {
        if (path === researchOutputPath) {
          return true;
        }
        if (path === fixturePath) {
          return Boolean(options?.fixtureJson);
        }
        if (path === experimentPath) {
          return Boolean(options?.existingRecord);
        }
        if (path === calibrationPath) {
          return Boolean(options?.calibrationExists);
        }
        if (path === aggregatePath) {
          return Boolean(options?.aggregateJson);
        }
        return (
          path === RESEARCH_ROOT
          || path === `${RESEARCH_ROOT}/${STRATEGY_ID}`
          || path === `${RESEARCH_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}`
          || path === `${RESEARCH_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_TICKER}`
          || path === `${FIXTURES_ROOT}/${SERIES_TICKER}`
          || path === `${FIXTURES_ROOT}/${SERIES_TICKER}/${MARKET_TICKER}`
        );
      },
      isDirectory: (path: string) =>
        path === RESEARCH_ROOT
        || path === `${RESEARCH_ROOT}/${STRATEGY_ID}`
        || path === `${RESEARCH_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}`
        || path === `${RESEARCH_ROOT}/${STRATEGY_ID}/${SERIES_TICKER}/${MARKET_TICKER}`
        || path === `${FIXTURES_ROOT}/${SERIES_TICKER}`
        || path === `${FIXTURES_ROOT}/${SERIES_TICKER}/${MARKET_TICKER}`,
      resolveGitCommit: () => "abc1234",
    },
    writes,
    experimentPath,
    experimentId,
    researchOutputPath,
  };
}

describe("registerExperiments", () => {
  it("creates immutable experiment records with artifact locations", () => {
    const { io, writes, experimentPath } = createIo({
      fixtureJson: createResearchOutputJson(),
      calibrationExists: true,
      aggregateJson: JSON.stringify({
        generatedAt: "2026-06-27T00:00:00.000Z",
        markets: [
          {
            marketTicker: MARKET_TICKER,
            metrics: { totalPnlCents: 100, totalReturnPct: 0.1, winRatePct: 50 },
          },
        ],
      }),
    });

    const result = registerExperiments(
      {
        researchRoot: RESEARCH_ROOT,
        experimentsRoot: EXPERIMENTS_ROOT,
        fixturesRoot: FIXTURES_ROOT,
        registeredAt: "2026-06-27T00:00:00.000Z",
      },
      io,
    );

    expect(result.registeredCount).toBe(1);
    expect(writes.has(experimentPath)).toBe(true);

    const record = JSON.parse(writes.get(experimentPath) ?? "{}");
    expect(record.strategyId).toBe(STRATEGY_ID);
    expect(record.runId).toBe("test-run");
    expect(record.gitCommit).toBe("abc1234");
    expect(record.researchOutputLocations).toHaveLength(1);
    expect(record.calibrationReportLocations).toHaveLength(1);
    expect(record.leaderboardSnapshot?.entries).toHaveLength(1);
  });

  it("serializes records deterministically", () => {
    const document = parseExperimentResearchDocument(createResearchOutputJson(), "output.json");
    const record = {
      experimentId: buildExperimentId({
        strategyId: document.strategyId,
        strategyConfig: document.strategyConfig,
        costModelConfig: document.costModelConfig,
        datasetHash: document.datasetHash,
        fixtureHash: null,
        engineVersion: document.engineVersion,
      }),
      runId: document.runId,
      strategyId: document.strategyId,
      strategyConfig: document.strategyConfig,
      costModelConfig: document.costModelConfig,
      datasetHash: document.datasetHash,
      fixtureHash: null,
      engineVersion: document.engineVersion,
      gitCommit: null,
      timestamp: document.timestamp,
      seriesTicker: document.seriesTicker,
      marketTicker: document.marketTicker,
      researchOutputLocations: [document.outputPath],
      calibrationReportLocations: [],
      leaderboardSnapshot: null,
      registeredAt: "2026-06-27T00:00:00.000Z",
    };

    expect(serializeExperimentRecord(record)).toBe(serializeExperimentRecord(record));
  });

  it("skips identical existing records", () => {
    const { io, experimentPath, writes } = createIo();
    const first = registerExperiments(
      {
        researchRoot: RESEARCH_ROOT,
        experimentsRoot: EXPERIMENTS_ROOT,
        fixturesRoot: FIXTURES_ROOT,
        registeredAt: "2026-06-27T00:00:00.000Z",
      },
      io,
    );

    const existingRecord = writes.get(experimentPath);
    const secondIo = createIo({ existingRecord });
    const second = registerExperiments(
      {
        researchRoot: RESEARCH_ROOT,
        experimentsRoot: EXPERIMENTS_ROOT,
        fixturesRoot: FIXTURES_ROOT,
        registeredAt: "2026-06-27T00:00:00.000Z",
      },
      secondIo.io,
    );

    expect(first.registeredCount).toBe(1);
    expect(second.skippedCount).toBe(1);
  });

  it("rejects conflicting immutable records", () => {
    const { io, experimentPath, writes } = createIo();
    registerExperiments(
      {
        researchRoot: RESEARCH_ROOT,
        experimentsRoot: EXPERIMENTS_ROOT,
        fixturesRoot: FIXTURES_ROOT,
        registeredAt: "2026-06-27T00:00:00.000Z",
      },
      io,
    );

    const existingRecord = (writes.get(experimentPath) ?? "").replace("test-run", "other-run");
    const conflictIo = createIo({ existingRecord });

    expect(() =>
      registerExperiments(
        {
          researchRoot: RESEARCH_ROOT,
          experimentsRoot: EXPERIMENTS_ROOT,
          fixturesRoot: FIXTURES_ROOT,
          registeredAt: "2026-06-27T00:00:00.000Z",
        },
        conflictIo.io,
      ),
    ).toThrow(ExperimentRegistryError);
  });

  it("throws for incomplete research metadata", () => {
    const brokenJson = createResearchOutputJson().replace('"runId":"test-run"', '"runId":""');

    expect(() =>
      parseExperimentResearchDocument(brokenJson, "output.json"),
    ).toThrow(ExperimentRegistryError);
  });

  it("throws for empty research trees", () => {
    expect(() =>
      registerExperiments(
        {
          researchRoot: RESEARCH_ROOT,
          experimentsRoot: EXPERIMENTS_ROOT,
          fixturesRoot: FIXTURES_ROOT,
          registeredAt: "2026-06-27T00:00:00.000Z",
        },
        {
          readdir: () => [],
          readFile: () => {
            throw new Error("missing");
          },
          writeFile: () => undefined,
          fileExists: () => false,
          isDirectory: (path) => path === RESEARCH_ROOT,
        },
      ),
    ).toThrowError(
      expect.objectContaining({
        code: ExperimentRegistryErrorCode.EMPTY_DATASET,
      }),
    );
  });
});
