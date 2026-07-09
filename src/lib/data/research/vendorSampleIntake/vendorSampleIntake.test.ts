import { describe, expect, it } from "vitest";

import {
  buildVendorSampleIntakeReport,
  serializeVendorSampleIntakeReport,
} from "./buildVendorSampleIntakeReport";
import { serializeVendorSampleIntakeHtml } from "./serializeVendorSampleIntakeHtml";
import { evaluateVendorIntakeVerdict } from "./evaluateVendorIntake";
import { inferVendorSampleSchema } from "./inferVendorSampleSchema";
import { adaptVendorSampleRows } from "./vendorSampleAdapters";
import type { VendorIntakeEntry } from "./vendorSampleIntakeTypes";

const SAMPLES_ROOT = "data/vendor-orderbook-samples";

function createMockIo(files: Record<string, string>, dirs: readonly string[]) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files || dirs.includes(path),
    readdir: (path: string) =>
      Object.keys(files)
        .filter((filePath) => filePath.startsWith(`${path}/`) && !filePath.slice(path.length + 1).includes("/"))
        .map((filePath) => filePath.slice(path.length + 1)),
    isDirectory: (path: string) => dirs.includes(path),
  };
}

const PREDEXON_JSON = JSON.stringify([
  {
    predexon_market_id: "KXBTC15M-TEST",
    series: "KXBTC15M",
    event: "KXBTC15M-TEST-EVENT",
    strike: 60000,
    timestamp: "2026-04-27T12:00:00.000Z",
    exchange_timestamp: "2026-04-27T12:00:00.000Z",
    yes_bid: 45,
    yes_ask: 47,
    yes_bid_size: 10,
    yes_ask_size: 12,
    sequence: "seq-1",
  },
]);

const DOME_JSONL = [
  '{"contract_ticker":"KXBTC15M-DOME","timestamp":"2026-04-27T12:01:00.000Z","yes_bid":40,"yes_ask":42,"bid_size":5,"ask_size":6,"seq":"d1"}',
  '{"contract_ticker":"KXBTC15M-DOME","timestamp":"2026-04-27T12:02:00.000Z","yes_bid":41,"yes_ask":43,"bid_size":5,"ask_size":6,"seq":"d2"}',
].join("\n");

const ALLIUM_CSV = "symbol,timestamp,yes_bid,yes_ask,yes_bid_size,yes_ask_size\nKXBTC15M-ALM,2026-04-27T12:00:00.000Z,50,52,8,9\n";

describe("vendorSampleIntake", () => {
  it("returns no-samples when vendor root folders are missing", () => {
    const report = buildVendorSampleIntakeReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/vendor-sample-intake.json",
      htmlOutputPath: "data/reports/vendor-sample-intake.html",
      samplesRoot: SAMPLES_ROOT,
      io: createMockIo({}, []),
    });

    expect(report.summary.overallVerdict).toBe("no-samples");
    expect(report.summary.recommendedAction).toBe("request-vendor-samples");
    expect(report.vendors.every((vendor) => vendor.status === "missing-folder")).toBe(true);
  });

  it("returns no-files for empty vendor folders", () => {
    const dirs = [
      SAMPLES_ROOT,
      `${SAMPLES_ROOT}/predexon`,
      `${SAMPLES_ROOT}/dome`,
      `${SAMPLES_ROOT}/allium`,
      `${SAMPLES_ROOT}/lychee`,
      `${SAMPLES_ROOT}/synthesis`,
    ];

    const report = buildVendorSampleIntakeReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/vendor-sample-intake.json",
      htmlOutputPath: "data/reports/vendor-sample-intake.html",
      samplesRoot: SAMPLES_ROOT,
      io: createMockIo({}, dirs),
    });

    expect(report.vendors.every((vendor) => vendor.status === "no-files")).toBe(true);
    expect(report.summary.overallVerdict).toBe("no-samples");
  });

  it("detects JSON, JSONL, and CSV samples with previews", () => {
    const files = {
      [`${SAMPLES_ROOT}/predexon/sample.json`]: PREDEXON_JSON,
      [`${SAMPLES_ROOT}/dome/sample.jsonl`]: DOME_JSONL,
      [`${SAMPLES_ROOT}/allium/sample.csv`]: ALLIUM_CSV,
    };
    const dirs = [
      SAMPLES_ROOT,
      `${SAMPLES_ROOT}/predexon`,
      `${SAMPLES_ROOT}/dome`,
      `${SAMPLES_ROOT}/allium`,
      `${SAMPLES_ROOT}/lychee`,
      `${SAMPLES_ROOT}/synthesis`,
      "data/vendor-orderbook-samples",
    ];

    const report = buildVendorSampleIntakeReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/vendor-sample-intake.json",
      htmlOutputPath: "data/reports/vendor-sample-intake.html",
      samplesRoot: SAMPLES_ROOT,
      io: createMockIo(files, dirs),
    });

    expect(report.summary.totalFilesDetected).toBe(3);
    expect(report.summary.totalPreviewRecords).toBeGreaterThan(0);
    expect(report.vendors.find((vendor) => vendor.vendorId === "predexon")?.status).toMatch(
      /sample-/,
    );
    expect(serializeVendorSampleIntakeHtml(report)).toContain("Executive verdict");
    expect(serializeVendorSampleIntakeReport(report)).not.toMatch(/api[_-]?key|secret|password/i);
  });

  it("detects price and size levels in normalized preview", () => {
    const rows = adaptVendorSampleRows({
      vendorId: "predexon",
      rawRecords: [
        {
          predexon_market_id: "KXBTC15M-P",
          timestamp: "2026-04-27T12:00:00.000Z",
          yes_bid: 40,
          yes_ask: 42,
          yes_bid_size: 5,
          yes_ask_size: 6,
          sequence: "s1",
        },
      ],
    });

    expect(rows[0]?.yesBidCents).toBe(40);
    expect(rows[0]?.yesAskCents).toBe(42);
    expect(rows[0]?.yesBidSize).toBe(5);
    expect(rows[0]?.yesAskSize).toBe(6);
    expect(rows[0]?.sequenceOrUpdateId).toBe("s1");
  });

  it("flags unsupported file types and parse errors", () => {
    const files = {
      [`${SAMPLES_ROOT}/lychee/bad.parquet`]: "binary",
      [`${SAMPLES_ROOT}/synthesis/invalid.json`]: "{not-json",
    };
    const dirs = [
      SAMPLES_ROOT,
      `${SAMPLES_ROOT}/lychee`,
      `${SAMPLES_ROOT}/synthesis`,
      `${SAMPLES_ROOT}/predexon`,
      `${SAMPLES_ROOT}/dome`,
      `${SAMPLES_ROOT}/allium`,
    ];

    const report = buildVendorSampleIntakeReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/vendor-sample-intake.json",
      htmlOutputPath: "data/reports/vendor-sample-intake.html",
      samplesRoot: SAMPLES_ROOT,
      io: createMockIo(files, dirs),
    });

    const lychee = report.vendors.find((vendor) => vendor.vendorId === "lychee");
    const synthesis = report.vendors.find((vendor) => vendor.vendorId === "synthesis");

    expect(lychee?.status).toBe("unsupported-file-type");
    expect(synthesis?.status).toBe("parse-error");
  });

  it("infers timestamp and market ticker fields", () => {
    const schema = inferVendorSampleSchema([
      {
        contract_ticker: "KXBTC15M-1",
        timestamp: "2026-04-27T12:00:00.000Z",
        yes_bid: 40,
        yes_ask: 42,
        seq: "1",
      },
    ]);

    expect(schema.marketTickerFields.length).toBeGreaterThan(0);
    expect(schema.timestampFields.length).toBeGreaterThan(0);
    expect(schema.sequenceFields).toContain("seq");
  });

  it("adapts synthetic vendor-like rows", () => {
    const predexonRows = adaptVendorSampleRows({
      vendorId: "predexon",
      rawRecords: [{ predexon_market_id: "KXBTC15M-P", yes_bid: 40, yes_ask: 42, timestamp: 1_700_000_000_000 }],
    });
    const domeRows = adaptVendorSampleRows({
      vendorId: "dome",
      rawRecords: [{ contract_ticker: "KXBTC15M-D", yes_bid: 40, yes_ask: 42, timestamp: 1_700_000_000_000 }],
    });
    const alliumRows = adaptVendorSampleRows({
      vendorId: "allium",
      rawRecords: [{ allium_symbol: "KXBTC15M-A", yes_bid: 40, yes_ask: 42, timestamp: 1_700_000_000_000 }],
    });

    expect(predexonRows[0]?.marketTicker).toBe("KXBTC15M-P");
    expect(domeRows[0]?.marketTicker).toBe("KXBTC15M-D");
    expect(alliumRows[0]?.marketTicker).toBe("KXBTC15M-A");
  });

  it("produces stable JSON serialization", () => {
    const input = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/vendor-sample-intake.json",
      htmlOutputPath: "data/reports/vendor-sample-intake.html",
      samplesRoot: SAMPLES_ROOT,
      io: createMockIo({}, []),
    };

    expect(serializeVendorSampleIntakeReport(buildVendorSampleIntakeReport(input))).toBe(
      serializeVendorSampleIntakeReport(buildVendorSampleIntakeReport(input)),
    );
  });

  it("evaluates promising verdict when sizes and sequence present", () => {
    const vendors = [
      {
        vendorId: "predexon",
        status: "sample-promising",
        files: [{ filePath: "x" }],
      },
    ] as unknown as VendorIntakeEntry[];

    expect(evaluateVendorIntakeVerdict(vendors).overallVerdict).toBe("samples-promising");
  });
});
