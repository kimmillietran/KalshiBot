/**
 * Load one pilot day from Coinbase .txt.zst + Kalshi series-day ZIP (streaming).
 */

import { join } from "node:path";

import {
  applyTickToBook,
  bboFromBook,
  createEmptyBook,
  kalshiExecutableFromYesBbo,
  parseTickLine,
  shouldEmitBbo,
  type BboPoint,
} from "./bookReplay";
import {
  hashFileSha256,
  listZipMembers,
  streamZipMemberZstd,
  streamZstdTextFile,
} from "./streamCryptostructTick";
import { CLOCK_POLICY } from "./timingQuality";
import type { ExecutableQuote, SelectedContract } from "./types";

export type LoadedPilotDay = {
  utcDay: string;
  externalBbo: BboPoint[];
  contracts: SelectedContract[];
  quotesByTicker: Map<string, ExecutableQuote[]>;
  inputHashes: Record<string, string>;
};

function parseIsoToMs(value: string | undefined): number | null {
  if (!value) return null;
  // CryptoStruct headers use "YYYY-MM-DD HH:MM:SS" (UTC implied).
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

function tickerFromMember(member: string): string | null {
  // kalshi-KXBTC15M-26SEP142000-00-2026-09-15.txt.zst
  const base = member.split("/").pop() ?? member;
  const m = /^kalshi-(KXBTC15M-[^-]+-\d+)-/.exec(base);
  return m?.[1] ?? null;
}

async function replayToSparseBbo(
  onEachLine: (onLine: (line: string) => void) => Promise<void>,
  priceScale: "usd" | "probability",
): Promise<BboPoint[]> {
  const book = createEmptyBook();
  const out: BboPoint[] = [];
  let previous: BboPoint | null = null;
  let headerSeen = false;

  await onEachLine((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (!headerSeen) {
      headerSeen = true;
      if (trimmed[0] === "{") return; // masterdata
    }
    const tick = parseTickLine(trimmed);
    if (!tick || (tick.msgType !== 0 && tick.msgType !== 1 && tick.msgType !== 6)) {
      return;
    }
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
    // probability books already in [0,1]; USD books are absolute prices
    if (priceScale === "probability") {
      if (!(bbo.bid >= 0 && bbo.ask <= 1.0000001)) {
        // still emit; kalshiExecutable rounds
      }
    }
    if (shouldEmitBbo(previous, bbo)) {
      out.push(bbo);
      previous = bbo;
    }
  });

  return out;
}

export async function loadPilotDayFromFiles(input: {
  utcDay: string;
  coinbaseTickPath: string;
  kalshiZipPath: string;
}): Promise<LoadedPilotDay> {
  const inputHashes: Record<string, string> = {
    [`coinbase:${input.utcDay}`]: await hashFileSha256(input.coinbaseTickPath),
    [`kalshi-zip:${input.utcDay}`]: await hashFileSha256(input.kalshiZipPath),
  };

  const externalBbo = await replayToSparseBbo(
    (onLine) => streamZstdTextFile(input.coinbaseTickPath, onLine),
    "usd",
  );

  const members = (await listZipMembers(input.kalshiZipPath)).filter((m) =>
    m.endsWith(".txt.zst") && m.includes("KXBTC15M"),
  );

  const contracts: SelectedContract[] = [];
  const quotesByTicker = new Map<string, ExecutableQuote[]>();

  for (const member of members) {
    const ticker = tickerFromMember(member);
    if (!ticker) continue;

    let startMs: number | null = null;
    let expiryMs: number | null = null;
    let headerDone = false;
    const book = createEmptyBook();
    const quotes: ExecutableQuote[] = [];
    let previous: BboPoint | null = null;

    await streamZipMemberZstd(input.kalshiZipPath, member, (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (!headerDone) {
        headerDone = true;
        if (trimmed[0] === "{") {
          try {
            const header = JSON.parse(trimmed) as {
              instrument?: { start?: string; expiry?: string; code?: string };
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
      if (!tick || (tick.msgType !== 0 && tick.msgType !== 1 && tick.msgType !== 6)) {
        return;
      }
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
      if (shouldEmitBbo(previous, bbo)) {
        quotes.push(kalshiExecutableFromYesBbo(bbo));
        previous = bbo;
      }
    });

    if (startMs === null || expiryMs === null) {
      // Fallback from ticker suffix like 26SEP142000 → rough window not available; skip
      continue;
    }
    contracts.push({ ticker, startMs, expiryMs });
    quotesByTicker.set(ticker, quotes);
  }

  return {
    utcDay: input.utcDay,
    externalBbo,
    contracts,
    quotesByTicker,
    inputHashes,
  };
}

export function defaultCoinbasePath(root: string, utcDay: string): string {
  return join(root, `coinbase-BTC-USD-${utcDay}.txt.zst`);
}

export function defaultKalshiZipPath(root: string, utcDay: string): string {
  return join(root, `kalshi-btc-15m_${utcDay}.zip`);
}
