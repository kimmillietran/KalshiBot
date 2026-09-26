/**
 * Bounded-memory day ingest: stream ticks → sparse JSONL on disk (no day arrays retained).
 */

import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

import {
  applyTickToBook,
  bboFromBook,
  createEmptyBook,
  kalshiExecutableFromYesBbo,
  parseTickLine,
  shouldEmitBbo,
  BBO_EMISSION_POLICY,
  REPLAY_IMPLEMENTATION_VERSION,
  type BboPoint,
} from "./bookReplay";
import {
  atomicWriteJson,
  coinbaseManifestPath,
  coinbaseSparsePath,
  createJsonlAppender,
  fileSizeOrNull,
  kalshiManifestPath,
  kalshiSparsePath,
  quoteCacheIdentityKey,
  readCompleteQuoteCacheManifest,
  writeQuoteCacheManifest,
  type QuoteCacheIdentity,
  QUOTE_CACHE_SCHEMA_VERSION,
} from "./checkpoint";
import type { createProgressReporter } from "./progress";
import {
  hashFileSha256,
  listZipMembers,
  streamZipMemberZstd,
  streamZstdTextFile,
} from "./streamCryptostructTick";
import { CLOCK_POLICY } from "./timingQuality";
import type { ExecutableQuote, SelectedContract } from "./types";

function parseIsoToMs(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function tickerFromMember(member: string): string | null {
  const base = member.split("/").pop() ?? member;
  const m = /^kalshi-(KXBTC15M-[^-]+-\d+)-/.exec(base);
  return m?.[1] ?? null;
}

function makeCoinbaseIdentity(rawSha: string, utcDay: string): QuoteCacheIdentity {
  return {
    kind: "quote-cache",
    schemaVersion: QUOTE_CACHE_SCHEMA_VERSION,
    emissionPolicy: BBO_EMISSION_POLICY,
    replayImplementation: REPLAY_IMPLEMENTATION_VERSION,
    decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
    rawInputSha256: rawSha,
    sourceLabel: `coinbase:${utcDay}`,
  };
}

function makeKalshiIdentity(
  rawZipSha: string,
  utcDay: string,
  ticker: string,
  member: string,
): QuoteCacheIdentity {
  return {
    kind: "quote-cache",
    schemaVersion: QUOTE_CACHE_SCHEMA_VERSION,
    emissionPolicy: BBO_EMISSION_POLICY,
    replayImplementation: REPLAY_IMPLEMENTATION_VERSION,
    decisionClockDomain: CLOCK_POLICY.decisionClockDomain,
    rawInputSha256: createHash("sha256")
      .update(`${rawZipSha}|${member}|${ticker}`)
      .digest("hex"),
    sourceLabel: `kalshi:${utcDay}:${ticker}`,
  };
}

function contractsSidecarPath(cacheRoot: string, utcDay: string, zipSha: string): string {
  return join(
    cacheRoot,
    "quotes",
    "kalshi",
    `contracts-${utcDay}-${zipSha.slice(0, 16)}.json`,
  );
}

export async function* readJsonlRecords<T>(path: string): AsyncGenerator<T> {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    yield JSON.parse(trimmed) as T;
  }
}

export async function ingestCoinbaseSparseBbo(input: {
  utcDay: string;
  coinbaseTickPath: string;
  cacheRoot: string;
  progress?: ReturnType<typeof createProgressReporter>;
}): Promise<{
  identity: QuoteCacheIdentity;
  key: string;
  jsonlPath: string;
  quoteCount: number;
  rawSha256: string;
  reused: boolean;
}> {
  const rawSha256 = await hashFileSha256(input.coinbaseTickPath);
  const identity = makeCoinbaseIdentity(rawSha256, input.utcDay);
  const key = quoteCacheIdentityKey(identity);
  const jsonlPath = coinbaseSparsePath(input.cacheRoot, key);
  const manifestPath = coinbaseManifestPath(input.cacheRoot, key);
  const existing = readCompleteQuoteCacheManifest(manifestPath, identity);
  if (existing && existsSync(jsonlPath)) {
    input.progress?.note(`reuse coinbase cache ${key.slice(0, 12)}`);
    return {
      identity,
      key,
      jsonlPath,
      quoteCount: existing.quoteCount,
      rawSha256,
      reused: true,
    };
  }

  input.progress?.setStage("ingest-coinbase", input.coinbaseTickPath);
  input.progress?.setCompressedFileBytes(fileSizeOrNull(input.coinbaseTickPath));

  const book = createEmptyBook();
  const appender = createJsonlAppender(jsonlPath);
  let previous: BboPoint | null = null;
  let headerSeen = false;
  let quoteCount = 0;
  let messagesSeen = 0;
  let bookApplied = 0;
  let decompressedBytesApprox = 0;
  const outputHash = createHash("sha256");

  await streamZstdTextFile(input.coinbaseTickPath, (line) => {
    const byteLen = Buffer.byteLength(line, "utf8") + 1;
    decompressedBytesApprox += byteLen;
    messagesSeen += 1;
    input.progress?.bump({ messagesSeen: 1, decompressedBytesApprox: byteLen });
    const trimmed = line.trim();
    if (!trimmed) return;
    if (!headerSeen) {
      headerSeen = true;
      if (trimmed[0] === "{") return;
    }
    const tick = parseTickLine(trimmed);
    if (!tick || (tick.msgType !== 0 && tick.msgType !== 1)) return;
    bookApplied += 1;
    input.progress?.bump({ bookMessagesApplied: 1 });
    const { chainBreak } = applyTickToBook(book, tick);
    const bbo = bboFromBook(
      book,
      {
        adapterTimestampNs: tick.adapterTimestampNs,
        exchangeTimestampNs: tick.exchangeTimestampNs,
      },
      chainBreak,
      CLOCK_POLICY.decisionClockDomain,
    );
    if (!bbo) return;
    if (!shouldEmitBbo(previous, bbo)) return;
    appender.writeLine(bbo);
    outputHash.update(JSON.stringify(bbo));
    outputHash.update("\n");
    previous = bbo;
    quoteCount += 1;
    input.progress?.bump({ quotesEmitted: 1 });
  });

  await appender.close();
  writeQuoteCacheManifest(manifestPath, {
    ...identity,
    complete: true,
    outputSha256: outputHash.digest("hex"),
    quoteCount,
    compressedBytesRead: fileSizeOrNull(input.coinbaseTickPath),
    decompressedBytesApprox,
    messagesSeen,
    bookMessagesApplied: bookApplied,
    writtenAtIso: new Date().toISOString(),
  });

  return {
    identity,
    key,
    jsonlPath,
    quoteCount,
    rawSha256,
    reused: false,
  };
}

export async function ingestKalshiDayQuotes(input: {
  utcDay: string;
  kalshiZipPath: string;
  cacheRoot: string;
  progress?: ReturnType<typeof createProgressReporter>;
}): Promise<{
  zipSha256: string;
  contracts: SelectedContract[];
  quotesByTickerPaths: Map<string, { key: string; jsonlPath: string; quoteCount: number }>;
}> {
  const zipSha256 = await hashFileSha256(input.kalshiZipPath);
  const sidecar = contractsSidecarPath(input.cacheRoot, input.utcDay, zipSha256);
  const members = (await listZipMembers(input.kalshiZipPath)).filter(
    (m) => m.endsWith(".txt.zst") && m.includes("KXBTC15M"),
  );

  const memberMeta: Array<{
    member: string;
    ticker: string;
    identity: QuoteCacheIdentity;
    key: string;
    jsonlPath: string;
    manifestPath: string;
  }> = [];

  for (const member of members) {
    const ticker = tickerFromMember(member);
    if (!ticker) continue;
    const identity = makeKalshiIdentity(zipSha256, input.utcDay, ticker, member);
    const key = quoteCacheIdentityKey(identity);
    memberMeta.push({
      member,
      ticker,
      identity,
      key,
      jsonlPath: kalshiSparsePath(input.cacheRoot, key),
      manifestPath: kalshiManifestPath(input.cacheRoot, key),
    });
  }

  const allCached =
    existsSync(sidecar)
    && memberMeta.every((m) => {
      const man = readCompleteQuoteCacheManifest(m.manifestPath, m.identity);
      return Boolean(man && existsSync(m.jsonlPath));
    });

  if (allCached) {
    try {
      const saved = JSON.parse(readFileSync(sidecar, "utf8")) as {
        contracts: SelectedContract[];
        keys: Record<string, { key: string; quoteCount: number }>;
      };
      if (
        saved
        && Array.isArray(saved.contracts)
        && saved.keys
        && typeof saved.keys === "object"
      ) {
        const quotesByTickerPaths = new Map<
          string,
          { key: string; jsonlPath: string; quoteCount: number }
        >();
        for (const [ticker, meta] of Object.entries(saved.keys)) {
          quotesByTickerPaths.set(ticker, {
            key: meta.key,
            jsonlPath: kalshiSparsePath(input.cacheRoot, meta.key),
            quoteCount: meta.quoteCount,
          });
        }
        input.progress?.note(`reuse kalshi caches for ${input.utcDay}`);
        return { zipSha256, contracts: saved.contracts, quotesByTickerPaths };
      }
    } catch {
      // Corrupt sidecar: fall through and rebuild from zip members.
    }
  }

  const contracts: SelectedContract[] = [];
  const quotesByTickerPaths = new Map<
    string,
    { key: string; jsonlPath: string; quoteCount: number }
  >();

  for (const meta of memberMeta) {
    input.progress?.setStage("ingest-kalshi-member", meta.member);
    const book = createEmptyBook();
    const appender = createJsonlAppender(meta.jsonlPath);
    let previous: BboPoint | null = null;
    let headerDone = false;
    let startMs: number | null = null;
    let expiryMs: number | null = null;
    let quoteCount = 0;
    let messagesSeen = 0;
    let bookApplied = 0;
    let decompressedBytesApprox = 0;
    const outputHash = createHash("sha256");

    await streamZipMemberZstd(input.kalshiZipPath, meta.member, (line) => {
      const byteLen = Buffer.byteLength(line, "utf8") + 1;
      decompressedBytesApprox += byteLen;
      messagesSeen += 1;
      input.progress?.bump({ messagesSeen: 1, decompressedBytesApprox: byteLen });
      const trimmed = line.trim();
      if (!trimmed) return;
      if (!headerDone) {
        headerDone = true;
        if (trimmed[0] === "{") {
          try {
            const header = JSON.parse(trimmed) as {
              instrument?: { start?: string; expiry?: string };
            };
            startMs = parseIsoToMs(header.instrument?.start);
            expiryMs = parseIsoToMs(header.instrument?.expiry);
          } catch {
            // ignore
          }
        }
        return;
      }
      const tick = parseTickLine(trimmed);
      if (!tick || (tick.msgType !== 0 && tick.msgType !== 1)) return;
      bookApplied += 1;
      input.progress?.bump({ bookMessagesApplied: 1 });
      const { chainBreak } = applyTickToBook(book, tick);
      const bbo = bboFromBook(
        book,
        {
          adapterTimestampNs: tick.adapterTimestampNs,
          exchangeTimestampNs: tick.exchangeTimestampNs,
        },
        chainBreak,
        CLOCK_POLICY.decisionClockDomain,
      );
      if (!bbo) return;
      if (!shouldEmitBbo(previous, bbo)) return;
      const quote = kalshiExecutableFromYesBbo(bbo);
      appender.writeLine(quote);
      outputHash.update(JSON.stringify(quote));
      outputHash.update("\n");
      previous = bbo;
      quoteCount += 1;
      input.progress?.bump({ quotesEmitted: 1 });
    });

    await appender.close();
    writeQuoteCacheManifest(meta.manifestPath, {
      ...meta.identity,
      complete: true,
      outputSha256: outputHash.digest("hex"),
      quoteCount,
      compressedBytesRead: null,
      decompressedBytesApprox,
      messagesSeen,
      bookMessagesApplied: bookApplied,
      writtenAtIso: new Date().toISOString(),
    });

    if (startMs !== null && expiryMs !== null) {
      contracts.push({ ticker: meta.ticker, startMs, expiryMs });
      quotesByTickerPaths.set(meta.ticker, {
        key: meta.key,
        jsonlPath: meta.jsonlPath,
        quoteCount,
      });
    }
  }

  mkdirSync(join(input.cacheRoot, "quotes", "kalshi"), { recursive: true });
  const keys: Record<string, { key: string; quoteCount: number }> = {};
  for (const [ticker, meta] of quotesByTickerPaths) {
    keys[ticker] = { key: meta.key, quoteCount: meta.quoteCount };
  }
  atomicWriteJson(sidecar, { zipSha256, contracts, keys });

  return { zipSha256, contracts, quotesByTickerPaths };
}

export async function loadQuotesArray(jsonlPath: string): Promise<ExecutableQuote[]> {
  const out: ExecutableQuote[] = [];
  for await (const q of readJsonlRecords<ExecutableQuote>(jsonlPath)) {
    out.push(q);
  }
  return out;
}
