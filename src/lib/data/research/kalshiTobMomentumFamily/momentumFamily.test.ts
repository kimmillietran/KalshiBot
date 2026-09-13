import { describe, expect, it } from "vitest";

import {
  ANCHOR_MATCH_TOLERANCE_MS,
  assertBtcCannotEnterCandidateDefinition,
  assertMultipleHorizonsDoNotInflateCellEss,
  assertNoBtcFields,
  assertNoProbabilityOrTimeBinAxes,
  assertNoReversalInUniverse,
  buildMomentumFamilyDefinitionReport,
  computeFeeAdjustedNetPnlCents,
  computeGrossExecutableOneContractPnlCents,
  computeMomentumEffectiveSampleSize,
  detectFirstMomentumCrossings,
  diagnosticSignedMidpointContinuationCents,
  DIRECTION_CONVENTION,
  enumerateMomentumHypotheses,
  FAMILY_HYPOTHESIS_COUNT,
  FORWARD_HORIZONS_MS,
  matchResponseQuote,
  MOMENTUM_FAMILY_DEFINITION_VERSION,
  passesProbabilityGate,
  passesTimeRemainingGate,
  refractoryPeriodMs,
  resolveBackwardReturnForEvent,
  selectIndependentEpisodes,
  applyRefractoryEpisodeFilter,
  yesMidCents,
  type MomentumQuoteInput,
} from "./index";

function quote(partial: Partial<MomentumQuoteInput> & Pick<MomentumQuoteInput, "timestampMs">): MomentumQuoteInput {
  return {
    marketTicker: "KXBTCD-TEST",
    yesBestBidCents: 40,
    noBestBidCents: 55,
    yesBestBidSize: 10,
    noBestBidSize: 10,
    bookState: "valid",
    isEconomicallyValid: true,
    quoteAgeMs: 100,
    ...partial,
  };
}

/** Build a series where mid moves by `deltaCents` over window ending at t. */
function seriesWithReturn(input: {
  t: number;
  W: number;
  deltaCents: number;
  midAtEvent?: number;
}): MomentumQuoteInput[] {
  const midEvent = input.midAtEvent ?? 50;
  const midAnchor = midEvent - input.deltaCents;
  // yesMid = 50 + (yesBid - noBid)/2 → set yesBid=mid, noBid=100-mid for mid.
  const toBids = (mid: number) => ({
    yesBestBidCents: mid,
    noBestBidCents: 100 - mid,
  });
  return [
    quote({ timestampMs: input.t - input.W, ...toBids(midAnchor) }),
    quote({ timestampMs: input.t - input.W / 2, ...toBids(midAnchor + input.deltaCents / 2) }),
    quote({ timestampMs: input.t, ...toBids(midEvent) }),
  ];
}

describe("M14.0a kalshiTobMomentumFamily", () => {
  it("1. exact midpoint complement identity", () => {
    expect(yesMidCents({ yesBestBidCents: 40, noBestBidCents: 55 })).toBe(42.5);
    expect(yesMidCents({ yesBestBidCents: 50, noBestBidCents: 50 })).toBe(50);
  });

  it("2. no BTC required", () => {
    const report = buildMomentumFamilyDefinitionReport();
    expect(report.btcFeaturesForbidden).toBe(true);
    expect(report.complementBookSemantics.capturedFields).not.toContainEqual(
      expect.stringMatching(/btc/i),
    );
  });

  it("3. BTC cannot enter candidate definition", () => {
    expect(() => assertNoBtcFields({ btcReturn: 1 })).toThrow(/BTC/);
    expect(() =>
      assertBtcCannotEnterCandidateDefinition({ candidateId: "btc-momentum-cell" }),
    ).toThrow(/BTC/);
  });

  it("4-5. backward anchor uses only <=t; anchor after target cannot be used", () => {
    const t = 100_000;
    const W = 5_000;
    const prior = [
      quote({
        timestampMs: t - W + 500,
        yesBestBidCents: 48,
        noBestBidCents: 52,
      }),
    ];
    const event = quote({ timestampMs: t, yesBestBidCents: 52, noBestBidCents: 48 });
    const result = resolveBackwardReturnForEvent({
      eventQuote: event,
      backwardWindowMs: W,
      priorQuotes: prior,
    });
    // Anchor at t-W+500 is after target t-W, so cannot be used; missing eligible at/before target.
    expect(result.status).toBe("fail-closed");
  });

  it("6. missing anchor fails closed", () => {
    const result = resolveBackwardReturnForEvent({
      eventQuote: quote({ timestampMs: 50_000 }),
      backwardWindowMs: 5_000,
      priorQuotes: [],
    });
    expect(result.status).toBe("fail-closed");
    if (result.status === "fail-closed") {
      expect(result.reason).toMatch(/missing/i);
    }
  });

  it("7. >250ms anchor mismatch fails closed", () => {
    const t = 100_000;
    const W = 5_000;
    const result = resolveBackwardReturnForEvent({
      eventQuote: quote({ timestampMs: t, yesBestBidCents: 52, noBestBidCents: 48 }),
      backwardWindowMs: W,
      priorQuotes: [
        quote({
          timestampMs: t - W - (ANCHOR_MATCH_TOLERANCE_MS + 1),
          yesBestBidCents: 48,
          noBestBidCents: 52,
        }),
      ],
    });
    expect(result.status).toBe("fail-closed");
    if (result.status === "fail-closed") {
      expect(result.reason).toMatch(/tolerance/i);
    }
  });

  it("8. invalid/gap/resync inside causal window fails", () => {
    const t = 100_000;
    const W = 5_000;
    const result = resolveBackwardReturnForEvent({
      eventQuote: quote({ timestampMs: t, yesBestBidCents: 52, noBestBidCents: 48 }),
      backwardWindowMs: W,
      priorQuotes: [
        quote({
          timestampMs: t - W,
          yesBestBidCents: 48,
          noBestBidCents: 52,
        }),
        quote({
          timestampMs: t - W / 2,
          yesBestBidCents: 50,
          noBestBidCents: 50,
          bookState: "gap-detected",
        }),
      ],
    });
    expect(result.status).toBe("fail-closed");
    if (result.status === "fail-closed") {
      expect(result.reason).toMatch(/gap|resync|invalid/i);
    }
  });

  it("9-12. first crossing 2¢/3¢; no repeat while inside; re-arm after leave", () => {
    const t0 = 1_000_000;
    const W = 5_000;
    // Build quotes: outside → cross 2¢ → stay inside → leave → recross
    const mk = (ts: number, mid: number, opts?: Partial<MomentumQuoteInput>) =>
      quote({
        timestampMs: ts,
        yesBestBidCents: mid,
        noBestBidCents: 100 - mid,
        ...opts,
      });

    const quotes: MomentumQuoteInput[] = [
      mk(t0, 50),
      mk(t0 + W, 50), // flat
      mk(t0 + W + 1_000, 50),
      // establish anchor then jump +2
      mk(t0 + 20_000 - W, 50),
      mk(t0 + 20_000, 52), // first 2¢ cross
      mk(t0 + 20_000 + 500, 53), // still inside — no re-fire
      mk(t0 + 40_000 - W, 52),
      mk(t0 + 40_000, 50), // leave threshold (return ~0 vs new anchors carefully)
    ];

    // Simpler dedicated series for 2¢ first crossing:
    const twoCent = seriesWithReturn({ t: 200_000, W, deltaCents: 2 });
    const detected2 = detectFirstMomentumCrossings({
      quotes: twoCent,
      backwardWindowMs: W,
      returnThresholdCents: 2,
      forwardHorizonMs: 5_000,
      resolveTimeRemainingMs: () => 10 * 60_000,
    });
    expect(detected2.events.length).toBe(1);
    expect(Math.abs(detected2.events[0]!.backwardReturnCents)).toBeGreaterThanOrEqual(2);

    const threeCent = seriesWithReturn({ t: 300_000, W, deltaCents: 3 });
    const detected3 = detectFirstMomentumCrossings({
      quotes: threeCent,
      backwardWindowMs: W,
      returnThresholdCents: 3,
      forwardHorizonMs: 5_000,
      resolveTimeRemainingMs: () => 10 * 60_000,
    });
    expect(detected3.events.length).toBe(1);

    // Remain inside: jump once and stay elevated vs W=5s anchor without leaving
    const remainBase = 600_000;
    const remainFull = [
      quote({
        timestampMs: remainBase - 5_000,
        yesBestBidCents: 50,
        noBestBidCents: 50,
      }),
      quote({
        timestampMs: remainBase - 2_500,
        yesBestBidCents: 50,
        noBestBidCents: 50,
      }),
      quote({
        timestampMs: remainBase,
        yesBestBidCents: 50,
        noBestBidCents: 50,
      }),
      quote({
        timestampMs: remainBase + 100,
        yesBestBidCents: 52.5,
        noBestBidCents: 47.5,
      }),
      quote({
        timestampMs: remainBase + 200,
        yesBestBidCents: 53,
        noBestBidCents: 47,
      }),
      quote({
        timestampMs: remainBase + 300,
        yesBestBidCents: 53.5,
        noBestBidCents: 46.5,
      }),
    ];
    const remainDet = detectFirstMomentumCrossings({
      quotes: remainFull,
      backwardWindowMs: W,
      returnThresholdCents: 2,
      forwardHorizonMs: 5_000,
      resolveTimeRemainingMs: () => 10 * 60_000,
    });
    expect(remainDet.events.length).toBe(1);

    // Leave then recross
    const rearm = [
      ...seriesWithReturn({ t: 500_000, W, deltaCents: 2 }),
      // leave: flat return
      quote({
        timestampMs: 500_000 + W,
        yesBestBidCents: 52,
        noBestBidCents: 48,
      }),
      quote({
        timestampMs: 500_000 + 2 * W,
        yesBestBidCents: 52,
        noBestBidCents: 48,
      }),
      // recross upward
      quote({
        timestampMs: 500_000 + 3 * W,
        yesBestBidCents: 55,
        noBestBidCents: 45,
      }),
    ];
    const rearmDet = detectFirstMomentumCrossings({
      quotes: rearm,
      backwardWindowMs: W,
      returnThresholdCents: 2,
      forwardHorizonMs: 5_000,
      resolveTimeRemainingMs: () => 10 * 60_000,
    });
    expect(rearmDet.events.length).toBeGreaterThanOrEqual(2);

    // Refractory may suppress the second
    const filtered = applyRefractoryEpisodeFilter({
      events: rearmDet.events,
      forwardHorizonMs: 5_000,
    });
    expect(filtered.refractoryMs).toBe(Math.max(5_000, 2_000));
    void quotes;
  });

  it("13. continuation sign fixed", () => {
    expect(DIRECTION_CONVENTION).toBe("continuation");
    const report = buildMomentumFamilyDefinitionReport();
    expect(report.directionConvention.reversalSearched).toBe(false);
  });

  it("14. reversal candidate cannot be enumerated", () => {
    const cells = enumerateMomentumHypotheses();
    expect(() => assertNoReversalInUniverse(cells)).not.toThrow();
    expect(() =>
      assertNoReversalInUniverse([
        {
          ...cells[0]!,
          directionConvention: "reversal" as "continuation",
          hypothesisId: "W-5000|X-2|H-5000|reversal",
        },
      ]),
    ).toThrow(/Reversal/);
  });

  it("15. horizons exactly 5s/15s/30s", () => {
    expect([...FORWARD_HORIZONS_MS]).toEqual([5_000, 15_000, 30_000]);
    expect(FORWARD_HORIZONS_MS).not.toContain(1_000);
  });

  it("16-18. response strictly after t; >250ms unobservable; missing not zero", () => {
    const eventTs = 10_000;
    const H = 5_000;
    const tooEarly = matchResponseQuote({
      eventTimestampMs: eventTs,
      forwardHorizonMs: H,
      responseQuotes: [quote({ timestampMs: eventTs })],
    });
    expect(tooEarly.status).toBe("response-unobservable");

    const late = matchResponseQuote({
      eventTimestampMs: eventTs,
      forwardHorizonMs: H,
      responseQuotes: [quote({ timestampMs: eventTs + H + 251 })],
    });
    expect(late.status).toBe("response-unobservable");
    if (late.status === "response-unobservable") {
      expect(late.reason).toMatch(/unobservable|mismatch/i);
      expect(late.reason).not.toMatch(/^0/);
    }

    const ok = matchResponseQuote({
      eventTimestampMs: eventTs,
      forwardHorizonMs: H,
      responseQuotes: [quote({ timestampMs: eventTs + H + 10 })],
    });
    expect(ok.status).toBe("observed");
  });

  it("response skips ineligible timestamp-matching quote then uses next eligible", () => {
    const eventTs = 20_000;
    const H = 5_000;
    const result = matchResponseQuote({
      eventTimestampMs: eventTs,
      forwardHorizonMs: H,
      responseQuotes: [
        quote({
          timestampMs: eventTs + H + 5,
          bookState: "gap-detected",
          isEconomicallyValid: false,
        }),
        quote({
          timestampMs: eventTs + H + 50,
          yesBestBidCents: 52,
          noBestBidCents: 48,
        }),
      ],
    });
    expect(result.status).toBe("observed");
    if (result.status === "observed") {
      expect(result.matchedQuoteTimestampMs).toBe(eventTs + H + 50);
    }
  });

  it("anchor failure clears threshold state so later crossing can fire", () => {
    const W = 5_000;
    const t0 = 800_000;
    // Valid outside baseline
    const quotes = [
      quote({
        timestampMs: t0 - W,
        yesBestBidCents: 50,
        noBestBidCents: 50,
      }),
      quote({
        timestampMs: t0,
        yesBestBidCents: 50,
        noBestBidCents: 50,
      }),
      // Would-be inside but missing eligible anchor (too far) → fail-closed clears state
      quote({
        timestampMs: t0 + 60_000,
        yesBestBidCents: 55,
        noBestBidCents: 45,
      }),
      // Recover with proper anchor then cross
      quote({
        timestampMs: t0 + 80_000 - W,
        yesBestBidCents: 50,
        noBestBidCents: 50,
      }),
      quote({
        timestampMs: t0 + 80_000,
        yesBestBidCents: 53,
        noBestBidCents: 47,
      }),
    ];
    const detected = detectFirstMomentumCrossings({
      quotes,
      backwardWindowMs: W,
      returnThresholdCents: 2,
      forwardHorizonMs: 5_000,
      resolveTimeRemainingMs: () => 10 * 60_000,
    });
    expect(detected.events.length).toBeGreaterThanOrEqual(1);
    expect(detected.rejectedReasons.some((row) => /anchor|tolerance|missing/i.test(row.reasons.join(" "))))
      .toBe(true);
  });

  it("19-21. probability and time gates", () => {
    expect(passesProbabilityGate(15)).toBe(true);
    expect(passesProbabilityGate(85)).toBe(true);
    expect(passesProbabilityGate(14.9)).toBe(false);
    expect(passesProbabilityGate(85.1)).toBe(false);
    expect(passesTimeRemainingGate({ timeRemainingMs: 10 * 60_000, forwardHorizonMs: 5_000 }))
      .toBe(true);
    expect(passesTimeRemainingGate({ timeRemainingMs: 15 * 60_000, forwardHorizonMs: 5_000 }))
      .toBe(false);
    expect(passesTimeRemainingGate({ timeRemainingMs: 9_000, forwardHorizonMs: 5_000 })).toBe(false);
  });

  it("22. refractory is max(H,2s)", () => {
    expect(refractoryPeriodMs(5_000)).toBe(5_000);
    expect(refractoryPeriodMs(1_000)).toBe(2_000);
    expect(refractoryPeriodMs(30_000)).toBe(30_000);
  });

  it("23-24. one market/day/cell cap; horizons do not inflate ESS", () => {
    const events = [
      {
        marketTicker: "M1",
        eventTimestampMs: Date.parse("2026-09-10T12:00:00.000Z"),
        backwardWindowMs: 5_000,
        returnThresholdCents: 2,
        forwardHorizonMs: 5_000,
        backwardReturnCents: 2,
        continuationSign: 1 as const,
        eventMidCents: 50,
        timeRemainingMs: 600_000,
        eventFeatures: { yesBestBidCents: 50, noBestBidCents: 50 },
      },
      {
        marketTicker: "M1",
        eventTimestampMs: Date.parse("2026-09-10T18:00:00.000Z"),
        backwardWindowMs: 5_000,
        returnThresholdCents: 2,
        forwardHorizonMs: 5_000,
        backwardReturnCents: 3,
        continuationSign: 1 as const,
        eventMidCents: 51,
        timeRemainingMs: 600_000,
        eventFeatures: { yesBestBidCents: 51, noBestBidCents: 49 },
      },
    ];
    const selected = selectIndependentEpisodes({
      events,
      structuralCellId: "W-5000|X-2|H-5000|continuation",
    });
    expect(selected.independentObservations).toHaveLength(1);
    const ess = computeMomentumEffectiveSampleSize({
      independentObservations: selected.independentObservations,
      rawQuoteCount: 10_000,
    });
    expect(ess.effectiveSampleSize).toBe(1);
    expect(ess.rawQuoteCountIsNeverStatisticalN).toBe(true);
    expect(() =>
      assertMultipleHorizonsDoNotInflateCellEss({
        physicalCrossingCount: 1,
        horizonCount: 3,
        cellEss: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertMultipleHorizonsDoNotInflateCellEss({
        physicalCrossingCount: 1,
        horizonCount: 3,
        cellEss: 3,
      }),
    ).toThrow(/inflate/);
  });

  it("25-27. universe exactly 12; no probability/time-bin axes", () => {
    const cells = enumerateMomentumHypotheses();
    expect(cells).toHaveLength(12);
    expect(FAMILY_HYPOTHESIS_COUNT).toBe(12);
    expect(() => assertNoProbabilityOrTimeBinAxes(cells)).not.toThrow();
  });

  it("28. gross executable distinct from midpoint contract", () => {
    const gross = computeGrossExecutableOneContractPnlCents({
      continuationSign: 1,
      entryYesBestBidCents: 40,
      entryNoBestBidCents: 55,
      exitYesBestBidCents: 45,
      exitNoBestBidCents: 50,
    });
    const diagnostic = diagnosticSignedMidpointContinuationCents({
      continuationSign: 1,
      eventMidCents: 42.5,
      responseMidCents: 47.5,
    });
    // Exact cents (not merely typeof / non-null): buy YES@45, sell@45 → 0; mid +5.
    expect(gross).toBe(0);
    expect(diagnostic).toBe(5);
    expect(gross).not.toBe(diagnostic);
  });

  it("29. fee-adjusted result cannot be produced without fee binding", () => {
    expect(() =>
      computeFeeAdjustedNetPnlCents({
        grossExecutablePnlCents: 2,
        feeContractIdentity: null,
      }),
    ).toThrow(/fee contract/i);
  });

  it("30. deterministic family identity", () => {
    const a = buildMomentumFamilyDefinitionReport({ generatedAt: "2026-09-10T00:00:00.000Z" });
    const b = buildMomentumFamilyDefinitionReport({ generatedAt: "2099-01-01T00:00:00.000Z" });
    expect(a.familyDefinitionIdentityHash).toBe(b.familyDefinitionIdentityHash);
    expect(a.analysisVersion).toBe(MOMENTUM_FAMILY_DEFINITION_VERSION);
    expect(a.outputPaths.outputPath).toContain(a.familyDefinitionIdentityHash);
    expect(a.outputPaths.outputPath).not.toMatch(/latest/i);
  });

  it("31. no historical outcome reads", () => {
    const report = buildMomentumFamilyDefinitionReport();
    expect(report.quarantine.historicalMomentumOutcomesRead).toBe(false);
    expect(report.quarantine.historicalDiscoveryRun).toBe(false);
    expect(report.quarantine.rankingPerformed).toBe(false);
    expect(report.quarantine.promotionArtifactCreated).toBe(false);
    expect(report.quarantine.liveOrdersExecuted).toBe(false);
  });
});
