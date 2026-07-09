import { describe, expect, it } from "vitest";

import {
  auditVendorSampleData,
  buildVendorOrderbookSufficiencyAuditReport,
  buildVendorSampleRequest,
  createVendorOrderbookAuditConfig,
  evaluateOverallAuditVerdict,
  evaluateVendorSufficiency,
  groupEventsByStrikeCount,
  parseVendorSampleFile,
  serializeVendorOrderbookSufficiencyAuditHtml,
  serializeVendorOrderbookSufficiencyAuditReport,
} from "./index";
import { SEEDED_VENDOR_METADATA } from "./seedVendorMetadata";

const THRESHOLDS = createVendorOrderbookAuditConfig().thresholds;

function createIo(files: Record<string, string> = {}) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files,
    readdir: () => [] as string[],
    isDirectory: () => false,
  };
}

describe("metadata-only run", () => {
  it("runs with no samples and requests vendor samples", () => {
    const report = buildVendorOrderbookSufficiencyAuditReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      inputPaths: {
        configPath: "data/vendor-orderbook-samples/vendor-orderbook-audit-config.json",
        samplesRoot: "data/vendor-orderbook-samples",
      },
      config: createVendorOrderbookAuditConfig(),
      io: createIo(),
    });

    expect(report.summary.overallVerdict).toBe("request-vendor-samples");
    expect(report.summary.recommendedNextAction).toBe("request-vendor-samples");
    expect(report.summary.vendorCount).toBe(SEEDED_VENDOR_METADATA.length);
    expect(report.summary.vendorsWithSamples).toBe(0);
    expect(report.vendors.every((vendor) => vendor.recommendation === "request-vendor-samples"
      || vendor.vendorId === "official-kalshi")).toBe(true);
  });
});

describe("parseVendorSampleFile", () => {
  it("detects JSON schema", () => {
    const parsed = parseVendorSampleFile({
      filePath: "sample.json",
      raw: JSON.stringify([
        {
          market_ticker: "KXBTC15M-26MAY081945-45",
          series_ticker: "KXBTC15M",
          timestamp: 1_700_000_000_000,
          yes_bid: 45,
          yes_ask: 47,
          bid_size: 10,
        },
      ]),
    });

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.marketTicker).toBe("KXBTC15M-26MAY081945-45");
    expect(parsed.rows[0]?.yesBidSize).toBe(10);
  });

  it("detects CSV schema", () => {
    const parsed = parseVendorSampleFile({
      filePath: "sample.csv",
      raw: "market_ticker,yes_bid,yes_ask,timestamp\nKXBTC15M-26MAY081945-45,40,42,1700000000000",
    });

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.yesBidCents).toBe(40);
    expect(parsed.rows[0]?.yesAskCents).toBe(42);
  });
});

describe("auditVendorSampleData", () => {
  const sampleJson = JSON.stringify([
    {
      market_ticker: "KXBTC15M-26MAY081945-45",
      series_ticker: "KXBTC15M",
      event_ticker: "KXBTC15M-26MAY081945",
      timestamp: 1_700_000_000_000,
      yes_bid: 45,
      yes_ask: 47,
      bid_size: 10,
      ask_size: 12,
    },
    {
      market_ticker: "KXBTC15M-26MAY081945-45",
      series_ticker: "KXBTC15M",
      event_ticker: "KXBTC15M-26MAY081945",
      timestamp: 1_700_000_003_000,
      yes_bid: 46,
      yes_ask: 48,
      bid_size: 8,
      ask_size: 9,
    },
  ]);

  it("calculates timestamp gaps and spread share", () => {
    const audit = auditVendorSampleData({
      vendorId: "predexon",
      sampleFilePaths: ["data/vendor-orderbook-samples/predexon/sample.json"],
      io: createIo({
        "data/vendor-orderbook-samples/predexon/sample.json": sampleJson,
      }),
    });

    expect(audit.sampleStatus).toBe("present");
    expect(audit.medianSnapshotGapMs).toBe(3000);
    expect(audit.nonZeroSpreadShare).toBe(1);
    expect(audit.hasSizes).toBe(true);
    expect(audit.distinctMarkets).toBe(1);
  });

  it("detects KXBTCD multi-strike grouping", () => {
    const kxbtcdJson = JSON.stringify([
      {
        market_ticker: "KXBTCD-26JUN30-T95000",
        series_ticker: "KXBTCD",
        event_ticker: "KXBTCD-26JUN30",
        floor_strike: 95000,
        timestamp: 1_700_000_000_000,
        yes_bid: 40,
        yes_ask: 42,
        bid_size: 5,
      },
      {
        market_ticker: "KXBTCD-26JUN30-T96000",
        series_ticker: "KXBTCD",
        event_ticker: "KXBTCD-26JUN30",
        floor_strike: 96000,
        timestamp: 1_700_000_000_500,
        yes_bid: 35,
        yes_ask: 37,
        bid_size: 6,
      },
    ]);

    const audit = auditVendorSampleData({
      vendorId: "predexon",
      sampleFilePaths: ["data/vendor-orderbook-samples/predexon/kxbtcd.json"],
      io: createIo({
        "data/vendor-orderbook-samples/predexon/kxbtcd.json": kxbtcdJson,
      }),
    });

    expect(audit.eventsWith2PlusStrikes).toBe(1);
    expect(audit.maxStrikesPerEvent).toBe(2);
  });
});

describe("evaluateVendorSufficiency", () => {
  const metadata = SEEDED_VENDOR_METADATA[0]!;

  it("returns unknown-no-sample without samples", () => {
    const result = evaluateVendorSufficiency({
      metadata,
      sampleAudit: null,
      thresholds: THRESHOLDS,
    });

    expect(result.sufficiency.kxbtc15mLeadLag).toBe("unknown-no-sample");
    expect(result.recommendation).toBe("request-vendor-samples");
  });

  it("returns insufficient-no-sizes when sizes missing", () => {
    const result = evaluateVendorSufficiency({
      metadata,
      sampleAudit: {
        vendorId: "predexon",
        sampleStatus: "present",
        sampleFileCount: 1,
        rowCount: 2,
        marketTickers: ["KXBTC15M-26MAY081945-45"],
        seriesTickers: ["KXBTC15M"],
        eventTickers: ["KXBTC15M-26MAY081945"],
        earliestTimestamp: "2026-01-01T00:00:00.000Z",
        latestTimestamp: "2026-01-01T00:00:03.000Z",
        timestampResolution: "ms",
        medianSnapshotGapMs: 3000,
        p90SnapshotGapMs: 3000,
        maxSnapshotGapMs: 3000,
        hasYesBids: true,
        hasYesAsks: true,
        hasNoBids: false,
        hasNoAsks: false,
        hasSizes: false,
        hasTrades: false,
        hasMarketMetadata: true,
        hasFloorStrike: false,
        hasEventTicker: true,
        hasSequenceOrUpdateId: false,
        hasExchangeTimestamp: false,
        hasVendorReceiveTimestamp: false,
        nonZeroSpreadShare: 1,
        zeroSpreadShare: 0,
        distinctMarkets: 1,
        distinctEvents: 1,
        eventsWith2PlusStrikes: 0,
        eventsWith3PlusStrikes: 0,
        maxStrikesPerEvent: 1,
        schemaNotes: [],
      },
      thresholds: THRESHOLDS,
    });

    expect(result.sufficiency.kxbtc15mLeadLag).toBe("insufficient-no-sizes");
  });

  it("returns insufficient-zero-spread when spreads are synthetic", () => {
    const result = evaluateVendorSufficiency({
      metadata,
      sampleAudit: {
        vendorId: "predexon",
        sampleStatus: "present",
        sampleFileCount: 1,
        rowCount: 5,
        marketTickers: ["KXBTC15M-26MAY081945-45"],
        seriesTickers: ["KXBTC15M"],
        eventTickers: ["KXBTC15M-26MAY081945"],
        earliestTimestamp: "2026-01-01T00:00:00.000Z",
        latestTimestamp: "2026-01-01T00:00:10.000Z",
        timestampResolution: "ms",
        medianSnapshotGapMs: 2000,
        p90SnapshotGapMs: 3000,
        maxSnapshotGapMs: 4000,
        hasYesBids: true,
        hasYesAsks: true,
        hasNoBids: false,
        hasNoAsks: false,
        hasSizes: true,
        hasTrades: false,
        hasMarketMetadata: true,
        hasFloorStrike: false,
        hasEventTicker: true,
        hasSequenceOrUpdateId: false,
        hasExchangeTimestamp: false,
        hasVendorReceiveTimestamp: false,
        nonZeroSpreadShare: 0,
        zeroSpreadShare: 1,
        distinctMarkets: 1,
        distinctEvents: 1,
        eventsWith2PlusStrikes: 0,
        eventsWith3PlusStrikes: 0,
        maxStrikesPerEvent: 1,
        schemaNotes: [],
      },
      thresholds: THRESHOLDS,
    });

    expect(result.sufficiency.kxbtc15mLeadLag).toBe("insufficient-zero-spread");
  });

  it("returns sufficient for valid KXBTC15M sample", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      market_ticker: "KXBTC15M-26MAY081945-45",
      series_ticker: "KXBTC15M",
      timestamp: 1_700_000_000_000 + index * 1000,
      yes_bid: 45 + (index % 2),
      yes_ask: 47 + (index % 2),
      bid_size: 10,
      ask_size: 12,
    }));

    const audit = auditVendorSampleData({
      vendorId: "predexon",
      sampleFilePaths: ["sample.json"],
      io: createIo({ "sample.json": JSON.stringify(rows) }),
    });

    const result = evaluateVendorSufficiency({
      metadata,
      sampleAudit: audit,
      thresholds: THRESHOLDS,
    });

    expect(result.sufficiency.kxbtc15mLeadLag).toBe("sufficient");
    expect(result.sufficiency.kxbtc15mLadder).toBe("product-blocked-no-ladder");
  });
});

describe("groupEventsByStrikeCount", () => {
  it("reports single-strike events", () => {
    const result = groupEventsByStrikeCount({
      rows: [
        { marketTicker: "KXBTC15M-26MAY081945-45", eventTicker: "KXBTC15M-26MAY081945" },
        { marketTicker: "KXBTC15M-26MAY081930-30", eventTicker: "KXBTC15M-26MAY081930" },
      ],
    });

    expect(result.eventsWith2PlusStrikes).toBe(0);
  });
});

describe("evaluateOverallAuditVerdict", () => {
  it("aggregates request-vendor-samples when no samples exist", () => {
    const report = buildVendorOrderbookSufficiencyAuditReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      inputPaths: {
        configPath: "config.json",
        samplesRoot: "samples",
      },
      config: createVendorOrderbookAuditConfig(),
      io: createIo(),
    });

    const verdict = evaluateOverallAuditVerdict({ vendors: report.vendors });
    expect(verdict.overallVerdict).toBe("request-vendor-samples");
  });
});

describe("serialization", () => {
  it("serializes stable JSON and HTML with caveats", () => {
    const report = buildVendorOrderbookSufficiencyAuditReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "out.json",
      htmlOutputPath: "out.html",
      inputPaths: {
        configPath: "config.json",
        samplesRoot: "samples",
      },
      config: createVendorOrderbookAuditConfig(),
      io: createIo(),
    });

    const json = JSON.parse(serializeVendorOrderbookSufficiencyAuditReport(report));
    const html = serializeVendorOrderbookSufficiencyAuditHtml(report);

    expect(json.summary.overallVerdict).toBe("request-vendor-samples");
    expect(html).toContain("request-vendor-samples");
    expect(html).toContain("Do not treat marketing claims as sufficient");
    expect(json.vendorSampleRequest.body).toContain("KXBTC15M orderbook samples");
  });
});

describe("buildVendorSampleRequest", () => {
  it("generates vendor sample request text", () => {
    const request = buildVendorSampleRequest();
    expect(request.subject).toContain("KXBTC15M");
    expect(request.body).toContain("floor_strike");
    expect(request.body).toContain(">=10 strikes");
  });
});
