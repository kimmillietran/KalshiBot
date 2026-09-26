/**
 * Instrumented baseline replay using production bookReplay + stream helpers.
 * Does not modify production ingestion modules.
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";

import {
  applyTickToBook,
  bboFromBook,
  createEmptyBook,
  parseTickLine,
  shouldEmitBbo,
  type BboPoint,
  type ReconstructedBook,
} from "@/lib/data/research/externalBtcDelayedRepricingPilot/bookReplay";
import { CLOCK_POLICY } from "@/lib/data/research/externalBtcDelayedRepricingPilot/timingQuality";

import {
  emptyStageCounters,
  type ReplayImplementationId,
  type RunMetrics,
  type StageCounters,
  type WorkloadKind,
} from "./types";

function cpuMs(): { user: number; system: number } {
  const u = process.cpuUsage();
  return { user: u.user / 1000, system: u.system / 1000 };
}

function hashQuotes(quotes: readonly BboPoint[]): string {
  const h = createHash("sha256");
  for (const q of quotes) {
    h.update(
      `${q.timestampMs}|${q.bid}|${q.ask}|${q.bidSize}|${q.askSize}|${q.chainBreak}|${q.failClosed}\n`,
    );
  }
  return h.digest("hex");
}

function hashBook(book: ReconstructedBook): string {
  const h = createHash("sha256");
  const bids = [...book.bids.entries()].sort((a, b) => b[0] - a[0]);
  const asks = [...book.asks.entries()].sort((a, b) => a[0] - b[0]);
  for (const [p, q] of bids) h.update(`B${p}:${q}\n`);
  for (const [p, q] of asks) h.update(`A${p}:${q}\n`);
  h.update(`fail=${book.failClosed}|last=${book.lastEventId ?? ""}\n`);
  return h.digest("hex");
}

export type InstrumentedReplayResult = {
  quotes: BboPoint[];
  book: ReconstructedBook;
  counters: StageCounters;
  decompressedBytes: number;
  outputHashSha256: string;
  finalBookHashSha256: string;
};

async function streamZstdLinesBaseline(
  path: string,
  onLine: (line: string) => void,
  counters: StageCounters,
): Promise<number> {
  const t0 = process.hrtime.bigint();
  const child = spawn("zstd", ["-dc", path], { stdio: ["ignore", "pipe", "pipe"] });
  let decompressedBytes = 0;
  const stdout = child.stdout as Readable;
  stdout.on("data", (chunk: Buffer) => {
    decompressedBytes += chunk.length;
  });
  const rl = createInterface({ input: stdout, crlfDelay: Infinity });
  const lineDone = (async () => {
    for await (const line of rl) {
      const tSplit = process.hrtime.bigint();
      counters.linesSeen += 1;
      counters.lineSplitNs += Number(process.hrtime.bigint() - tSplit);
      await Promise.resolve(onLine(line));
    }
  })();
  const errChunks: Buffer[] = [];
  child.stderr?.on("data", (c: Buffer) => errChunks.push(c));
  await Promise.all([
    lineDone,
    new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(`zstd -dc failed (${code}): ${Buffer.concat(errChunks).toString("utf8")}`),
          );
        }
      });
    }),
  ]);
  counters.decompressNs += Number(process.hrtime.bigint() - t0);
  return decompressedBytes;
}

function applyLineToBook(
  line: string,
  book: ReconstructedBook,
  previous: BboPoint | null,
  quotes: BboPoint[],
  counters: StageCounters,
  profiled: boolean,
): BboPoint | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed[0] !== "[") return previous;

  let tick;
  if (profiled) {
    const t = process.hrtime.bigint();
    tick = parseTickLine(trimmed);
    counters.jsonParseNs += Number(process.hrtime.bigint() - t);
  } else {
    tick = parseTickLine(trimmed);
  }
  if (!tick) return previous;
  counters.linesParsed += 1;
  if (tick.msgType !== 0 && tick.msgType !== 1) return previous;

  if (profiled) {
    const t = process.hrtime.bigint();
    const { chainBreak } = applyTickToBook(book, tick);
    counters.bookMutationNs += Number(process.hrtime.bigint() - t);
    counters.bookMutations += 1;
    counters.ticksApplied += 1;
    if (tick.isSnapshot || tick.msgType === 0) counters.snapshotsApplied += 1;
    if (chainBreak) counters.continuityGaps += 1;

    const tScan = process.hrtime.bigint();
    const bbo = bboFromBook(
      book,
      {
        adapterTimestampNs: tick.adapterTimestampNs,
        exchangeTimestampNs: tick.exchangeTimestampNs,
      },
      chainBreak,
      CLOCK_POLICY.decisionClockDomain,
    );
    counters.bestScanNs += Number(process.hrtime.bigint() - tScan);
    counters.bestScans += 2;
    counters.bboConstructed += 1;
    if (!bbo) return previous;

    const tEmit = process.hrtime.bigint();
    if (shouldEmitBbo(previous, bbo)) {
      quotes.push(bbo);
      counters.quotesEmitted += 1;
      counters.actualBboChanges += 1;
      counters.quoteEmitNs += Number(process.hrtime.bigint() - tEmit);
      return bbo;
    }
    counters.quoteEmitNs += Number(process.hrtime.bigint() - tEmit);
    return previous;
  }

  const { chainBreak } = applyTickToBook(book, tick);
  counters.bookMutations += 1;
  counters.ticksApplied += 1;
  if (tick.isSnapshot || tick.msgType === 0) counters.snapshotsApplied += 1;
  if (chainBreak) counters.continuityGaps += 1;
  const bbo = bboFromBook(
    book,
    {
      adapterTimestampNs: tick.adapterTimestampNs,
      exchangeTimestampNs: tick.exchangeTimestampNs,
    },
    chainBreak,
    CLOCK_POLICY.decisionClockDomain,
  );
  counters.bestScans += 2;
  counters.bboConstructed += 1;
  if (!bbo) return previous;
  if (shouldEmitBbo(previous, bbo)) {
    quotes.push(bbo);
    counters.quotesEmitted += 1;
    counters.actualBboChanges += 1;
    return bbo;
  }
  return previous;
}

export async function replayBaselineAsync(
  path: string,
  options?: { profiled?: boolean; hashInputSeparately?: boolean },
): Promise<InstrumentedReplayResult & { inputSha256: string; hashNs: number }> {
  const profiled = options?.profiled ?? true;
  const counters = emptyStageCounters();
  const book = createEmptyBook();
  const quotes: BboPoint[] = [];
  let previous: BboPoint | null = null;
  let headerSeen = false;

  let hashNs = 0;
  let inputSha256 = "";
  if (options?.hashInputSeparately !== false) {
    const tHash = process.hrtime.bigint();
    inputSha256 = await new Promise<string>((resolve, reject) => {
      const hash = createHash("sha256");
      const stream = createReadStream(path);
      stream.on("data", (c) => hash.update(c));
      stream.on("error", reject);
      stream.on("end", () => resolve(hash.digest("hex")));
    });
    hashNs = Number(process.hrtime.bigint() - tHash);
    counters.hashNs = hashNs;
  }

  const decompressedBytes = await streamZstdLinesBaseline(
    path,
    (line) => {
      if (!headerSeen) {
        headerSeen = true;
        if (line.trim()[0] === "{") return;
      }
      previous = applyLineToBook(line, book, previous, quotes, counters, profiled);
    },
    counters,
  );

  return {
    quotes,
    book,
    counters,
    decompressedBytes,
    outputHashSha256: hashQuotes(quotes),
    finalBookHashSha256: hashBook(book),
    inputSha256,
    hashNs,
  };
}

export async function measureRun(input: {
  implementationId: ReplayImplementationId;
  workloadKind: WorkloadKind;
  path: string;
  profiled: boolean;
  repeats: number;
  runner: () => Promise<InstrumentedReplayResult & { inputSha256: string }>;
}): Promise<RunMetrics> {
  const beforeCpu = cpuMs();
  const wall0 = performance.now();
  let last: InstrumentedReplayResult & { inputSha256: string } | null = null;
  for (let r = 0; r < input.repeats; r += 1) {
    last = await input.runner();
  }
  const wallMs = performance.now() - wall0;
  const afterCpu = cpuMs();
  if (!last) {
    throw new Error("measureRun produced no result");
  }
  const mem = process.memoryUsage();
  const messageCount = last.counters.linesSeen * input.repeats;
  const decompressedBytes = last.decompressedBytes * input.repeats;
  return {
    implementationId: input.implementationId,
    workloadKind: input.workloadKind,
    profiled: input.profiled,
    wallMs,
    cpuUserMs: afterCpu.user - beforeCpu.user,
    cpuSystemMs: afterCpu.system - beforeCpu.system,
    messagesPerSec: wallMs > 0 ? (messageCount / wallMs) * 1000 : 0,
    decompressedMbPerSec:
      wallMs > 0 ? decompressedBytes / (1024 * 1024) / (wallMs / 1000) : 0,
    peakRssBytes: mem.rss,
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    externalBytes: mem.external,
    gcPauseMsApprox: null,
    counters: last.counters,
    outputHashSha256: last.outputHashSha256,
    finalBookHashSha256: last.finalBookHashSha256,
    inputSha256: last.inputSha256,
    decompressedBytes: last.decompressedBytes,
    messageCount: last.counters.linesSeen,
    repeats: input.repeats,
  };
}

export { hashBook, hashQuotes };
