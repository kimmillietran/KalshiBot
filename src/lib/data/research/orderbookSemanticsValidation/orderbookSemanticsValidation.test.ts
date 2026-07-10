import { describe, expect, it } from "vitest";

import {
  buildLadderEvaluationPoints,
  compareTransformModels,
} from "./compareTransformModels";
import { buildOrderbookSemanticsValidationReport } from "./buildOrderbookSemanticsValidationReport";
import { inspectRawOrderbookPayloads } from "./inspectRawOrderbookPayloads";
import { parseOrderbookSemanticsValidationArgv } from "./parseOrderbookSemanticsValidationArgv";
import { serializeOrderbookSemanticsValidationHtml } from "./serializeOrderbookSemanticsValidationHtml";
import { serializeOrderbookSemanticsValidationReport } from "./serializeOrderbookSemanticsValidationReport";
import { validateOrderbookSemantics } from "./validateOrderbookSemantics";

const MARKET = "KXBTC15M-TEST";
const RUN_DIR = "data/live-capture/forward-quotes/run-semantics";

function snapshot(seq: number, yes: string, no: string) {
  return {
    type: "orderbook_snapshot",
    sid: 1,
    seq,
    msg: {
      market_ticker: MARKET,
      market_id: "mock",
      yes_dollars_fp: [[yes, "10.00"]],
      no_dollars_fp: [[no, "10.00"]],
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
      ts_ms: 1_700_000_000_000 + seq,
    },
  };
}

function wrapRaw(message: unknown, receivedAtLocal: string) {
  return JSON.stringify({
    receivedAtLocal,
    messageType:
      typeof message === "object"
      && message !== null
      && "type" in message
      && typeof message.type === "string"
        ? message.type
        : null,
    marketTicker: MARKET,
    sequence:
      typeof message === "object"
      && message !== null
      && "seq" in message
      && typeof message.seq === "number"
        ? message.seq
        : null,
    rawPayload: message,
  });
}

function buildFixture(input?: { crossed?: boolean; malformed?: boolean }) {
  const crossed = input?.crossed ?? false;
  const yes = crossed ? "0.5400" : "0.4500";
  const no = crossed ? "0.7000" : "0.5000";
  const rawLines = [
    wrapRaw(snapshot(1, yes, no), "2026-07-10T00:00:01.000Z"),
    wrapRaw(delta(2, "yes", "0.4600", "5.00"), "2026-07-10T00:00:02.000Z"),
    wrapRaw(snapshot(3, yes, no), "2026-07-10T00:00:03.000Z"),
  ];
  if (input?.malformed) {
    rawLines.push("{bad");
  }

  return {
    [`${RUN_DIR}/capture-health.json`]: JSON.stringify({ runId: "run-semantics" }),
    [`${RUN_DIR}/raw-kalshi-ws.jsonl`]: `${rawLines.join("\n")}\n`,
    [`${RUN_DIR}/top-of-book.jsonl`]: "",
    [`${RUN_DIR}/market-metadata.jsonl`]: "",
  };
}

function createIo(files: Record<string, string>) {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path.replaceAll("\\", "/"), content]),
  );
  return {
    readFile: (path: string) => normalized[path.replaceAll("\\", "/")] ?? "",
    fileExists: (path: string) => {
      const normalizedPath = path.replaceAll("\\", "/");
      if (normalizedPath in normalized) {
        return true;
      }
      return Object.keys(normalized).some((filePath) => filePath.startsWith(`${normalizedPath}/`));
    },
  };
}

describe("inspectRawOrderbookPayloads", () => {
  it("detects YES/NO bid ladder fields and no explicit asks", () => {
    const files = buildFixture();
    const semantics = inspectRawOrderbookPayloads({
      lines: files[`${RUN_DIR}/raw-kalshi-ws.jsonl`]!.split("\n"),
      maxMessages: Number.POSITIVE_INFINITY,
    });
    expect(semantics.yesNoBidLadderFieldsFound).toContain("yes_dollars_fp");
    expect(semantics.yesNoBidLadderFieldsFound).toContain("no_dollars_fp");
    expect(semantics.explicitAskFieldsFound).toHaveLength(0);
    expect(semantics.observedSideValues).toContain("yes");
  });

  it("respects max raw messages", () => {
    const files = buildFixture();
    const semantics = inspectRawOrderbookPayloads({
      lines: files[`${RUN_DIR}/raw-kalshi-ws.jsonl`]!.split("\n"),
      maxMessages: 1,
    });
    expect(semantics.messagesScanned).toBe(1);
  });
});

describe("compareTransformModels", () => {
  it("classifies complement model crossed records", () => {
    const files = buildFixture({ crossed: true });
    const points = buildLadderEvaluationPoints({
      lines: files[`${RUN_DIR}/raw-kalshi-ws.jsonl`]!.split("\n"),
      maxMessages: Number.POSITIVE_INFINITY,
    });
    const { models } = compareTransformModels({
      points,
      freshnessWindowMs: 500,
      hasExplicitAskFields: false,
    });
    const complement = models.find((model) => model.modelId === "complement-derived");
    expect(complement?.crossedRecords).toBeGreaterThan(0);
    expect(complement?.crossedShare).toBeGreaterThan(0);
  });

  it("reports bid-only model metrics", () => {
    const files = buildFixture({ crossed: true });
    const points = buildLadderEvaluationPoints({
      lines: files[`${RUN_DIR}/raw-kalshi-ws.jsonl`]!.split("\n"),
      maxMessages: Number.POSITIVE_INFINITY,
    });
    const { models } = compareTransformModels({
      points,
      freshnessWindowMs: 500,
      hasExplicitAskFields: false,
    });
    const bidOnly = models.find((model) => model.modelId === "bid-only");
    expect(bidOnly?.recordsEvaluated).toBeGreaterThan(0);
  });

  it("detects freshness-window crossing patterns", () => {
    const files = buildFixture({ crossed: true });
    const points = buildLadderEvaluationPoints({
      lines: files[`${RUN_DIR}/raw-kalshi-ws.jsonl`]!.split("\n"),
      maxMessages: Number.POSITIVE_INFINITY,
    });
    const { complementTransform } = compareTransformModels({
      points,
      freshnessWindowMs: 500,
      hasExplicitAskFields: false,
    });
    expect(complementTransform.freshDualSideRecordCount).toBeGreaterThan(0);
  });
});

describe("validateOrderbookSemantics", () => {
  it("produces evidence summary and recommended next fix", () => {
    const result = validateOrderbookSemantics({
      io: createIo(buildFixture({ crossed: true })),
      config: {
        captureRunDir: RUN_DIR,
        marketTicker: null,
        maxRawMessages: Number.POSITIVE_INFINITY,
        sampleLimit: 10,
        freshnessWindowMs: 500,
      },
    });
    expect(result.summary.yesNoBidLaddersFound).toBe(true);
    expect(result.summary.explicitAskFieldsFound).toBe(false);
    expect(result.evidence.codebaseEvidence.length).toBeGreaterThan(0);
    expect(result.evidence.localSchemaEvidence.length).toBeGreaterThan(0);
    expect(result.summary.recommendedNextFix).not.toBe("unknown");
  });

  it("skips malformed raw JSONL with warning", () => {
    const result = validateOrderbookSemantics({
      io: createIo(buildFixture({ malformed: true })),
      config: {
        captureRunDir: RUN_DIR,
        marketTicker: null,
        maxRawMessages: Number.POSITIVE_INFINITY,
        sampleLimit: 10,
        freshnessWindowMs: 500,
      },
    });
    expect(result.rawPayloadSemantics.malformedLineCount).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("malformed"))).toBe(true);
  });

  it("detects stale opposite-side updates in complement transform checks", () => {
    const rawLines = [
      wrapRaw(snapshot(1, "0.5400", "0.5000"), "2026-07-10T00:00:01.000Z"),
      wrapRaw(delta(2, "no", "0.7000", "10.00"), "2026-07-10T00:00:05.000Z"),
      wrapRaw(snapshot(3, "0.5400", "0.7000"), "2026-07-10T00:00:05.100Z"),
    ];
    const files = {
      [`${RUN_DIR}/capture-health.json`]: JSON.stringify({ runId: "run-semantics" }),
      [`${RUN_DIR}/raw-kalshi-ws.jsonl`]: `${rawLines.join("\n")}\n`,
      [`${RUN_DIR}/top-of-book.jsonl`]: "",
      [`${RUN_DIR}/market-metadata.jsonl`]: "",
    };
    const result = validateOrderbookSemantics({
      io: createIo(files),
      config: {
        captureRunDir: RUN_DIR,
        marketTicker: null,
        maxRawMessages: Number.POSITIVE_INFINITY,
        sampleLimit: 10,
        freshnessWindowMs: 500,
      },
    });
    expect(result.complementTransform.staleOppositeSideCrossedCount).toBeGreaterThan(0);
    expect(result.complementTransform.medianOppositeSideGapMs).toBeGreaterThan(500);
  });
});

describe("parseOrderbookSemanticsValidationArgv", () => {
  it("parses CLI args", () => {
    const parsed = parseOrderbookSemanticsValidationArgv([
      "--capture-run-dir",
      RUN_DIR,
      "--max-raw-messages",
      "100",
      "--sample-limit",
      "5",
      "--market-ticker",
      MARKET,
    ]);
    expect(parsed.config.captureRunDir).toBe(RUN_DIR);
    expect(parsed.config.maxRawMessages).toBe(100);
    expect(parsed.config.marketTicker).toBe(MARKET);
  });
});

describe("buildOrderbookSemanticsValidationReport", () => {
  it("serializes JSON and HTML", () => {
    const report = buildOrderbookSemanticsValidationReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      outputPath: "data/research-results/orderbook-semantics-validation.json",
      htmlOutputPath: "data/reports/orderbook-semantics-validation.html",
      config: {
        captureRunDir: RUN_DIR,
        marketTicker: null,
        maxRawMessages: Number.POSITIVE_INFINITY,
        sampleLimit: 5,
        freshnessWindowMs: 500,
      },
      io: createIo(buildFixture()),
    });
    const json = serializeOrderbookSemanticsValidationReport(report);
    const html = serializeOrderbookSemanticsValidationHtml(report);
    expect(json).toContain("recommendedPricingModel");
    expect(html).toContain("Orderbook Semantics Validation");
    expect(html).toContain(report.summary.recommendedPricingModel);
  });
});
