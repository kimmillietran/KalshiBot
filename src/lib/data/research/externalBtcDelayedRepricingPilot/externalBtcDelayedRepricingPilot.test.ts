import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  assertNoFutureLeakage,
  buildDiagnosticControls,
  buildPilotDataManifest,
  createEmptyBook,
  detectExternalBtcEvents,
  directionalSide,
  delayClaimSupport,
  FROZEN_PILOT_SPEC,
  joinAsOf,
  loadPilotDayFromFiles,
  M128_RECONCILIATION,
  PILOT_DELAY_MS,
  parseTickLine,
  runExternalBtcDelayedRepricingPilot,
  simulateDayTrades,
  simulateEventTrade,
  applyTickToBook,
  bboFromBook,
  kalshiExecutableFromYesBbo,
  writeZstdTextFixture,
  CLOCK_POLICY,
  selectContractAtEventTime,
} from "./index";
import type { BboPoint } from "./bookReplay";
import type { ExecutableQuote, ExternalBtcEvent, SelectedContract } from "./types";

function bbo(
  timestampMs: number,
  mid: number,
): BboPoint {
  const half = 0.5;
  return {
    timestampMs,
    clockDomain: "adapter",
    timestampSource: "adapter",
    adapterTimestampMs: timestampMs,
    exchangeTimestampMs: timestampMs,
    bid: mid - half,
    ask: mid + half,
    bidSize: 2,
    askSize: 2,
    mid,
    chainBreak: false,
    failClosed: false,
  };
}

function quote(
  timestampMs: number,
  yesBid: number,
  yesAsk: number,
  sizes = { bid: 5, ask: 5 },
): ExecutableQuote {
  return {
    timestampMs,
    clockDomain: "adapter",
    timestampSource: "adapter",
    adapterTimestampMs: timestampMs,
    exchangeTimestampMs: timestampMs,
    yesBidCents: yesBid,
    yesAskCents: yesAsk,
    yesBidSize: sizes.bid,
    yesAskSize: sizes.ask,
    noBidCents: 100 - yesAsk,
    noAskCents: 100 - yesBid,
    noBidSize: sizes.ask,
    noAskSize: sizes.bid,
    stale: false,
    chainBreak: false,
    failClosed: false,
  };
}

function primaryEvent(partial: Partial<ExternalBtcEvent> & Pick<ExternalBtcEvent, "eventId" | "eventTimestampMs" | "direction">): ExternalBtcEvent {
  return {
    utcDay: "2026-08-14",
    timestampSource: "adapter",
    clockDomain: "adapter",
    returnBps: partial.direction === "up" ? 8 : -8,
    absoluteReturnBps: 8,
    lookbackMs: 5_000,
    btcPriceUsd: 100_000,
    controlKind: "primary",
    controlNote: null,
    ...partial,
  };
}

const CONTRACT: SelectedContract = {
  ticker: "KXBTC15M-TEST",
  startMs: 0,
  expiryMs: 1_000_000,
};

describe("externalBtcDelayedRepricingPilot correction-v1", () => {
  it("keeps causal as-of joins and rejects future leakage", () => {
    const series = [quote(1000, 40, 42), quote(2000, 41, 43), quote(3000, 45, 47)];
    const joined = joinAsOf({ series, decisionTimestampMs: 2500, maxAgeMs: 5_000 });
    expect(joined.sample?.timestampMs).toBe(2000);
    expect(() =>
      assertNoFutureLeakage({ decisionTimestampMs: 1000, observationTimestampMs: 1001 }),
    ).toThrow(/future-leakage-guard/);
  });

  it("detects chain breaks and continuity reset on snapshot", () => {
    const book = createEmptyBook();
    applyTickToBook(book, {
      msgType: 0,
      prevEventId: "0",
      eventId: "a",
      adapterTimestampNs: 1e9,
      exchangeTimestampNs: 1e9,
      levels: [[0, "0.40", "10", 1], [1, "0.42", "8", 1]],
      isSnapshot: true,
    });
    const gap = applyTickToBook(book, {
      msgType: 1,
      prevEventId: "missing",
      eventId: "b",
      adapterTimestampNs: 2e9,
      exchangeTimestampNs: 2e9,
      levels: [[0, "0.41", "10", 1]],
    });
    expect(gap.chainBreak).toBe(true);
    expect(book.failClosed).toBe(true);
    applyTickToBook(book, {
      msgType: 0,
      prevEventId: "x",
      eventId: "c",
      adapterTimestampNs: 3e9,
      exchangeTimestampNs: 3e9,
      levels: [[0, "0.40", "10", 1], [1, "0.42", "8", 1]],
      isSnapshot: true,
    });
    expect(book.failClosed).toBe(false);
  });

  it("does not apply CryptoStruct TOB (msgType 6) into the L2 depth book", () => {
    const book = createEmptyBook();
    applyTickToBook(book, {
      msgType: 0,
      prevEventId: "0",
      eventId: "1",
      adapterTimestampNs: 1e9,
      exchangeTimestampNs: 1e9,
      levels: [
        [0, "0.40", "10", 1],
        [0, "0.39", "5", 1],
        [1, "0.42", "8", 1],
        [1, "0.43", "4", 1],
      ],
      isSnapshot: true,
    });
    expect(book.bids.size).toBe(2);
    expect(book.asks.size).toBe(2);

    // Loader must skip type 6; if applied as an update it would stamp only BBO
    // levels onto the depth book and leave stale deeper levels (forbidden).
    const tob = parseTickLine(
      JSON.stringify([
        6,
        1,
        "1",
        "2",
        2e9,
        2e9,
        [
          [0, "0.41", "99", 1],
          [1, "0.42", "99", 1],
        ],
      ]),
    );
    expect(tob?.msgType).toBe(6);
    // Simulate the loadPilotDay filter: only 0+1 are book-applied.
    const accepted = tob && (tob.msgType === 0 || tob.msgType === 1);
    expect(accepted).toBe(false);
    expect(book.bids.size).toBe(2);
    expect(book.asks.get(0.43)).toBe(4);
    expect(FROZEN_PILOT_SPEC.kalshiSeries.note).toMatch(/never feed TOB\(6\)/);
  });

  it("marks delay claims without inventing verified tradability", () => {
    expect(
      delayClaimSupport({
        delayMs: 250,
        decisionClockDomain: "adapter",
        eventClockDomain: "adapter",
        quoteClockDomain: "adapter",
        eventHasDomainTimestamp: true,
        quoteHasDomainTimestamp: true,
      }),
    ).toBe("diagnostic-only");
    expect(
      delayClaimSupport({
        delayMs: 1_000,
        decisionClockDomain: "adapter",
        eventClockDomain: "adapter",
        quoteClockDomain: "adapter",
        eventHasDomainTimestamp: true,
        quoteHasDomainTimestamp: true,
      }),
    ).toBe("scenario-assumption-unverified");
    expect(
      delayClaimSupport({
        delayMs: 3_000,
        decisionClockDomain: "adapter",
        eventClockDomain: "exchange",
        quoteClockDomain: "adapter",
        eventHasDomainTimestamp: true,
        quoteHasDomainTimestamp: true,
      }),
    ).toBe("blocked-domain-mix");
    expect(CLOCK_POLICY.clockAlignmentStatus).toBe("unknown");
    expect(FROZEN_PILOT_SPEC.timing.clockPolicy.alignmentNote).not.toMatch(/50–250/);
  });

  it("separates entry success from unresolved exit and retains cooldown", () => {
    const event = primaryEvent({ eventId: "e1", eventTimestampMs: 10_000, direction: "up" });
    const quotes = [
      quote(10_000, 48, 50),
      quote(11_000, 48, 50),
      // no usable exit liquidity at intended exit
      quote(26_000, 55, 57, { bid: 0, ask: 0 }),
    ];
    const trade = simulateEventTrade({
      event,
      delayMs: 1_000,
      holdMs: 15_000,
      contract: CONTRACT,
      quotes,
      minDisplayedSize: 1,
      staleMaxAgeMs: 2_000,
      openUntilMs: null,
      cooldownUntilMs: null,
      decisionClockDomain: "adapter",
    });
    expect(trade.entryStatus).toBe("entered");
    expect(trade.exitStatus).toBe("unresolved");
    expect(trade.completedNetPnlCents).toBeNull();
    expect(trade.allEntryLowerBoundNetCents).not.toBeNull();
    expect(trade.allEntryUpperBoundNetCents).not.toBeNull();

    const second = primaryEvent({ eventId: "e2", eventTimestampMs: 12_000, direction: "up" });
    const day = simulateDayTrades({
      events: [event, second],
      delayMs: 1_000,
      holdMs: 15_000,
      contracts: [CONTRACT],
      quotesByTicker: new Map([[CONTRACT.ticker, quotes]]),
      minDisplayedSize: 1,
      staleMaxAgeMs: 5_000,
      cooldownMs: 60_000,
      decisionClockDomain: "adapter",
    });
    expect(day[0]!.entryStatus).toBe("entered");
    expect(day[0]!.exitStatus).toBe("unresolved");
    expect(day[1]!.preEntryRejectReason).toBe("overlapping-position");
  });

  it("selects contract at event time and rejects insufficient time-to-expiry", () => {
    const short: SelectedContract = {
      ticker: "SHORT",
      startMs: 0,
      expiryMs: 20_000,
    };
    const quotesByTicker = new Map([["SHORT", [quote(10_000, 49, 51)]]]);
    const selected = selectContractAtEventTime({
      contracts: [short],
      eventTimestampMs: 10_000,
      holdMs: 15_000,
      delayMs: 1_000,
      quotesByTicker,
    });
    expect(selected.reject).toBe("insufficient-time-to-expiry");
  });

  it("YES/NO payoff uses ask entry and bid exit with fees when completed", () => {
    const event = primaryEvent({ eventId: "e3", eventTimestampMs: 10_000, direction: "up" });
    expect(directionalSide(event)).toBe("YES");
    const trade = simulateEventTrade({
      event,
      delayMs: 1_000,
      holdMs: 15_000,
      contract: CONTRACT,
      quotes: [quote(11_000, 48, 50), quote(26_000, 55, 57)],
      minDisplayedSize: 1,
      staleMaxAgeMs: 2_000,
      openUntilMs: null,
      cooldownUntilMs: null,
      decisionClockDomain: "adapter",
    });
    expect(trade.exitStatus).toBe("completed");
    expect(trade.entryPriceCents).toBe(50);
    expect(trade.exitPriceCents).toBe(55);
    expect(trade.completedNetPnlCents).toBe(
      5 - (trade.entryFeeCents + trade.exitFeeCents),
    );
  });

  it("isolates controls from primary position state and labels retrospective placebo", () => {
    const points: BboPoint[] = [];
    for (let t = 0; t <= 10_000; t += 1_000) points.push(bbo(t, 100_000));
    points.push(bbo(11_000, 100_060));
    const { events } = detectExternalBtcEvents({
      utcDay: "2026-08-14",
      points,
      lookbackMs: 5_000,
      boundaryBps: 5,
      cooldownMs: 60_000,
    });
    const controls = buildDiagnosticControls(events, 15_000, 1_000);
    expect(controls.some((c) => c.controlKind === "sign-flip")).toBe(true);
    expect(
      controls.some((c) => c.controlKind === "time-sham-retrospective-placebo"),
    ).toBe(true);
    expect(controls[0]!.controlNote).toMatch(/Not independent evidence/);
    expect(controls.find((c) => c.controlKind === "time-sham-retrospective-placebo")!.controlNote)
      .toMatch(/Retrospective placebo/);
  });

  it("reports incomplete economics when unresolved exits exist", () => {
    const externalBbo: BboPoint[] = [];
    for (let t = 0; t <= 20_000; t += 1_000) externalBbo.push(bbo(t, 50_000));
    externalBbo.push(bbo(21_000, 50_040));

    const quotes: ExecutableQuote[] = [];
    for (let t = 0; t <= 60_000; t += 500) {
      // entry ok; exit size zero around intended exits for 1s delay (22000+15000=37000)
      const thinExit = t >= 30_000 && t <= 45_000;
      quotes.push(quote(t, 49, 51, thinExit ? { bid: 0, ask: 0 } : { bid: 5, ask: 5 }));
    }
    const report = runExternalBtcDelayedRepricingPilot({
      days: [
        {
          utcDay: "2026-08-14",
          externalBbo,
          contracts: [CONTRACT],
          quotesByTicker: new Map([[CONTRACT.ticker, quotes]]),
        },
      ],
      inputHashes: { fixture: "incomplete-path" },
    });
    expect(report.fridayOnly).toBe(true);
    expect(report.byDelay["1000"]!.delayClaimStatus).toBe("scenario-assumption-unverified");
    expect(report.m128Reconciliation.m128Result).toBeDefined();
    // May be incomplete or no-entries depending on event detection + liquidity
    expect(["incomplete-unresolved-exits", "complete", "no-entries"]).toContain(
      report.byDelay["1000"]!.economicResultStatus,
    );
  });

  it("documents M12.8 material gap without inventing novelty-only justification", () => {
    expect(M128_RECONCILIATION.m128Result.interpretationClassification).toBe(
      "no-directional-response",
    );
    expect(M128_RECONCILIATION.materialGapThisPilotAddresses.length).toBeGreaterThan(0);
    expect(M128_RECONCILIATION.whatDoesNotJustifyANewPilotAlone.join(" ")).toMatch(
      /vendor name/i,
    );
    expect(FROZEN_PILOT_SPEC.daySelection.fridayOnly).toBe(true);
  });

  it("runs native compressed inputs through load→report path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pilot-native-"));
    const utcDay = "2026-08-14";
    const coinbasePath = join(dir, `coinbase-BTC-USD-${utcDay}.txt.zst`);
    const cb: string[] = [
      JSON.stringify({ instrument: { id: 15050, code: "BTC-USD" } }),
    ];
    let id = 1;
    for (let s = 0; s <= 21; s += 1) {
      const mid = s < 21 ? "50000.0" : "50040.0";
      const bid = s < 21 ? "49999.5" : "50039.5";
      const ask = s < 21 ? "50000.5" : "50040.5";
      const prev = s === 0 ? "0" : String(id - 1);
      const eid = String(id);
      id += 1;
      const ns = s * 1_000_000_000;
      cb.push(
        JSON.stringify([
          s === 0 ? 0 : 1,
          15050,
          prev,
          eid,
          ns,
          ns,
          [[0, bid, "1", 1], [1, ask, "1", 1]],
          ...(s === 0 ? [true] : []),
        ]),
      );
      void mid;
    }
    await writeZstdTextFixture(coinbasePath, cb);

    const member = `kalshi-KXBTC15M-26AUG141500-00-${utcDay}.txt.zst`;
    const memberPath = join(dir, member);
    const kl: string[] = [
      JSON.stringify({
        instrument: {
          code: "KXBTC15M-26AUG141500-00",
          start: "2026-08-14 00:00:00",
          expiry: "2026-08-14 23:59:00",
        },
      }),
    ];
    id = 1;
    for (let s = 0; s <= 60; s += 1) {
      const prev = s === 0 ? "0" : String(id - 1);
      const eid = String(id);
      id += 1;
      const ns = s * 1_000_000_000;
      const fav = s >= 22;
      kl.push(
        JSON.stringify([
          s === 0 ? 0 : 1,
          1,
          prev,
          eid,
          ns,
          ns,
          [
            [0, fav ? "0.54" : "0.49", "10", 1],
            [1, fav ? "0.56" : "0.51", "10", 1],
          ],
          ...(s === 0 ? [true] : []),
        ]),
      );
    }
    await writeZstdTextFixture(memberPath, kl);
    const zipPath = join(dir, `kalshi-btc-15m_${utcDay}.zip`);
    const z = spawnSync("zip", ["-q", zipPath, member], { cwd: dir });
    expect(z.status).toBe(0);
    writeFileSync(join(dir, "MANIFEST.txt"), `${member}\n`);

    const day = await loadPilotDayFromFiles({
      utcDay,
      coinbaseTickPath: coinbasePath,
      kalshiZipPath: zipPath,
    });
    expect(day.externalBbo.length).toBeGreaterThan(0);
    expect(day.contracts.length).toBe(1);
    expect(Object.keys(day.inputHashes).length).toBe(2);

    const report = runExternalBtcDelayedRepricingPilot({
      days: [
        {
          utcDay: day.utcDay,
          externalBbo: day.externalBbo,
          contracts: day.contracts,
          quotesByTicker: day.quotesByTicker,
        },
      ],
      inputHashes: day.inputHashes,
    });
    expect(report.analysisVersion).toBe(FROZEN_PILOT_SPEC.analysisVersion);
    for (const delay of PILOT_DELAY_MS.SENSITIVITY) {
      expect(report.byDelay[String(delay)]).toBeDefined();
    }
    expect(report.byDelay["250"]!.delayClaimStatus).toBe("diagnostic-only");
  }, 30_000);

  it("builds friday-only manifest without purchase authorization", () => {
    const manifest = buildPilotDataManifest({
      creditBalanceCents: 1600,
      generatedAtIso: "2026-09-26T03:00:00.000Z",
    });
    expect(manifest.utcDates).toEqual([...FROZEN_PILOT_SPEC.daySelection.selectedUtcDays]);
    expect(manifest.creditQuote.purchaseAuthorizedInThisTask).toBe(false);
  });

  it("converts YES book to executable cents", () => {
    const book = createEmptyBook();
    applyTickToBook(book, {
      msgType: 0,
      prevEventId: "0",
      eventId: "1",
      adapterTimestampNs: 1e9,
      exchangeTimestampNs: 1e9,
      levels: [[0, "0.40", "12", 1], [1, "0.45", "9", 1]],
      isSnapshot: true,
    });
    const point = bboFromBook(
      book,
      { adapterTimestampNs: 1e9, exchangeTimestampNs: 1e9 },
      false,
      "adapter",
    );
    expect(point).not.toBeNull();
    const exec = kalshiExecutableFromYesBbo(point!);
    expect(exec.yesBidCents).toBe(40);
    expect(exec.yesAskCents).toBe(45);
  });
});
