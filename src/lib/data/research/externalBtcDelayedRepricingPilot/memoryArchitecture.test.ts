/**
 * Parity + memory-architecture tests for incremental BBO, event detection,
 * checkpoint resume, and multi-day aggregation.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  applyTickToBook,
  applyTickToBookFullScan,
  bboFromBook,
  bboFromBookFullScan,
  createEmptyBook,
  hashBookState,
  parseTickLine,
  shouldEmitBbo,
  type BboPoint,
  type TickEnvelope,
  REPLAY_IMPLEMENTATION_VERSION,
} from "./bookReplay";
import { detectExternalBtcEvents } from "./detectExternalEvents";
import {
  dayResultIdentityKey,
  readCompleteDayResult,
  simulationSpecHash,
  writeDayResult,
  DAY_RESULT_SCHEMA_VERSION,
  QUOTE_CACHE_SCHEMA_VERSION,
  type DayResultIdentity,
} from "./checkpoint";
import { CONTRACT_METADATA_VERSION } from "./contractMetadata";
import { aggregateDayResults, loadDayResultFile } from "./aggregateDayResults";
import { EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION } from "./types";
import { runExternalBtcDelayedRepricingPilot } from "./runPilot";
import { processOnePilotDay } from "./processOneDay";
import { writeZstdTextFixture } from "./streamCryptostructTick";
import { loadPilotDayFromFiles } from "./loadPilotDay";
import { ingestCoinbaseSparseBbo } from "./ingestBounded";

function tick(
  msgType: 0 | 1,
  eventId: string,
  prev: string,
  adapterNs: number,
  levels: Array<[number, string, string]>,
): TickEnvelope {
  return {
    msgType,
    prevEventId: prev,
    eventId,
    adapterTimestampNs: adapterNs,
    exchangeTimestampNs: adapterNs,
    levels,
    isSnapshot: msgType === 0,
  };
}

describe("incremental BBO parity", () => {
  it("matches full-scan quotes and final book on deep-book fixture", () => {
    const inc = createEmptyBook();
    const full = createEmptyBook();
    const quotesInc: BboPoint[] = [];
    const quotesFull: BboPoint[] = [];
    let prevInc: BboPoint | null = null;
    let prevFull: BboPoint | null = null;

    const levels: Array<[number, string, string]> = [];
    for (let i = 0; i < 50; i += 1) {
      levels.push([0, String(100 - i), "1"]);
      levels.push([1, String(101 + i), "1"]);
    }

    const sequence: TickEnvelope[] = [
      tick(0, "1", "0", 1e9, levels),
    ];
    // Improve bid, improve ask, delete best bid (force rescan), delete best ask.
    sequence.push(tick(1, "2", "1", 2e9, [[0, "100.5", "2"]]));
    sequence.push(tick(1, "3", "2", 3e9, [[1, "100.75", "2"]]));
    sequence.push(tick(1, "4", "3", 4e9, [[0, "100.5", "0"]]));
    sequence.push(tick(1, "5", "4", 5e9, [[1, "100.75", "0"]]));
    // Empty then rebuild
    sequence.push(
      tick(0, "6", "0", 6e9, [
        [0, "99", "1"],
        [1, "101", "1"],
      ]),
    );

    for (const t of sequence) {
      const a = applyTickToBook(inc, t);
      const b = applyTickToBookFullScan(full, t);
      expect(a.chainBreak).toBe(b.chainBreak);
      const qi = bboFromBook(inc, t, a.chainBreak);
      const qf = bboFromBookFullScan(full, t, b.chainBreak);
      if (qi && shouldEmitBbo(prevInc, qi)) {
        quotesInc.push(qi);
        prevInc = qi;
      }
      if (qf && shouldEmitBbo(prevFull, qf)) {
        quotesFull.push(qf);
        prevFull = qf;
      }
    }

    expect(quotesInc.length).toBe(quotesFull.length);
    for (let i = 0; i < quotesInc.length; i += 1) {
      const a = quotesInc[i]!;
      const b = quotesFull[i]!;
      expect(a.bid).toBe(b.bid);
      expect(a.ask).toBe(b.ask);
      expect(a.bidSize).toBe(b.bidSize);
      expect(a.askSize).toBe(b.askSize);
      expect(a.timestampMs).toBe(b.timestampMs);
      expect(a.failClosed).toBe(b.failClosed);
      expect(a.chainBreak).toBe(b.chainBreak);
    }
    expect(hashBookState(inc)).toBe(hashBookState(full));
  });

  it("parses TOB msgType 6 for callers to filter (does not null it)", () => {
    const tob = parseTickLine('[6,1,"0","9",1,1,[]]');
    expect(tob?.msgType).toBe(6);
  });
});

describe("event detection rolling lookback", () => {
  it("matches prior full-array semantics on a synthetic mid path", () => {
    const points: BboPoint[] = [];
    const push = (t: number, mid: number) => {
      points.push({
        timestampMs: t,
        clockDomain: "adapter",
        timestampSource: "adapter",
        adapterTimestampMs: t,
        exchangeTimestampMs: t,
        bid: mid - 0.5,
        ask: mid + 0.5,
        bidSize: 1,
        askSize: 1,
        mid,
        chainBreak: false,
        failClosed: false,
      });
    };
    // flat then jump >5bps over 5s lookback
    for (let t = 0; t <= 20_000; t += 1_000) push(t, 50_000);
    push(21_000, 50_040); // ~8bps from t=16000

    const detected = detectExternalBtcEvents({
      utcDay: "2026-08-14",
      points,
      lookbackMs: 5_000,
      boundaryBps: 5,
      cooldownMs: 60_000,
    });
    expect(detected.events.length).toBeGreaterThanOrEqual(1);
    expect(detected.events[0]!.direction).toBe("up");
  });

  it("matches reference findLastAtOrBefore semantics across irregular gaps", () => {
    const points: BboPoint[] = [];
    const push = (t: number, mid: number, flags?: { failClosed?: boolean }) => {
      points.push({
        timestampMs: t,
        clockDomain: "adapter",
        timestampSource: "adapter",
        adapterTimestampMs: t,
        exchangeTimestampMs: t,
        bid: mid - 0.5,
        ask: mid + 0.5,
        bidSize: 1,
        askSize: 1,
        mid,
        chainBreak: false,
        failClosed: flags?.failClosed ?? false,
      });
    };
    for (let t = 0; t <= 100_000; t += 2_500) {
      if (t === 50_000) {
        push(t, 40_000, { failClosed: true }); // retained for lookback, skipped as trigger
      } else {
        push(t, 40_000 + t / 1_000);
      }
    }
    push(102_500, 40_200);

    const lookbackMs = 10_000;
    const boundaryBps = 5;
    const cooldownMs = 0;

    const reference = (() => {
      const events: Array<{ t: number; direction: "up" | "down" }> = [];
      let previousAbsolute = 0;
      let lastTriggerMs = Number.NEGATIVE_INFINITY;
      const findLast = (ts: number) => {
        let result: BboPoint | null = null;
        for (const p of points) {
          if (p.timestampMs <= ts) result = p;
          else break;
        }
        return result;
      };
      for (const point of points) {
        if (point.failClosed || point.chainBreak) continue;
        const start = findLast(point.timestampMs - lookbackMs);
        if (!start || start.timestampMs >= point.timestampMs) continue;
        const returnBps = ((point.mid - start.mid) / start.mid) * 10_000;
        const absolute = Math.abs(returnBps);
        const crossed = previousAbsolute < boundaryBps && absolute >= boundaryBps;
        previousAbsolute = absolute;
        if (!crossed || returnBps === 0) continue;
        if (point.timestampMs - lastTriggerMs < cooldownMs) continue;
        lastTriggerMs = point.timestampMs;
        events.push({
          t: point.timestampMs,
          direction: returnBps > 0 ? "up" : "down",
        });
      }
      return events;
    })();

    const detected = detectExternalBtcEvents({
      utcDay: "2026-08-14",
      points,
      lookbackMs,
      boundaryBps,
      cooldownMs,
    });
    expect(detected.events.map((e) => ({ t: e.eventTimestampMs, direction: e.direction }))).toEqual(
      reference,
    );
  });
});

describe("quote cache integrity", () => {
  it("rebuilds when manifest outputSha256 does not match JSONL bytes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-cache-integrity-"));
    const utcDay = "2026-08-14";
    const coinbasePath = join(dir, `coinbase-BTC-USD-${utcDay}.txt.zst`);
    const cbLines: string[] = [
      JSON.stringify({ instrument: { id: 15050, code: "BTC-USD" } }),
      JSON.stringify([
        0,
        15050,
        "0",
        "1",
        0,
        0,
        [
          [0, "49999.5", "1.5"],
          [1, "50000.5", "1.5"],
        ],
      ]),
    ];
    await writeZstdTextFixture(coinbasePath, cbLines);
    const cacheRoot = join(dir, "cache");
    const first = await ingestCoinbaseSparseBbo({
      utcDay,
      coinbaseTickPath: coinbasePath,
      cacheRoot,
    });
    expect(first.reused).toBe(false);

    // Corrupt the sparse JSONL while leaving the complete manifest in place.
    writeFileSync(first.jsonlPath, '{"tampered":true}\n', "utf8");
    const second = await ingestCoinbaseSparseBbo({
      utcDay,
      coinbaseTickPath: coinbasePath,
      cacheRoot,
    });
    expect(second.reused).toBe(false);
    expect(second.key).toBe(first.key);
    const third = await ingestCoinbaseSparseBbo({
      utcDay,
      coinbaseTickPath: coinbasePath,
      cacheRoot,
    });
    expect(third.reused).toBe(true);
  });
});

describe("checkpoint identity", () => {
  it("rejects partial and incompatible day results", () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-ckpt-"));
    const identity: DayResultIdentity = {
      kind: "day-result",
      schemaVersion: DAY_RESULT_SCHEMA_VERSION,
      analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
      simulationSpecSha256: simulationSpecHash(),
      replayImplementation: REPLAY_IMPLEMENTATION_VERSION,
      quoteCacheSchemaVersion: QUOTE_CACHE_SCHEMA_VERSION,
      contractMetadataVersion: CONTRACT_METADATA_VERSION,
      coinbaseRawSha256: "a".repeat(64),
      kalshiZipSha256: "b".repeat(64),
      utcDay: "2026-08-14",
    };
    const path = join(dir, "day.json");
    writeFileSync(path, JSON.stringify({ ...identity, complete: false }) + "\n");
    expect(readCompleteDayResult(path, identity)).toBeNull();

    writeDayResult(path, {
      ...identity,
      complete: true,
      writtenAtIso: new Date().toISOString(),
      contracts: [],
      events: [],
      trades: [],
      daySummary: {
        utcDay: "2026-08-14",
        weekday: "Friday",
        primaryEventCount: 0,
        preEntryRejectCount: 0,
        enteredCount: 0,
        completedExitCount: 0,
        unresolvedExitCount: 0,
        completedMeanNetPnlCents: null,
      },
      timingNotes: [],
      coinbaseQuoteCacheKey: "x",
      kalshiQuoteCacheKeys: {},
      peakRssBytes: 1,
      elapsedMs: 1,
    });
    expect(readCompleteDayResult(path, identity)?.complete).toBe(true);

    const bad = {
      ...identity,
      replayImplementation: "other" as typeof REPLAY_IMPLEMENTATION_VERSION,
    };
    expect(readCompleteDayResult(path, bad)).toBeNull();
    expect(dayResultIdentityKey(identity)).not.toBe(dayResultIdentityKey(bad));
  });
});

describe("multi-day aggregation parity with in-memory runner", () => {
  it("aggregates compact day outputs with same weighting fields", () => {
    const emptyDay = (utcDay: string) => ({
      kind: "day-result" as const,
      schemaVersion: DAY_RESULT_SCHEMA_VERSION,
      analysisVersion: EXTERNAL_BTC_DELAYED_REPRICING_PILOT_ANALYSIS_VERSION,
      simulationSpecSha256: simulationSpecHash(),
      replayImplementation: REPLAY_IMPLEMENTATION_VERSION,
      quoteCacheSchemaVersion: QUOTE_CACHE_SCHEMA_VERSION,
      contractMetadataVersion: CONTRACT_METADATA_VERSION,
      coinbaseRawSha256: "c".repeat(64),
      kalshiZipSha256: "d".repeat(64),
      utcDay,
      complete: true as const,
      writtenAtIso: new Date().toISOString(),
      contracts: [],
      events: [],
      trades: [],
      daySummary: {
        utcDay,
        weekday: "Friday" as const,
        primaryEventCount: 0,
        preEntryRejectCount: 0,
        enteredCount: 0,
        completedExitCount: 0,
        unresolvedExitCount: 0,
        completedMeanNetPnlCents: null,
      },
      timingNotes: [],
      coinbaseQuoteCacheKey: "k",
      kalshiQuoteCacheKeys: {},
      peakRssBytes: 1,
      elapsedMs: 1,
    });

    const report = aggregateDayResults({
      dayResults: [emptyDay("2026-08-14"), emptyDay("2026-08-21")],
    });
    expect(report.daySummaries).toHaveLength(2);
    expect(report.byDelay["1000"]?.opportunityEnteredCount).toBe(0);
    expect(report.fridayOnly).toBe(true);
    expect(report.byDelay["250"]?.delayClaimStatus).toBe("diagnostic-only");
    expect(report.byDelay["1000"]?.delayClaimStatus).toBe(
      "scenario-assumption-unverified",
    );

    const mem = runExternalBtcDelayedRepricingPilot({
      days: [
        {
          utcDay: "2026-08-14",
          externalBbo: [],
          contracts: [],
          quotesByTicker: new Map(),
        },
        {
          utcDay: "2026-08-21",
          externalBbo: [],
          contracts: [],
          quotesByTicker: new Map(),
        },
      ],
    });
    expect(mem.byDelay["1000"]?.opportunityEnteredCount).toBe(
      report.byDelay["1000"]?.opportunityEnteredCount,
    );
  });
});

describe("bounded day worker vs in-memory on native compressed fixture", () => {
  it("matches trade/event counts and supports resume from complete checkpoint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-native-parity-"));
    const utcDay = "2026-08-14";
    const coinbasePath = join(dir, `coinbase-BTC-USD-${utcDay}.txt.zst`);

    const cbLines: string[] = [
      JSON.stringify({ instrument: { id: 15050, code: "BTC-USD" } }),
    ];
    let eventId = 1;
    const pushBook = (
      adapterNs: number,
      bid: string,
      ask: string,
      snapshot: boolean,
    ) => {
      const prev = snapshot ? "0" : String(eventId - 1);
      const id = String(eventId);
      eventId += 1;
      cbLines.push(
        JSON.stringify([
          snapshot ? 0 : 1,
          15050,
          prev,
          id,
          adapterNs,
          adapterNs,
          [
            [0, bid, "1.5", 1],
            [1, ask, "1.5", 1],
          ],
        ]),
      );
    };
    for (let s = 0; s <= 20; s += 1) {
      pushBook(s * 1_000_000_000, "49999.5", "50000.5", s === 0);
    }
    pushBook(21_000_000_000, "50039.5", "50040.5", false);
    await writeZstdTextFixture(coinbasePath, cbLines);

    const member = `kalshi-KXBTC15M-26AUG141500-00-${utcDay}.txt.zst`;
    const memberPath = join(dir, member);
    const kLines: string[] = [
      JSON.stringify({
        instrument: {
          code: "KXBTC15M-26AUG141500-00",
          start: "2026-08-14 00:00:00",
          expiry: "2026-08-14 23:59:00",
        },
      }),
      JSON.stringify([
        0,
        1,
        "0",
        "1",
        0,
        0,
        [
          [0, "0.49", "10"],
          [1, "0.51", "10"],
        ],
      ]),
      JSON.stringify([
        1,
        1,
        "1",
        "2",
        21_000_000_000,
        21_000_000_000,
        [
          [0, "0.55", "10"],
          [1, "0.57", "10"],
        ],
      ]),
    ];
    await writeZstdTextFixture(memberPath, kLines);
    const kalshiZip = join(dir, `kalshi-btc-15m_${utcDay}.zip`);
    const zip = spawnSync("zip", ["-q", kalshiZip, member], { cwd: dir });
    expect(zip.status).toBe(0);

    const outDir = join(dir, "out");
    const t0 = Date.now();
    const memBefore = process.memoryUsage().heapUsed;
    const first = await processOnePilotDay({
      utcDay,
      coinbaseTickPath: coinbasePath,
      kalshiZipPath: kalshiZip,
      outDir,
      progressIntervalMs: 60_000,
    });
    const elapsedMs = Date.now() - t0;
    const memAfter = process.memoryUsage().heapUsed;
    expect(first.reused).toBe(false);

    const second = await processOnePilotDay({
      utcDay,
      coinbaseTickPath: coinbasePath,
      kalshiZipPath: kalshiZip,
      outDir,
      progressIntervalMs: 60_000,
    });
    expect(second.reused).toBe(true);
    expect(second.dayResultKey).toBe(first.dayResultKey);

    const dayResult = loadDayResultFile(first.path);
    const loaded = await loadPilotDayFromFiles({
      utcDay,
      coinbaseTickPath: coinbasePath,
      kalshiZipPath: kalshiZip,
    });
    const memReport = runExternalBtcDelayedRepricingPilot({
      days: [
        {
          utcDay: loaded.utcDay,
          externalBbo: loaded.externalBbo,
          contracts: loaded.contracts,
          quotesByTicker: loaded.quotesByTicker,
        },
      ],
    });
    const agg = aggregateDayResults({ dayResults: [dayResult] });

    expect(agg.events.filter((e) => e.controlKind === "primary").length).toBe(
      memReport.events.filter((e) => e.controlKind === "primary").length,
    );
    expect(agg.trades.length).toBe(memReport.trades.length);
    expect(agg.byDelay["1000"]?.opportunityEnteredCount).toBe(
      memReport.byDelay["1000"]?.opportunityEnteredCount,
    );
    expect(agg.byDelay["1000"]?.economicResultStatus).toBe(
      memReport.byDelay["1000"]?.economicResultStatus,
    );

    // Throughput note for the fixture (not an empirical speedup claim).
    expect(elapsedMs).toBeGreaterThan(0);
    expect(memAfter).toBeGreaterThan(0);
    expect(memBefore).toBeGreaterThanOrEqual(0);
  });
});
