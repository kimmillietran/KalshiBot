import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import { HistoricalBronzeImportMode } from "@/lib/data/importJobs/config";
import { parseForwardSettlementCoverageArgv } from "@/lib/data/research/forwardSettlementCoverage";
import { buildCaptureMarketImportConfig } from "@/lib/data/research/forwardSettlementCoverage/buildCaptureMarketImportConfig";
import { loadEligibleCalendarAuthority } from "@/lib/data/research/settlementFrictionCoverage";

import {
  buildTickerManifest,
  classifyLabelCompleteness,
  extractLabelFromImportResult,
  hashFileContent,
  parseSettlementFrictionLabelBackfillArgv,
  runSettlementFrictionLabelBackfill,
  scanLocalSettlementLabels,
  serializeSettlementLabelsJsonl,
  SettlementFrictionLabelBackfillError,
  syntheticManifestCaptureRunDir,
  toSettlementLabelRecord,
  validateTickerManifestNoDuplicates,
} from "./index";

const FIXTURE_DIR = join(
  __dirname,
  "fixtures",
);
const ROOT = join(__dirname, "../../../../../");

function readFixtureSamples(): string {
  return readFileSync(join(FIXTURE_DIR, "samples.jsonl"), "utf8");
}

function eligibleDays(): string[] {
  return loadEligibleCalendarAuthority({
    repoRoot: ROOT,
    dayClustersPath: join(FIXTURE_DIR, "day-clusters.json"),
    reservoirStatusPath: join(FIXTURE_DIR, "reservoir-status.json"),
  }).eligibleUtcDays;
}

function buildFixtureManifest() {
  const samplesContent = readFixtureSamples();
  const lines = samplesContent.split(/\r?\n/).filter((l) => l.trim());
  return buildTickerManifest({
    samplesPath: "fixtures/samples.jsonl",
    samplesContent,
    eligibleUtcDays: eligibleDays(),
    expectedSamplesContentSha256: hashFileContent(samplesContent),
    expectedRetainedSamples: lines.length,
    expectedDistinctTickers: 2,
  });
}

function completeBronzeImportResult(ticker: string): unknown {
  return {
    jobId: `test-${ticker}`,
    bronzeRecords: [
      {
        recordId: `${ticker}-market`,
        ticker,
        contentType: SILVER_BRONZE_CONTENT_TYPE.MARKET,
        eventTime: "2026-08-14T12:00:00.000Z",
        collectionTime: "2026-08-14T12:20:00.000Z",
        observedAt: "2026-08-14T12:20:00.000Z",
        payload: {
          ticker,
          event_ticker: ticker.replace(/-[^-]+$/, ""),
          status: "determined",
          result: "yes",
          open_time: "2026-08-14T12:00:00.000Z",
          close_time: "2026-08-14T12:15:00.000Z",
          settlement_ts: "2026-08-14T12:20:00.000Z",
          expiration_value: "65000.25",
          floor_strike: 64980.5,
          strike_type: "greater",
        },
        provenance: { source: "kalshi-rest", collectionTime: "2026-08-14T12:20:00.000Z", observedAt: "2026-08-14T12:20:00.000Z", fetchId: "f1" },
      },
      {
        recordId: `${ticker}-settlement`,
        ticker,
        contentType: SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT,
        eventTime: "2026-08-14T12:20:00.000Z",
        collectionTime: "2026-08-14T12:20:00.000Z",
        observedAt: "2026-08-14T12:20:00.000Z",
        payload: {
          result: "yes",
          settlement_ts: "2026-08-14T12:20:00.000Z",
          expiration_value: "65000.25",
          floor_strike: 64980.5,
        },
        provenance: { source: "kalshi-rest", collectionTime: "2026-08-14T12:20:00.000Z", observedAt: "2026-08-14T12:20:00.000Z", fetchId: "f2" },
      },
    ],
    validationResult: { valid: true },
    metadata: { valid: true, marketTicker: ticker },
  };
}

function partialBronzeImportResult(ticker: string): unknown {
  const full = completeBronzeImportResult(ticker) as {
    bronzeRecords: Array<{ payload: Record<string, unknown> }>;
  };
  for (const record of full.bronzeRecords) {
    delete record.payload.expiration_value;
    delete record.payload.floor_strike;
  }
  return full;
}

function createMemoryIo(root: string) {
  const files = new Map<string, string>();
  return {
    root,
    files,
    io: {
      readFile: (path: string) => {
        const content = files.get(path);
        if (content === undefined) throw new Error(`missing ${path}`);
        return content;
      },
      fileExists: (path: string) => files.has(path),
      writeFile: (path: string, content: string) => {
        files.set(path, content);
      },
      mkdirSync: () => undefined,
      readdirSync: () => [],
    },
  };
}

describe("settlementFrictionLabelBackfill", () => {
  it("builds exact ticker manifest and rejects duplicates", () => {
    const manifest = buildFixtureManifest();
    expect(manifest.distinctTickers).toBe(2);
    expect(manifest.retainedSamples).toBe(3);
    expect(manifest.tickers.map((t) => t.marketTicker)).toEqual([
      "KXBTC15M-26AUG141200-50",
      "KXBTC15M-26AUG141215-55",
    ]);
    validateTickerManifestNoDuplicates(manifest.tickers.map((t) => t.marketTicker));
    expect(() =>
      validateTickerManifestNoDuplicates(["A", "A"]),
    ).toThrow(SettlementFrictionLabelBackfillError);
  });

  it("rejects sample content SHA mismatch", () => {
    expect(() =>
      buildTickerManifest({
        samplesPath: "x",
        samplesContent: readFixtureSamples(),
        eligibleUtcDays: eligibleDays(),
        expectedSamplesContentSha256: "deadbeef",
        expectedRetainedSamples: 3,
        expectedDistinctTickers: 2,
      }),
    ).toThrow(/SHA mismatch/);
  });

  it("preserves capture-run CLI requirement for existing backfill", () => {
    expect(() => parseForwardSettlementCoverageArgv([])).toThrow(/capture-run-dir/);
    const parsed = parseForwardSettlementCoverageArgv([
      "--capture-run-dir",
      "data/captures/example",
    ]);
    expect(parsed.captureRunDir).toContain("data/captures/example");
  });

  it("classifies study completeness independently of settlement-ready", () => {
    expect(
      classifyLabelCompleteness({
        result: "yes",
        expirationValue: null,
        floorStrike: null,
        closeTime: null,
        settlementTs: null,
      }).completeness,
    ).toBe("partial");
    expect(
      classifyLabelCompleteness({
        result: "yes",
        expirationValue: "65000.25",
        floorStrike: 64980.5,
        closeTime: "2026-08-14T12:15:00.000Z",
        settlementTs: "2026-08-14T12:20:00.000Z",
      }).completeness,
    ).toBe("complete");
  });

  it("extracts official fields from bronze import-result and maps schema", () => {
    const label = extractLabelFromImportResult({
      marketTicker: "KXBTC15M-26AUG141200-50",
      importResultRaw: completeBronzeImportResult("KXBTC15M-26AUG141200-50"),
      source: "local-import",
      importResultPath: "data/imports/x/import-result.json",
    });
    expect(label.completeness).toBe("complete");
    expect(label.result).toBe("yes");
    expect(label.expirationValue).toBe("65000.25");
    expect(label.floorStrike).toBe(64980.5);
    expect(label.fieldProvenance.result).toBe("local-import");
    const record = toSettlementLabelRecord(label);
    expect(record?.marketTicker).toBe("KXBTC15M-26AUG141200-50");
  });

  it("reuses complete local records without network calls", async () => {
    const manifest = buildFixtureManifest();
    const tmp = mkdtempSync(join(tmpdir(), "label-backfill-"));
    const importsDir = join(tmp, "imports");
    const mem = createMemoryIo(tmp);

    for (const entry of manifest.tickers) {
      const series = "KXBTC15M";
      const path = join(importsDir, series, entry.marketTicker, "import-result.json");
      mem.files.set(path, JSON.stringify(completeBronzeImportResult(entry.marketTicker)));
    }

    const fetchImpl = vi.fn(async () => {
      throw new Error("network should not be called");
    }) as unknown as typeof fetch;

    const summary = await runSettlementFrictionLabelBackfill({
      manifest,
      config: {
        importsDir,
        checkpointPath: join(tmp, "checkpoint.json"),
        dryRun: false,
        concurrency: 2,
        maxRetries: 1,
        retryBaseDelayMs: 1,
      },
      io: mem.io,
      evaluatedAt: "2026-09-24T00:00:00.000Z",
      fetchImpl,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(summary.plan.plannedFetchCount).toBe(0);
    expect(summary.plan.localComplete).toBe(2);
    expect(summary.sourceCounts.localImport).toBe(2);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("treats partial local records as needing fetch", () => {
    const manifest = buildFixtureManifest();
    const files = new Map<string, string>();
    const ticker = manifest.tickers[0]!.marketTicker;
    const path = `data/imports/KXBTC15M/${ticker}/import-result.json`;
    files.set(path, JSON.stringify(partialBronzeImportResult(ticker)));

    const scan = scanLocalSettlementLabels({
      manifest,
      deps: {
        fileExists: (p) => files.has(p),
        readFile: (p) => files.get(p)!,
      },
      importRoots: ["data/imports"],
    });
    expect(scan.partial).toBe(1);
    expect(scan.missing).toBe(1);
    expect(scan.complete).toBe(0);
  });

  it("binds checkpoint to ticker-manifest identity and rejects mismatch", async () => {
    const manifest = buildFixtureManifest();
    const tmp = mkdtempSync(join(tmpdir(), "label-backfill-cp-"));
    const mem = createMemoryIo(tmp);
    const checkpointPath = join(tmp, "checkpoint.json");
    const importsDir = join(tmp, "imports");

    await runSettlementFrictionLabelBackfill({
      manifest,
      config: {
        importsDir,
        checkpointPath,
        dryRun: true,
        concurrency: 1,
        maxRetries: 1,
        retryBaseDelayMs: 1,
      },
      io: mem.io,
      evaluatedAt: "2026-09-24T00:00:00.000Z",
    });

    const checkpoint = JSON.parse(mem.files.get(checkpointPath)!);
    expect(checkpoint.captureRunDir).toBe(
      syntheticManifestCaptureRunDir(manifest.tickerManifestIdentity),
    );

    checkpoint.captureRunDir = "ticker-manifest:other";
    mem.files.set(checkpointPath, JSON.stringify(checkpoint));

    await expect(
      runSettlementFrictionLabelBackfill({
        manifest,
        config: {
          importsDir,
          checkpointPath,
          dryRun: true,
          concurrency: 1,
          maxRetries: 1,
          retryBaseDelayMs: 1,
        },
        io: mem.io,
        evaluatedAt: "2026-09-24T00:01:00.000Z",
      }),
    ).rejects.toThrow(/captureRunDir mismatch/);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("detects conflicting official local records without overwrite", () => {
    const manifest = buildFixtureManifest();
    const ticker = manifest.tickers[0]!.marketTicker;
    const a = completeBronzeImportResult(ticker) as {
      bronzeRecords: Array<{ payload: { result: string } }>;
    };
    const b = completeBronzeImportResult(ticker) as {
      bronzeRecords: Array<{ payload: { result: string } }>;
    };
    b.bronzeRecords[0]!.payload.result = "no";

    const files = new Map<string, string>();
    files.set(
      `data/imports/settlement-friction-label-backfill/KXBTC15M/${ticker}/import-result.json`,
      JSON.stringify(a),
    );
    files.set(
      `data/imports/KXBTC15M/${ticker}/import-result.json`,
      JSON.stringify(b),
    );

    const scan = scanLocalSettlementLabels({
      manifest,
      deps: {
        fileExists: (p) => files.has(p),
        readFile: (p) => files.get(p)!,
      },
      importRoots: [
        "data/imports/settlement-friction-label-backfill",
        "data/imports",
      ],
    });
    expect(scan.conflicting).toBe(1);
    expect(scan.conflicts[0]?.fields).toContain("result");
  });

  it("exports labels deterministically", () => {
    const rows = [
      {
        marketTicker: "B",
        result: "no",
        expirationValue: "1",
        floorStrike: 1,
        closeTime: "2026-08-14T12:15:00.000Z",
        settlementTs: "2026-08-14T12:20:00.000Z",
      },
      {
        marketTicker: "A",
        result: "yes",
        expirationValue: "2",
        floorStrike: 2,
        closeTime: "2026-08-14T12:15:00.000Z",
        settlementTs: "2026-08-14T12:20:00.000Z",
      },
    ];
    const once = serializeSettlementLabelsJsonl(rows);
    const twice = serializeSettlementLabelsJsonl([...rows].reverse());
    expect(once).toBe(twice);
    expect(once.startsWith('{"marketTicker":"A"')).toBe(true);
  });

  it("builds SETTLEMENT_ONLY import config (no candles mode)", () => {
    const config = buildCaptureMarketImportConfig({
      market: {
        marketTicker: "KXBTC15M-26AUG141200-50",
        seriesTicker: "KXBTC15M",
        firstObservedAt: "2026-08-14T12:00:00.000Z",
        lastObservedAt: "2026-08-14T12:10:00.000Z",
        observationCount: 2,
        marketCloseTime: null,
        expectedSettlementAvailability: "available",
        eventTicker: "KXBTC15M-26AUG141200",
        sourceArtifacts: ["test"],
      },
      evaluatedAt: "2026-09-24T00:00:00.000Z",
    });
    expect(config.importMode).toBe(HistoricalBronzeImportMode.SETTLEMENT_ONLY);
    expect(config.btc).toBeNull();
  });

  it("parses argv with dedicated work/output dirs and fixture isolation", () => {
    const parsed = parseSettlementFrictionLabelBackfillArgv([
      "--fixture",
      "--work-dir",
      "tmp/label-backfill-fixture",
    ]);
    expect(parsed.fixture).toBe(true);
    expect(parsed.workDir).toBe("tmp/label-backfill-fixture");
    expect(parsed.coverageOutDir).not.toContain(
      "m17-prep-settlement-friction-coverage",
    );
  });

  it("fetches incomplete tickers via mocked SETTLEMENT_ONLY API without candles", async () => {
    const manifest = buildFixtureManifest();
    const tmp = mkdtempSync(join(tmpdir(), "label-backfill-fetch-"));
    const importsDir = join(tmp, "imports");
    mkdirSync(importsDir, { recursive: true });
    const mem = createMemoryIo(tmp);

    // Bridge memory io to also write real paths used by path builders — use fs-backed io
    const { createFilesystemForwardSettlementCoverageIo } = await import(
      "@/lib/data/research/forwardSettlementCoverage"
    );
    const io = createFilesystemForwardSettlementCoverageIo();

    const requestedUrls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/candlesticks") || url.includes("/klines") || url.includes("/trades")) {
        throw new Error(`unexpected unrelated request: ${url}`);
      }
      const match = /\/(?:historical\/)?markets\/([^/?]+)/.exec(url);
      if (match) {
        const ticker = decodeURIComponent(match[1]!);
        return new Response(
          JSON.stringify({
            market: {
              ticker,
              event_ticker: ticker.replace(/-[^-]+$/, ""),
              status: "determined",
              result: "yes",
              open_time: "2026-08-14T12:00:00.000Z",
              close_time: "2026-08-14T12:15:00.000Z",
              settlement_ts: "2026-08-14T12:20:00.000Z",
              expiration_value: "65000.25",
              floor_strike: 64980.5,
              strike_type: "greater",
              series_ticker: "KXBTC15M",
              settlement_value_dollars: "1.0000",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "nf" }), { status: 404 });
    }) as typeof fetch;

    const summary = await runSettlementFrictionLabelBackfill({
      manifest,
      config: {
        importsDir,
        checkpointPath: join(tmp, "checkpoint.json"),
        dryRun: false,
        concurrency: 1,
        maxRetries: 2,
        retryBaseDelayMs: 1,
      },
      io,
      evaluatedAt: "2026-09-24T00:00:00.000Z",
      fetchImpl,
      sleep: async () => undefined,
    });

    expect(requestedUrls.some((u) => u.includes("/candlesticks"))).toBe(false);
    expect(requestedUrls.some((u) => u.includes("/klines"))).toBe(false);
    expect(summary.fetched + summary.sourceCounts.fetchedSettlementOnly).toBeGreaterThan(0);
    expect(
      summary.labels.filter((l) => l.completeness === "complete").length,
    ).toBe(2);

    // Resume: second run should skip complete
    const summary2 = await runSettlementFrictionLabelBackfill({
      manifest,
      config: {
        importsDir,
        checkpointPath: join(tmp, "checkpoint.json"),
        dryRun: false,
        concurrency: 1,
        maxRetries: 1,
        retryBaseDelayMs: 1,
      },
      io,
      evaluatedAt: "2026-09-24T00:05:00.000Z",
      fetchImpl,
      sleep: async () => undefined,
    });
    expect(summary2.plan.plannedFetchCount).toBe(0);

    rmSync(tmp, { recursive: true, force: true });
    void mem;
  });

  it("handles bounded API failure without inventing outcomes", async () => {
    const manifest = buildFixtureManifest();
    const tmp = mkdtempSync(join(tmpdir(), "label-backfill-fail-"));
    const importsDir = join(tmp, "imports");
    mkdirSync(importsDir, { recursive: true });
    const { createFilesystemForwardSettlementCoverageIo } = await import(
      "@/lib/data/research/forwardSettlementCoverage"
    );
    const io = createFilesystemForwardSettlementCoverageIo();

    const fetchImpl = (async () =>
      new Response(JSON.stringify({ message: "not found" }), {
        status: 404,
      })) as typeof fetch;

    const summary = await runSettlementFrictionLabelBackfill({
      manifest,
      config: {
        importsDir,
        checkpointPath: join(tmp, "checkpoint.json"),
        dryRun: false,
        concurrency: 1,
        maxRetries: 1,
        retryBaseDelayMs: 1,
        limit: 1,
      },
      io,
      evaluatedAt: "2026-09-24T00:00:00.000Z",
      fetchImpl,
      sleep: async () => undefined,
    });

    expect(summary.failed).toBeGreaterThanOrEqual(1);
    expect(summary.labels.every((l) => l.result !== "invented")).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });
});
