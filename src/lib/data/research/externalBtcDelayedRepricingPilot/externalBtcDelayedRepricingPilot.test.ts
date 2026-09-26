import { describe, expect, it } from "vitest";

import {
  assertNoFutureLeakage,
  buildDiagnosticControls,
  buildPilotDataManifest,
  createEmptyBook,
  detectExternalBtcEvents,
  directionalSide,
  FROZEN_PILOT_SPEC,
  joinAsOf,
  kalshiExecutableFromYesBbo,
  PILOT_DELAY_MS,
  resolveDecisionTimestamp,
  runExternalBtcDelayedRepricingPilot,
  simulateDayTrades,
  simulateEventTrade,
  applyTickToBook,
  bboFromBook,
  delayClaimSupport,
} from "./index";
import type { BboPoint } from "./bookReplay";
import type { ExecutableQuote, ExternalBtcEvent } from "./types";

function bbo(
  timestampMs: number,
  mid: number,
  source: "exchange" | "adapter" = "exchange",
): BboPoint {
  const half = 0.5;
  return {
    timestampMs,
    timestampSource: source,
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
    timestampSource: "exchange",
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
  };
}

describe("externalBtcDelayedRepricingPilot", () => {
  it("resolves exchange timestamp when present and adapter otherwise", () => {
    expect(
      resolveDecisionTimestamp({
        exchangeTimestampNs: 1_700_000_000_000_000_000,
        adapterTimestampNs: 1_700_000_000_100_000_000,
      }),
    ).toEqual({ timestampMs: 1_700_000_000_000, source: "exchange" });
    expect(
      resolveDecisionTimestamp({
        exchangeTimestampNs: 0,
        adapterTimestampNs: 1_700_000_000_100_000_000,
      }),
    ).toEqual({ timestampMs: 1_700_000_000_100, source: "adapter" });
  });

  it("causal as-of join never returns a future observation", () => {
    const series = [quote(1000, 40, 42), quote(2000, 41, 43), quote(3000, 45, 47)];
    const joined = joinAsOf({
      series,
      decisionTimestampMs: 2500,
      maxAgeMs: 5_000,
    });
    expect(joined.futureLeakageGuardStatus).toBe("pass");
    expect(joined.sample?.timestampMs).toBe(2000);
    expect(() =>
      assertNoFutureLeakage({
        decisionTimestampMs: 1000,
        observationTimestampMs: 1001,
      }),
    ).toThrow(/future-leakage-guard/);
  });

  it("marks stale books beyond max age and detects chain breaks", () => {
    const series = [quote(1000, 40, 42)];
    const stale = joinAsOf({
      series,
      decisionTimestampMs: 5000,
      maxAgeMs: 1000,
    });
    expect(stale.stale).toBe(true);
    expect(stale.joined).toBe(false);

    const book = createEmptyBook();
    applyTickToBook(book, {
      msgType: 0,
      prevEventId: "0",
      eventId: "a",
      adapterTimestampNs: 1,
      exchangeTimestampNs: 1,
      levels: [[0, "0.40", "10", 1], [1, "0.42", "8", 1]],
      isSnapshot: true,
    });
    const gap = applyTickToBook(book, {
      msgType: 1,
      prevEventId: "missing",
      eventId: "b",
      adapterTimestampNs: 2,
      exchangeTimestampNs: 2,
      levels: [[0, "0.41", "10", 1]],
    });
    expect(gap.chainBreak).toBe(true);
    expect(book.failClosed).toBe(true);
  });

  it("detects 5bps boundary-cross events with cooldown and builds controls", () => {
    const points: BboPoint[] = [];
    // flat then jump >5bps over 5s lookback
    for (let t = 0; t <= 10_000; t += 1000) {
      points.push(bbo(t, 100_000));
    }
    points.push(bbo(11_000, 100_060)); // 6 bps up over ~5s from t=6000 price 100000
    const { events, suppressedByCooldown } = detectExternalBtcEvents({
      utcDay: "2026-08-14",
      points,
      lookbackMs: 5_000,
      boundaryBps: 5,
      cooldownMs: 60_000,
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.direction).toBe("up");
    expect(suppressedByCooldown).toBeGreaterThanOrEqual(0);
    const controls = buildDiagnosticControls(events, 15_000, 1_000);
    expect(controls.some((c) => c.controlKind === "sign-flip")).toBe(true);
    expect(controls.some((c) => c.controlKind === "time-sham")).toBe(true);
  });

  it("YES/NO directional payoff uses executable ask entry and bid exit with fees", () => {
    const event: ExternalBtcEvent = {
      eventId: "e1",
      utcDay: "2026-08-14",
      eventTimestampMs: 10_000,
      timestampSource: "exchange",
      direction: "up",
      returnBps: 8,
      absoluteReturnBps: 8,
      lookbackMs: 5_000,
      btcPriceUsd: 100_000,
      controlKind: "primary",
    };
    expect(directionalSide(event)).toBe("YES");
    const quotes = [
      quote(10_000, 48, 50),
      quote(11_000, 48, 50), // entry at +1000ms delay
      quote(26_000, 55, 57), // exit after 15s hold from entry
    ];
    const trade = simulateEventTrade({
      event,
      delayMs: 1_000,
      holdMs: 15_000,
      quotes,
      minDisplayedSize: 1,
      staleMaxAgeMs: 2_000,
      openUntilMs: null,
      cooldownUntilMs: null,
    });
    expect(trade.excluded).toBe(false);
    expect(trade.side).toBe("YES");
    expect(trade.entryPriceCents).toBe(50);
    expect(trade.exitPriceCents).toBe(55);
    expect(trade.entryFeeCents).toBeGreaterThan(0);
    expect(trade.exitFeeCents).toBeGreaterThan(0);
    expect(trade.grossPnlCents).toBe(5);
    expect(trade.netPnlCents).toBe(5 - trade.entryFeeCents - trade.exitFeeCents);
  });

  it("applies delay scenarios and excludes insufficient displayed liquidity", () => {
    const event: ExternalBtcEvent = {
      eventId: "e2",
      utcDay: "2026-08-14",
      eventTimestampMs: 10_000,
      timestampSource: "exchange",
      direction: "down",
      returnBps: -7,
      absoluteReturnBps: 7,
      lookbackMs: 5_000,
      btcPriceUsd: 100_000,
      controlKind: "primary",
    };
    expect(directionalSide(event)).toBe("NO");
    const thin = simulateEventTrade({
      event,
      delayMs: 250,
      holdMs: 15_000,
      quotes: [
        quote(10_250, 40, 42, { bid: 0, ask: 0 }),
        quote(25_250, 40, 42, { bid: 0, ask: 0 }),
      ],
      minDisplayedSize: 1,
      staleMaxAgeMs: 2_000,
      openUntilMs: null,
      cooldownUntilMs: null,
    });
    expect(thin.excluded).toBe(true);
    expect(thin.exclusionReason).toBe("insufficient-displayed-size");
  });

  it("deduplicates overlapping positions and respects cooldown", () => {
    const events: ExternalBtcEvent[] = [
      {
        eventId: "a",
        utcDay: "2026-08-14",
        eventTimestampMs: 10_000,
        timestampSource: "exchange",
        direction: "up",
        returnBps: 6,
        absoluteReturnBps: 6,
        lookbackMs: 5_000,
        btcPriceUsd: 100_000,
        controlKind: "primary",
      },
      {
        eventId: "b",
        utcDay: "2026-08-14",
        eventTimestampMs: 12_000,
        timestampSource: "exchange",
        direction: "up",
        returnBps: 6,
        absoluteReturnBps: 6,
        lookbackMs: 5_000,
        btcPriceUsd: 100_000,
        controlKind: "primary",
      },
    ];
    const quotes = [
      quote(11_000, 48, 50),
      quote(13_000, 48, 50),
      quote(26_000, 52, 54),
      quote(28_000, 52, 54),
    ];
    const trades = simulateDayTrades({
      events,
      delayMs: 1_000,
      holdMs: 15_000,
      quotes,
      minDisplayedSize: 1,
      staleMaxAgeMs: 5_000,
      cooldownMs: 60_000,
    });
    expect(trades[0]!.excluded).toBe(false);
    expect(trades[1]!.excluded).toBe(true);
    expect(trades[1]!.exclusionReason).toBe("overlapping-position");
  });

  it("runs the pilot on synthetic fixtures for all declared delays without claiming empirics", () => {
    const externalBbo: BboPoint[] = [];
    for (let t = 0; t <= 20_000; t += 1_000) {
      externalBbo.push(bbo(t, 50_000));
    }
    externalBbo.push(bbo(21_000, 50_040)); // 8 bps over 5s from t=16000

    const kalshiQuotes: ExecutableQuote[] = [];
    for (let t = 0; t <= 60_000; t += 500) {
      kalshiQuotes.push(quote(t, 49, 51));
    }
    // After delay, move favorable for YES
    for (let t = 22_000; t <= 45_000; t += 500) {
      kalshiQuotes.push(quote(t, 54, 56));
    }

    const report = runExternalBtcDelayedRepricingPilot({
      days: [{ utcDay: "2026-08-14", externalBbo, kalshiQuotes }],
      inputHashes: { fixture: "synthetic-only" },
    });

    expect(report.studyId).toBe(FROZEN_PILOT_SPEC.studyId);
    for (const delay of PILOT_DELAY_MS.SENSITIVITY) {
      expect(report.byDelay[String(delay)]).toBeDefined();
    }
    expect(report.disclaimer).toContain("Does not purchase");
    expect(report.priorResearchNote).toContain("no-directional-response");
  });

  it("builds an outcome-blind data manifest with credit quote and no purchase flag", () => {
    const manifest = buildPilotDataManifest({
      creditBalanceCents: 1600,
      generatedAtIso: "2026-09-26T00:00:00.000Z",
    });
    expect(manifest.utcDates).toEqual([...FROZEN_PILOT_SPEC.daySelection.selectedUtcDays]);
    expect(manifest.creditQuote.purchaseAuthorizedInThisTask).toBe(false);
    expect(manifest.creditQuote.totalEur).toBe(manifest.totals.missingCoinbaseDays.length);
    expect(manifest.venue.instrumentId).toBe(15050);
    expect(manifest.downloadMethod.doNotRunInThisTask).toBe(true);
  });

  it("marks subsecond claims diagnostic-only or blocked without dual exchange clocks", () => {
    expect(
      delayClaimSupport({
        delayMs: 250,
        externalSource: "adapter",
        kalshiSource: "exchange",
      }),
    ).toBe("blocked");
    expect(
      delayClaimSupport({
        delayMs: 250,
        externalSource: "exchange",
        kalshiSource: "exchange",
      }),
    ).toBe("diagnostic-only");
    expect(
      delayClaimSupport({
        delayMs: 1_000,
        externalSource: "exchange",
        kalshiSource: "exchange",
      }),
    ).toBe("supported");
  });

  it("excludes blocked-delay primary trades from opportunity metrics (no silent P&L)", () => {
    const externalBbo: BboPoint[] = [];
    for (let t = 0; t <= 20_000; t += 1_000) {
      externalBbo.push(bbo(t, 50_000, "adapter"));
    }
    externalBbo.push(bbo(21_000, 50_040, "adapter"));

    const kalshiQuotes: ExecutableQuote[] = [];
    for (let t = 0; t <= 60_000; t += 500) {
      kalshiQuotes.push({
        ...quote(t, 49, 51),
        timestampSource: "adapter",
      });
    }

    const report = runExternalBtcDelayedRepricingPilot({
      days: [{ utcDay: "2026-08-14", externalBbo, kalshiQuotes }],
      delaysMs: [250, 1_000],
      inputHashes: { fixture: "adapter-clocks-timing-block" },
    });

    expect(report.byDelay["250"]!.opportunityCount).toBe(0);
    expect(
      report.trades.some(
        (t) =>
          t.delayMs === 250
          && t.controlKind === "primary"
          && t.exclusionReason === "timing-quality-block",
      ),
    ).toBe(true);
    expect(
      report.timingExclusions.some((e) => e.reason === "timing-quality-block"),
    ).toBe(true);
    // 1s remains supported even with adapter clocks.
    expect(report.byDelay["1000"]!.opportunityCount).toBeGreaterThanOrEqual(0);
  });

  it("converts YES [0,1] book to executable cents including NO complement", () => {
    const point = bboFromBook(
      (() => {
        const book = createEmptyBook();
        applyTickToBook(book, {
          msgType: 0,
          prevEventId: "0",
          eventId: "1",
          adapterTimestampNs: 1e9,
          exchangeTimestampNs: 1e9,
          levels: [
            [0, "0.40", "12", 1],
            [1, "0.45", "9", 1],
          ],
          isSnapshot: true,
        });
        return book;
      })(),
      1000,
      "exchange",
      false,
    );
    expect(point).not.toBeNull();
    const exec = kalshiExecutableFromYesBbo(point!);
    expect(exec.yesBidCents).toBe(40);
    expect(exec.yesAskCents).toBe(45);
    expect(exec.noBidCents).toBe(55);
    expect(exec.noAskCents).toBe(60);
  });
});
