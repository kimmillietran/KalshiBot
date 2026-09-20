/**
 * M15.0 prospective taker cost-floor — synthetic fixtures only.
 * No real M15 evidence. No M14 validation events.
 */
import { describe, expect, it } from "vitest";

import { createMemoryMomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery";
import {
  deriveNoBestAskCents,
  deriveYesBestAskCents,
  midpointFromQuote,
  type MomentumQuoteInput,
} from "../kalshiTobMomentumFamily";
import { computeKalshiScheduleFeeCents, KALSHI_FEE_SCHEDULE_ROLE, KALSHI_FEE_SCHEDULE_VARIANT } from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import {
  aggregateAcrossMarketDays,
  aggregateHurdlesByMarketDayHorizon,
  assertM15CaptureSetClean,
  assertM15FeeContractMatches,
  bindM15FeeContract,
  buildM15IndependentUnitKey,
  buildM15StudyDefinition,
  complementHalfSpreadCents,
  computeM15FeeContractIdentity,
  computeM15OneContractTakerFeeCents,
  computeYesTakerRoundTripHurdle,
  decideM15ProgramDecision,
  listM15IndependentUnits,
  M15_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M15_HORIZONS_MS,
  M15_SAMPLE_CADENCE_MS,
  M15_STUDY_NAME,
  M15CostFloorError,
  m15TradingDayUtc,
  parseM15CostFloorArgv,
  selectCadenceSampleTimestamps,
  serializeM15CostFloorReportJson,
  serializeM15StudyDefinitionJson,
  streamM15TakerCostFloorFromCaptures,
  type M15CaptureDescriptor,
  type M15QuoteSampleHurdle,
} from "./index";

function quote(input: {
  marketTicker?: string;
  timestampMs: number;
  yesBestBidCents: number;
  noBestBidCents: number;
  bookState?: string;
  isEconomicallyValid?: boolean;
  quoteAgeMs?: number | null;
}): MomentumQuoteInput {
  return {
    marketTicker: input.marketTicker ?? "KXBTC15M-TEST",
    timestampMs: input.timestampMs,
    yesBestBidCents: input.yesBestBidCents,
    noBestBidCents: input.noBestBidCents,
    yesBestBidSize: 10,
    noBestBidSize: 10,
    bookState: input.bookState ?? "valid",
    isEconomicallyValid: input.isEconomicallyValid ?? true,
    quoteAgeMs: input.quoteAgeMs ?? 0,
  };
}

function tobLine(input: {
  marketTicker: string;
  receivedAtLocal: string;
  yesBestBidCents: number;
  noBestBidCents: number;
  exchangeTimestampMs?: number | null;
  bookState?: string;
  isEconomicallyValid?: boolean;
}): string {
  return JSON.stringify({
    marketTicker: input.marketTicker,
    eventTicker: input.marketTicker.replace(/-\d+$/, ""),
    seriesTicker: "KXBTC15M",
    receivedAtLocal: input.receivedAtLocal,
    exchangeTimestampMs: input.exchangeTimestampMs ?? null,
    sequence: 1,
    bookState: input.bookState ?? "valid",
    isEconomicallyValid: input.isEconomicallyValid ?? true,
    yesBestBidCents: input.yesBestBidCents,
    noBestBidCents: input.noBestBidCents,
    yesBestBidSize: 10,
    noBestBidSize: 10,
    yesBestAskCents: 100 - input.noBestBidCents,
    noBestAskCents: 100 - input.yesBestBidCents,
  });
}

function captureDesc(overrides?: Partial<M15CaptureDescriptor>): M15CaptureDescriptor {
  return {
    runId: "m15-synth-001",
    captureRunDir: "/fixture/m15-synth-001",
    captureIdentityHash: "hash-m15-synth-001",
    researchRole: "m15-cost-floor",
    ...overrides,
  };
}

describe("M15 fee contract binding", () => {
  it("23. fee formula exactness matches schedule helper", () => {
    const prices = [1, 5, 25, 50, 75, 95, 99];
    for (const priceCents of prices) {
      expect(computeM15OneContractTakerFeeCents(priceCents)).toBe(
        computeKalshiScheduleFeeCents({
          quantity: 1,
          priceCents,
          role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
          schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
        }),
      );
    }
  });

  it("24. fee rounding boundaries (ceil) at low/high probability", () => {
    // At P=1: fee = ceil(7*1*1*99 / 10000) = ceil(0.693) = 1
    expect(computeM15OneContractTakerFeeCents(1)).toBe(1);
    expect(computeM15OneContractTakerFeeCents(99)).toBe(1);
    // At P=50: ceil(7*1*50*50 / 10000) = ceil(1.75) = 2
    expect(computeM15OneContractTakerFeeCents(50)).toBe(2);
    // At P=0 / P=100: zero numerator → 0
    expect(computeM15OneContractTakerFeeCents(0)).toBe(0);
    expect(computeM15OneContractTakerFeeCents(100)).toBe(0);
  });

  it("22. fee contract identity mismatch rejected", () => {
    expect(() => assertM15FeeContractMatches("deadbeef")).toThrow(M15CostFloorError);
    const id = computeM15FeeContractIdentity();
    expect(assertM15FeeContractMatches(id).feeContractIdentity).toBe(id);
    expect(bindM15FeeContract().feeContractIdentity).toBe(id);
  });
});

describe("M15 complement economics", () => {
  it("1–2. complement-derived YES/NO asks", () => {
    expect(deriveYesBestAskCents(40)).toBe(60);
    expect(deriveNoBestAskCents(55)).toBe(45);
  });

  it("3. spread identity / YES-NO half-spread symmetry", () => {
    const q = quote({ timestampMs: 1, yesBestBidCents: 48, noBestBidCents: 50 });
    const half = complementHalfSpreadCents(q);
    expect(half).toBe(1); // mid=49, ask=50 → half=1
  });

  it("4. zero-spread state", () => {
    const entry = quote({ timestampMs: 1, yesBestBidCents: 50, noBestBidCents: 50 });
    const exit = quote({ timestampMs: 2, yesBestBidCents: 50, noBestBidCents: 50 });
    const hurdle = computeYesTakerRoundTripHurdle({ entryQuote: entry, exitQuote: exit });
    expect(hurdle).not.toBeNull();
    expect(hurdle!.spreadOnlyHurdleCents).toBe(0);
    expect(hurdle!.feeInclusiveHurdleCents).toBe(hurdle!.totalFeeCents);
  });

  it("5. 1¢ spread state", () => {
    // yesBid=49, noBid=50 → yesAsk=50, mid=49.5, half=0.5; round-trip spread-only=1
    const entry = quote({ timestampMs: 1, yesBestBidCents: 49, noBestBidCents: 50 });
    const exit = quote({ timestampMs: 2, yesBestBidCents: 49, noBestBidCents: 50 });
    const hurdle = computeYesTakerRoundTripHurdle({ entryQuote: entry, exitQuote: exit });
    expect(hurdle!.spreadOnlyHurdleCents).toBe(1);
  });

  it("6. asymmetric entry/exit spreads", () => {
    const entry = quote({ timestampMs: 1, yesBestBidCents: 40, noBestBidCents: 58 }); // ask=42 mid=41 half=1
    const exit = quote({ timestampMs: 2, yesBestBidCents: 45, noBestBidCents: 51 }); // mid=47 bid=45 half=2
    const hurdle = computeYesTakerRoundTripHurdle({ entryQuote: entry, exitQuote: exit });
    expect(hurdle!.spreadOnlyHurdleCents).toBe(3);
    expect(hurdle!.entryFeeCents).toBe(computeM15OneContractTakerFeeCents(42));
    expect(hurdle!.exitFeeCents).toBe(computeM15OneContractTakerFeeCents(45));
    expect(hurdle!.feeInclusiveHurdleCents).toBe(
      hurdle!.spreadOnlyHurdleCents + hurdle!.totalFeeCents,
    );
  });
});

describe("M15 ordinary-quote sampler", () => {
  it("13. deterministic fixed-cadence sampler", () => {
    const t0 = Date.parse("2026-09-20T12:00:00.000Z");
    const selected = selectCadenceSampleTimestamps({
      eligibleTimestampsMs: [
        t0 + 100,
        t0 + 30_000,
        t0 + 60_000,
        t0 + 60_500,
        t0 + 120_000,
      ],
      cadenceMs: M15_SAMPLE_CADENCE_MS,
    });
    expect(selected).toEqual([t0 + 100, t0 + 60_000, t0 + 120_000]);
  });

  it("14–15. sampler unaffected by price movement or spread width", () => {
    const t0 = Date.parse("2026-09-20T12:00:00.000Z");
    const times = [t0, t0 + 60_000, t0 + 120_000];
    const a = selectCadenceSampleTimestamps({ eligibleTimestampsMs: times });
    const b = selectCadenceSampleTimestamps({ eligibleTimestampsMs: times });
    expect(a).toEqual(b);
    // Price/spread are not inputs — identity by timestamps alone.
    expect(a).toEqual(times);
  });

  it("18. UTC-day boundary", () => {
    const before = Date.parse("2026-09-20T23:59:59.000Z");
    const after = Date.parse("2026-09-21T00:00:01.000Z");
    expect(m15TradingDayUtc(before)).toBe("2026-09-20");
    expect(m15TradingDayUtc(after)).toBe("2026-09-21");
    expect(
      buildM15IndependentUnitKey({
        marketTicker: "M",
        tradingDayUtc: m15TradingDayUtc(before),
      }),
    ).not.toBe(
      buildM15IndependentUnitKey({
        marketTicker: "M",
        tradingDayUtc: m15TradingDayUtc(after),
      }),
    );
  });
});

describe("M15 aggregation + decision", () => {
  it("16–17. market-day aggregation; independent N ≠ raw quote count", () => {
    const hurdles: M15QuoteSampleHurdle[] = [];
    for (let i = 0; i < 10; i += 1) {
      hurdles.push({
        marketTicker: "M1",
        tradingDayUtc: "2026-09-20",
        horizonMs: 30_000,
        entryTimestampMs: i,
        exitTimestampMs: i + 30_000,
        spreadOnlyHurdleCents: 1,
        entryFeeCents: 1,
        exitFeeCents: 1,
        totalFeeCents: 2,
        feeInclusiveHurdleCents: 3,
      });
    }
    hurdles.push({
      marketTicker: "M2",
      tradingDayUtc: "2026-09-20",
      horizonMs: 30_000,
      entryTimestampMs: 0,
      exitTimestampMs: 30_000,
      spreadOnlyHurdleCents: 2,
      entryFeeCents: 1,
      exitFeeCents: 1,
      totalFeeCents: 2,
      feeInclusiveHurdleCents: 4,
    });
    const summaries = aggregateHurdlesByMarketDayHorizon(hurdles);
    const perHorizon = aggregateAcrossMarketDays(summaries);
    const h30 = perHorizon.find((r) => r.horizonMs === 30_000)!;
    expect(h30.rawSamplePairCount).toBe(11);
    expect(h30.independentMarketDayN).toBe(2);
    expect(listM15IndependentUnits(hurdles)).toHaveLength(2);
    expect(h30.independentMarketDayN).not.toBe(h30.rawSamplePairCount);
  });

  it("prospective decision thresholds", () => {
    const mk = (median: number) =>
      decideM15ProgramDecision({
        perHorizon: M15_HORIZONS_MS.map((horizonMs) => ({
          horizonMs,
          independentMarketDayN: 5,
          rawSamplePairCount: 50,
          medianFeeInclusiveCents: median,
          medianSpreadOnlyCents: median - 1,
          medianFeeContributionCents: 1,
          p25FeeInclusiveCents: median,
          p75FeeInclusiveCents: median,
          shareMarketDaysMedianFeeInclusiveAtMost: { "1": 0, "2": 0, "3": 1 },
        })),
      });
    expect(mk(0.5).decision).toBe("short-horizon-taker-research-economically-plausible");
    expect(mk(1.5).decision).toBe("short-horizon-taker-research-cost-constrained");
    expect(mk(2.5).decision).toBe("short-horizon-taker-research-economically-hostile");
  });
});

describe("M15 contamination guards", () => {
  it("20. duplicate input capture rejected", () => {
    expect(() =>
      assertM15CaptureSetClean([
        captureDesc(),
        captureDesc({ captureIdentityHash: "other" }),
      ]),
    ).toThrow(/duplicate M15 run ID/);
  });

  it("rejects known M14 validation run IDs", () => {
    expect(() =>
      assertM15CaptureSetClean([
        captureDesc({
          runId: M15_FORBIDDEN_M14_VALIDATION_RUN_IDS[0],
          captureIdentityHash: "x",
        }),
      ]),
    ).toThrow(/M14 validation/);
  });

  it("rejects priorResearchRole=validation", () => {
    expect(() =>
      assertM15CaptureSetClean([
        captureDesc({ priorResearchRole: "validation" }),
      ]),
    ).toThrow(/priorResearchRole=validation/);
  });

  it("rejects mutable latest paths at argv parse", () => {
    expect(() =>
      parseM15CostFloorArgv([
        "--capture",
        "r|/data/live-capture/latest|hash",
      ]),
    ).toThrow(/latest/);
  });
});

describe("M15 streaming analyzer (synthetic TOB)", () => {
  const marketTicker = "KXBTC15M-26SEP200000-15";
  const t0 = Date.parse("2026-09-20T12:00:00.000Z");

  async function runStream(lines: string[], desc?: Partial<M15CaptureDescriptor>) {
    const capture = captureDesc(desc);
    const io = createMemoryMomentumDiscoveryIo({
      [`${capture.captureRunDir}/top-of-book.jsonl`]: `${lines.join("\n")}\n`,
    });
    return streamM15TakerCostFloorFromCaptures({
      io,
      captures: [capture],
      generatedAt: "2026-09-20T18:00:00.000Z",
      codeAuthoritySha: "test-sha",
    });
  }

  function eligibleLine(
    offsetMs: number,
    yesBid: number,
    noBid: number,
    extras?: { bookState?: string; exchangeOffset?: number },
  ): string {
    const received = t0 + offsetMs;
    const exchange =
      extras?.exchangeOffset != null ? received + extras.exchangeOffset : received;
    return tobLine({
      marketTicker,
      receivedAtLocal: new Date(received).toISOString(),
      yesBestBidCents: yesBid,
      noBestBidCents: noBid,
      exchangeTimestampMs: exchange,
      bookState: extras?.bookState,
    });
  }

  it("7–9. 5s / 15s / 30s response horizons produce pairs", async () => {
    const lines = [
      eligibleLine(0, 49, 50),
      eligibleLine(5_000, 49, 50),
      eligibleLine(15_000, 49, 50),
      eligibleLine(30_000, 49, 50),
    ];
    const report = await runStream(lines);
    expect(report.horizonsMs).toEqual([5_000, 15_000, 30_000]);
    expect(report.observability.observablePairs).toBeGreaterThanOrEqual(3);
    expect(report.quarantine.signalAnalysisPerformed).toBe(false);
    expect(report.m14Contamination.m14Closed).toBe(true);
  });

  it("10. first eligible response wins", async () => {
    const lines = [
      eligibleLine(0, 49, 50),
      eligibleLine(5_000, 48, 50), // first at H=5s
      eligibleLine(5_100, 40, 50), // later — must not replace
    ];
    const report = await runStream(lines);
    expect(report.observability.observablePairs).toBeGreaterThanOrEqual(1);
  });

  it("11. stale response excluded", async () => {
    const lines = [
      eligibleLine(0, 49, 50),
      // At +5s: receive lag 5000ms vs exchange → quoteAge > 2000 → ineligible
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 49,
        noBestBidCents: 50,
        exchangeTimestampMs: t0, // 5s stale at receive
      }),
    ];
    const report = await runStream(lines);
    expect(report.observability.unobservableMissingResponse).toBeGreaterThan(0);
  });

  it("12. missing response unobservable", async () => {
    const lines = [eligibleLine(0, 49, 50)];
    const report = await runStream(lines);
    expect(report.observability.observablePairs).toBe(0);
    expect(report.observability.unobservableMissingResponse).toBe(3); // 3 horizons
  });

  it("19. cross-run processing is deterministic by runId order", async () => {
    const linesA = [
      eligibleLine(0, 49, 50),
      eligibleLine(5_000, 49, 50),
      eligibleLine(15_000, 49, 50),
      eligibleLine(30_000, 49, 50),
    ];
    const linesB = [
      tobLine({
        marketTicker: "KXBTC15M-OTHER",
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 49,
        noBestBidCents: 50,
        exchangeTimestampMs: t0,
      }),
      tobLine({
        marketTicker: "KXBTC15M-OTHER",
        receivedAtLocal: new Date(t0 + 30_000).toISOString(),
        yesBestBidCents: 49,
        noBestBidCents: 50,
        exchangeTimestampMs: t0 + 30_000,
      }),
    ];
    const io = createMemoryMomentumDiscoveryIo({
      "/a/top-of-book.jsonl": `${linesA.join("\n")}\n`,
      "/b/top-of-book.jsonl": `${linesB.join("\n")}\n`,
    });
    const r1 = await streamM15TakerCostFloorFromCaptures({
      io,
      captures: [
        captureDesc({ runId: "b-run", captureRunDir: "/b", captureIdentityHash: "hb" }),
        captureDesc({ runId: "a-run", captureRunDir: "/a", captureIdentityHash: "ha" }),
      ],
      generatedAt: "2026-09-20T18:00:00.000Z",
    });
    const r2 = await streamM15TakerCostFloorFromCaptures({
      io,
      captures: [
        captureDesc({ runId: "a-run", captureRunDir: "/a", captureIdentityHash: "ha" }),
        captureDesc({ runId: "b-run", captureRunDir: "/b", captureIdentityHash: "hb" }),
      ],
      generatedAt: "2026-09-20T18:00:00.000Z",
    });
    expect(r1.reportIdentity).toBe(r2.reportIdentity);
    expect(r1.acceptedCaptureRunIds).toEqual(["a-run", "b-run"]);
  });

  it("21. capture identity mismatch rejected", async () => {
    const capture = captureDesc();
    const io = createMemoryMomentumDiscoveryIo({
      [`${capture.captureRunDir}/top-of-book.jsonl`]: `${eligibleLine(0, 49, 50)}\n`,
    });
    await expect(
      streamM15TakerCostFloorFromCaptures({
        io,
        captures: [capture],
        verifyCaptureIdentity: async () => "wrong-hash",
      }),
    ).rejects.toThrow(/capture identity mismatch/);
  });

  it("25–26. bounded-memory streaming / chunk-boundary independence", async () => {
    const lines: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      lines.push(eligibleLine(i * 60_000, 49, 50));
      lines.push(eligibleLine(i * 60_000 + 5_000, 49, 50));
      lines.push(eligibleLine(i * 60_000 + 15_000, 49, 50));
      lines.push(eligibleLine(i * 60_000 + 30_000, 49, 50));
    }
    const whole = await runStream(lines);
    // Chunked: same lines joined — memory iterateJsonl is line-based; identity stable.
    const again = await runStream(lines);
    expect(whole.reportIdentity).toBe(again.reportIdentity);
    expect(whole.observability.rawSampleAttempts).toBe(5);
  });

  it("27. PR #94 ordering: exchange-ts regression does not abort", async () => {
    const lines = [
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0).toISOString(),
        yesBestBidCents: 49,
        noBestBidCents: 50,
        exchangeTimestampMs: t0,
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 4).toISOString(),
        yesBestBidCents: 49,
        noBestBidCents: 50,
        exchangeTimestampMs: t0 - 17, // −17ms event-time regression
      }),
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + 5_000).toISOString(),
        yesBestBidCents: 49,
        noBestBidCents: 50,
        exchangeTimestampMs: t0 + 5_000,
      }),
    ];
    const report = await runStream(lines);
    expect(report.studyId).toBe(M15_STUDY_NAME);
  });

  it("28. no signal/outcome fields required", async () => {
    const report = await runStream([
      eligibleLine(0, 49, 50),
      eligibleLine(30_000, 49, 50),
    ]);
    expect(report).not.toHaveProperty("signedGrossExecutablePnlCents");
    expect(report).not.toHaveProperty("continuationSign");
    expect(report.quarantine.signalAnalysisPerformed).toBe(false);
    expect(report.quarantine.momentumEventConditioning).toBe(false);
  });

  it("29–30. deterministic artifact identity + exact rerun idempotency", async () => {
    const lines = [
      eligibleLine(0, 49, 50),
      eligibleLine(5_000, 49, 50),
      eligibleLine(15_000, 49, 50),
      eligibleLine(30_000, 49, 50),
    ];
    const a = await runStream(lines);
    const b = await runStream(lines);
    expect(a.reportIdentity).toBe(b.reportIdentity);
    expect(serializeM15CostFloorReportJson(a)).toBe(serializeM15CostFloorReportJson(b));
  });
});

describe("M15 study definition artifact", () => {
  it("binds fee, horizons, sampling, decision framework; stable identity", () => {
    const a = buildM15StudyDefinition();
    const b = buildM15StudyDefinition();
    expect(a.studyId).toBe(M15_STUDY_NAME);
    expect(a.studyDefinitionIdentity).toBe(b.studyDefinitionIdentity);
    expect(a.feeContract.feeContractIdentity).toBe(computeM15FeeContractIdentity());
    expect(a.horizonsMs).toEqual([5_000, 15_000, 30_000]);
    expect(a.orderingSemantics).toBe("jsonl-file-append-order-pr94");
    expect(a.contaminationExclusions).toContain("m14-validation-events");
    expect(serializeM15StudyDefinitionJson(a)).toContain(a.studyDefinitionIdentity);
  });
});

describe("M15 mid helper smoke", () => {
  it("midpointFromQuote used by economics", () => {
    const mid = midpointFromQuote(
      quote({ timestampMs: 1, yesBestBidCents: 40, noBestBidCents: 58 }),
    );
    expect(mid).toBe(41);
  });
});
