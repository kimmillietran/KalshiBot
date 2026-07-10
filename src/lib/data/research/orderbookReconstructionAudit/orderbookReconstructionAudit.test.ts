import { describe, expect, it } from "vitest";

import { auditOrderbookReconstruction } from "./auditOrderbookReconstruction";
import { buildOrderbookReconstructionAuditReport } from "./buildOrderbookReconstructionAuditReport";
import { compareTopOfBookToReplay } from "./compareTopOfBookToReplay";
import { parseOrderbookReconstructionAuditArgv } from "./parseOrderbookReconstructionAuditArgv";
import {
  parseRawWsLine,
  replayRawOrderbookMessages,
} from "./replayRawOrderbookMessages";
import { serializeOrderbookReconstructionAuditHtml } from "./serializeOrderbookReconstructionAuditHtml";
import { serializeOrderbookReconstructionAuditReport } from "./serializeOrderbookReconstructionAuditReport";

const MARKET = "KXBTC15M-TEST";
const RUN_DIR = "data/live-capture/forward-quotes/run-test";

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
    runId: "run-test",
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

function topOfBookLine(input: {
  sequence: number;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  economicBookState?: string;
}) {
  return JSON.stringify({
    runId: "run-test",
    marketTicker: MARKET,
    receivedAtLocal: `2026-07-10T00:00:0${input.sequence}.000Z`,
    sequence: input.sequence,
    bookState: "valid",
    yesBestBidCents: input.yesBid,
    yesBestAskCents: input.yesAsk,
    noBestBidCents: input.noBid,
    noBestAskCents: input.noAsk,
    economicBookState: input.economicBookState ?? "economically-valid",
  });
}

function buildSyntheticCaptureFiles(input?: {
  crossed?: boolean;
  extraMalformedRaw?: boolean;
}) {
  const crossed = input?.crossed ?? false;
  const yesBid = crossed ? "0.5400" : "0.4500";
  const noBid = crossed ? "0.7000" : "0.5000";

  const rawLines = [
    wrapRaw(snapshot(1, yesBid, noBid), "2026-07-10T00:00:01.000Z"),
    wrapRaw(delta(2, "yes", "0.4600", "5.00"), "2026-07-10T00:00:02.000Z"),
    wrapRaw(snapshot(3, yesBid, noBid), "2026-07-10T00:00:03.000Z"),
  ];
  if (input?.extraMalformedRaw) {
    rawLines.push("{bad json");
  }

  const files: Record<string, string> = {
    [`${RUN_DIR}/capture-health.json`]: JSON.stringify({ runId: "run-test" }),
    [`${RUN_DIR}/raw-kalshi-ws.jsonl`]: `${rawLines.join("\n")}\n`,
    [`${RUN_DIR}/market-metadata.jsonl`]: `${JSON.stringify({
      marketTicker: MARKET,
      recordedAtLocal: "2026-07-10T00:00:00.000Z",
      action: "subscribed",
      closeTime: "2026-07-10T00:15:00.000Z",
    })}\n`,
    [`${RUN_DIR}/top-of-book.jsonl`]: [
      topOfBookLine({
        sequence: 1,
        yesBid: crossed ? 54 : 45,
        yesAsk: crossed ? 30 : 50,
        noBid: crossed ? 70 : 50,
        noAsk: crossed ? 46 : 55,
        economicBookState: crossed ? "sequence-valid-crossed" : "economically-valid",
      }),
      topOfBookLine({
        sequence: 3,
        yesBid: crossed ? 54 : 45,
        yesAsk: crossed ? 30 : 50,
        noBid: crossed ? 70 : 50,
        noAsk: crossed ? 46 : 55,
        economicBookState: crossed ? "sequence-valid-crossed" : "economically-valid",
      }),
    ].join("\n"),
  };

  return files;
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

describe("parseRawWsLine", () => {
  it("parses wrapped raw capture records", () => {
    const line = wrapRaw(snapshot(1, "0.4500", "0.5000"), "2026-07-10T00:00:01.000Z");
    const parsed = parseRawWsLine(line);
    expect(parsed?.messageType).toBe("orderbook_snapshot");
    expect(parsed?.sequence).toBe(1);
  });
});

describe("replayRawOrderbookMessages", () => {
  it("replays snapshots and deltas with capture book semantics", () => {
    const files = buildSyntheticCaptureFiles();
    const { replayPoints } = replayRawOrderbookMessages({
      lines: files[`${RUN_DIR}/raw-kalshi-ws.jsonl`]!.split("\n"),
    });
    expect(replayPoints.length).toBeGreaterThan(0);
    expect(replayPoints[0]?.yesBestBidCents).toBe(45);
  });

  it("respects max raw message limit", () => {
    const files = buildSyntheticCaptureFiles();
    const { replayPoints } = replayRawOrderbookMessages({
      lines: files[`${RUN_DIR}/raw-kalshi-ws.jsonl`]!.split("\n"),
      maxMessages: 1,
    });
    expect(replayPoints.length).toBe(1);
  });
});

describe("compareTopOfBookToReplay", () => {
  it("matches captured and replayed prices at sequence points", () => {
    const files = buildSyntheticCaptureFiles({ crossed: true });
    const { replayPoints } = replayRawOrderbookMessages({
      lines: files[`${RUN_DIR}/raw-kalshi-ws.jsonl`]!.split("\n"),
    });
    const captured = JSON.parse(topOfBookLine({
      sequence: 1,
      yesBid: 54,
      yesAsk: 30,
      noBid: 70,
      noAsk: 46,
      economicBookState: "sequence-valid-crossed",
    }));

    const result = compareTopOfBookToReplay({
      captured: [captured],
      replayPoints,
      sampleLimit: 5,
    });
    expect(result.compared).toBe(1);
    expect(result.matched).toBe(1);
  });
});

describe("auditOrderbookReconstruction", () => {
  it("aggregates raw message inventory", () => {
    const files = buildSyntheticCaptureFiles();
    const result = auditOrderbookReconstruction({
      io: createIo(files),
      config: {
        captureRunDir: RUN_DIR,
        maxRawMessages: Number.POSITIVE_INFINITY,
        marketTicker: null,
        sampleLimit: 10,
      },
    });

    expect(result.rawMessageInventory.snapshotCount).toBe(2);
    expect(result.rawMessageInventory.deltaCount).toBe(1);
    expect(result.rawMessageInventory.snapshotFieldsPresent).toContain("market_ticker");
  });

  it("detects crossed complement transform records", () => {
    const files = buildSyntheticCaptureFiles({ crossed: true });
    const result = auditOrderbookReconstruction({
      io: createIo(files),
      config: {
        captureRunDir: RUN_DIR,
        maxRawMessages: Number.POSITIVE_INFINITY,
        marketTicker: null,
        sampleLimit: 10,
      },
    });

    expect(result.oppositeSideAskDerivation.crossedFromDerivationAloneCount).toBeGreaterThan(0);
    expect(result.summary.rootCauseClassification).not.toBe("unknown");
  });

  it("skips malformed raw JSONL with warning", () => {
    const files = buildSyntheticCaptureFiles({ extraMalformedRaw: true });
    const result = auditOrderbookReconstruction({
      io: createIo(files),
      config: {
        captureRunDir: RUN_DIR,
        maxRawMessages: Number.POSITIVE_INFINITY,
        marketTicker: null,
        sampleLimit: 10,
      },
    });

    expect(result.rawMessageInventory.malformedLineCount).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("malformed"))).toBe(true);
  });

  it("aggregates market-level findings", () => {
    const files = buildSyntheticCaptureFiles({ crossed: true });
    const result = auditOrderbookReconstruction({
      io: createIo(files),
      config: {
        captureRunDir: RUN_DIR,
        maxRawMessages: Number.POSITIVE_INFINITY,
        marketTicker: null,
        sampleLimit: 10,
      },
    });

    expect(result.marketFindings.length).toBeGreaterThan(0);
    expect(result.marketFindings[0]?.crossedCount).toBeGreaterThan(0);
  });

  it("prefers relative delta semantics when snapshots follow deltas", () => {
    const rawLines = [
      wrapRaw(
        {
          type: "orderbook_snapshot",
          sid: 1,
          seq: 1,
          msg: {
            market_ticker: MARKET,
            market_id: "mock",
            yes_dollars_fp: [["0.4600", "10.00"]],
            no_dollars_fp: [["0.5000", "10.00"]],
          },
        },
        "2026-07-10T00:00:01.000Z",
      ),
      wrapRaw(delta(2, "yes", "0.4600", "5.00"), "2026-07-10T00:00:02.000Z"),
      wrapRaw(
        {
          type: "orderbook_snapshot",
          sid: 1,
          seq: 3,
          msg: {
            market_ticker: MARKET,
            market_id: "mock",
            yes_dollars_fp: [["0.4600", "15.00"]],
            no_dollars_fp: [["0.5000", "10.00"]],
          },
        },
        "2026-07-10T00:00:03.000Z",
      ),
    ];
    const files = {
      [`${RUN_DIR}/capture-health.json`]: JSON.stringify({ runId: "run-test" }),
      [`${RUN_DIR}/raw-kalshi-ws.jsonl`]: `${rawLines.join("\n")}\n`,
      [`${RUN_DIR}/top-of-book.jsonl`]: topOfBookLine({
        sequence: 1,
        yesBid: 45,
        yesAsk: 50,
        noBid: 50,
        noAsk: 55,
      }),
      [`${RUN_DIR}/market-metadata.jsonl`]: "",
    };

    const result = auditOrderbookReconstruction({
      io: createIo(files),
      config: {
        captureRunDir: RUN_DIR,
        maxRawMessages: Number.POSITIVE_INFINITY,
        marketTicker: null,
        sampleLimit: 10,
      },
    });
    expect(result.deltaSemantics.preferredSemantics).toBe("relative");
    expect(result.deltaSemantics.treatsQuantityAsRelativeChange).toBe(true);
  });
});

describe("parseOrderbookReconstructionAuditArgv", () => {
  it("parses capture run dir and limits", () => {
    const parsed = parseOrderbookReconstructionAuditArgv([
      "--capture-run-dir",
      RUN_DIR,
      "--max-raw-messages",
      "100",
      "--sample-limit",
      "5",
    ]);
    expect(parsed.config.captureRunDir).toBe(RUN_DIR);
    expect(parsed.config.maxRawMessages).toBe(100);
    expect(parsed.config.sampleLimit).toBe(5);
  });
});

describe("buildOrderbookReconstructionAuditReport", () => {
  it("serializes JSON and HTML artifacts", () => {
    const files = buildSyntheticCaptureFiles();
    const report = buildOrderbookReconstructionAuditReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      outputPath: "data/research-results/orderbook-reconstruction-audit.json",
      htmlOutputPath: "data/reports/orderbook-reconstruction-audit.html",
      config: {
        captureRunDir: RUN_DIR,
        maxRawMessages: Number.POSITIVE_INFINITY,
        marketTicker: null,
        sampleLimit: 5,
      },
      io: createIo(files),
    });

    const html = serializeOrderbookReconstructionAuditHtml(report);
    const json = serializeOrderbookReconstructionAuditReport(report);
    expect(html).toContain("Orderbook Reconstruction Audit");
    expect(html).toContain(report.summary.rootCauseClassification);
    expect(json).toContain("rootCauseClassification");
  });
});
