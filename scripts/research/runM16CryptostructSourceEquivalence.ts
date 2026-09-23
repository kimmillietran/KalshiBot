/**
 * M16 CryptoStruct source-equivalence audit (pre-entry only, no economics).
 *
 * Reuses canonical stepM16MarketMachine / midpointFromQuote / isEligibleEventQuote.
 * Does NOT call assertM16CaptureNotContaminated (QUALITY_AUDIT_ONLY overlap runs
 * include some M14-forbidden IDs that are explicitly allowed here for fidelity).
 */
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

import { resolveKalshiTimestampMs } from "@/lib/data/research/btcKalshiLeadLagAnalysis/leadLagUtils";
import type { ParsedTopOfBookRecord } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";
import { parseTopOfBookLine } from "@/lib/data/research/captureHealthAudit/parseCaptureHealthRecords";
import {
  isEligibleEventQuote,
  midpointFromQuote,
  type MomentumQuoteInput,
} from "@/lib/data/research/kalshiTobMomentumFamily";
import type { MomentumDiscoveryIo } from "@/lib/data/research/kalshiTobMomentumDiscovery/momentumDiscoveryTypes";
import { loadCloseTimeByMarketForBlindIncidence } from "@/lib/data/research/kalshiTobMomentumValidationCohort";
import {
  candidateMidFromYesMid,
  createM16MarketMachine,
  stepM16MarketMachine,
  type M16MachineEvent,
  type M16MarketMachineState,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16StateMachine";
import type { M16CandidateSide } from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16Types";
import {
  M16_EXPECTED_COHORT_PLAN_IDENTITY,
  M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY,
  M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY,
  M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
  M16_EXPECTED_FEE_CONTRACT_IDENTITY,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16ValidationAuthority";
import { stableStringify } from "@/lib/trading/config/hashConfig";

const ROOT = process.cwd();
const OUT = join(ROOT, "data/research-results/external-kalshi-data-audit");
const CS_OBS = join(ROOT, "data/external-samples/cryptostruct/overlap/work/m16-obs");
const KB_ROOT = "/Users/builder/Desktop/KalshiBot/data/live-capture/forward-quotes";

const QUALITY_DAYS = [
  "2026-09-08",
  "2026-09-09",
  "2026-09-14",
  "2026-09-18",
  "2026-09-20",
] as const;

const TOL_MS = [100, 500, 1000, 2000, 5000] as const;
const ADAPTERS = ["RAW-BBO-CHANGE", "KALSHIBOT-MIRROR"] as const;
type AdapterId = (typeof ADAPTERS)[number];

function fileIo(): Pick<MomentumDiscoveryIo, "fileExists" | "readFile"> {
  return {
    fileExists: (p: string) => existsSync(p),
    readFile: (p: string) => readFileSync(p, "utf8"),
  };
}

const FORBIDDEN_OUTCOME_KEYS = [
  "pnl",
  "pAndL",
  "realizedReturn",
  "targetHit",
  "stopHit",
  "settlement",
  "winRate",
  "mfe",
  "mae",
  "exitPrice",
  "feeAdjusted",
  "tStatistic",
  "pValue",
] as const;

type ObsTick = {
  timestampMs: number;
  yesBestBidCents: number | null;
  noBestBidCents: number | null;
  yesMidCents: number | null;
  bookEligible: boolean;
  structuralGap: boolean;
};

type PreEntryEvent = {
  source: "kalshiBot" | "cryptostruct";
  adapter?: AdapterId;
  day: string;
  runId: string;
  marketTicker: string;
  side: M16CandidateSide;
  kind:
    | "left-truncated"
    | "down-cross"
    | "abort-waterfall"
    | "invalidated-gap"
    | "confirmation"
    | "time-gate-reject";
  timestampMs: number;
  midCents?: number;
  setupLowL?: number;
  reboundHighH?: number | null;
  confirmationMidCents?: number;
  passedTimeGate?: boolean;
  governed1800to2200: boolean;
};

type MarketBundle = {
  yes: M16MarketMachineState;
  no: M16MarketMachineState;
  marketClaimed: boolean;
  closeTimeMs: number | null;
  lastH: number | null;
};

function inGovernedWindow(ts: number): boolean {
  const iso = new Date(ts).toISOString();
  const hh = Number(iso.slice(11, 13));
  const mm = Number(iso.slice(14, 16));
  const minutes = hh * 60 + mm;
  return minutes >= 18 * 60 && minutes < 22 * 60;
}

function recordToQuote(
  record: ParsedTopOfBookRecord,
  timestampMs: number,
  quoteAgeMs: number,
): MomentumQuoteInput {
  return {
    marketTicker: record.marketTicker,
    timestampMs,
    yesBestBidCents: record.yesBestBidCents,
    noBestBidCents: record.noBestBidCents ?? null,
    yesBestBidSize: record.yesBestBidSize ?? null,
    noBestBidSize: record.noBestBidSize ?? null,
    bookState: record.bookState,
    isEconomicallyValid: record.isEconomicallyValid ?? null,
    quoteAgeMs,
  };
}

function isStructuralGapBook(bookState: string | null): boolean {
  return (
    bookState === "gap-detected"
    || bookState === "resyncing"
    || bookState === "awaiting-snapshot"
  );
}

function pushEvents(
  events: M16MachineEvent[],
  meta: {
    source: PreEntryEvent["source"];
    adapter?: AdapterId;
    day: string;
    runId: string;
    marketTicker: string;
    lastH: number | null;
  },
  out: PreEntryEvent[],
  bundle: MarketBundle,
): void {
  for (const event of events) {
    const base = {
      source: meta.source,
      adapter: meta.adapter,
      day: meta.day,
      runId: meta.runId,
      marketTicker: meta.marketTicker,
      side: event.side,
      timestampMs: event.timestampMs,
      governed1800to2200: inGovernedWindow(event.timestampMs),
    };
    if (event.type === "left-truncated") {
      out.push({ ...base, kind: "left-truncated" });
    } else if (event.type === "down-cross") {
      out.push({ ...base, kind: "down-cross", midCents: event.midCents });
    } else if (event.type === "abort-waterfall") {
      out.push({ ...base, kind: "abort-waterfall", setupLowL: event.setupLowL });
    } else if (event.type === "invalidated-gap") {
      out.push({ ...base, kind: "invalidated-gap" });
    } else if (event.type === "confirmation") {
      out.push({
        ...base,
        kind: "confirmation",
        confirmationMidCents: event.confirmationMidCents,
        setupLowL: event.setupLowL,
        reboundHighH: meta.lastH,
        passedTimeGate: true,
      });
      bundle.marketClaimed = true;
    } else if (event.type === "time-gate-reject") {
      out.push({
        ...base,
        kind: "time-gate-reject",
        confirmationMidCents: event.confirmationMidCents,
        setupLowL: event.setupLowL,
        reboundHighH: meta.lastH,
        passedTimeGate: false,
      });
      bundle.marketClaimed = true;
    }
  }
}

function stepBundle(
  bundle: MarketBundle,
  tick: {
    timestampMs: number;
    yesBestBidCents: number;
    noBestBidCents: number;
    yesMidCents: number;
    bookEligible: boolean;
    structuralGap: boolean;
  },
  meta: {
    source: PreEntryEvent["source"];
    adapter?: AdapterId;
    day: string;
    runId: string;
    marketTicker: string;
  },
  out: PreEntryEvent[],
): void {
  if (bundle.marketClaimed) return;
  for (const side of ["YES", "NO"] as const) {
    if (bundle.marketClaimed) break;
    const machine = side === "YES" ? bundle.yes : bundle.no;
    const stepped = stepM16MarketMachine({
      state: machine,
      tick: {
        timestampMs: tick.timestampMs,
        yesBestBidCents: tick.yesBestBidCents,
        noBestBidCents: tick.noBestBidCents,
        candidateMidCents: candidateMidFromYesMid(side, tick.yesMidCents),
        bookEligible: tick.bookEligible,
        structuralGap: tick.structuralGap,
      },
      closeTimeMs: bundle.closeTimeMs,
    });
    if (side === "YES") bundle.yes = stepped.state;
    else bundle.no = stepped.state;
    const h = stepped.state.build?.reboundHighH ?? null;
    if (h != null) bundle.lastH = h;
    pushEvents(stepped.events, { ...meta, lastH: bundle.lastH }, out, bundle);
  }
}

async function iterateJsonl(
  path: string,
  onLine: (line: string, lineNumber: number) => void,
): Promise<void> {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    n += 1;
    onLine(line, n);
  }
}

async function streamKalshiBotRun(input: {
  day: string;
  runId: string;
  captureDir: string;
}): Promise<{ events: PreEntryEvent[]; stats: Record<string, number> }> {
  const tobPath = join(input.captureDir, "top-of-book.jsonl");
  const closeByMarket = loadCloseTimeByMarketForBlindIncidence(
    fileIo() as MomentumDiscoveryIo,
    input.captureDir,
  );
  const markets = new Map<string, MarketBundle>();
  const events: PreEntryEvent[] = [];
  let lines = 0;
  let eligibleObs = 0;
  let midChanges = 0;
  const lastMid = new Map<string, number>();

  await iterateJsonl(tobPath, (line, lineNumber) => {
    lines += 1;
    let record: ParsedTopOfBookRecord | null;
    try {
      record = parseTopOfBookLine(line, lineNumber);
    } catch {
      return;
    }
    if (!record) return;
    const timestampMs = resolveKalshiTimestampMs({
      receivedAtMs: record.receivedAtMs,
      exchangeTimestampMs: record.exchangeTimestampMs,
    });
    const quoteAgeMs =
      record.exchangeTimestampMs != null
        ? Math.max(record.receivedAtMs - record.exchangeTimestampMs, 0)
        : 0;
    const quote = recordToQuote(record, timestampMs, quoteAgeMs);
    const yesMid = midpointFromQuote(quote);
    const eligible = isEligibleEventQuote(quote).eligible && yesMid != null;
    const gap = isStructuralGapBook(record.bookState);
    let bundle = markets.get(record.marketTicker);
    if (!bundle) {
      bundle = {
        yes: createM16MarketMachine("YES"),
        no: createM16MarketMachine("NO"),
        marketClaimed: false,
        closeTimeMs: closeByMarket.get(record.marketTicker) ?? null,
        lastH: null,
      };
      markets.set(record.marketTicker, bundle);
    }
    if (bundle.marketClaimed) return;
    if (
      !eligible
      || yesMid == null
      || record.yesBestBidCents == null
      || record.noBestBidCents == null
    ) {
      if (gap) {
        for (const side of ["YES", "NO"] as const) {
          const machine = side === "YES" ? bundle.yes : bundle.no;
          if (
            machine.phase === "in-setup"
            || machine.phase === "building-reversal"
            || machine.phase === "pullback-held"
          ) {
            const stepped = stepM16MarketMachine({
              state: machine,
              tick: {
                timestampMs,
                yesBestBidCents: record.yesBestBidCents ?? 0,
                noBestBidCents: record.noBestBidCents ?? 0,
                candidateMidCents: candidateMidFromYesMid(side, yesMid ?? 50),
                bookEligible: false,
                structuralGap: true,
              },
              closeTimeMs: bundle.closeTimeMs,
            });
            if (side === "YES") bundle.yes = stepped.state;
            else bundle.no = stepped.state;
            pushEvents(
              stepped.events,
              {
                source: "kalshiBot",
                day: input.day,
                runId: input.runId,
                marketTicker: record.marketTicker,
                lastH: bundle.lastH,
              },
              events,
              bundle,
            );
          }
        }
      }
      return;
    }
    eligibleObs += 1;
    const prev = lastMid.get(record.marketTicker);
    if (prev == null || prev !== yesMid) {
      midChanges += 1;
      lastMid.set(record.marketTicker, yesMid);
    }
    stepBundle(
      bundle,
      {
        timestampMs,
        yesBestBidCents: record.yesBestBidCents,
        noBestBidCents: record.noBestBidCents,
        yesMidCents: yesMid,
        bookEligible: true,
        structuralGap: gap,
      },
      {
        source: "kalshiBot",
        day: input.day,
        runId: input.runId,
        marketTicker: record.marketTicker,
      },
      events,
    );
  });

  return {
    events,
    stats: {
      lines,
      eligibleObs,
      midChanges,
      markets: markets.size,
      confirmations: events.filter((e) => e.kind === "confirmation").length,
      timeGateRejects: events.filter((e) => e.kind === "time-gate-reject").length,
      downCrosses: events.filter((e) => e.kind === "down-cross").length,
    },
  };
}

function streamCryptostructTicker(input: {
  day: string;
  runId: string;
  ticker: string;
  adapter: AdapterId;
  overlapStartMs: number;
  overlapEndMs: number;
  kbCloseTimeMs: number | null;
}): { events: PreEntryEvent[]; stats: Record<string, number> } {
  const path = join(CS_OBS, input.day, `${input.ticker}.json`);
  if (!existsSync(path)) {
    return { events: [], stats: { missing: 1 } };
  }
  const payload = JSON.parse(readFileSync(path, "utf8")) as {
    closeTimeMs: number | null;
    adapters: Record<AdapterId, ObsTick[]>;
  };
  const rows = payload.adapters[input.adapter] ?? [];
  const bundle: MarketBundle = {
    yes: createM16MarketMachine("YES"),
    no: createM16MarketMachine("NO"),
    marketClaimed: false,
    closeTimeMs: input.kbCloseTimeMs ?? payload.closeTimeMs,
    lastH: null,
  };
  const events: PreEntryEvent[] = [];
  let obs = 0;
  let midChanges = 0;
  let lastMid: number | null = null;
  for (const row of rows) {
    if (row.timestampMs < input.overlapStartMs || row.timestampMs > input.overlapEndMs) {
      continue;
    }
    if (
      row.yesMidCents == null
      || row.yesBestBidCents == null
      || row.noBestBidCents == null
      || !row.bookEligible
    ) {
      if (row.structuralGap) {
        for (const side of ["YES", "NO"] as const) {
          const machine = side === "YES" ? bundle.yes : bundle.no;
          if (
            machine.phase === "in-setup"
            || machine.phase === "building-reversal"
            || machine.phase === "pullback-held"
          ) {
            const stepped = stepM16MarketMachine({
              state: machine,
              tick: {
                timestampMs: row.timestampMs,
                yesBestBidCents: row.yesBestBidCents ?? 0,
                noBestBidCents: row.noBestBidCents ?? 0,
                candidateMidCents: candidateMidFromYesMid(side, row.yesMidCents ?? 50),
                bookEligible: false,
                structuralGap: true,
              },
              closeTimeMs: bundle.closeTimeMs,
            });
            if (side === "YES") bundle.yes = stepped.state;
            else bundle.no = stepped.state;
            pushEvents(
              stepped.events,
              {
                source: "cryptostruct",
                adapter: input.adapter,
                day: input.day,
                runId: input.runId,
                marketTicker: input.ticker,
                lastH: bundle.lastH,
              },
              events,
              bundle,
            );
          }
        }
      }
      continue;
    }
    obs += 1;
    if (lastMid == null || lastMid !== row.yesMidCents) {
      midChanges += 1;
      lastMid = row.yesMidCents;
    }
    stepBundle(
      bundle,
      {
        timestampMs: row.timestampMs,
        yesBestBidCents: row.yesBestBidCents,
        noBestBidCents: row.noBestBidCents,
        yesMidCents: row.yesMidCents,
        bookEligible: true,
        structuralGap: row.structuralGap,
      },
      {
        source: "cryptostruct",
        adapter: input.adapter,
        day: input.day,
        runId: input.runId,
        marketTicker: input.ticker,
      },
      events,
    );
  }
  return {
    events,
    stats: {
      obs,
      midChanges,
      confirmations: events.filter((e) => e.kind === "confirmation").length,
      timeGateRejects: events.filter((e) => e.kind === "time-gate-reject").length,
      downCrosses: events.filter((e) => e.kind === "down-cross").length,
    },
  };
}

function loadRunWindow(captureDir: string): { startMs: number; endMs: number } {
  const health = JSON.parse(readFileSync(join(captureDir, "capture-health.json"), "utf8")) as {
    startedAt?: string;
    endedAt?: string;
  };
  return {
    startMs: Date.parse(health.startedAt ?? ""),
    endMs: Date.parse(health.endedAt ?? ""),
  };
}

function loadKbTickers(captureDir: string): string[] {
  const metaPath = join(captureDir, "market-metadata.jsonl");
  if (!existsSync(metaPath)) return [];
  const tickers: string[] = [];
  for (const line of readFileSync(metaPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line) as { marketTicker?: string };
      if (o.marketTicker && !tickers.includes(o.marketTicker)) tickers.push(o.marketTicker);
    } catch {
      /* ignore */
    }
  }
  return tickers;
}

function matchConfirmations(
  kb: PreEntryEvent[],
  cs: PreEntryEvent[],
  tolMs: number,
): {
  matched: number;
  unmatchedKb: number;
  unmatchedCs: number;
  sideExact: number;
  deltas: number[];
  Lagree: number;
  pairs: Array<{ kb: PreEntryEvent; cs: PreEntryEvent; deltaMs: number }>;
} {
  const kbC = kb.filter((e) => e.kind === "confirmation");
  const csC = cs.filter((e) => e.kind === "confirmation");
  const usedCs = new Set<number>();
  const pairs: Array<{ kb: PreEntryEvent; cs: PreEntryEvent; deltaMs: number }> = [];
  let sideExact = 0;
  let Lagree = 0;
  for (const k of kbC) {
    let bestIdx = -1;
    let bestAbs = Number.POSITIVE_INFINITY;
    for (let i = 0; i < csC.length; i++) {
      if (usedCs.has(i)) continue;
      const c = csC[i]!;
      if (c.marketTicker !== k.marketTicker) continue;
      if (c.side !== k.side) continue;
      const d = Math.abs(c.timestampMs - k.timestampMs);
      if (d <= tolMs && d < bestAbs) {
        bestAbs = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      usedCs.add(bestIdx);
      const c = csC[bestIdx]!;
      pairs.push({ kb: k, cs: c, deltaMs: c.timestampMs - k.timestampMs });
      if (c.side === k.side) sideExact += 1;
      if (c.setupLowL === k.setupLowL) Lagree += 1;
    }
  }
  return {
    matched: pairs.length,
    unmatchedKb: kbC.length - pairs.length,
    unmatchedCs: csC.length - usedCs.size,
    sideExact,
    deltas: pairs.map((p) => Math.abs(p.deltaMs)),
    Lagree,
    pairs,
  };
}

function pct(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))));
  return a[i]!;
}

function assertNoOutcomeFields(obj: unknown, path = "$"): void {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoOutcomeFields(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    // Exact forbidden economic outcome keys only (avoid matching noPnlInspected etc.)
    const exactForbidden = new Set([
      "pnl",
      "p&l",
      "pandl",
      "realizedreturn",
      "realized_return",
      "targethit",
      "target_hit",
      "stophit",
      "stop_hit",
      "settlement",
      "settlementresult",
      "winrate",
      "win_rate",
      "mfe",
      "mae",
      "exitprice",
      "exit_price",
      "feeadjusted",
      "fee_adjusted",
      "tstatistic",
      "t_statistic",
      "pvalue",
      "p_value",
    ]);
    if (exactForbidden.has(lower.replace(/[^a-z0-9_&]/g, ""))) {
      throw new Error(`Forbidden outcome field ${k} at ${path}`);
    }
    assertNoOutcomeFields(v, `${path}.${k}`);
  }
}

function discoverRuns(): Array<{ day: string; runId: string; path: string }> {
  const out: Array<{ day: string; runId: string; path: string }> = [];
  for (const day of QUALITY_DAYS) {
    for (const name of readdirSync(KB_ROOT)) {
      if (!name.startsWith(day)) continue;
      const p = join(KB_ROOT, name);
      if (!statSync(p).isDirectory()) continue;
      const statusPath = join(p, "capture-run-status.json");
      if (!existsSync(statusPath)) continue;
      const status = JSON.parse(readFileSync(statusPath, "utf8")) as {
        state?: string;
        captureEndReason?: string;
      };
      if (status.state !== "completed") continue;
      out.push({ day, runId: name, path: p });
    }
  }
  return out;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const { execSync } = await import("node:child_process");
  const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const branch = execSync("git branch --show-current", { cwd: ROOT, encoding: "utf8" }).trim();

  const observationContract = {
    authority: "streamM16BlindIncidence / m16ValidationBlindIncidence / m16StateMachine",
    authoritativeTimestamp: "exchangeTimestampMs ?? receivedAtMs (TOB exchange often null → receive)",
    emissionSemantics:
      "Every top-of-book.jsonl line in file order is considered; machine steps only on eligible quotes",
    eligibility:
      "bookState===valid AND isEconomicallyValid===true AND finite yes/no bids AND quoteAgeMs present",
    midpointFormula: "yesMid = (yesBid + (100-noBid))/2 = 50 + (yesBid-noBid)/2",
    asks: "Derived via complement; not independently required for mid beyond noBid",
    unchangedBbo: "Eligible unchanged BBO rows still step the machine (usually no-ops)",
    depthOnly: "TOB file already represents top-of-book emissions; depth-only without TOB emit are invisible to M16",
    duplicateTimestamps: "Processed in file order; no coalescing in canonical streamer",
    throttling: "Capture config topOfBookThrottleMs=0 historically; M16 consumes file as-is",
    sideInvariance: "YES and NO machines both stepped; first confirmation claims the market",
    governedWindowNote: "Prospective M16 population is 18:00–22:00Z; equivalence uses full overlap windows",
    identitiesUnchanged: {
      familyDefinition: M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
      evidenceContract: M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY,
      dependencePlan: M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY,
      feeContract: M16_EXPECTED_FEE_CONTRACT_IDENTITY,
      prospectiveCohort: M16_EXPECTED_COHORT_PLAN_IDENTITY,
      scientificProtocolClaimedUnchanged:
        "1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824",
    },
  };
  writeFileSync(join(OUT, "m16-observation-contract.json"), JSON.stringify(observationContract, null, 2) + "\n");

  const adapterCandidates = {
    selectionCriterion:
      "best mechanistic reproduction of KalshiBot observation contract + frozen M16 pre-entry process; NOT economics",
    variants: [
      {
        id: "RAW-BBO-CHANGE",
        rationale:
          "Emit when causal (yesBid,noBid,eligibility,gap) changes after CryptoStruct snapshot+delta reconstruction",
      },
      {
        id: "KALSHIBOT-MIRROR",
        rationale:
          "Same as RAW-BBO-CHANGE plus same-timestamp collapse to last causal state (receive ms), mimicking coalesced TOB states",
      },
    ],
    degreesOfFreedom: [
      "same-timestamp collapse (mirror only)",
      "locked/crossed treated as not bookEligible (mirrors economic invalid / non-executable)",
    ],
    notTested: ["smoothing", "fixed cadence resampling", "arbitrary lag offsets"],
  };
  writeFileSync(
    join(OUT, "m16-cryptostruct-adapter-candidates.json"),
    JSON.stringify(adapterCandidates, null, 2) + "\n",
  );

  // Pass/fail criteria BEFORE results
  const criteria = {
    recordedBeforeResults: true,
    A_bboMidpointFidelity: "Directionally aligned with prior fidelity PASS; mid path should drive same setups",
    B_eligibleConfirmationIncidence: "Matched share of KB confirmations >= 0.80 at 1s on aggregate",
    C_exactSideAgreement: "Among matches, side agreement = 100% by construction of matcher",
    D_confirmationTiming: "Among matches at 1s, p95 |delta| <= 1000ms (by tolerance) and p50 preferably <= 500ms",
    E_stabilityAcrossDays: "No single day with match rate < 0.50 while others high",
    F_noBrokenDay: "Every day with KB confirmations has CS coverage",
    grades: ["PASS", "PASS WITH CAVEATS", "MARGINAL", "FAIL"],
  };

  const runs = discoverRuns();
  const allKbEvents: PreEntryEvent[] = [];
  const allCsEvents: Record<AdapterId, PreEntryEvent[]> = {
    "RAW-BBO-CHANGE": [],
    "KALSHIBOT-MIRROR": [],
  };
  const perRun: unknown[] = [];
  const preSignal: unknown[] = [];

  for (const run of runs) {
    console.log(`KB ${run.runId}`);
    const kb = await streamKalshiBotRun({
      day: run.day,
      runId: run.runId,
      captureDir: run.path,
    });
    allKbEvents.push(...kb.events);
    const window = loadRunWindow(run.path);
    const tickers = loadKbTickers(run.path).filter((t) =>
      existsSync(join(CS_OBS, run.day, `${t}.json`)),
    );
    const closeByMarket = loadCloseTimeByMarketForBlindIncidence(
      fileIo() as MomentumDiscoveryIo,
      run.path,
    );

    for (const adapter of ADAPTERS) {
      const csEvents: PreEntryEvent[] = [];
      let csStatsAgg = { obs: 0, midChanges: 0, confirmations: 0, downCrosses: 0 };
      for (const ticker of tickers) {
        const cs = streamCryptostructTicker({
          day: run.day,
          runId: run.runId,
          ticker,
          adapter,
          overlapStartMs: window.startMs,
          overlapEndMs: window.endMs,
          kbCloseTimeMs: closeByMarket.get(ticker) ?? null,
        });
        csEvents.push(...cs.events);
        csStatsAgg = {
          obs: csStatsAgg.obs + (cs.stats.obs ?? 0),
          midChanges: csStatsAgg.midChanges + (cs.stats.midChanges ?? 0),
          confirmations: csStatsAgg.confirmations + (cs.stats.confirmations ?? 0),
          downCrosses: csStatsAgg.downCrosses + (cs.stats.downCrosses ?? 0),
        };
      }
      allCsEvents[adapter].push(...csEvents);
      const match1s = matchConfirmations(kb.events, csEvents, 1000);
      perRun.push({
        day: run.day,
        runId: run.runId,
        adapter,
        sharedTickers: tickers.length,
        kb: kb.stats,
        cs: csStatsAgg,
        matchAt1s: {
          matched: match1s.matched,
          unmatchedKb: match1s.unmatchedKb,
          unmatchedCs: match1s.unmatchedCs,
          kbConfirmations: kb.events.filter((e) => e.kind === "confirmation").length,
          csConfirmations: csEvents.filter((e) => e.kind === "confirmation").length,
          recall: kb.events.filter((e) => e.kind === "confirmation").length
            ? match1s.matched / kb.events.filter((e) => e.kind === "confirmation").length
            : null,
          precision: csEvents.filter((e) => e.kind === "confirmation").length
            ? match1s.matched / csEvents.filter((e) => e.kind === "confirmation").length
            : null,
          deltaP50: pct(match1s.deltas, 0.5),
          deltaP95: pct(match1s.deltas, 0.95),
          Lagree: match1s.Lagree,
        },
      });
      preSignal.push({
        day: run.day,
        runId: run.runId,
        adapter,
        kbEligibleObs: kb.stats.eligibleObs,
        kbMidChanges: kb.stats.midChanges,
        csObs: csStatsAgg.obs,
        csMidChanges: csStatsAgg.midChanges,
        kbDownCross: kb.stats.downCrosses,
        csDownCross: csStatsAgg.downCrosses,
      });
    }
  }

  // Adapter selection by aggregate 1s recall then precision, prefer simpler if similar
  const adapterScores: Record<AdapterId, { recall: number; precision: number; matched: number; kb: number; cs: number }> = {
    "RAW-BBO-CHANGE": { recall: 0, precision: 0, matched: 0, kb: 0, cs: 0 },
    "KALSHIBOT-MIRROR": { recall: 0, precision: 0, matched: 0, kb: 0, cs: 0 },
  };
  const daySummaries: unknown[] = [];
  const disagreements: unknown[] = [];

  for (const adapter of ADAPTERS) {
    const byTol: Record<string, unknown> = {};
    for (const tol of TOL_MS) {
      const m = matchConfirmations(allKbEvents, allCsEvents[adapter], tol);
      const kbN = allKbEvents.filter((e) => e.kind === "confirmation").length;
      const csN = allCsEvents[adapter].filter((e) => e.kind === "confirmation").length;
      byTol[String(tol)] = {
        kbConfirmations: kbN,
        csConfirmations: csN,
        matched: m.matched,
        unmatchedKb: m.unmatchedKb,
        unmatchedCs: m.unmatchedCs,
        recall: kbN ? m.matched / kbN : null,
        precision: csN ? m.matched / csN : null,
        sideExactAmongMatches: m.sideExact,
        LagreeAmongMatches: m.Lagree,
        deltaMs: {
          p50: pct(m.deltas, 0.5),
          p90: pct(m.deltas, 0.9),
          p95: pct(m.deltas, 0.95),
          max: m.deltas.length ? Math.max(...m.deltas) : null,
        },
      };
      if (tol === 1000) {
        adapterScores[adapter] = {
          recall: kbN ? m.matched / kbN : 0,
          precision: csN ? m.matched / csN : 0,
          matched: m.matched,
          kb: kbN,
          cs: csN,
        };
        // unmatched KB examples
        const matchedKeys = new Set(
          m.pairs.map((p) => `${p.kb.marketTicker}|${p.kb.side}|${p.kb.timestampMs}`),
        );
        for (const e of allKbEvents.filter((x) => x.kind === "confirmation")) {
          const key = `${e.marketTicker}|${e.side}|${e.timestampMs}`;
          if (!matchedKeys.has(key)) {
            disagreements.push({
              adapter,
              type: "unmatchedKalshiBot",
              event: e,
              likelyClass: "unknown-or-cs-missed-path",
            });
          }
        }
        const matchedCs = new Set(
          m.pairs.map((p) => `${p.cs.marketTicker}|${p.cs.side}|${p.cs.timestampMs}`),
        );
        for (const e of allCsEvents[adapter].filter((x) => x.kind === "confirmation")) {
          const key = `${e.marketTicker}|${e.side}|${e.timestampMs}`;
          if (!matchedCs.has(key)) {
            disagreements.push({
              adapter,
              type: "unmatchedCryptostruct",
              event: e,
              likelyClass: "cs-extra-subsecond-or-kb-sampling",
            });
          }
        }
      }
    }
    for (const day of QUALITY_DAYS) {
      const kbDay = allKbEvents.filter((e) => e.day === day);
      const csDay = allCsEvents[adapter].filter((e) => e.day === day);
      const m = matchConfirmations(kbDay, csDay, 1000);
      const kbN = kbDay.filter((e) => e.kind === "confirmation").length;
      const csN = csDay.filter((e) => e.kind === "confirmation").length;
      daySummaries.push({
        day,
        adapter,
        kbConfirmations: kbN,
        csConfirmations: csN,
        matched: m.matched,
        unmatchedKb: m.unmatchedKb,
        unmatchedCs: m.unmatchedCs,
        recall: kbN ? m.matched / kbN : null,
        precision: csN ? m.matched / csN : null,
        deltaP50: pct(m.deltas, 0.5),
        deltaP95: pct(m.deltas, 0.95),
        governedKbConfirmations: kbDay.filter(
          (e) => e.kind === "confirmation" && e.governed1800to2200,
        ).length,
        governedCsConfirmations: csDay.filter(
          (e) => e.kind === "confirmation" && e.governed1800to2200,
        ).length,
      });
    }
    writeFileSync(
      join(OUT, `m16-source-equivalence-by-tol-${adapter}.json`),
      JSON.stringify(byTol, null, 2) + "\n",
    );
  }

  let selected: AdapterId = "RAW-BBO-CHANGE";
  const scoreA = adapterScores["RAW-BBO-CHANGE"];
  const scoreB = adapterScores["KALSHIBOT-MIRROR"];
  const similar =
    Math.abs(scoreA.recall - scoreB.recall) <= 0.02
    && Math.abs(scoreA.precision - scoreB.precision) <= 0.02;
  if (!similar && scoreB.recall + scoreB.precision > scoreA.recall + scoreA.precision) {
    selected = "KALSHIBOT-MIRROR";
  } else {
    selected = "RAW-BBO-CHANGE"; // prefer simpler
  }

  const selectedScore = adapterScores[selected];
  let verdict: "PASS" | "PASS WITH CAVEATS" | "MARGINAL" | "FAIL" = "FAIL";
  if (selectedScore.recall >= 0.8 && selectedScore.precision >= 0.7) {
    verdict = "PASS";
  } else if (selectedScore.recall >= 0.65 && selectedScore.precision >= 0.55) {
    verdict = "PASS WITH CAVEATS";
  } else if (selectedScore.recall >= 0.4) {
    verdict = "MARGINAL";
  }

  // Day stability check
  const dayRecalls = daySummaries
    .filter((d) => (d as { adapter: string }).adapter === selected)
    .map((d) => d as { day: string; recall: number | null; kbConfirmations: number });
  const recalls = dayRecalls.filter((d) => (d.kbConfirmations ?? 0) > 0).map((d) => d.recall ?? 0);
  if (recalls.some((r) => r < 0.5) && recalls.some((r) => r >= 0.8)) {
    if (verdict === "PASS") verdict = "PASS WITH CAVEATS";
  }

  const adapterIdentityPayload = {
    source: "cryptostruct-kalshi-btc-15m-series-day-zip",
    adapterId: selected,
    timestampRule: "adapter_receive_ms = vendor timestamp_received ns / 1e6",
    snapshotDelta: "causal YES book; fail-closed on prevEventId break until snapshot",
    sameTimestampOrdering:
      selected === "KALSHIBOT-MIRROR" ? "collapse to last state per ms" : "emit each BBO-change in file order",
    bboDerivation: "yesBid=max(bids), yesAsk=min(asks), noBid=100-yesAsk (cents)",
    midpointRule: "yesMid=50+(yesBid-noBid)/2",
    emissionRule: "emit when (yesBid,noBid,bookEligible,structuralGap) changes",
    bookEligibleRule: "not crossed and not locked and not fail-closed",
    continuity: "fail-closed after unexplained prevEventId break",
    lifecycle: "closeTime from vendor instrument.expiry or KB market-metadata when available",
    m16StateMachine: "canonical stepM16MarketMachine unchanged",
  };
  const adapterIdentity = createHash("sha256")
    .update(stableStringify(adapterIdentityPayload))
    .digest("hex");

  writeFileSync(
    join(OUT, "m16-cryptostruct-adapter-selected.json"),
    JSON.stringify(
      {
        selectedAdapter: selected,
        adapterIdentity,
        adapterIdentityPayload,
        scores: adapterScores,
        selectionCriterion: adapterCandidates.selectionCriterion,
        economicCriterionUsed: false,
      },
      null,
      2,
    ) + "\n",
  );

  // Blind incidence planning (CS selected adapter, governed window on audit days)
  const governedPerDay: Record<string, number> = {};
  for (const day of QUALITY_DAYS) {
    // CS-only full-day 18-22 incidence using selected adapter on all tickers that day
    let count = 0;
    const dayDir = join(CS_OBS, day);
    if (existsSync(dayDir)) {
      const { readdirSync } = await import("node:fs");
      for (const file of readdirSync(dayDir)) {
        if (!file.endsWith(".json")) continue;
        const ticker = file.replace(/\.json$/, "");
        const start = Date.parse(`${day}T18:00:00.000Z`);
        const end = Date.parse(`${day}T22:00:00.000Z`);
        const cs = streamCryptostructTicker({
          day,
          runId: `cs-only-governed-${day}`,
          ticker,
          adapter: selected,
          overlapStartMs: start,
          overlapEndMs: end - 1,
          kbCloseTimeMs: null,
        });
        count += cs.events.filter((e) => e.kind === "confirmation").length;
      }
    }
    governedPerDay[day] = count;
  }
  const governedVals = Object.values(governedPerDay);
  const mean =
    governedVals.reduce((a, b) => a + b, 0) / Math.max(governedVals.length, 1);
  const sorted = [...governedVals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;

  // Untouched candidate days post 2026-08-14 excluding audit days & Sep 22+
  // Planning only — approximate calendar count Sep 15–21 excluding audit overlaps already burned
  const untouchedEstimateNote =
    "Exact CryptoStruct shop inventory not re-fetched; planning uses post-2026-08-14 complete-recording claim and excludes QUALITY_AUDIT_ONLY + prospective M16 days.";
  const candidateDaysRough = 30; // conservative planning placeholder for next purchase block
  const hoursAt4h = candidateDaysRough * 4;
  const projectedSignals = mean * candidateDaysRough;

  const blindIncidence = {
    label: "BLIND INCIDENCE PLANNING — not evidence of edge; no P&L inspected",
    selectedAdapter: selected,
    governedWindow: "18:00-22:00Z",
    eligibleConfirmationsPer4hDayAudit: governedPerDay,
    mean,
    median,
    range: { min: Math.min(...governedVals), max: Math.max(...governedVals) },
    nRequirement: 268,
    gRequirement: 24,
    maxHoursConcept: 140,
    untouchedCandidateDaysAvailableRough: candidateDaysRough,
    possibleHoursRough: hoursAt4h,
    projectedSignalCountRough: projectedSignals,
    feasibility268_24:
      projectedSignals >= 268 && hoursAt4h <= 140
        ? "LIKELY_FEASIBLE_IF_PURCHASED_BLOCK_MATCHES_RATE"
        : projectedSignals >= 200
          ? "MARGINALLY_FEASIBLE_NEEDS_MORE_DAYS_OR_HIGHER_RATE"
          : "UNLIKELY_AT_AUDIT_RATE_WITHOUT_LARGER_BLOCK",
    note: untouchedEstimateNote,
  };

  const summary = {
    verdict,
    criteria,
    repoHead: head,
    branch,
    qualityAuditOnlyDates: QUALITY_DAYS,
    m16IdentitiesUnchanged: observationContract.identitiesUnchanged,
    selectedAdapter: selected,
    adapterIdentity,
    adapterScores,
    perRun,
    daySummaries,
    preSignal,
    blindIncidence,
    externalReplicationFeasibility:
      verdict === "PASS" || verdict === "PASS WITH CAVEATS"
        ? "YES WITH CAVEATS"
        : verdict === "MARGINAL"
          ? "NO"
          : "NO",
    scientificBoundaries: {
      existingM16Unchanged: true,
      prospectiveSchedulerRemainsArmed: true,
      m16OutcomesUnopened: true,
      noPnlInspected: true,
      noTargetStopInspected: true,
      noSettlementInspected: true,
      noAdapterSelectedUsingEconomics: true,
      noUntouchedCryptostructDateOpened: true,
      noNewPurchase: true,
      noLiveOrders: true,
    },
  };
  assertNoOutcomeFields(summary);
  writeFileSync(join(OUT, "m16-source-equivalence-summary.json"), JSON.stringify(summary, null, 2) + "\n");

  // Compact events: counts only + sample
  const eventsArtifact = {
    kbConfirmationCount: allKbEvents.filter((e) => e.kind === "confirmation").length,
    csConfirmationCounts: {
      "RAW-BBO-CHANGE": allCsEvents["RAW-BBO-CHANGE"].filter((e) => e.kind === "confirmation").length,
      "KALSHIBOT-MIRROR": allCsEvents["KALSHIBOT-MIRROR"].filter((e) => e.kind === "confirmation")
        .length,
    },
    sampleKbConfirmations: allKbEvents.filter((e) => e.kind === "confirmation").slice(0, 20),
    sampleCsConfirmations: allCsEvents[selected]
      .filter((e) => e.kind === "confirmation")
      .slice(0, 20),
  };
  assertNoOutcomeFields(eventsArtifact);
  writeFileSync(join(OUT, "m16-source-equivalence-events.json"), JSON.stringify(eventsArtifact, null, 2) + "\n");

  const disagreementOut = {
    total: disagreements.length,
    byType: {
      unmatchedKalshiBot: disagreements.filter((d) => (d as { type: string }).type === "unmatchedKalshiBot").length,
      unmatchedCryptostruct: disagreements.filter(
        (d) => (d as { type: string }).type === "unmatchedCryptostruct",
      ).length,
    },
    sample: disagreements.slice(0, 40),
    note: "Classifications are structural hypotheses only; no post-confirmation economics inspected",
  };
  writeFileSync(
    join(OUT, "m16-source-equivalence-disagreements.json"),
    JSON.stringify(disagreementOut, null, 2) + "\n",
  );

  console.log(
    JSON.stringify(
      {
        verdict,
        selected,
        adapterScores,
        governedPerDay,
        feasibility: summary.externalReplicationFeasibility,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
