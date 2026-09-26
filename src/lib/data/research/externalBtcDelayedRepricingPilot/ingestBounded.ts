/**
 * Bounded-memory day ingest: stream ticks → sparse JSONL on disk (no day arrays retained).
 */

import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
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
import {
  CONTRACT_METADATA_VERSION,
  isCurrentContractSidecar,
  resolveContractWindow,
  type ContractSidecarV1,
} from "./contractMetadata";
import type { createProgressReporter } from "./progress";
import {
  hashFileSha256,
  listZipMembers,
  peekZipMemberFirstLine,
  streamZipMemberZstd,
  streamZstdTextFile,
} from "./streamCryptostructTick";
import { CLOCK_POLICY } from "./timingQuality";
import type { ExecutableQuote, SelectedContract } from "./types";

async function quoteCacheMatchesManifest(
  jsonlPath: string,
  expectedSha256: string,
): Promise<boolean> {
  try {
    const actual = await hashFileSha256(jsonlPath);
    return actual === expectedSha256;
  } catch {
    return false;
  }
}

function invalidateQuoteCache(jsonlPath: string, manifestPath: string): void {
  for (const path of [jsonlPath, manifestPath]) {
    try {
      unlinkSync(path);
    } catch {
      // ignore missing
    }
  }
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

function emptyDerivationStats(): ContractSidecarV1["derivationStats"] {
  return {
    headerExpiryUsed: 0,
    tickerCloseUsed: 0,
    rejected: 0,
    rejectReasons: {},
  };
}

function noteReject(
  stats: ContractSidecarV1["derivationStats"],
  source: string,
): void {
  stats.rejected += 1;
  stats.rejectReasons[source] = (stats.rejectReasons[source] ?? 0) + 1;
}

function writeContractsSidecar(
  sidecar: string,
  payload: ContractSidecarV1,
): void {
  mkdirSync(dirname(sidecar), { recursive: true });
  atomicWriteJson(sidecar, payload);
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
    const intact = await quoteCacheMatchesManifest(jsonlPath, existing.outputSha256);
    if (intact) {
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
    input.progress?.note(`rebuild coinbase cache (hash mismatch) ${key.slice(0, 12)}`);
    invalidateQuoteCache(jsonlPath, manifestPath);
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

type MemberMeta = {
  member: string;
  ticker: string;
  identity: QuoteCacheIdentity;
  key: string;
  jsonlPath: string;
  manifestPath: string;
};

async function allMemberQuoteCachesIntact(memberMeta: readonly MemberMeta[]): Promise<boolean> {
  for (const m of memberMeta) {
    const man = readCompleteQuoteCacheManifest(m.manifestPath, m.identity);
    if (!man || !existsSync(m.jsonlPath)) return false;
    if (!(await quoteCacheMatchesManifest(m.jsonlPath, man.outputSha256))) {
      invalidateQuoteCache(m.jsonlPath, m.manifestPath);
      return false;
    }
  }
  return true;
}

/**
 * Rebuild contract sidecar from headers + ticker close without re-streaming quotes.
 * Used when quote JSONL caches are intact but contract metadata version changed
 * (e.g. expiry-null recovery).
 */
function rebuildContractsFromCachedQuotes(input: {
  utcDay: string;
  kalshiZipPath: string;
  zipSha256: string;
  memberMeta: readonly MemberMeta[];
  progress?: ReturnType<typeof createProgressReporter>;
}): {
  contracts: SelectedContract[];
  quotesByTickerPaths: Map<string, { key: string; jsonlPath: string; quoteCount: number }>;
  derivationStats: ContractSidecarV1["derivationStats"];
} {
  input.progress?.setStage("rebuild-contract-metadata", input.utcDay);
  const contracts: SelectedContract[] = [];
  const quotesByTickerPaths = new Map<
    string,
    { key: string; jsonlPath: string; quoteCount: number }
  >();
  const derivationStats = emptyDerivationStats();

  for (const meta of input.memberMeta) {
    const man = readCompleteQuoteCacheManifest(meta.manifestPath, meta.identity);
    if (!man || !existsSync(meta.jsonlPath)) {
      throw new Error(
        `rebuild-contract-metadata requires intact quote cache for ${meta.ticker}`,
      );
    }
    const headerLine = peekZipMemberFirstLine(input.kalshiZipPath, meta.member);
    let headerStart: string | null = null;
    let headerExpiry: string | null = null;
    if (headerLine && headerLine[0] === "{") {
      try {
        const header = JSON.parse(headerLine) as {
          instrument?: { start?: string | null; expiry?: string | null };
        };
        headerStart = header.instrument?.start ?? null;
        headerExpiry = header.instrument?.expiry ?? null;
      } catch {
        // fall through to resolve rejection
      }
    }
    const resolved = resolveContractWindow({
      ticker: meta.ticker,
      headerStart,
      headerExpiry,
    });
    if (!resolved.ok) {
      noteReject(derivationStats, resolved.source);
      input.progress?.note(`skip contract ${meta.ticker}: ${resolved.reason}`);
      continue;
    }
    if (resolved.source === "header-start+header-expiry") {
      derivationStats.headerExpiryUsed += 1;
    } else {
      derivationStats.tickerCloseUsed += 1;
    }
    contracts.push(resolved.contract);
    quotesByTickerPaths.set(meta.ticker, {
      key: meta.key,
      jsonlPath: meta.jsonlPath,
      quoteCount: man.quoteCount,
    });
  }

  return { contracts, quotesByTickerPaths, derivationStats };
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
  contractMetadataVersion: typeof CONTRACT_METADATA_VERSION;
  derivationStats: ContractSidecarV1["derivationStats"];
  quotesReused: boolean;
  sidecarRebuilt: boolean;
}> {
  const zipSha256 = await hashFileSha256(input.kalshiZipPath);
  const sidecar = contractsSidecarPath(input.cacheRoot, input.utcDay, zipSha256);
  const members = (await listZipMembers(input.kalshiZipPath)).filter(
    (m) => m.endsWith(".txt.zst") && m.includes("KXBTC15M"),
  );

  const memberMeta: MemberMeta[] = [];

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

  const quotesIntact = await allMemberQuoteCachesIntact(memberMeta);

  if (quotesIntact && existsSync(sidecar)) {
    try {
      const saved = JSON.parse(readFileSync(sidecar, "utf8")) as unknown;
      if (isCurrentContractSidecar(saved) && saved.zipSha256 === zipSha256) {
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
        input.progress?.note(
          `reuse kalshi caches+sidecar for ${input.utcDay} `
            + `(contracts=${saved.contracts.length})`,
        );
        return {
          zipSha256,
          contracts: saved.contracts,
          quotesByTickerPaths,
          contractMetadataVersion: CONTRACT_METADATA_VERSION,
          derivationStats: saved.derivationStats,
          quotesReused: true,
          sidecarRebuilt: false,
        };
      }
    } catch {
      // Corrupt sidecar: rebuild metadata below when quotes intact.
    }
  }

  // Quote caches intact but sidecar missing/stale/wrong version → rebuild sidecar only.
  if (quotesIntact && memberMeta.length > 0) {
    const rebuilt = rebuildContractsFromCachedQuotes({
      utcDay: input.utcDay,
      kalshiZipPath: input.kalshiZipPath,
      zipSha256,
      memberMeta,
      progress: input.progress,
    });
    const keys: Record<string, { key: string; quoteCount: number }> = {};
    for (const [ticker, meta] of rebuilt.quotesByTickerPaths) {
      keys[ticker] = { key: meta.key, quoteCount: meta.quoteCount };
    }
    writeContractsSidecar(sidecar, {
      zipSha256,
      contractMetadataVersion: CONTRACT_METADATA_VERSION,
      contracts: rebuilt.contracts,
      keys,
      derivationStats: rebuilt.derivationStats,
    });
    input.progress?.note(
      `rebuilt contract sidecar ${input.utcDay}: `
        + `${rebuilt.contracts.length} contracts `
        + `(header=${rebuilt.derivationStats.headerExpiryUsed}, `
        + `ticker=${rebuilt.derivationStats.tickerCloseUsed}, `
        + `rejected=${rebuilt.derivationStats.rejected})`,
    );
    return {
      zipSha256,
      contracts: rebuilt.contracts,
      quotesByTickerPaths: rebuilt.quotesByTickerPaths,
      contractMetadataVersion: CONTRACT_METADATA_VERSION,
      derivationStats: rebuilt.derivationStats,
      quotesReused: true,
      sidecarRebuilt: true,
    };
  }

  const contracts: SelectedContract[] = [];
  const quotesByTickerPaths = new Map<
    string,
    { key: string; jsonlPath: string; quoteCount: number }
  >();
  const derivationStats = emptyDerivationStats();

  for (const meta of memberMeta) {
    input.progress?.setStage("ingest-kalshi-member", meta.member);
    const book = createEmptyBook();
    const appender = createJsonlAppender(meta.jsonlPath);
    let previous: BboPoint | null = null;
    let headerDone = false;
    let headerStart: string | null = null;
    let headerExpiry: string | null = null;
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
              instrument?: { start?: string | null; expiry?: string | null };
            };
            headerStart = header.instrument?.start ?? null;
            headerExpiry = header.instrument?.expiry ?? null;
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

    const resolved = resolveContractWindow({
      ticker: meta.ticker,
      headerStart,
      headerExpiry,
    });
    if (!resolved.ok) {
      noteReject(derivationStats, resolved.source);
      continue;
    }
    if (resolved.source === "header-start+header-expiry") {
      derivationStats.headerExpiryUsed += 1;
    } else {
      derivationStats.tickerCloseUsed += 1;
    }
    contracts.push(resolved.contract);
    quotesByTickerPaths.set(meta.ticker, {
      key: meta.key,
      jsonlPath: meta.jsonlPath,
      quoteCount,
    });
  }

  const keys: Record<string, { key: string; quoteCount: number }> = {};
  for (const [ticker, meta] of quotesByTickerPaths) {
    keys[ticker] = { key: meta.key, quoteCount: meta.quoteCount };
  }
  writeContractsSidecar(sidecar, {
    zipSha256,
    contractMetadataVersion: CONTRACT_METADATA_VERSION,
    contracts,
    keys,
    derivationStats,
  });

  return {
    zipSha256,
    contracts,
    quotesByTickerPaths,
    contractMetadataVersion: CONTRACT_METADATA_VERSION,
    derivationStats,
    quotesReused: false,
    sidecarRebuilt: false,
  };
}

export async function loadQuotesArray(jsonlPath: string): Promise<ExecutableQuote[]> {
  const out: ExecutableQuote[] = [];
  for await (const q of readJsonlRecords<ExecutableQuote>(jsonlPath)) {
    out.push(q);
  }
  return out;
}
