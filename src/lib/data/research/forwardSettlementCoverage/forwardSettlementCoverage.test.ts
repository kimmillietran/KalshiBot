import { describe, expect, it, vi } from "vitest";

import { runForwardSettlementBackfill, createProductionForwardSettlementBackfillDeps } from "./backfillForwardSettlements";
import { buildForwardSettlementCoverageReport } from "./buildForwardSettlementCoverageReport";
import { buildCaptureMarketImportConfig, resolveMarketImportPaths } from "./buildCaptureMarketImportConfig";
import {
  classifyInvalidMarketEntry,
  classifyMarketSettlementCoverage,
} from "./classifyMarketSettlementCoverage";
import { applyCheckpointCoverageOverride } from "./reconcileForwardSettlementCoverage";
import {
  createForwardSettlementBackfillCheckpoint,
  loadForwardSettlementBackfillCheckpoint,
  serializeForwardSettlementBackfillCheckpoint,
} from "./checkpointForwardSettlementBackfill";
import { extractSelectedRunMarketInventory } from "./extractSelectedRunMarketInventory";
import { isRealCaptureMarketTicker } from "./isRealCaptureMarketTicker";
import {
  detectSettlementConflicts,
  parseAllImportResultSettlements,
} from "./loadMarketImportSettlementState";
import type {
  ForwardSettlementCoverageConfig,
  ForwardSettlementCoverageIo,
} from "./forwardSettlementCoverageTypes";

const RUN_ID = "2026-07-11T11-07-38-871Z";
const RUN_DIR = `data/live-capture/forward-quotes/${RUN_ID}`;
const MARKET_A = "KXBTC15M-26JUL111100-00";
const MARKET_B = "KXBTC15M-26JUL111115-15";
const MARKET_PENDING = "KXBTC15M-26JUL111200-00";
const EVALUATED_AT = "2026-07-11T12:00:00.000Z";

function createImportResult(marketTicker: string, outcome: "yes" | "no", options?: {
  settlementTs?: string;
  collectionTime?: string;
  conflicting?: boolean;
}): string {
  const records = [
    {
      contentType: "kalshi.historical.settlement",
      ticker: marketTicker,
      collectionTime: options?.collectionTime ?? "2026-07-11T11:30:00.000Z",
      payload: {
        market: {
          ticker: marketTicker,
          result: outcome,
          settlement_ts: options?.settlementTs ?? "2026-07-11T11:15:00.000Z",
          open_time: "2026-07-11T11:00:00.000Z",
          close_time: "2026-07-11T11:15:00.000Z",
        },
      },
    },
  ];

  if (options?.conflicting) {
    records.push({
      contentType: "kalshi.historical.settlement",
      ticker: marketTicker,
      collectionTime: "2026-07-11T11:31:00.000Z",
      payload: {
        market: {
          ticker: marketTicker,
          result: outcome === "yes" ? "no" : "yes",
          settlement_ts: "2026-07-11T11:16:00.000Z",
          open_time: "2026-07-11T11:00:00.000Z",
          close_time: "2026-07-11T11:15:00.000Z",
        },
      },
    });
  }

  return JSON.stringify({
    metadata: {
      valid: true,
      collectionTime: options?.collectionTime ?? "2026-07-11T11:30:00.000Z",
      settlementPresent: true,
    },
    bronzeRecords: records,
  });
}

function seedRun(files: Record<string, string>, dirs: string[]): void {
  dirs.push(RUN_DIR, "data/live-capture/forward-quotes", "data/imports");
  files[`${RUN_DIR}/top-of-book.jsonl`] = [
    JSON.stringify({
      marketTicker: MARKET_A,
      seriesTicker: "KXBTC15M",
      eventTicker: "KXBTC15M-26JUL111100",
      receivedAtLocal: "2026-07-11T11:08:00.000Z",
    }),
    JSON.stringify({
      marketTicker: MARKET_B,
      seriesTicker: "KXBTC15M",
      eventTicker: "KXBTC15M-26JUL111115",
      receivedAtLocal: "2026-07-11T11:09:00.000Z",
    }),
    JSON.stringify({
      marketTicker: "KXBTC15M-MOCK",
      seriesTicker: "KXBTC15M",
      receivedAtLocal: "2026-07-11T11:09:30.000Z",
    }),
    JSON.stringify({
      marketTicker: MARKET_PENDING,
      seriesTicker: "KXBTC15M",
      receivedAtLocal: "2026-07-11T11:10:00.000Z",
    }),
  ].join("\n");

  files[`${RUN_DIR}/market-metadata.jsonl`] = [
    JSON.stringify({
      marketTicker: MARKET_A,
      seriesTicker: "KXBTC15M",
      closeTime: "2026-07-11T11:15:00.000Z",
      receivedAtLocal: "2026-07-11T11:08:00.000Z",
    }),
    JSON.stringify({
      marketTicker: MARKET_B,
      seriesTicker: "KXBTC15M",
      closeTime: "2026-07-11T11:30:00.000Z",
      receivedAtLocal: "2026-07-11T11:09:00.000Z",
    }),
    JSON.stringify({
      marketTicker: MARKET_PENDING,
      seriesTicker: "KXBTC15M",
      closeTime: "2026-07-11T13:00:00.000Z",
      receivedAtLocal: "2026-07-11T11:10:00.000Z",
    }),
  ].join("\n");
}

function createIo(
  files: Record<string, string>,
  dirs: string[] = [],
): ForwardSettlementCoverageIo {
  const written: Record<string, string> = {};

  return {
    readFile: (path) => files[path] ?? written[path] ?? (() => {
      throw new Error(`Missing file: ${path}`);
    })(),
    fileExists: (path) => path in files || path in written || dirs.includes(path),
    readdir: (path) => {
      const prefix = `${path}/`;
      const entries = new Set<string>();
      for (const filePath of [...Object.keys(files), ...Object.keys(written)]) {
        if (filePath.startsWith(prefix)) {
          entries.add(filePath.slice(prefix.length).split("/")[0]!);
        }
      }
      return [...entries];
    },
    isDirectory: (path) => dirs.includes(path),
    writeFile: (path, data) => {
      written[path] = data;
      files[path] = data;
    },
    mkdirSync: () => undefined,
  };
}

function defaultConfig(overrides: Partial<ForwardSettlementCoverageConfig> = {}): ForwardSettlementCoverageConfig {
  return {
    captureRunDir: RUN_DIR,
    importsDir: "data/imports",
    outputPath: "data/research-results/forward-settlement-coverage.json",
    htmlOutputPath: "data/reports/forward-settlement-coverage.html",
    checkpointPath: "data/research-results/forward-settlement-backfill-checkpoint.json",
    dryRun: false,
    resume: false,
    maxConcurrency: 2,
    maxRetries: 2,
    retryBaseDelayMs: 1,
    staleAfterCaptureObservation: true,
    ...overrides,
  };
}

describe("forwardSettlementCoverage", () => {
  it("extracts and deduplicates selected-run real market tickers", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);

    const extracted = extractSelectedRunMarketInventory({
      io: createIo(files, dirs),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    expect(extracted.selectedRunId).toBe(RUN_ID);
    expect(extracted.inventory.map((entry) => entry.marketTicker)).toEqual([
      MARKET_A,
      MARKET_B,
      MARKET_PENDING,
    ]);
    expect(extracted.inventory[0]?.observationCount).toBe(2);
    expect(extracted.excludedTickers.some((entry) => entry.marketTicker.includes("MOCK"))).toBe(true);
    expect(isRealCaptureMarketTicker("KXBTC15M-MOCK")).toBe(false);
  });

  it("reads forward capture metadata timestamps from recordedAtLocal", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    dirs.push(RUN_DIR, "data/live-capture/forward-quotes");
    files[`${RUN_DIR}/top-of-book.jsonl`] = JSON.stringify({
      marketTicker: MARKET_A,
      seriesTicker: "KXBTC15M",
      receivedAtLocal: "2026-07-11T11:08:00.000Z",
    });
    files[`${RUN_DIR}/market-metadata.jsonl`] = JSON.stringify({
      marketTicker: MARKET_A,
      seriesTicker: "KXBTC15M",
      closeTime: "2026-07-11T11:15:00.000Z",
      recordedAtLocal: "2026-07-11T11:08:00.000Z",
    });

    const extracted = extractSelectedRunMarketInventory({
      io: createIo(files, dirs),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    expect(extracted.inventory[0]?.marketCloseTime).toBe("2026-07-11T11:15:00.000Z");
    expect(extracted.inventory[0]?.expectedSettlementAvailability).toBe("available");
  });

  it("excludes non-ready settlements from join inputs", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_A}/import-result.json`] = createImportResult(MARKET_A, "yes");
    files[`data/imports/KXBTC15M/${MARKET_B}/import-result.json`] = createImportResult(
      MARKET_B,
      "no",
      { collectionTime: "2026-07-11T11:08:00.000Z" },
    );

    const report = await buildForwardSettlementCoverageReport({
      generatedAt: EVALUATED_AT,
      config: defaultConfig(),
      io: createIo(files, dirs),
      joinOutputPath: "data/research-results/forward-settlement-join-selected-run.json",
      runBackfill: false,
    });

    expect(report.joinIntegration.settlementKnownMarketCount).toBe(1);
    expect(
      report.joinIntegration.marketsExcludedFromJoin.some(
        (market) => market.marketTicker === MARKET_B,
      ),
    ).toBe(true);
    const joinJson = JSON.parse(
      files["data/research-results/forward-settlement-join-selected-run.json"]!,
    ) as { marketJoins: Array<{ marketTicker: string }> };
    expect(joinJson.marketJoins.map((join) => join.marketTicker)).toEqual([MARKET_A]);
  });

  it("detects existing settlement-ready markets", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_A}/import-result.json`] = createImportResult(MARKET_A, "yes");

    const extracted = extractSelectedRunMarketInventory({
      io: createIo(files, dirs),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files, dirs),
      importsDir: "data/imports",
      inventory: extracted.inventory[0]!,
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: true,
    });

    expect(classified.classification).toBe("settlement-ready");
    expect(classified.settledOutcome).toBe("yes");
  });

  it("classifies missing settlement source", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);

    const extracted = extractSelectedRunMarketInventory({
      io: createIo(files, dirs),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files, dirs),
      importsDir: "data/imports",
      inventory: extracted.inventory[1]!,
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: true,
    });

    expect(classified.classification).toBe("missing-settlement-source");
  });

  it("classifies stale settlement imports", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_A}/import-result.json`] = createImportResult(MARKET_A, "yes", {
      collectionTime: "2026-07-11T11:07:00.000Z",
    });

    const extracted = extractSelectedRunMarketInventory({
      io: createIo(files, dirs),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files, dirs),
      importsDir: "data/imports",
      inventory: extracted.inventory[0]!,
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: true,
    });

    expect(classified.classification).toBe("settlement-present-but-stale");
  });

  it("classifies unsettled markets", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);

    const extracted = extractSelectedRunMarketInventory({
      io: createIo(files, dirs),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files, dirs),
      importsDir: "data/imports",
      inventory: extracted.inventory.find((entry) => entry.marketTicker === MARKET_PENDING)!,
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: true,
    });

    expect(classified.classification).toBe("market-not-yet-settled");
  });

  it("detects conflicting settlement records", () => {
    const candidates = parseAllImportResultSettlements({
      marketTicker: MARKET_A,
      importPath: "data/imports/KXBTC15M/MARKET/import-result.json",
      content: createImportResult(MARKET_A, "yes", { conflicting: true }),
    });

    expect(detectSettlementConflicts(candidates)).toContain("conflicting outcomes");
  });

  it("runs idempotent dry-run backfill without mutating imports", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const io = createIo(files, dirs);
    const runMarketImport = vi.fn(async () => ({ success: true }));

    const extracted = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });
    const markets = extracted.inventory.map((inventory) =>
      classifyMarketSettlementCoverage({
        io,
        importsDir: "data/imports",
        inventory,
        evaluatedAt: EVALUATED_AT,
        staleAfterCaptureObservation: true,
      }),
    );

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig({ dryRun: true }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport },
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.marketResults.some((result) => result.status === "dry-run-planned")).toBe(true);
    expect(runMarketImport).not.toHaveBeenCalled();
    expect(files[`data/imports/KXBTC15M/${MARKET_B}/import-result.json`]).toBeUndefined();
  });

  it("supports checkpoint resume and bounded concurrency backfill", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const io = createIo(files, dirs);

    const checkpoint = createForwardSettlementBackfillCheckpoint({
      captureRunDir: RUN_DIR,
      selectedRunId: RUN_ID,
      importsDir: "data/imports",
      dryRun: false,
      startedAt: EVALUATED_AT,
      marketTickers: [MARKET_A, MARKET_B],
    });
    files["data/research-results/forward-settlement-backfill-checkpoint.json"] =
      serializeForwardSettlementBackfillCheckpoint(checkpoint);

    let inFlight = 0;
    let maxInFlight = 0;
    const runMarketImport = vi.fn(async ({ market }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      files[`data/imports/KXBTC15M/${market.marketTicker}/import-result.json`] =
        createImportResult(market.marketTicker, "yes");
      return { success: true };
    });

    const extracted = extractSelectedRunMarketInventory({ io, captureRunDir: RUN_DIR, evaluatedAt: EVALUATED_AT });
    const markets = extracted.inventory
      .filter((entry) => [MARKET_A, MARKET_B].includes(entry.marketTicker))
      .map((inventory) =>
        classifyMarketSettlementCoverage({
          io,
          importsDir: "data/imports",
          inventory,
          evaluatedAt: EVALUATED_AT,
          staleAfterCaptureObservation: true,
        }),
      );

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig({ resume: true, maxConcurrency: 2, maxRetries: 2 }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport },
    });

    expect(summary.importedMarketCount).toBe(2);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(loadForwardSettlementBackfillCheckpoint({
      readFile: io.readFile,
      fileExists: io.fileExists,
      checkpointPath: "data/research-results/forward-settlement-backfill-checkpoint.json",
    })?.markets.every((market) => market.status === "imported")).toBe(true);
  });

  it("retries failed imports with backoff", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const io = createIo(files, dirs);
    let attempts = 0;
    const runMarketImport = vi.fn(async () => {
      attempts += 1;
      if (attempts < 2) {
        return { success: false, errorMessage: "rate limited" };
      }
      files[`data/imports/KXBTC15M/${MARKET_B}/import-result.json`] =
        createImportResult(MARKET_B, "no");
      return { success: true };
    });

    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    }).inventory.find((entry) => entry.marketTicker === MARKET_B)!;

    const markets = [
      classifyMarketSettlementCoverage({
        io,
        importsDir: "data/imports",
        inventory,
        evaluatedAt: EVALUATED_AT,
        staleAfterCaptureObservation: true,
      }),
    ];

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig({ maxRetries: 3, retryBaseDelayMs: 1, maxConcurrency: 1 }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport, sleep: async () => undefined },
    });

    expect(runMarketImport).toHaveBeenCalledTimes(2);
    expect(summary.importedMarketCount).toBe(1);
  });

  it("retries import-failed coverage entries instead of skipping them", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_B}/metadata.json`] = JSON.stringify({
      valid: false,
      closeTime: "2026-07-11T11:30:00.000Z",
    });
    files[`data/imports/KXBTC15M/${MARKET_B}/import-result.json`] = JSON.stringify({
      metadata: {
        valid: false,
        collectionTime: "2026-07-11T11:31:00.000Z",
        settlementPresent: true,
      },
      bronzeRecords: [],
    });
    const io = createIo(files, dirs);
    const runMarketImport = vi.fn(async ({ market }) => {
      files[`data/imports/KXBTC15M/${market.marketTicker}/metadata.json`] = JSON.stringify({
        valid: true,
        closeTime: "2026-07-11T11:30:00.000Z",
      });
      files[`data/imports/KXBTC15M/${market.marketTicker}/import-result.json`] =
        createImportResult(market.marketTicker, "no");
      return { success: true };
    });

    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    }).inventory.find((entry) => entry.marketTicker === MARKET_B)!;
    const markets = [
      classifyMarketSettlementCoverage({
        io,
        importsDir: "data/imports",
        inventory,
        evaluatedAt: EVALUATED_AT,
        staleAfterCaptureObservation: true,
      }),
    ];

    expect(markets[0]?.classification).toBe("import-failed");

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig({ maxRetries: 1, maxConcurrency: 1 }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport },
    });

    expect(runMarketImport).toHaveBeenCalledTimes(1);
    expect(summary.importedMarketCount).toBe(1);
    expect(summary.marketResults[0]?.status).toBe("imported");
  });

  it("invalidates imported checkpoint entries when the market is backfillable again", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const checkpoint = createForwardSettlementBackfillCheckpoint({
      captureRunDir: RUN_DIR,
      selectedRunId: RUN_ID,
      importsDir: "data/imports",
      dryRun: false,
      startedAt: EVALUATED_AT,
      marketTickers: [MARKET_B],
    });
    checkpoint.markets[0] = {
      marketTicker: MARKET_B,
      status: "imported",
      attempts: 1,
      lastAttemptAt: EVALUATED_AT,
      nextEligibleRetryAt: null,
      errorMessage: null,
      importResultPath: `data/imports/KXBTC15M/${MARKET_B}/import-result.json`,
    };
    files[defaultConfig().checkpointPath] = serializeForwardSettlementBackfillCheckpoint(checkpoint);

    const io = createIo(files, dirs);
    const runMarketImport = vi.fn(async ({ market }) => {
      files[`data/imports/KXBTC15M/${market.marketTicker}/import-result.json`] =
        createImportResult(market.marketTicker, "no");
      return { success: true };
    });
    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    }).inventory.find((entry) => entry.marketTicker === MARKET_B)!;
    const markets = [
      classifyMarketSettlementCoverage({
        io,
        importsDir: "data/imports",
        inventory,
        evaluatedAt: EVALUATED_AT,
        staleAfterCaptureObservation: true,
      }),
    ];

    expect(markets[0]?.classification).toBe("missing-settlement-source");

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig({ maxRetries: 1, maxConcurrency: 1 }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport },
    });

    expect(runMarketImport).toHaveBeenCalledTimes(1);
    expect(summary.importedMarketCount).toBe(1);
    expect(summary.marketResults[0]?.status).toBe("imported");
  });

  it("honors failed checkpoint retry cooldown during resume", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const checkpoint = createForwardSettlementBackfillCheckpoint({
      captureRunDir: RUN_DIR,
      selectedRunId: RUN_ID,
      importsDir: "data/imports",
      dryRun: false,
      startedAt: EVALUATED_AT,
      marketTickers: [MARKET_B],
    });
    checkpoint.markets[0] = {
      marketTicker: MARKET_B,
      status: "failed",
      attempts: 1,
      lastAttemptAt: EVALUATED_AT,
      nextEligibleRetryAt: "2026-07-11T18:00:00.000Z",
      errorMessage: "import failed",
      errorCategory: "unknown",
      importResultPath: null,
    };
    files[defaultConfig().checkpointPath] = serializeForwardSettlementBackfillCheckpoint(checkpoint);

    const io = createIo(files, dirs);
    const runMarketImport = vi.fn(async () => ({ success: true }));
    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    }).inventory.find((entry) => entry.marketTicker === MARKET_B)!;
    const markets = [
      classifyMarketSettlementCoverage({
        io,
        importsDir: "data/imports",
        inventory,
        evaluatedAt: EVALUATED_AT,
        staleAfterCaptureObservation: true,
      }),
    ];

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig({ resume: true, maxRetries: 1, maxConcurrency: 1 }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport },
    });

    expect(runMarketImport).not.toHaveBeenCalled();
    expect(summary.marketResults[0]?.status).toBe("failed");
    expect(summary.marketResults[0]?.nextEligibleRetryAt).toBe("2026-07-11T18:00:00.000Z");
  });

  it("retries failed checkpoints after cooldown even when maxRetries was exhausted", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const checkpoint = createForwardSettlementBackfillCheckpoint({
      captureRunDir: RUN_DIR,
      selectedRunId: RUN_ID,
      importsDir: "data/imports",
      dryRun: false,
      startedAt: EVALUATED_AT,
      marketTickers: [MARKET_B],
    });
    checkpoint.markets[0] = {
      marketTicker: MARKET_B,
      status: "failed",
      attempts: 1,
      lastAttemptAt: "2026-07-11T10:00:00.000Z",
      nextEligibleRetryAt: "2026-07-11T11:00:00.000Z",
      errorMessage: "import failed",
      errorCategory: "unknown",
      importResultPath: null,
    };
    files[defaultConfig().checkpointPath] = serializeForwardSettlementBackfillCheckpoint(checkpoint);

    const io = createIo(files, dirs);
    const runMarketImport = vi.fn(async ({ market }) => {
      files[`data/imports/KXBTC15M/${market.marketTicker}/import-result.json`] =
        createImportResult(market.marketTicker, "no");
      return { success: true };
    });
    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    }).inventory.find((entry) => entry.marketTicker === MARKET_B)!;
    const markets = [
      classifyMarketSettlementCoverage({
        io,
        importsDir: "data/imports",
        inventory,
        evaluatedAt: EVALUATED_AT,
        staleAfterCaptureObservation: true,
      }),
    ];

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig({ resume: true, maxRetries: 1, maxConcurrency: 1 }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport },
    });

    expect(runMarketImport).toHaveBeenCalledTimes(1);
    expect(summary.marketResults[0]?.status).toBe("imported");
  });

  it("integrates M12.12 join semantics for zero-candidate selected-run coverage", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_A}/import-result.json`] = createImportResult(MARKET_A, "yes");

    const report = await buildForwardSettlementCoverageReport({
      generatedAt: EVALUATED_AT,
      config: defaultConfig(),
      io: createIo(files, dirs),
      joinOutputPath: "data/research-results/forward-settlement-join-selected-run.json",
      runBackfill: false,
    });

    expect(report.summary.analysisScope).toBe("selected-run");
    expect(report.summary.capturedMarketCount).toBe(3);
    expect(report.joinIntegration.settlementKnownMarketCount).toBeGreaterThanOrEqual(1);
    expect(report.joinIntegration.settlementCoverageShare).toBeLessThan(1);
    expect(report.joinIntegration.overallVerdict).toBe("partial-settlement-coverage");
    expect(report.joinIntegration.marketsExcludedFromJoin.length).toBeGreaterThan(0);
    expect(files["data/research-results/forward-settlement-join-selected-run.json"]).toBeDefined();
  });

  it("production backfill deps only skips settlement-ready existing imports", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_B}/metadata.json`] = JSON.stringify({
      valid: true,
      closeTime: "2026-07-11T11:30:00.000Z",
    });
    files[`data/imports/KXBTC15M/${MARKET_B}/import-result.json`] = createImportResult(
      MARKET_B,
      "no",
      { collectionTime: "2026-07-11T11:08:00.000Z" },
    );

    const io = createIo(files, dirs);
    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    }).inventory.find((entry) => entry.marketTicker === MARKET_B)!;
    const paths = resolveMarketImportPaths({
      importsDir: "data/imports",
      market: inventory,
    });
    const deps = createProductionForwardSettlementBackfillDeps({
      io,
      evaluatedAt: EVALUATED_AT,
      importsDir: "data/imports",
      staleAfterCaptureObservation: true,
      fetchImpl: vi.fn().mockRejectedValue(new Error("mock-import-blocked")),
    });

    await expect(
      deps.runMarketImport({
        market: inventory,
        configPath: paths.configPath,
        importResultPath: paths.importResultPath,
        dryRun: false,
      }),
    ).rejects.toThrow("mock-import-blocked");

    files[`data/imports/KXBTC15M/${MARKET_B}/import-result.json`] = createImportResult(
      MARKET_B,
      "no",
      { collectionTime: "2026-07-11T11:31:00.000Z" },
    );

    const readyResult = await deps.runMarketImport({
      market: inventory,
      configPath: paths.configPath,
      importResultPath: paths.importResultPath,
      dryRun: false,
    });

    expect(readyResult.skipped).toBe(true);
  });

  it("production backfill deps retries valid-but-empty existing imports", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_B}/metadata.json`] = JSON.stringify({
      valid: true,
      closeTime: "2026-07-11T11:30:00.000Z",
    });
    files[`data/imports/KXBTC15M/${MARKET_B}/import-result.json`] = JSON.stringify({
      metadata: {
        valid: true,
        collectionTime: "2026-07-11T11:31:00.000Z",
        settlementPresent: false,
      },
      bronzeRecords: [],
    });

    const io = createIo(files, dirs);
    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    }).inventory.find((entry) => entry.marketTicker === MARKET_B)!;
    const paths = resolveMarketImportPaths({
      importsDir: "data/imports",
      market: inventory,
    });
    const deps = createProductionForwardSettlementBackfillDeps({
      io,
      evaluatedAt: EVALUATED_AT,
      importsDir: "data/imports",
      fetchImpl: vi.fn().mockRejectedValue(new Error("mock-import-blocked")),
    });

    await expect(
      deps.runMarketImport({
        market: inventory,
        configPath: paths.configPath,
        importResultPath: paths.importResultPath,
        dryRun: false,
      }),
    ).rejects.toThrow("mock-import-blocked");
  });

  it("preserves invalid capture tickers after a backfill-enabled report refresh", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const runMarketImport = vi.fn(async () => ({ success: true }));

    const report = await buildForwardSettlementCoverageReport({
      generatedAt: EVALUATED_AT,
      config: defaultConfig({ dryRun: true }),
      io: createIo(files, dirs),
      runBackfill: true,
      backfillDeps: { runMarketImport },
    });

    expect(report.backfill).not.toBeNull();
    expect(report.summary.invalidMarketCount).toBe(1);
    expect(report.markets.find((market) => market.marketTicker === "KXBTC15M-MOCK")?.classification)
      .toBe("invalid-market");
    expect(report.joinIntegration.marketsExcludedFromJoin.some((market) =>
      market.marketTicker === "KXBTC15M-MOCK")).toBe(true);
  });

  it("classifies invalid markets explicitly", () => {
    const entry = classifyInvalidMarketEntry({
      marketTicker: "KXBTC15M-MOCK",
      reason: "mock ticker excluded",
    });

    expect(entry.classification).toBe("invalid-market");
  });

  it("resolves import paths from market ticker series when capture seriesTicker is wrong", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`${RUN_DIR}/top-of-book.jsonl`] = files[`${RUN_DIR}/top-of-book.jsonl`]!.replace(
      /"seriesTicker": "KXBTC15M"/,
      '"seriesTicker": "WRONGSERIES"',
    );
    files[`data/imports/KXBTC15M/${MARKET_A}/import-result.json`] = createImportResult(MARKET_A, "yes");

    const extracted = extractSelectedRunMarketInventory({
      io: createIo(files, dirs),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files, dirs),
      importsDir: "data/imports",
      inventory: extracted.inventory.find((entry) => entry.marketTicker === MARKET_A)!,
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: true,
    });

    expect(classified.classification).toBe("settlement-ready");
  });

  it("persists skipped terminal statuses into the backfill checkpoint", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const io = createIo(files, dirs);

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig(),
      io,
      markets: [
        classifyInvalidMarketEntry({
          marketTicker: "KXBTC15M-MOCK",
          reason: "mock ticker excluded",
        }),
      ],
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport: vi.fn() },
    });

    expect(summary.marketResults[0]?.status).toBe("skipped-not-candidate");
    const checkpoint = loadForwardSettlementBackfillCheckpoint({
      readFile: io.readFile,
      fileExists: io.fileExists,
      checkpointPath: defaultConfig().checkpointPath,
    });
    expect(checkpoint?.markets[0]?.status).toBe("skipped-not-candidate");
  });

  it("builds import config for post-close single-observation windows", () => {
    const closeTime = "2026-07-11T11:15:00.000Z";
    const config = buildCaptureMarketImportConfig({
      market: {
        marketTicker: MARKET_A,
        seriesTicker: "KXBTC15M",
        firstObservedAt: closeTime,
        lastObservedAt: closeTime,
        observationCount: 1,
        marketCloseTime: closeTime,
        expectedSettlementAvailability: "available",
        eventTicker: null,
        sourceArtifacts: [],
      },
      evaluatedAt: EVALUATED_AT,
    });

    expect(Date.parse(config.startTime)).toBeLessThan(Date.parse(config.endTime));
    expect(config.importMode).toBe("settlement-only");
    expect(config.btc).toBeNull();
  });

  it("reports resumed false and preserves checkpoint when capture run mismatches", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const otherRunDir = "data/live-capture/forward-quotes/other-run";
    dirs.push(otherRunDir);
    const checkpoint = createForwardSettlementBackfillCheckpoint({
      captureRunDir: otherRunDir,
      selectedRunId: "other-run",
      importsDir: "data/imports",
      dryRun: false,
      startedAt: EVALUATED_AT,
      marketTickers: [MARKET_B],
    });
    checkpoint.markets[0] = {
      marketTicker: MARKET_B,
      status: "failed",
      attempts: 2,
      lastAttemptAt: EVALUATED_AT,
      nextEligibleRetryAt: "2026-07-11T18:00:00.000Z",
      errorMessage: "prior run failure",
      errorCategory: "unknown",
      importResultPath: null,
    };
    const checkpointPath = defaultConfig().checkpointPath;
    const serializedCheckpoint = serializeForwardSettlementBackfillCheckpoint(checkpoint);
    files[checkpointPath] = serializedCheckpoint;

    const io = createIo(files, dirs);
    const runMarketImport = vi.fn(async ({ market }) => {
      files[`data/imports/KXBTC15M/${market.marketTicker}/import-result.json`] =
        createImportResult(market.marketTicker, "no");
      return { success: true };
    });
    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    }).inventory.find((entry) => entry.marketTicker === MARKET_B)!;
    const markets = [
      classifyMarketSettlementCoverage({
        io,
        importsDir: "data/imports",
        inventory,
        evaluatedAt: EVALUATED_AT,
        staleAfterCaptureObservation: true,
      }),
    ];

    const summary = await runForwardSettlementBackfill({
      config: defaultConfig({ resume: true, maxRetries: 1, maxConcurrency: 1 }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport },
    });

    expect(summary.resumed).toBe(false);
    expect(files[checkpointPath]).toBe(serializedCheckpoint);
    expect(
      loadForwardSettlementBackfillCheckpoint({
        readFile: io.readFile,
        fileExists: io.fileExists,
        checkpointPath,
      })?.markets[0]?.errorMessage,
    ).toBe("prior run failure");
  });

  it("classifies future-close markets as not-yet-settled before import-failed", () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_PENDING}/metadata.json`] = JSON.stringify({
      valid: false,
      closeTime: "2026-07-11T13:00:00.000Z",
    });
    files[`data/imports/KXBTC15M/${MARKET_PENDING}/import-result.json`] = JSON.stringify({
      metadata: {
        valid: false,
        collectionTime: "2026-07-11T11:31:00.000Z",
        settlementPresent: false,
      },
      bronzeRecords: [],
    });

    const extracted = extractSelectedRunMarketInventory({
      io: createIo(files, dirs),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    const classified = classifyMarketSettlementCoverage({
      io: createIo(files, dirs),
      importsDir: "data/imports",
      inventory: extracted.inventory.find((entry) => entry.marketTicker === MARKET_PENDING)!,
      evaluatedAt: EVALUATED_AT,
      staleAfterCaptureObservation: true,
    });

    expect(classified.classification).toBe("market-not-yet-settled");
  });

  it("recommends resolve-missing-metadata instead of backfill for missing metadata", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    dirs.push(RUN_DIR, "data/live-capture/forward-quotes");
    files[`${RUN_DIR}/top-of-book.jsonl`] = JSON.stringify({
      marketTicker: MARKET_A,
      seriesTicker: "KXBTC15M",
      receivedAtLocal: "2026-07-11T11:08:00.000Z",
    });
    files[`${RUN_DIR}/market-metadata.jsonl`] = "";

    const report = await buildForwardSettlementCoverageReport({
      generatedAt: EVALUATED_AT,
      config: defaultConfig(),
      io: createIo(files, dirs),
      runBackfill: false,
    });

    expect(report.markets[0]?.classification).toBe("missing-market-metadata");
    expect(report.summary.recommendedNextAction).toBe("resolve-missing-metadata");
  });

  it("parses flat settlement bronze records once without duplicate candidates", () => {
    const candidates = parseAllImportResultSettlements({
      marketTicker: MARKET_A,
      importPath: "data/imports/KXBTC15M/MARKET/import-result.json",
      content: JSON.stringify({
        metadata: {
          valid: true,
          collectionTime: "2026-07-11T11:30:00.000Z",
          settlementPresent: true,
        },
        bronzeRecords: [
          {
            contentType: "kalshi.historical.settlement",
            ticker: MARKET_A,
            collectionTime: "2026-07-11T11:30:00.000Z",
            payload: {
              result: "yes",
              settlement_ts: "2026-07-11T11:15:00.000Z",
              open_time: "2026-07-11T11:00:00.000Z",
              close_time: "2026-07-11T11:15:00.000Z",
            },
          },
        ],
      }),
    });

    expect(candidates).toHaveLength(1);
    expect(detectSettlementConflicts(candidates)).toBeNull();
  });

  it("reconciles failed checkpoint entries as import-failed instead of missing-source", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    const checkpoint = createForwardSettlementBackfillCheckpoint({
      captureRunDir: RUN_DIR,
      selectedRunId: RUN_ID,
      importsDir: "data/imports",
      dryRun: false,
      startedAt: EVALUATED_AT,
      marketTickers: [MARKET_B],
    });
    checkpoint.markets[0] = {
      marketTicker: MARKET_B,
      status: "failed",
      attempts: 3,
      lastAttemptAt: EVALUATED_AT,
      nextEligibleRetryAt: "2026-07-11T18:00:00.000Z",
      errorMessage: "BTC historical klines request failed (451)",
      errorCategory: "btc-provider-unexpectedly-required",
      importResultPath: null,
    };
    files[defaultConfig().checkpointPath] =
      serializeForwardSettlementBackfillCheckpoint(checkpoint);

    const report = await buildForwardSettlementCoverageReport({
      generatedAt: EVALUATED_AT,
      config: defaultConfig({ resume: true }),
      io: createIo(files, dirs),
      runBackfill: false,
    });

    const marketB = report.markets.find((market) => market.marketTicker === MARKET_B);
    expect(marketB?.classification).toBe("import-failed");
    expect(report.summary.importFailedMarketCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.missingSourceMarketCount).toBeLessThan(
      report.summary.capturedMarketCount,
    );
    expect(report.summary.neverAttemptedMarketCount).toBe(
      report.summary.missingSourceMarketCount - report.summary.importFailedMarketCount,
    );
  });

  it("retries 34 stale BTC 451 checkpoint failures through settlement-only backfill", async () => {
    const MARKET_COUNT = 34;
    const tickers = Array.from(
      { length: MARKET_COUNT },
      (_, index) => `KXBTC15M-26JUL11${1100 + index}-${String(index).padStart(2, "0")}`,
    );
    const files: Record<string, string> = {};
    const dirs: string[] = [RUN_DIR, "data/live-capture/forward-quotes", "data/imports"];
    const closeTime = "2026-07-11T11:15:00.000Z";
    files[`${RUN_DIR}/top-of-book.jsonl`] = tickers
      .map((marketTicker) =>
        JSON.stringify({
          marketTicker,
          seriesTicker: "KXBTC15M",
          receivedAtLocal: "2026-07-11T11:08:00.000Z",
        }))
      .join("\n");
    files[`${RUN_DIR}/market-metadata.jsonl`] = tickers
      .map((marketTicker) =>
        JSON.stringify({
          marketTicker,
          seriesTicker: "KXBTC15M",
          closeTime,
          receivedAtLocal: "2026-07-11T11:08:00.000Z",
        }))
      .join("\n");

    const retryEligibleAt = "2026-07-12T08:00:00.000Z";
    const checkpoint = createForwardSettlementBackfillCheckpoint({
      captureRunDir: RUN_DIR,
      selectedRunId: RUN_ID,
      importsDir: "data/imports",
      dryRun: false,
      startedAt: EVALUATED_AT,
      marketTickers: tickers,
    });
    checkpoint.markets = tickers.map((marketTicker) => ({
      marketTicker,
      status: "failed" as const,
      attempts: 3,
      lastAttemptAt: EVALUATED_AT,
      nextEligibleRetryAt: retryEligibleAt,
      errorMessage: "BTC historical klines request failed (451)",
      errorCategory: "btc-provider-unexpectedly-required" as const,
      importResultPath: null,
    }));
    files[defaultConfig().checkpointPath] =
      serializeForwardSettlementBackfillCheckpoint(checkpoint);

    const io = createIo(files, dirs);
    const importConfigs: unknown[] = [];
    const runMarketImport = vi.fn(async ({ market, importResultPath }) => {
      const config = buildCaptureMarketImportConfig({
        market,
        evaluatedAt: "2026-07-12T12:00:00.000Z",
      });
      importConfigs.push(config);
      expect(config.importMode).toBe("settlement-only");
      expect(config.btc).toBeNull();
      files[importResultPath] = createImportResult(market.marketTicker, "no");
      return { success: true };
    });

    const inventory = extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: "2026-07-12T12:00:00.000Z",
    }).inventory;
    expect(inventory).toHaveLength(MARKET_COUNT);

    const markets = inventory.map((entry) =>
      applyCheckpointCoverageOverride({
        market: classifyMarketSettlementCoverage({
          io,
          importsDir: "data/imports",
          inventory: entry,
          evaluatedAt: "2026-07-12T12:00:00.000Z",
          staleAfterCaptureObservation: true,
        }),
        checkpointEntry:
          checkpoint.markets.find((item) => item.marketTicker === entry.marketTicker) ?? null,
        evaluatedAt: "2026-07-12T12:00:00.000Z",
      }));

    expect(markets.every((market) => market.classification === "import-failed")).toBe(true);

    const backfill = await runForwardSettlementBackfill({
      config: defaultConfig({ resume: true, maxRetries: 1, maxConcurrency: 4 }),
      io,
      markets,
      selectedRunId: RUN_ID,
      evaluatedAt: "2026-07-12T12:00:00.000Z",
      deps: { runMarketImport },
    });

    expect(runMarketImport).toHaveBeenCalledTimes(MARKET_COUNT);
    expect(importConfigs).toHaveLength(MARKET_COUNT);
    expect(backfill.importedMarketCount).toBe(MARKET_COUNT);
    expect(backfill.failedMarketCount).toBe(0);
    expect(backfill.retryDeferredMarketCount).toBe(0);

    const report = await buildForwardSettlementCoverageReport({
      generatedAt: "2026-07-12T12:00:00.000Z",
      config: defaultConfig({ resume: true }),
      io,
      runBackfill: false,
    });

    expect(report.summary.importFailedMarketCount).toBe(0);
    expect(report.summary.settledMarketCount).toBe(MARKET_COUNT);
    expect(report.summary.neverAttemptedMarketCount).toBe(0);
    expect(report.summary.missingSourceMarketCount).toBe(0);
    expect(
      report.summary.readyMarketCount
      + report.summary.importFailedMarketCount
      + report.summary.pendingMarketCount
      + report.summary.neverAttemptedMarketCount
      + report.summary.invalidMarketCount,
    ).toBeGreaterThanOrEqual(MARKET_COUNT);
  });

  it("assigns each captured market to exactly one terminal coverage category", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);
    files[`data/imports/KXBTC15M/${MARKET_A}/import-result.json`] =
      createImportResult(MARKET_A, "yes");
    files[`data/imports/KXBTC15M/${MARKET_B}/import-result.json`] =
      createImportResult(MARKET_B, "no");

    const report = await buildForwardSettlementCoverageReport({
      generatedAt: EVALUATED_AT,
      config: defaultConfig(),
      io: createIo(files, dirs),
      runBackfill: false,
    });

    const terminalClassifications = new Set([
      "settlement-ready",
      "settlement-present-but-stale",
      "settlement-present-but-conflicting",
      "market-not-yet-settled",
      "missing-settlement-source",
      "missing-market-metadata",
      "import-failed",
      "invalid-market",
    ]);
    expect(report.markets).toHaveLength(
      report.summary.capturedMarketCount + report.summary.invalidMarketCount,
    );
    for (const market of report.markets) {
      expect(terminalClassifications.has(market.classification)).toBe(true);
    }
    const classificationTotals = report.markets.reduce<Record<string, number>>(
      (accumulator, market) => {
        accumulator[market.classification] = (accumulator[market.classification] ?? 0) + 1;
        return accumulator;
      },
      {},
    );
    expect(
      Object.values(classificationTotals).reduce((left, right) => left + right, 0),
    ).toBe(report.markets.length);
  });

  it("retries stale unknown 404 checkpoint failures after implementation version change", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [RUN_DIR, "data/live-capture/forward-quotes", "data/imports"];
    files[`${RUN_DIR}/top-of-book.jsonl`] = JSON.stringify({
      marketTicker: MARKET_B,
      seriesTicker: "KXBTC15M",
      receivedAtLocal: "2026-07-11T11:09:00.000Z",
    });
    files[`${RUN_DIR}/market-metadata.jsonl`] = JSON.stringify({
      marketTicker: MARKET_B,
      seriesTicker: "KXBTC15M",
      closeTime: "2026-07-11T11:30:00.000Z",
      receivedAtLocal: "2026-07-11T11:09:00.000Z",
    });
    const checkpoint = createForwardSettlementBackfillCheckpoint({
      captureRunDir: RUN_DIR,
      selectedRunId: RUN_ID,
      importsDir: "data/imports",
      dryRun: false,
      startedAt: EVALUATED_AT,
      marketTickers: [MARKET_B],
    });
    delete checkpoint.implementationVersion;
    checkpoint.markets[0] = {
      marketTicker: MARKET_B,
      status: "failed",
      attempts: 3,
      lastAttemptAt: EVALUATED_AT,
      nextEligibleRetryAt: "2026-07-12T08:00:00.000Z",
      errorMessage: "Kalshi historical API error (404)",
      errorCategory: "unknown",
      importResultPath: null,
    };
    files[defaultConfig().checkpointPath] =
      serializeForwardSettlementBackfillCheckpoint(checkpoint);

    const runMarketImport = vi.fn(async ({ importResultPath }) => {
      files[importResultPath] = createImportResult(MARKET_B, "no");
      return { success: true };
    });

    const report = await buildForwardSettlementCoverageReport({
      generatedAt: "2026-07-12T12:00:00.000Z",
      config: defaultConfig({ resume: true, maxRetries: 3 }),
      io: createIo(files, dirs),
      runBackfill: true,
      backfillDeps: { runMarketImport },
    });

    expect(runMarketImport).toHaveBeenCalledTimes(1);
    expect(report.backfill?.importedMarketCount).toBe(1);
    expect(report.backfill?.failedMarketCount).toBe(0);
    expect(report.summary.settledMarketCount).toBeGreaterThanOrEqual(1);
  });

  it("does not retry deterministic 404 failures three times", async () => {
    const files: Record<string, string> = {};
    const dirs: string[] = [];
    seedRun(files, dirs);

    const runMarketImport = vi.fn(async () => ({
      success: false,
      errorMessage:
        "Kalshi get-rest-market returned 404 for marketTicker on /markets/KXBTC15M-26JUL111115-15",
    }));

    const backfill = await runForwardSettlementBackfill({
      config: defaultConfig({ maxRetries: 3, maxConcurrency: 1 }),
      io: createIo(files, dirs),
      markets: [
        classifyMarketSettlementCoverage({
          io: createIo(files, dirs),
          importsDir: "data/imports",
          inventory: extractSelectedRunMarketInventory({
            io: createIo(files, dirs),
            captureRunDir: RUN_DIR,
            evaluatedAt: EVALUATED_AT,
          }).inventory.find((entry) => entry.marketTicker === MARKET_B)!,
          evaluatedAt: EVALUATED_AT,
          staleAfterCaptureObservation: true,
        }),
      ],
      selectedRunId: RUN_ID,
      evaluatedAt: EVALUATED_AT,
      deps: { runMarketImport },
    });

    expect(runMarketImport).toHaveBeenCalledTimes(1);
    expect(backfill.failedMarketCount).toBe(1);
    expect(backfill.marketResults[0]?.errorCategory).toBe("kalshi-market-not-found");
    expect(backfill.marketResults[0]?.nextEligibleRetryAt).toBeNull();
  });
});
