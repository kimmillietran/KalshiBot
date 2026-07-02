import { describe, expect, it } from "vitest";

import {
  buildSettlementTraceConfigFromTicker,
  buildSettlementTraceReport,
  serializeSettlementTraceReport,
} from "./buildSettlementTraceReport";
import type { SettlementTraceIo } from "./settlementTraceTypes";

const GENERATED_AT = "2026-07-02T18:00:00.000Z";
const MARKET_TICKER = "KXBTC15M-26MAY020515-15";
const SERIES_TICKER = "KXBTC15M";
const OUTPUT_PATH = `data/audits/settlement-trace-${MARKET_TICKER}.json`;

function settlementBronzeRecord(result: "yes" | "no") {
  return {
    contentType: "kalshi.historical.settlement",
    ticker: MARKET_TICKER,
    payload: {
      result,
      settlement_ts: "2026-05-02T05:30:00.000Z",
      expiration_value: "60010.25",
    },
  };
}

function createResearchOutputJson(options: {
  strategyId: string;
  settlementResult?: "yes" | "no" | null;
  includeReplayStepSettlement?: boolean;
}) {
  const settlement =
    options.settlementResult === undefined || options.settlementResult === null
      ? null
      : {
          result: options.settlementResult,
          ticker: MARKET_TICKER,
        };

  return JSON.stringify({
    dataset: JSON.stringify({
      snapshots: [
        {
          ticker: MARKET_TICKER,
          settlement,
        },
      ],
    }),
    researchRun: JSON.stringify({
      config: { strategyId: options.strategyId },
      backtestResult: JSON.stringify({
        replayResult: {
          results: [
            {
              stepIndex: 0,
              sourceSnapshot: {
                settlement:
                  options.includeReplayStepSettlement === false
                    ? null
                    : settlement,
              },
            },
          ],
        },
      }),
    }),
    metadata: { strategyId: options.strategyId },
  });
}

function createVirtualIo(files: Record<string, string>, directories: string[] = []): SettlementTraceIo {
  const dirSet = new Set(directories);

  return {
    readFile: (path) => {
      if (!(path in files)) {
        throw new Error(`ENOENT: ${path}`);
      }

      return files[path]!;
    },
    fileExists: (path) => path in files,
    readdir: (path) => {
      const prefix = `${path}/`;
      const entries = new Set<string>();

      for (const filePath of Object.keys(files)) {
        if (filePath.startsWith(prefix)) {
          const remainder = filePath.slice(prefix.length);
          const [entry] = remainder.split("/");
          if (entry) {
            entries.add(entry);
          }
        }
      }

      for (const directory of dirSet) {
        if (directory.startsWith(prefix)) {
          const remainder = directory.slice(prefix.length);
          const [entry] = remainder.split("/");
          if (entry) {
            entries.add(entry);
          }
        }
      }

      return [...entries].sort();
    },
    isDirectory: (path) =>
      dirSet.has(path)
      || Object.keys(files).some((filePath) => filePath.startsWith(`${path}/`))
      || [...dirSet].some((directory) => directory.startsWith(`${path}/`)),
  };
}

function buildEndToEndFiles() {
  const baseConfig = buildSettlementTraceConfigFromTicker(MARKET_TICKER, {
    importConfigsDir: "configs",
    importsDir: "imports",
    fixturesDir: "fixtures",
    registryDir: "registry",
    researchResultsDir: "results",
  });

  const files: Record<string, string> = {
    [`configs/${SERIES_TICKER}/${MARKET_TICKER}/config.json`]: JSON.stringify({
      marketTicker: MARKET_TICKER,
      kalshi: { settlementSource: "kalshi-rest" },
    }),
    [`imports/${SERIES_TICKER}/${MARKET_TICKER}/import-result.json`]: JSON.stringify({
      bronzeRecords: [settlementBronzeRecord("yes")],
    }),
    [`imports/${SERIES_TICKER}/${MARKET_TICKER}/metadata.json`]: JSON.stringify({
      marketTicker: MARKET_TICKER,
      settlementPresent: true,
    }),
    [`fixtures/${SERIES_TICKER}/${MARKET_TICKER}/fixture.json`]: JSON.stringify({
      bronzeRecords: [settlementBronzeRecord("yes")],
    }),
    [`registry/${SERIES_TICKER}/dataset-registry.json`]: JSON.stringify({
      markets: [
        {
          marketTicker: MARKET_TICKER,
          settlementPresent: true,
          fixturePath: `fixtures/${SERIES_TICKER}/${MARKET_TICKER}/fixture.json`,
        },
      ],
    }),
    [`results/noop/${SERIES_TICKER}/${MARKET_TICKER}/research-output.json`]:
      createResearchOutputJson({ strategyId: "noop", settlementResult: "yes" }),
    [`results/noop/${SERIES_TICKER}/calibration-report.json`]: JSON.stringify({
      markets: [{ marketTicker: MARKET_TICKER, settlementOutcome: 1 }],
    }),
    [`results/noop/${SERIES_TICKER}/aggregate-summary.json`]: JSON.stringify({
      markets: [{ marketTicker: MARKET_TICKER }],
    }),
    "results/mispricing-atlas.json": JSON.stringify({
      sampleCounts: { skippedMissingSettlement: 0 },
      warnings: [],
    }),
  };

  const directories = [
    "results",
    `results/noop`,
    `results/noop/${SERIES_TICKER}`,
    `results/noop/${SERIES_TICKER}/${MARKET_TICKER}`,
  ];

  return { files, directories, baseConfig };
}

describe("buildSettlementTraceReport", () => {
  it("reports settlement present end-to-end", () => {
    const { files, directories, baseConfig } = buildEndToEndFiles();
    const report = buildSettlementTraceReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      config: baseConfig,
      io: createVirtualIo(files, directories),
    });

    expect(report.firstMissingStage).toBeNull();
    expect(report.stages.find((stage) => stage.stageId === "import-result")?.settlementPresent).toBe(
      true,
    );
    expect(
      report.stages.find((stage) => stage.stageId === "research-output-replay-input")
        ?.settlementPresent,
    ).toBe(true);
    expect(report.strategySummaries).toHaveLength(1);
    expect(report.strategySummaries[0]?.calibrationSettlementOutcome).toBe(1);
  });

  it("flags missing settlement at import", () => {
    const { files, directories, baseConfig } = buildEndToEndFiles();
    files[`imports/${SERIES_TICKER}/${MARKET_TICKER}/import-result.json`] = JSON.stringify({
      bronzeRecords: [],
    });
    files[`imports/${SERIES_TICKER}/${MARKET_TICKER}/metadata.json`] = JSON.stringify({
      marketTicker: MARKET_TICKER,
      settlementPresent: false,
    });

    const report = buildSettlementTraceReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      config: baseConfig,
      io: createVirtualIo(files, directories),
    });

    expect(report.firstMissingStage).toBe("import-result");
    expect(report.likelyRootCause).toContain("bronze import result");
  });

  it("flags missing settlement at fixture", () => {
    const { files, directories, baseConfig } = buildEndToEndFiles();
    delete files[`fixtures/${SERIES_TICKER}/${MARKET_TICKER}/fixture.json`];

    const report = buildSettlementTraceReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      config: baseConfig,
      io: createVirtualIo(files, directories),
    });

    expect(report.firstMissingStage).toBe("fixture");
  });

  it("detects settlement present in fixture but absent in research output", () => {
    const { files, directories, baseConfig } = buildEndToEndFiles();
    files[`results/noop/${SERIES_TICKER}/${MARKET_TICKER}/research-output.json`] =
      createResearchOutputJson({ strategyId: "noop", settlementResult: null });

    const report = buildSettlementTraceReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      config: baseConfig,
      io: createVirtualIo(files, directories),
    });

    expect(report.firstMissingStage).toBe("research-output-replay-input");
    expect(report.likelyRootCause).toContain("research-output-replay-input");
  });

  it("summarizes multiple strategies deterministically", () => {
    const { files, directories, baseConfig } = buildEndToEndFiles();
    files[`results/baseline/${SERIES_TICKER}/${MARKET_TICKER}/research-output.json`] =
      createResearchOutputJson({ strategyId: "baseline", settlementResult: "no" });
    files[`results/baseline/${SERIES_TICKER}/calibration-report.json`] = JSON.stringify({
      markets: [{ marketTicker: MARKET_TICKER, settlementOutcome: 0 }],
    });
    directories.push(
      "results/baseline",
      `results/baseline/${SERIES_TICKER}`,
      `results/baseline/${SERIES_TICKER}/${MARKET_TICKER}`,
    );

    const report = buildSettlementTraceReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      config: baseConfig,
      io: createVirtualIo(files, directories),
    });

    expect(report.strategySummaries.map((summary) => summary.strategyId)).toEqual([
      "baseline",
      "noop",
    ]);
    expect(report.strategySummaries[0]?.replayInputSettlementValue).toBe("no");
    expect(report.strategySummaries[1]?.replayInputSettlementValue).toBe("yes");
  });

  it("marks malformed JSON stages", () => {
    const { files, directories, baseConfig } = buildEndToEndFiles();
    files[`imports/${SERIES_TICKER}/${MARKET_TICKER}/import-result.json`] = "{not-json";

    const report = buildSettlementTraceReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      config: baseConfig,
      io: createVirtualIo(files, directories),
    });

    expect(report.stages.find((stage) => stage.stageId === "import-result")?.status).toBe(
      "malformed",
    );
    expect(report.firstMissingStage).toBe("import-result");
  });

  it("handles missing ticker artifacts gracefully", () => {
    const baseConfig = buildSettlementTraceConfigFromTicker(MARKET_TICKER, {
      importConfigsDir: "configs",
      importsDir: "imports",
      fixturesDir: "fixtures",
      registryDir: "registry",
      researchResultsDir: "results",
    });

    const report = buildSettlementTraceReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      config: baseConfig,
      io: createVirtualIo({}, []),
    });

    expect(report.firstMissingStage).toBe("import-config");
    expect(report.stages.every((stage) => stage.stageId)).toBe(true);
    expect(report.stages.find((stage) => stage.stageId === "mispricing-atlas")?.status).toBe(
      "unavailable",
    );
  });

  it("serializes deterministically", () => {
    const { files, directories, baseConfig } = buildEndToEndFiles();
    const io = createVirtualIo(files, directories);
    const input = {
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      config: baseConfig,
      io,
    };

    const first = serializeSettlementTraceReport(buildSettlementTraceReport(input));
    const second = serializeSettlementTraceReport(buildSettlementTraceReport(input));

    expect(first).toBe(second);
  });
});
