import { describe, expect, it } from "vitest";

import {
  buildForwardSettlementJoinReport,
  joinForwardCaptureSettlements,
  loadKnownSettlementsFromImports,
  mergeDuplicateSettlementRecords,
  parseCapturedMarketSettlementKeys,
} from "./index";
import type {
  CapturedMarketSettlementKey,
  ForwardSettlementJoinIo,
  KnownSettlementRecord,
} from "./forwardSettlementJoinTypes";

const MARKET_YES = "KXBTC15M-26APR281945-45";
const MARKET_NO = "KXBTC15M-26APR281946-45";
const MARKET_UNKNOWN = "KXBTC15M-26APR281947-45";

function createImportResultJson(marketTicker: string, outcome: "yes" | "no"): string {
  return JSON.stringify({
    bronzeRecords: [
      {
        contentType: "kalshi.historical.settlement",
        ticker: marketTicker,
        payload: {
          market: {
            ticker: marketTicker,
            event_ticker: "KXBTC15M-26APR281945",
            result: outcome,
            settlement_ts: "2026-04-28T23:45:09.271822Z",
            open_time: "2026-04-28T23:30:00Z",
            close_time: "2026-04-28T23:45:00Z",
          },
        },
      },
    ],
  });
}

function createLifecycleJson(episodes: Array<Record<string, unknown>>): string {
  return JSON.stringify({ episodes });
}

function createIo(files: Record<string, string>, dirs: readonly string[] = []): ForwardSettlementJoinIo {
  const dirSet = new Set(dirs);

  return {
    readFile: (path) => files[path] ?? (() => { throw new Error(`Missing file: ${path}`); })(),
    fileExists: (path) => path in files || dirSet.has(path),
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
      for (const dirPath of dirs) {
        if (dirPath.startsWith(prefix)) {
          const remainder = dirPath.slice(prefix.length);
          const [entry] = remainder.split("/");
          if (entry) {
            entries.add(entry);
          }
        }
      }
      return [...entries];
    },
    isDirectory: (path) => dirSet.has(path),
  };
}

function seedCaptureRun(files: Record<string, string>, dirs: string[], runId: string, marketTicker: string): void {
  const runDir = `data/live-capture/forward-quotes/${runId}`;
  dirs.push(runDir, "data/live-capture/forward-quotes");
  files[`${runDir}/top-of-book.jsonl`] = `${JSON.stringify({
    runId,
    marketTicker,
    seriesTicker: "KXBTC15M",
    eventTicker: "KXBTC15M-26APR281945",
    receivedAtLocal: "2026-04-28T23:31:00.000Z",
  })}\n`;
  files[`${runDir}/market-metadata.jsonl`] = `${JSON.stringify({
    runId,
    marketTicker,
    seriesTicker: "KXBTC15M",
    eventTicker: "KXBTC15M-26APR281945",
    openTime: "2026-04-28T23:30:00Z",
    closeTime: "2026-04-28T23:45:00Z",
  })}\n`;
}

describe("forwardSettlementJoin", () => {
  it("joins captured market to known YES settlement", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = ["data/imports"];
    seedCaptureRun(files, dirs, "run-a", MARKET_YES);
    files[`data/imports/KXBTC15M/${MARKET_YES}/import-result.json`] =
      createImportResultJson(MARKET_YES, "yes");

    const io = createIo(files, dirs);
    const captured = parseCapturedMarketSettlementKeys({
      io,
      forwardQuotesDir: "data/live-capture/forward-quotes",
      staticParityScanPath: null,
      seriesTicker: "KXBTC15M",
    });
    const settlements = loadKnownSettlementsFromImports({
      io,
      importsDir: "data/imports",
      marketTickers: captured.markets.map((market) => market.marketTicker),
    });

    const joined = joinForwardCaptureSettlements({
      markets: captured.markets,
      settlementSource: settlements,
      episodes: [],
      evaluatedAt: "2026-04-28T23:50:00.000Z",
      inputArtifactsUsed: captured.inputArtifactsUsed,
      missingArtifacts: [],
      warnings: [],
    });

    expect(joined.marketJoins).toHaveLength(1);
    expect(joined.marketJoins[0]?.settledOutcome).toBe("yes");
    expect(joined.marketJoins[0]?.settlementStatus).toBe("known");
    expect(joined.marketJoins[0]?.joinConfidence).toBe("high");
  });

  it("joins captured market to known NO settlement", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = ["data/imports"];
    seedCaptureRun(files, dirs, "run-b", MARKET_NO);
    files[`data/imports/KXBTC15M/${MARKET_NO}/import-result.json`] =
      createImportResultJson(MARKET_NO, "no");

    const io = createIo(files, dirs);
    const captured = parseCapturedMarketSettlementKeys({
      io,
      forwardQuotesDir: "data/live-capture/forward-quotes",
      staticParityScanPath: null,
      seriesTicker: "KXBTC15M",
    });
    const settlements = loadKnownSettlementsFromImports({
      io,
      importsDir: "data/imports",
      marketTickers: captured.markets.map((market) => market.marketTicker),
    });

    const joined = joinForwardCaptureSettlements({
      markets: captured.markets,
      settlementSource: settlements,
      episodes: [],
      evaluatedAt: "2026-04-28T23:50:00.000Z",
      inputArtifactsUsed: [],
      missingArtifacts: [],
      warnings: [],
    });

    expect(joined.marketJoins[0]?.settledOutcome).toBe("no");
  });

  it("reports missing settlement source when imports dir absent", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedCaptureRun(files, dirs, "run-c", MARKET_UNKNOWN);
    const io = createIo(files, dirs);

    const report = buildForwardSettlementJoinReport({
      generatedAt: "2026-04-28T23:50:00.000Z",
      outputPath: "data/research-results/forward-settlement-join.json",
      htmlOutputPath: "data/reports/forward-settlement-join.html",
      config: {
        forwardQuotesDir: "data/live-capture/forward-quotes",
        importsDir: "data/imports",
        staticParityScanPath: null,
        bidOnlyCandidateLifecyclePath: null,
        seriesTicker: "KXBTC15M",
      },
      io,
    });

    expect(report.summary.overallVerdict).toBe("missing-settlement-source");
    expect(report.summary.recommendedNextAction).toBe("import-settlements");
    expect(report.marketJoins[0]?.settlementStatus).toBe("missing-source");
  });

  it("marks unknown market settlement when import missing", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = ["data/imports"];
    seedCaptureRun(files, dirs, "run-d", MARKET_UNKNOWN);
    const io = createIo(files, dirs);

    const captured = parseCapturedMarketSettlementKeys({
      io,
      forwardQuotesDir: "data/live-capture/forward-quotes",
      staticParityScanPath: null,
      seriesTicker: "KXBTC15M",
    });
    const settlements = loadKnownSettlementsFromImports({
      io,
      importsDir: "data/imports",
      marketTickers: captured.markets.map((market) => market.marketTicker),
    });

    const joined = joinForwardCaptureSettlements({
      markets: captured.markets,
      settlementSource: settlements,
      episodes: [],
      evaluatedAt: "2026-04-28T23:50:00.000Z",
      inputArtifactsUsed: [],
      missingArtifacts: [],
      warnings: [],
    });

    expect(joined.marketJoins[0]?.settledOutcome).toBe("unknown");
    expect(joined.marketJoins[0]?.settlementStatus).toBe("unknown");
  });

  it("joins candidate episodes by marketTicker", () => {
    const market: CapturedMarketSettlementKey = {
      marketTicker: MARKET_YES,
      eventTicker: null,
      seriesTicker: "KXBTC15M",
      openTime: null,
      closeTime: null,
      captureRunIds: ["run-a"],
      sourceArtifacts: ["top-of-book.jsonl"],
    };
    const settlement: KnownSettlementRecord = {
      marketTicker: MARKET_YES,
      settledOutcome: "yes",
      settlementTime: "2026-04-28T23:45:09.271822Z",
      openTime: null,
      closeTime: null,
      eventTicker: null,
      seriesTicker: "KXBTC15M",
      sourceArtifact: "import-result.json",
      joinConfidence: "high",
      settlementStatus: "known",
    };

    const joined = joinForwardCaptureSettlements({
      markets: [market],
      settlementSource: {
        importsDirPresent: true,
        settlementsByMarket: new Map([[MARKET_YES, settlement]]),
        sourceArtifacts: ["data/imports"],
        warnings: [],
      },
      episodes: [
        {
          episodeId: "ep-1",
          marketTicker: MARKET_YES,
          episodeStart: "2026-04-28T23:31:00.000Z",
          episodeEnd: "2026-04-28T23:32:00.000Z",
          episodeClassification: "gross-candidate-episode",
        },
      ],
      evaluatedAt: "2026-04-28T23:50:00.000Z",
      inputArtifactsUsed: [],
      missingArtifacts: [],
      warnings: [],
    });

    expect(joined.episodeJoins).toHaveLength(1);
    expect(joined.episodeJoins[0]?.isOutcomeKnown).toBe(true);
    expect(joined.episodeJoins[0]?.settledOutcome).toBe("yes");
    expect(joined.episodeJoins[0]?.timeFromEpisodeEndToSettlementMs).toBeGreaterThan(0);
  });

  it("reports partial settlement coverage", () => {
    const markets: CapturedMarketSettlementKey[] = [
      {
        marketTicker: MARKET_YES,
        eventTicker: null,
        seriesTicker: "KXBTC15M",
        openTime: null,
        closeTime: null,
        captureRunIds: ["run-a"],
        sourceArtifacts: [],
      },
      {
        marketTicker: MARKET_UNKNOWN,
        eventTicker: null,
        seriesTicker: "KXBTC15M",
        openTime: null,
        closeTime: null,
        captureRunIds: ["run-a"],
        sourceArtifacts: [],
      },
    ];

    const joined = joinForwardCaptureSettlements({
      markets,
      settlementSource: {
        importsDirPresent: true,
        settlementsByMarket: new Map([
          [
            MARKET_YES,
            {
              marketTicker: MARKET_YES,
              settledOutcome: "yes",
              settlementTime: "2026-04-28T23:45:09.271822Z",
              openTime: null,
              closeTime: null,
              eventTicker: null,
              seriesTicker: "KXBTC15M",
              sourceArtifact: "import-result.json",
              joinConfidence: "high",
              settlementStatus: "known",
            },
          ],
        ]),
        sourceArtifacts: ["data/imports"],
        warnings: [],
      },
      episodes: [
        {
          episodeId: "ep-1",
          marketTicker: MARKET_YES,
          episodeStart: "2026-04-28T23:31:00.000Z",
          episodeEnd: "2026-04-28T23:32:00.000Z",
          episodeClassification: "gross-candidate-episode",
        },
        {
          episodeId: "ep-2",
          marketTicker: MARKET_UNKNOWN,
          episodeStart: "2026-04-28T23:31:00.000Z",
          episodeEnd: "2026-04-28T23:32:00.000Z",
          episodeClassification: "gross-candidate-episode",
        },
      ],
      evaluatedAt: "2026-04-28T23:50:00.000Z",
      inputArtifactsUsed: [],
      missingArtifacts: [],
      warnings: [],
    });

    expect(joined.summary.overallVerdict).toBe("partial-settlement-coverage");
    expect(joined.summary.settlementCoverageShare).toBe(0.5);
    expect(joined.summary.episodeSettlementCoverageShare).toBe(0.5);
  });

  it("reports no captured markets", () => {
    const joined = joinForwardCaptureSettlements({
      markets: [],
      settlementSource: {
        importsDirPresent: true,
        settlementsByMarket: new Map(),
        sourceArtifacts: [],
        warnings: [],
      },
      episodes: [],
      evaluatedAt: "2026-04-28T23:50:00.000Z",
      inputArtifactsUsed: [],
      missingArtifacts: [],
      warnings: [],
    });

    expect(joined.summary.overallVerdict).toBe("no-captured-markets");
  });

  it("reports no candidate episodes when markets exist", () => {
    const joined = joinForwardCaptureSettlements({
      markets: [
        {
          marketTicker: MARKET_YES,
          eventTicker: null,
          seriesTicker: "KXBTC15M",
          openTime: null,
          closeTime: null,
          captureRunIds: ["run-a"],
          sourceArtifacts: [],
        },
      ],
      settlementSource: {
        importsDirPresent: true,
        settlementsByMarket: new Map(),
        sourceArtifacts: ["data/imports"],
        warnings: [],
      },
      episodes: [],
      evaluatedAt: "2026-04-28T23:50:00.000Z",
      inputArtifactsUsed: [],
      missingArtifacts: [],
      warnings: [],
    });

    expect(joined.summary.overallVerdict).toBe("no-candidate-episodes");
  });

  it("does not crash on malformed optional artifacts", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = ["data/imports"];
    seedCaptureRun(files, dirs, "run-e", MARKET_YES);
    files["data/research-results/static-parity-scan.json"] = "{not-json";
    files["data/research-results/bid-only-candidate-lifecycle.json"] = "{\"episodes\":\"bad\"}";

    const io = createIo(files, dirs);
    const report = buildForwardSettlementJoinReport({
      generatedAt: "2026-04-28T23:50:00.000Z",
      outputPath: "data/research-results/forward-settlement-join.json",
      htmlOutputPath: "data/reports/forward-settlement-join.html",
      config: {
        forwardQuotesDir: "data/live-capture/forward-quotes",
        importsDir: "data/imports",
        staticParityScanPath: "data/research-results/static-parity-scan.json",
        bidOnlyCandidateLifecyclePath: "data/research-results/bid-only-candidate-lifecycle.json",
        seriesTicker: "KXBTC15M",
      },
      io,
    });

    expect(report.summary.capturedMarketCount).toBe(1);
    expect(report.summary.candidateEpisodeCount).toBe(0);
    expect(report.summary.warnings.length).toBeGreaterThan(0);
  });

  it("handles duplicate settlement records deterministically", () => {
    const older: KnownSettlementRecord = {
      marketTicker: MARKET_YES,
      settledOutcome: "no",
      settlementTime: "2026-04-28T23:40:00.000Z",
      openTime: null,
      closeTime: null,
      eventTicker: null,
      seriesTicker: "KXBTC15M",
      sourceArtifact: "older",
      joinConfidence: "high",
      settlementStatus: "known",
    };
    const newer: KnownSettlementRecord = {
      marketTicker: MARKET_YES,
      settledOutcome: "yes",
      settlementTime: "2026-04-28T23:45:09.271822Z",
      openTime: null,
      closeTime: null,
      eventTicker: null,
      seriesTicker: "KXBTC15M",
      sourceArtifact: "newer",
      joinConfidence: "high",
      settlementStatus: "known",
    };

    expect(mergeDuplicateSettlementRecords([older, newer])?.settledOutcome).toBe("yes");
    expect(mergeDuplicateSettlementRecords([newer, older])?.settledOutcome).toBe("yes");
  });

  it("builds settlement-join-ready verdict with high coverage", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = ["data/imports"];
    seedCaptureRun(files, dirs, "run-f", MARKET_YES);
    files[`data/imports/KXBTC15M/${MARKET_YES}/import-result.json`] =
      createImportResultJson(MARKET_YES, "yes");
    files["data/research-results/bid-only-candidate-lifecycle.json"] = createLifecycleJson([
      {
        episodeId: "ep-ready",
        marketTicker: MARKET_YES,
        startedAt: "2026-04-28T23:31:00.000Z",
        endedAt: "2026-04-28T23:32:00.000Z",
        episodeClassification: "buffer-adjusted-candidate-episode",
      },
    ]);

    const io = createIo(files, dirs);
    const report = buildForwardSettlementJoinReport({
      generatedAt: "2026-04-28T23:50:00.000Z",
      outputPath: "data/research-results/forward-settlement-join.json",
      htmlOutputPath: "data/reports/forward-settlement-join.html",
      config: {
        forwardQuotesDir: "data/live-capture/forward-quotes",
        importsDir: "data/imports",
        staticParityScanPath: null,
        bidOnlyCandidateLifecyclePath: "data/research-results/bid-only-candidate-lifecycle.json",
        seriesTicker: "KXBTC15M",
      },
      io,
    });

    expect(report.summary.overallVerdict).toBe("settlement-join-ready");
    expect(report.summary.recommendedNextAction).toBe("build-outcome-study");
    expect(report.disclaimer).toContain("does not evaluate strategy PnL");
  });
});
