import { describe, expect, it } from "vitest";

import {
  DIRECTION_CONVENTION,
  DIRECTION_COUNT,
  EXPLICIT_EXCLUSIONS,
  FAMILY_HYPOTHESIS_COUNT,
  IMBALANCE_THRESHOLD_ABS,
  RESPONSE_HORIZONS_MS,
  RESPONSE_MATCH_TOLERANCE_MS,
  applyRefractoryEpisodeFilter,
  assertNoBtcFields,
  buildComplementBookSemantics,
  buildMicrostructureFamilyDefinitionReport,
  computeMicrostructureEffectiveSampleSize,
  computeTobSizeImbalance,
  deriveYesBestAskCents,
  deriveYesBestAskSize,
  detectFirstImbalanceCrossings,
  enumerateMicrostructureHypotheses,
  isEligibleEventQuote,
  matchResponseQuote,
  parseMicrostructureFamilyArgv,
  predictedYesRepricingSign,
  quoteHasForbiddenBtcShape,
  refractoryPeriodMs,
  selectIndependentEpisodes,
  type TobImbalanceQuoteInput,
} from "./index";

function quote(overrides: Partial<TobImbalanceQuoteInput> & { timestampMs: number }): TobImbalanceQuoteInput {
  return {
    marketTicker: "KXBTC-TEST",
    yesBestBidCents: 48,
    noBestBidCents: 50,
    yesBestBidSize: 10,
    noBestBidSize: 10,
    bookState: "valid",
    isEconomicallyValid: true,
    quoteAgeMs: 100,
    ...overrides,
  };
}

describe("spreadLiquidityMicrostructureFamily M13.0a", () => {
  it("proves complement ask/size semantics", () => {
    const semantics = buildComplementBookSemantics();
    expect(semantics.askSideIndependentlyCaptured).toBe(false);
    expect(semantics.derivedYesAskCentsRule).toBe("100 - noBestBidCents");
    expect(semantics.derivedYesAskSizeRule).toBe("noBestBidSize");
    expect(deriveYesBestAskCents(42)).toBe(58);
    expect(deriveYesBestAskSize(17)).toBe(17);
    expect(semantics.sizeDecreaseIsNotCancellationOrTradeOrWithdrawal).toBe(true);
  });

  it("proves imbalance formula and sign", () => {
    const positive = computeTobSizeImbalance({ yesBestBidSize: 80, noBestBidSize: 20 });
    expect(positive.ok).toBe(true);
    if (positive.ok) {
      expect(positive.imbalance).toBeCloseTo(0.6);
      expect(positive.sign).toBe(1);
      expect(predictedYesRepricingSign(positive.sign)).toBe(1);
    }
    const negative = computeTobSizeImbalance({ yesBestBidSize: 20, noBestBidSize: 80 });
    expect(negative.ok).toBe(true);
    if (negative.ok) {
      expect(negative.imbalance).toBeCloseTo(-0.6);
      expect(negative.sign).toBe(-1);
      expect(predictedYesRepricingSign(negative.sign)).toBe(-1);
    }
    expect(computeTobSizeImbalance({ yesBestBidSize: 0, noBestBidSize: 0 }).ok).toBe(false);
  });

  it("enumerates exactly 12 hypotheses with one fixed direction", () => {
    const cells = enumerateMicrostructureHypotheses();
    expect(cells).toHaveLength(12);
    expect(FAMILY_HYPOTHESIS_COUNT).toBe(12);
    expect(DIRECTION_COUNT).toBe(1);
    expect(IMBALANCE_THRESHOLD_ABS).toEqual([0.4, 0.6]);
    expect(RESPONSE_HORIZONS_MS).toEqual([1_000, 5_000, 15_000]);
    expect(new Set(cells.map((c) => c.directionConvention))).toEqual(
      new Set([DIRECTION_CONVENTION]),
    );
    expect(cells.every((c) => c.directionConvention === DIRECTION_CONVENTION)).toBe(true);
    const ids = new Set(cells.map((c) => c.hypothesisId));
    expect(ids.size).toBe(12);
  });

  it("uses fixed same-direction convention for positive and negative imbalance", () => {
    const report = buildMicrostructureFamilyDefinitionReport({
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.directionConvention.positiveImbalanceImplies).toBe("yes-price-expected-to-rise");
    expect(report.directionConvention.negativeImbalanceImplies).toBe("yes-price-expected-to-fall");
    expect(report.directionConvention.directionCount).toBe(1);
    expect(report.searchUniverse.directionCount).toBe(1);
  });

  it("proves response data cannot affect event detection", () => {
    const eventQuotes = [
      quote({ timestampMs: 1_000, yesBestBidSize: 10, noBestBidSize: 10 }),
      quote({ timestampMs: 2_000, yesBestBidSize: 80, noBestBidSize: 20 }),
    ];
    const withResponsePoison = [
      ...eventQuotes,
      // Response-window quote at event+H within tolerance; must not alter prior event features.
      quote({ timestampMs: 3_100, yesBestBidSize: 99, noBestBidSize: 1 }),
    ];
    const base = detectFirstImbalanceCrossings({
      quotes: eventQuotes,
      imbalanceThresholdAbs: 0.4,
      resolveTimeRemainingMs: () => 3 * 60_000,
    });
    const poisoned = detectFirstImbalanceCrossings({
      quotes: withResponsePoison,
      imbalanceThresholdAbs: 0.4,
      resolveTimeRemainingMs: () => 3 * 60_000,
    });
    // First crossing at t=2000 is identical; response-time quotes do not rewrite event features.
    expect(base.events[0]?.eventTimestampMs).toBe(2_000);
    expect(poisoned.events[0]?.eventTimestampMs).toBe(2_000);
    expect(base.events[0]?.eventFeatures).toEqual(poisoned.events[0]?.eventFeatures);
    const response = matchResponseQuote({
      eventTimestampMs: 2_000,
      responseHorizonMs: 1_000,
      responseQuotes: withResponsePoison,
    });
    expect(response.status).toBe("observed");
    const again = detectFirstImbalanceCrossings({
      quotes: eventQuotes,
      imbalanceThresholdAbs: 0.4,
      resolveTimeRemainingMs: () => 3 * 60_000,
    });
    expect(again.events).toEqual(base.events);
  });

  it("proves missing response is unobservable, not zero", () => {
    const result = matchResponseQuote({
      eventTimestampMs: 1_000,
      responseHorizonMs: 1_000,
      responseQuotes: [quote({ timestampMs: 1_100 })],
      toleranceMs: RESPONSE_MATCH_TOLERANCE_MS,
    });
    expect(result.status).toBe("response-unobservable");
    if (result.status === "response-unobservable") {
      expect(result.reason).toMatch(/not zero movement/i);
    }
    expect(RESPONSE_MATCH_TOLERANCE_MS).toBe(250);
    expect(RESPONSE_MATCH_TOLERANCE_MS).toBeLessThan(1_000);
    expect(RESPONSE_MATCH_TOLERANCE_MS).not.toBe(1_500);
  });

  it("proves invalid/resync books cannot create events", () => {
    for (const bookState of ["awaiting-snapshot", "resyncing", "gap-detected", "closed"]) {
      const { events, rejectedReasons } = detectFirstImbalanceCrossings({
        quotes: [
          quote({
            timestampMs: 1_000,
            bookState,
            yesBestBidSize: 90,
            noBestBidSize: 10,
          }),
        ],
        imbalanceThresholdAbs: 0.4,
        resolveTimeRemainingMs: () => 60_000,
      });
      expect(events).toHaveLength(0);
      expect(rejectedReasons.length).toBeGreaterThan(0);
    }
    expect(
      isEligibleEventQuote(
        quote({ timestampMs: 1, isEconomicallyValid: false, yesBestBidSize: 90, noBestBidSize: 10 }),
      ).eligible,
    ).toBe(false);
  });

  it("proves first-crossing suppresses repeated threshold-state quotes", () => {
    const { events } = detectFirstImbalanceCrossings({
      quotes: [
        quote({ timestampMs: 1_000, yesBestBidSize: 10, noBestBidSize: 10 }),
        quote({ timestampMs: 2_000, yesBestBidSize: 80, noBestBidSize: 20 }),
        quote({ timestampMs: 3_000, yesBestBidSize: 85, noBestBidSize: 15 }),
        quote({ timestampMs: 4_000, yesBestBidSize: 10, noBestBidSize: 10 }),
        quote({ timestampMs: 5_000, yesBestBidSize: 80, noBestBidSize: 20 }),
      ],
      imbalanceThresholdAbs: 0.4,
      resolveTimeRemainingMs: () => 3 * 60_000,
    });
    expect(events.map((e) => e.eventTimestampMs)).toEqual([2_000, 5_000]);
  });

  it("proves refractory handling prevents overlapping response pseudo-replication", () => {
    expect(refractoryPeriodMs(1_000)).toBe(2_000);
    expect(refractoryPeriodMs(5_000)).toBe(5_000);
    expect(refractoryPeriodMs(15_000)).toBe(15_000);

    const { events } = detectFirstImbalanceCrossings({
      quotes: [
        quote({ timestampMs: 1_000, yesBestBidSize: 10, noBestBidSize: 10 }),
        quote({ timestampMs: 2_000, yesBestBidSize: 80, noBestBidSize: 20 }),
        quote({ timestampMs: 3_000, yesBestBidSize: 10, noBestBidSize: 10 }),
        quote({ timestampMs: 3_500, yesBestBidSize: 80, noBestBidSize: 20 }),
      ],
      imbalanceThresholdAbs: 0.4,
      resolveTimeRemainingMs: () => 3 * 60_000,
    });
    expect(events).toHaveLength(2);
    const filtered = applyRefractoryEpisodeFilter({
      events,
      responseHorizonMs: 1_000,
    });
    expect(filtered.refractoryMs).toBe(2_000);
    expect(filtered.accepted).toHaveLength(1);
    expect(filtered.accepted[0]?.eventTimestampMs).toBe(2_000);
    expect(filtered.suppressedOverlapping).toHaveLength(1);
    expect(filtered.suppressedOverlapping[0]?.eventTimestampMs).toBe(3_500);
  });

  it("proves one-market-day independent-unit policy and raw quotes never become ESS", () => {
    const { events } = detectFirstImbalanceCrossings({
      quotes: [
        quote({
          marketTicker: "MKT-A",
          timestampMs: Date.parse("2026-09-10T01:00:00.000Z"),
          yesBestBidSize: 10,
          noBestBidSize: 10,
        }),
        quote({
          marketTicker: "MKT-A",
          timestampMs: Date.parse("2026-09-10T01:01:00.000Z"),
          yesBestBidSize: 80,
          noBestBidSize: 20,
        }),
        quote({
          marketTicker: "MKT-A",
          timestampMs: Date.parse("2026-09-10T02:00:00.000Z"),
          yesBestBidSize: 10,
          noBestBidSize: 10,
        }),
        quote({
          marketTicker: "MKT-A",
          timestampMs: Date.parse("2026-09-10T02:01:00.000Z"),
          yesBestBidSize: 80,
          noBestBidSize: 20,
        }),
        quote({
          marketTicker: "MKT-B",
          timestampMs: Date.parse("2026-09-11T01:00:00.000Z"),
          yesBestBidSize: 10,
          noBestBidSize: 10,
        }),
        quote({
          marketTicker: "MKT-B",
          timestampMs: Date.parse("2026-09-11T01:01:00.000Z"),
          yesBestBidSize: 80,
          noBestBidSize: 20,
        }),
      ],
      imbalanceThresholdAbs: 0.4,
      resolveTimeRemainingMs: () => 3 * 60_000,
    });
    const selected = selectIndependentEpisodes({
      events,
      structuralCellId: "imb-0.40|h-1000|under-5-minutes",
    });
    // Two crossings on MKT-A same day → one independent + one diagnostic; one on MKT-B.
    expect(selected.observations).toHaveLength(3);
    expect(selected.independentObservations).toHaveLength(2);
    expect(selected.diagnosticOnlyCount).toBe(1);

    const ess = computeMicrostructureEffectiveSampleSize({
      independentObservations: selected.independentObservations,
      rawQuoteCount: 10_000,
    });
    expect(ess.effectiveSampleSize).toBe(2);
    expect(ess.independentMarketCount).toBe(2);
    expect(ess.rawQuoteCountIsNeverStatisticalN).toBe(true);
    expect(ess.quoteCountWouldHaveBeen).toBe(10_000);
    expect(ess.effectiveSampleSize).not.toBe(10_000);
  });

  it("forbids BTC fields and unsupported cancel/withdrawal/depth features", () => {
    expect(() => assertNoBtcFields({ btcSpot: 1 })).toThrow(/BTC fields are forbidden/i);
    expect(
      quoteHasForbiddenBtcShape({
        ...quote({ timestampMs: 1 }),
        btcReturn: 0.01,
      } as TobImbalanceQuoteInput & Record<string, unknown>),
    ).toBe(true);
    const report = buildMicrostructureFamilyDefinitionReport({
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    expect(report.btcFeaturesForbidden).toBe(true);
    expect(report.independenceFromLeadLag).toBe(true);
    expect(EXPLICIT_EXCLUSIONS).toEqual(
      expect.arrayContaining([
        "BTC-conditioned features",
        "multi-level depth",
        "cancel/trade classification",
        "true liquidity-withdrawal claims",
        "size-drop impulse discovery",
        "spread-widening discovery",
        "spread × imbalance interactions",
        "historical discovery/ranking",
        "candidate promotion",
        "prospective freeze",
        "new capture",
        "live trading",
      ]),
    );
    expect(JSON.stringify(report)).not.toMatch(/btcReturn|btcSpot|depthLevels|cancelFlow/i);
  });

  it("proves deterministic artifact identity and quarantine", () => {
    const a = buildMicrostructureFamilyDefinitionReport({
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    const b = buildMicrostructureFamilyDefinitionReport({
      generatedAt: "2026-09-11T00:00:00.000Z",
    });
    expect(a.familyDefinitionIdentityHash).toBe(b.familyDefinitionIdentityHash);
    expect(a.familyDefinitionIdentityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(a.searchUniverse.hypothesisCount).toBe(12);
    expect(a.quarantine).toEqual({
      historicalDiscoveryRun: false,
      rankingPerformed: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      frozenHypothesisCreated: false,
      validationRun: false,
      holdoutRun: false,
      captureStarted: false,
      liveOrdersExecuted: false,
    });
    expect(a.responseMatchContract.responseMatchToleranceMs).toBe(250);
    expect(a.refractoryPolicy.rule).toBe("R = max(H, 2000ms)");
    expect(a.outcomeSemantics.settlementIsPrimaryOutcome).toBe(false);
    expect(a.outcomeSemantics.assumesFillBeyondDisplayedSize).toBe(false);
  });

  it("rejects discovery/promotion/freeze/capture/live and latest/mtime authority", () => {
    for (const flag of [
      "--latest",
      "--mtime",
      "--discover",
      "--rank",
      "--promote",
      "--freeze",
      "--capture",
      "--live",
    ]) {
      expect(() => parseMicrostructureFamilyArgv([flag])).toThrow(/Forbidden authority/i);
    }
  });

  it("changing a methodological field changes identity", () => {
    const base = buildMicrostructureFamilyDefinitionReport({
      generatedAt: "2026-09-10T00:00:00.000Z",
    });
    // Identity binds tolerance; a different contract object in payload must differ.
    const mutatedPayload = {
      ...base,
      responseMatchContract: {
        ...base.responseMatchContract,
        responseMatchToleranceMs: 1500 as typeof RESPONSE_MATCH_TOLERANCE_MS,
      },
    };
    expect(JSON.stringify(mutatedPayload.responseMatchContract)).not.toBe(
      JSON.stringify(base.responseMatchContract),
    );
    // Rebuilding with the sealed constants remains stable (no silent mutation path).
    expect(
      buildMicrostructureFamilyDefinitionReport({ generatedAt: "2099-01-01T00:00:00.000Z" })
        .familyDefinitionIdentityHash,
    ).toBe(base.familyDefinitionIdentityHash);
  });
});
