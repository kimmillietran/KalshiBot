import { createReadStream } from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { describe, expect, it, vi } from "vitest";

import { iterateJsonlLines } from "@/lib/data/research/jsonl";

import {
  extractSelectedRunMarketInventory,
  ingestInventoryJsonlLine,
} from "./extractSelectedRunMarketInventory";
import type {
  CapturedMarketInventoryEntry,
  ForwardSettlementCoverageIo,
} from "./forwardSettlementCoverageTypes";
import { ForwardSettlementCoverageError } from "./forwardSettlementCoverageTypes";

const RUN_ID = "2026-09-08T07-46-44-416Z";
const RUN_DIR = `data/live-capture/forward-quotes/${RUN_ID}`;
const MARKET_A = "KXBTC15M-26SEP081100-00";
const MARKET_B = "KXBTC15M-26SEP081115-15";
const EVALUATED_AT = "2026-09-08T12:00:00.000Z";

function tobLine(input: {
  marketTicker: string;
  receivedAtLocal: string;
  eventTicker?: string;
  seriesTicker?: string;
}): string {
  return JSON.stringify({
    marketTicker: input.marketTicker,
    seriesTicker: input.seriesTicker ?? "KXBTC15M",
    eventTicker: input.eventTicker ?? null,
    receivedAtLocal: input.receivedAtLocal,
  });
}

async function iterateLinesFromChunks(
  chunks: readonly string[],
  options: Parameters<ForwardSettlementCoverageIo["iterateJsonl"]>[1],
): Promise<Awaited<ReturnType<ForwardSettlementCoverageIo["iterateJsonl"]>>> {
  const stream = Readable.from(chunks, { encoding: "utf8" });
  const lineReader = createInterface({
    input: stream,
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  const summary = {
    linesRead: 0,
    blankLinesSkipped: 0,
    invalidLineCount: 0,
    recordsHandled: 0,
    truncated: false,
  };

  try {
    for await (const line of lineReader) {
      summary.linesRead += 1;
      const trimmed = line.trim();
      if (!trimmed) {
        summary.blankLinesSkipped += 1;
        continue;
      }
      const action = await options.onLine(trimmed, summary.linesRead);
      if (action === "skip") {
        summary.invalidLineCount += 1;
        continue;
      }
      summary.recordsHandled += 1;
      if (action === "stop") {
        break;
      }
    }
  } finally {
    lineReader.close();
    stream.destroy();
  }

  return summary;
}

function createStreamingIo(input: {
  files: Record<string, string>;
  dirs: string[];
  tobIterate?: ForwardSettlementCoverageIo["iterateJsonl"];
  readFile?: ForwardSettlementCoverageIo["readFile"];
}): ForwardSettlementCoverageIo & {
  readFileCalls: string[];
  tobIterateCalls: string[];
} {
  const readFileCalls: string[] = [];
  const tobIterateCalls: string[] = [];
  const files = input.files;

  return {
    readFileCalls,
    tobIterateCalls,
    readFile: (path) => {
      readFileCalls.push(path);
      if (input.readFile) {
        return input.readFile(path);
      }
      const content = files[path];
      if (content === undefined) {
        throw new Error(`Missing file: ${path}`);
      }
      return content;
    },
    fileExists: (path) => path in files || input.dirs.includes(path),
    readdir: () => [],
    isDirectory: (path) => input.dirs.includes(path),
    iterateJsonl: async (path, options) => {
      if (path.endsWith("/top-of-book.jsonl") || path.endsWith("top-of-book.jsonl")) {
        tobIterateCalls.push(path);
        if (input.tobIterate) {
          return input.tobIterate(path, options);
        }
      }
      return iterateJsonlLines((files[path] ?? "").split(/\r?\n/), options);
    },
  };
}

describe("M12.6e.2 bounded-memory settlement inventory streaming", () => {
  it("A: production path never whole-file reads top-of-book.jsonl", async () => {
    const files: Record<string, string> = {
      [`${RUN_DIR}/top-of-book.jsonl`]: [
        tobLine({ marketTicker: MARKET_A, receivedAtLocal: "2026-09-08T11:00:00.000Z" }),
        tobLine({ marketTicker: MARKET_B, receivedAtLocal: "2026-09-08T11:01:00.000Z" }),
      ].join("\n"),
      [`${RUN_DIR}/market-metadata.jsonl`]: JSON.stringify({
        marketTicker: MARKET_A,
        seriesTicker: "KXBTC15M",
        closeTime: "2026-09-08T11:15:00.000Z",
        receivedAtLocal: "2026-09-08T11:00:00.000Z",
      }),
    };
    const io = createStreamingIo({ files, dirs: [RUN_DIR] });

    const extracted = await extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    expect(extracted.inventory).toHaveLength(2);
    expect(io.tobIterateCalls).toEqual([`${RUN_DIR}/top-of-book.jsonl`]);
    expect(io.readFileCalls.some((path) => path.includes("top-of-book.jsonl"))).toBe(false);
    expect(io.readFileCalls).toEqual([]);
  });

  it("B: single-pass semantics for first/last/count/exclusions/sourceArtifacts", async () => {
    const tobPath = `${RUN_DIR}/top-of-book.jsonl`;
    const metaPath = `${RUN_DIR}/market-metadata.jsonl`;
    const files: Record<string, string> = {
      [tobPath]: [
        tobLine({
          marketTicker: MARKET_A,
          receivedAtLocal: "2026-09-08T11:00:00.000Z",
          eventTicker: "KXBTC15M-26SEP081100",
        }),
        tobLine({ marketTicker: "KXBTC15M-MOCK", receivedAtLocal: "2026-09-08T11:00:30.000Z" }),
        tobLine({
          marketTicker: MARKET_A,
          receivedAtLocal: "2026-09-08T11:05:00.000Z",
          eventTicker: "KXBTC15M-26SEP081100",
        }),
        tobLine({ marketTicker: "KXBTC15M-FAKE", receivedAtLocal: "2026-09-08T11:05:30.000Z" }),
        tobLine({
          marketTicker: MARKET_B,
          receivedAtLocal: "2026-09-08T11:02:00.000Z",
          eventTicker: "KXBTC15M-26SEP081115",
        }),
        tobLine({ marketTicker: "KXBTC15M-MOCK", receivedAtLocal: "2026-09-08T11:06:00.000Z" }),
      ].join("\n"),
      [metaPath]: JSON.stringify({
        marketTicker: MARKET_A,
        seriesTicker: "KXBTC15M",
        closeTime: "2026-09-08T11:15:00.000Z",
        eventTicker: "KXBTC15M-26SEP081100",
        receivedAtLocal: "2026-09-08T11:00:00.000Z",
      }),
    };

    const io = createStreamingIo({ files, dirs: [RUN_DIR] });
    const extracted = await extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    expect(io.tobIterateCalls).toHaveLength(1);
    expect(extracted.inventory.map((entry) => entry.marketTicker)).toEqual([MARKET_A, MARKET_B]);
    const a = extracted.inventory[0]!;
    expect(a.firstObservedAt).toBe("2026-09-08T11:00:00.000Z");
    expect(a.lastObservedAt).toBe("2026-09-08T11:05:00.000Z");
    expect(a.observationCount).toBe(3); // 2 TOB + 1 metadata
    expect(a.sourceArtifacts).toEqual([tobPath, metaPath]);
    expect(extracted.excludedTickers.map((entry) => entry.marketTicker).sort()).toEqual([
      "KXBTC15M-FAKE",
      "KXBTC15M-MOCK",
    ]);
  });

  it("C: malformed JSON lines are skipped without aborting the run", async () => {
    const files: Record<string, string> = {
      [`${RUN_DIR}/top-of-book.jsonl`]: [
        "{not-json",
        tobLine({ marketTicker: MARKET_A, receivedAtLocal: "2026-09-08T11:00:00.000Z" }),
        "",
        "{",
        tobLine({ marketTicker: MARKET_B, receivedAtLocal: "2026-09-08T11:01:00.000Z" }),
        "null",
      ].join("\n"),
    };
    const extracted = await extractSelectedRunMarketInventory({
      io: createStreamingIo({ files, dirs: [RUN_DIR] }),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });
    expect(extracted.inventory.map((entry) => entry.marketTicker)).toEqual([MARKET_A, MARKET_B]);
  });

  it("D: JSONL records split across stream chunks still parse", async () => {
    const lineA = tobLine({ marketTicker: MARKET_A, receivedAtLocal: "2026-09-08T11:00:00.000Z" });
    const lineB = tobLine({ marketTicker: MARKET_B, receivedAtLocal: "2026-09-08T11:01:00.000Z" });
    const joined = `${lineA}\n${lineB}\n`;
    // Force a mid-line split (do not assume chunks align with JSONL records).
    const splitAt = lineA.length - 12;
    expect(splitAt).toBeGreaterThan(0);
    expect(splitAt).toBeLessThan(lineA.length);
    const chunks = [joined.slice(0, splitAt), joined.slice(splitAt)];
    expect(chunks[0]).not.toContain("\n");

    const files: Record<string, string> = {};
    const io = createStreamingIo({
      files,
      dirs: [RUN_DIR],
      tobIterate: async (_path, options) => iterateLinesFromChunks(chunks, options),
    });
    // fileExists still needs TOB present
    files[`${RUN_DIR}/top-of-book.jsonl`] = "placeholder-not-read";

    const extracted = await extractSelectedRunMarketInventory({
      io,
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    expect(extracted.inventory.map((entry) => entry.marketTicker)).toEqual([MARKET_A, MARKET_B]);
    expect(io.readFileCalls.some((path) => path.includes("top-of-book.jsonl"))).toBe(false);
  });

  it("E: large synthetic async generator stays bounded (ticker-scale memory)", async () => {
    const map = new Map<string, CapturedMarketInventoryEntry>();
    const excludedTickers: Array<{ marketTicker: string; reason: string }> = [];
    const seenInvalid = new Set<string>();
    let linesSeen = 0;
    const totalLines = 50_000;
    const tickerCount = 40;

    async function* generateLines(): AsyncGenerator<string> {
      for (let i = 0; i < totalLines; i += 1) {
        const marketTicker = `KXBTC15M-26SEP08${String(1000 + (i % tickerCount)).padStart(4, "0")}-00`;
        yield tobLine({
          marketTicker,
          receivedAtLocal: new Date(Date.parse("2026-09-08T11:00:00.000Z") + i * 1000).toISOString(),
        });
      }
    }

    for await (const line of generateLines()) {
      linesSeen += 1;
      ingestInventoryJsonlLine({
        map,
        excludedTickers,
        seenInvalid,
        line,
        sourceArtifact: `${RUN_DIR}/top-of-book.jsonl`,
        observedAtField: "receivedAtLocal",
        collectInvalidExclusions: true,
      });
      // Memory proxy: accumulator size never exceeds distinct tickers.
      expect(map.size).toBeLessThanOrEqual(tickerCount);
    }

    expect(linesSeen).toBe(totalLines);
    expect(map.size).toBe(tickerCount);
    const sample = [...map.values()][0]!;
    expect(sample.observationCount).toBe(totalLines / tickerCount);
  });

  it("F: metadata enrichment preserves eventTicker/seriesTicker/closeTime/availability", async () => {
    const files: Record<string, string> = {
      [`${RUN_DIR}/top-of-book.jsonl`]: tobLine({
        marketTicker: MARKET_A,
        receivedAtLocal: "2026-09-08T11:00:00.000Z",
      }),
      [`${RUN_DIR}/market-metadata.jsonl`]: JSON.stringify({
        marketTicker: MARKET_A,
        seriesTicker: "KXBTC15M",
        eventTicker: "KXBTC15M-26SEP081100",
        closeTime: "2026-09-08T11:15:00.000Z",
        receivedAtLocal: "2026-09-08T11:00:05.000Z",
      }),
    };

    const extracted = await extractSelectedRunMarketInventory({
      io: createStreamingIo({ files, dirs: [RUN_DIR] }),
      captureRunDir: RUN_DIR,
      evaluatedAt: EVALUATED_AT,
    });

    expect(extracted.inventory).toHaveLength(1);
    expect(extracted.inventory[0]).toMatchObject({
      marketTicker: MARKET_A,
      seriesTicker: "KXBTC15M",
      eventTicker: "KXBTC15M-26SEP081100",
      marketCloseTime: "2026-09-08T11:15:00.000Z",
      expectedSettlementAvailability: "available",
    });
  });

  it("G: different chunk delivery boundaries yield identical inventory", async () => {
    const lines = [
      tobLine({ marketTicker: MARKET_A, receivedAtLocal: "2026-09-08T11:00:00.000Z" }),
      tobLine({ marketTicker: MARKET_B, receivedAtLocal: "2026-09-08T11:01:00.000Z" }),
      tobLine({ marketTicker: MARKET_A, receivedAtLocal: "2026-09-08T11:02:00.000Z" }),
    ];
    const joined = `${lines.join("\n")}\n`;

    async function extractWithChunks(chunks: string[]) {
      const files: Record<string, string> = {
        [`${RUN_DIR}/top-of-book.jsonl`]: "unused",
      };
      const io = createStreamingIo({
        files,
        dirs: [RUN_DIR],
        tobIterate: async (_path, options) => iterateLinesFromChunks(chunks, options),
      });
      return extractSelectedRunMarketInventory({
        io,
        captureRunDir: RUN_DIR,
        evaluatedAt: EVALUATED_AT,
      });
    }

    const byLine = await extractWithChunks(lines.map((line) => `${line}\n`));
    const byOdd = await extractWithChunks([
      joined.slice(0, 37),
      joined.slice(37, 91),
      joined.slice(91),
    ]);
    const byWhole = await extractWithChunks([joined]);

    expect(byLine.inventory).toEqual(byOdd.inventory);
    expect(byOdd.inventory).toEqual(byWhole.inventory);
  });

  it("H: missing run directory / stream open failure fail closed with path context", async () => {
    await expect(
      extractSelectedRunMarketInventory({
        io: createStreamingIo({ files: {}, dirs: [] }),
        captureRunDir: RUN_DIR,
        evaluatedAt: EVALUATED_AT,
      }),
    ).rejects.toMatchObject({
      name: "ForwardSettlementCoverageError",
      message: expect.stringContaining(RUN_DIR),
    });

    const files: Record<string, string> = {
      [`${RUN_DIR}/top-of-book.jsonl`]: "unused",
    };
    const io = createStreamingIo({
      files,
      dirs: [RUN_DIR],
      tobIterate: async () => {
        throw new Error("ENOENT: no such file or directory");
      },
    });

    await expect(
      extractSelectedRunMarketInventory({
        io,
        captureRunDir: RUN_DIR,
        evaluatedAt: EVALUATED_AT,
      }),
    ).rejects.toBeInstanceOf(ForwardSettlementCoverageError);

    await expect(
      extractSelectedRunMarketInventory({
        io,
        captureRunDir: RUN_DIR,
        evaluatedAt: EVALUATED_AT,
      }),
    ).rejects.toThrow(/Failed to stream inventory JSONL.*top-of-book\.jsonl/);
  });

  it("filesystem IO streams real temp TOB without invoking readFile on it", async () => {
    const root = mkdtempSync(join(tmpdir(), "m12-6e2-settlement-"));
    const runDir = join(root, RUN_ID);
    mkdirSync(runDir, { recursive: true });
    const tobPath = join(runDir, "top-of-book.jsonl");
    writeFileSync(
      tobPath,
      [
        tobLine({ marketTicker: MARKET_A, receivedAtLocal: "2026-09-08T11:00:00.000Z" }),
        tobLine({ marketTicker: MARKET_B, receivedAtLocal: "2026-09-08T11:01:00.000Z" }),
      ].join("\n"),
      "utf8",
    );

    const readFile = vi.fn((path: string) => {
      throw new Error(`unexpected readFile: ${path}`);
    });
    const iterateJsonl = vi.fn(async (path: string, options: Parameters<ForwardSettlementCoverageIo["iterateJsonl"]>[1]) => {
      // Mirror production: stream via readline, never readFileSync whole file.
      const stream = createReadStream(path, { encoding: "utf8" });
      const lineReader = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
      const summary = {
        linesRead: 0,
        blankLinesSkipped: 0,
        invalidLineCount: 0,
        recordsHandled: 0,
        truncated: false,
      };
      try {
        for await (const line of lineReader) {
          summary.linesRead += 1;
          const trimmed = line.trim();
          if (!trimmed) {
            summary.blankLinesSkipped += 1;
            continue;
          }
          const action = await options.onLine(trimmed, summary.linesRead);
          if (action === "skip") {
            summary.invalidLineCount += 1;
            continue;
          }
          summary.recordsHandled += 1;
          if (action === "stop") {
            break;
          }
        }
      } finally {
        lineReader.close();
        stream.destroy();
      }
      return summary;
    });

    const io: ForwardSettlementCoverageIo = {
      readFile,
      fileExists: (path) => path === runDir || path === tobPath,
      readdir: () => [],
      isDirectory: (path) => path === runDir,
      iterateJsonl,
    };

    try {
      const extracted = await extractSelectedRunMarketInventory({
        io,
        captureRunDir: runDir,
        evaluatedAt: EVALUATED_AT,
      });
      expect(extracted.inventory).toHaveLength(2);
      expect(iterateJsonl).toHaveBeenCalledTimes(1);
      expect(readFile).not.toHaveBeenCalled();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
