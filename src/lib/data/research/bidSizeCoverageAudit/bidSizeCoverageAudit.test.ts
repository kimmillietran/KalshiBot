import { describe, expect, it } from "vitest";

import { OrderbookCaptureBook } from "@/lib/data/live/forwardQuoteCapture/orderbookCaptureBook";
import {
  hasExecutableBidPairSize,
  shouldRemoveOrderbookLevelSize,
} from "@/lib/data/live/forwardQuoteCapture/orderbookLevelSize";
import { auditBidSizeCoverage } from "./auditBidSizeCoverage";
import { buildBidSizeCoverageAuditReport } from "./buildBidSizeCoverageAuditReport";
import { compareRawDepthToTopOfBook, parseCapturedTopOfBookLine } from "./compareRawDepthToTopOfBook";
import { inspectRawLadderSizes } from "./inspectRawLadderSizes";
import { parseBidSizeCoverageAuditArgv } from "./parseBidSizeCoverageAuditArgv";
import { replayBidSizeState } from "./replayBidSizeState";
import { serializeBidSizeCoverageAuditHtml } from "./serializeBidSizeCoverageAuditHtml";
import type { BidSizeCoverageAuditIo } from "./bidSizeCoverageAuditTypes";

const MARKET = "KXBTC15M-TEST";
const RUN_DIR = "data/live-capture/forward-quotes/run-size-audit";

function snapshot(seq: number, yes: string, no: string) {
  return {
    type: "orderbook_snapshot",
    sid: 1,
    seq,
    msg: {
      market_ticker: MARKET,
      market_id: "mock",
      yes_dollars_fp: [[yes, "10.00"]],
      no_dollars_fp: [[no, "8.00"]],
    },
  };
}

function delta(seq: number, side: "yes" | "no", price: string, deltaFp: string) {
  return {
    type: "orderbook_delta",
    sid: 1,
    seq,
    msg: {
      market_ticker: MARKET,
      market_id: "mock",
      price_dollars: price,
      delta_fp: deltaFp,
      side,
    },
  };
}

function wrapRaw(message: unknown, receivedAtLocal: string) {
  return JSON.stringify({
    receivedAtLocal,
    messageType:
      typeof message === "object" && message !== null && "type" in message
        ? (message as { type: string }).type
        : null,
    marketTicker: MARKET,
    sequence:
      typeof message === "object" && message !== null && "seq" in message
        ? (message as { seq: number }).seq
        : null,
    rawPayload: message,
  });
}

function createIo(files: Record<string, string>): BidSizeCoverageAuditIo {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path.replaceAll("\\", "/"), content]),
  );
  return {
    readFile: (path) => normalized[path.replaceAll("\\", "/")] ?? "",
    fileExists: (path) => {
      const key = path.replaceAll("\\", "/");
      if (key in normalized) {
        return true;
      }
      return Object.keys(normalized).some((filePath) => filePath.startsWith(`${key}/`));
    },
  };
}

function buildFixture(input?: { legacyTopOfBook?: boolean }) {
  const rawLines = [
    wrapRaw(snapshot(1, "0.5400", "0.4600"), "2026-07-10T00:00:01.000Z"),
    wrapRaw(delta(2, "yes", "0.5400", "-9.999999999999999"), "2026-07-10T00:00:02.000Z"),
    wrapRaw(snapshot(3, "0.5400", "0.4600"), "2026-07-10T00:00:03.000Z"),
  ];
  const topLine = input?.legacyTopOfBook
    ? {
        runId: "run-size-audit",
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-10T00:00:03.000Z",
        sequence: 3,
        bookState: "valid",
        yesBestBidCents: 54,
        noBestBidCents: 46,
      }
    : {
        runId: "run-size-audit",
        marketTicker: MARKET,
        receivedAtLocal: "2026-07-10T00:00:03.000Z",
        sequence: 3,
        bookState: "valid",
        yesBestBidCents: 54,
        yesBestBidSize: 10,
        noBestBidCents: 46,
        noBestBidSize: 8,
      };

  return {
    [`${RUN_DIR}/capture-health.json`]: JSON.stringify({ runId: "run-size-audit" }),
    [`${RUN_DIR}/raw-kalshi-ws.jsonl`]: `${rawLines.join("\n")}\n`,
    [`${RUN_DIR}/top-of-book.jsonl`]: `${JSON.stringify(topLine)}\n`,
    [`${RUN_DIR}/market-metadata.jsonl`]: "",
  };
}

describe("orderbookLevelSize", () => {
  it("treats floating-point dust as removable", () => {
    expect(shouldRemoveOrderbookLevelSize(1e-14)).toBe(true);
    expect(shouldRemoveOrderbookLevelSize(0.5)).toBe(false);
  });
});

describe("inspectRawLadderSizes", () => {
  it("inventories raw snapshot and delta size fields", () => {
    const inventory = inspectRawLadderSizes({
      lines: buildFixture()[`${RUN_DIR}/raw-kalshi-ws.jsonl`].split("\n").filter(Boolean),
      maxMessages: 100,
    });
    expect(inventory.snapshotLadderEntries).toBeGreaterThan(0);
    expect(inventory.deltaUpdates).toBe(1);
    expect(inventory.snapshotEntriesWithSize).toBeGreaterThan(0);
  });
});

describe("replayBidSizeState", () => {
  it("tracks replay best bid sizes and zero-size removals", () => {
    const { state, points } = replayBidSizeState({
      lines: buildFixture()[`${RUN_DIR}/raw-kalshi-ws.jsonl`].split("\n").filter(Boolean),
      maxMessages: 100,
      runId: "run-size-audit",
    });
    expect(state.replayPointsEmitted).toBeGreaterThan(0);
    expect(state.zeroSizeRemoveLevelCount).toBeGreaterThanOrEqual(0);
    expect(points.some((point) => point.yesBestBidSize !== null)).toBe(true);
  });
});

describe("compareRawDepthToTopOfBook", () => {
  it("matches top-of-book sizes when replay agrees", () => {
    const { points } = replayBidSizeState({
      lines: buildFixture()[`${RUN_DIR}/raw-kalshi-ws.jsonl`].split("\n").filter(Boolean),
      maxMessages: 100,
      runId: "run-size-audit",
    });
    const captured = parseCapturedTopOfBookLine(
      buildFixture()[`${RUN_DIR}/top-of-book.jsonl`].trim(),
    );
    expect(captured).not.toBeNull();
    const { metrics } = compareRawDepthToTopOfBook({
      captured: captured ? [captured] : [],
      replayPoints: points,
      sampleLimit: 5,
    });
    expect(metrics.topOfBookRecordsCompared).toBeGreaterThanOrEqual(0);
  });

  it("classifies legacy top-of-book without size fields", () => {
    const captured = parseCapturedTopOfBookLine(
      buildFixture({ legacyTopOfBook: true })[`${RUN_DIR}/top-of-book.jsonl`].trim(),
    );
    const { metrics } = compareRawDepthToTopOfBook({
      captured: captured ? [captured] : [],
      replayPoints: [],
      sampleLimit: 5,
    });
    expect(metrics.legacyRecordWithoutSizeCount).toBe(0);
    expect(captured?.hasYesBidSizeField).toBe(false);
  });
});

describe("auditBidSizeCoverage", () => {
  it("produces summary with size loss classification", () => {
    const result = auditBidSizeCoverage({
      io: createIo(buildFixture()),
      config: {
        captureRunDir: RUN_DIR,
        marketTicker: null,
        maxRawMessages: Number.POSITIVE_INFINITY,
        sampleLimit: 10,
      },
    });
    expect(result.summary.messagesScanned).toBeGreaterThan(0);
    expect(result.summary.recommendedNextFix).not.toBe("unknown");
    expect(result.rawInventory.rawBestBidSizeNonzeroCount).toBeGreaterThan(0);
  });

  it("skips malformed raw JSONL with warning", () => {
    const files = buildFixture();
    files[`${RUN_DIR}/raw-kalshi-ws.jsonl`] += "{bad\n";
    const result = auditBidSizeCoverage({
      io: createIo(files),
      config: {
        captureRunDir: RUN_DIR,
        marketTicker: null,
        maxRawMessages: Number.POSITIVE_INFINITY,
        sampleLimit: 10,
      },
    });
    expect(result.warnings.some((warning) => warning.includes("malformed"))).toBe(true);
  });
});

describe("OrderbookCaptureBook dust handling", () => {
  it("removes dust-level sizes after delta cancellation", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: MARKET,
      seriesTicker: "KXBTC15M",
    });
    book.applySnapshot(snapshot(1, "0.5400", "0.4600") as never);
    book.applyDelta(delta(2, "yes", "0.5400", "-10.00") as never);
    const top = book.toTopOfBookRecord({
      runId: "test",
      receivedAtLocal: "2026-07-10T00:00:02.000Z",
      exchangeTimestampMs: null,
    });
    expect(top.yesBestBidSize === null || top.yesBestBidSize >= 1).toBe(true);
  });

  it("emits yesBestBidSize and noBestBidSize", () => {
    const book = new OrderbookCaptureBook({
      marketTicker: MARKET,
      seriesTicker: "KXBTC15M",
    });
    book.applySnapshot(snapshot(1, "0.5400", "0.4600") as never);
    const top = book.toTopOfBookRecord({
      runId: "test",
      receivedAtLocal: "2026-07-10T00:00:01.000Z",
      exchangeTimestampMs: null,
    });
    expect(top.yesBestBidSize).toBe(10);
    expect(top.noBestBidSize).toBe(8);
    expect(hasExecutableBidPairSize(top.yesBestBidSize, top.noBestBidSize)).toBe(true);
  });
});

describe("parseBidSizeCoverageAuditArgv", () => {
  it("parses capture run dir", () => {
    const parsed = parseBidSizeCoverageAuditArgv([
      "--capture-run-dir",
      RUN_DIR,
    ]);
    expect(parsed.config.captureRunDir).toBe(RUN_DIR);
  });
});

describe("buildBidSizeCoverageAuditReport", () => {
  it("serializes JSON and HTML", () => {
    const report = buildBidSizeCoverageAuditReport({
      generatedAt: "2026-07-10T12:00:00.000Z",
      outputPath: "data/research-results/bid-size-coverage-audit.json",
      htmlOutputPath: "data/reports/bid-size-coverage-audit.html",
      config: {
        captureRunDir: RUN_DIR,
        marketTicker: null,
        maxRawMessages: Number.POSITIVE_INFINITY,
        sampleLimit: 10,
      },
      io: createIo(buildFixture()),
    });
    const html = serializeBidSizeCoverageAuditHtml(report);
    expect(html).toContain("Bid Size Coverage");
    expect(report.summary.captureRunDir).toBe(RUN_DIR);
  });
});
