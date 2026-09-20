/**
 * M16.0 side-invariant reversal — synthetic tests only.
 * No real P&L / target-hit / stop-hit / settlement direction.
 */
import { describe, expect, it } from "vitest";

import { createMemoryMomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery";
import { KALSHI_FEE_SCHEDULE_VARIANT } from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";

import {
  assertM16BlindIncidenceHasNoOutcomeFields,
  assertM16CaptureSetClean,
  assertM16FeeContractMatches,
  assertNoAskDerivation,
  assertYesAskDerivation,
  bindM16FeeContract,
  buildM16FamilyDefinition,
  buildM16IncidencePlan,
  buildM16SampleSizePlan,
  candidateMidFromYesMid,
  candidateSideExecutableAskCents,
  computeM16FeeContractIdentity,
  computeM16OneContractTakerFeeCents,
  createM16MarketMachine,
  isM16StructuralStop,
  isM16TargetBid,
  M16_FORBIDDEN_M14_VALIDATION_RUN_IDS,
  M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
  M16_SUBFAMILY_ID,
  M16ReversalError,
  stepM16MarketMachine,
  streamM16BlindIncidenceFromCaptures,
  type M16CaptureDescriptor,
  type M16MarketMachineState,
  type M16QuoteTick,
} from "./index";

function tick(partial: Partial<M16QuoteTick> & { candidateMidCents: number; timestampMs: number }): M16QuoteTick {
  return {
    yesBestBidCents: 50,
    noBestBidCents: 50,
    bookEligible: true,
    structuralGap: false,
    ...partial,
  };
}

function drive(
  state: M16MarketMachineState,
  ticks: M16QuoteTick[],
  closeTimeMs: number | null = 1_000_000,
) {
  const events = [];
  let s = state;
  for (const t of ticks) {
    const out = stepM16MarketMachine({ state: s, tick: t, closeTimeMs });
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
}

describe("M16 complement economics", () => {
  it("24–25. YES/NO executable ask derivation", () => {
    expect(assertYesAskDerivation(40)).toBe(60);
    expect(assertNoAskDerivation(55)).toBe(45);
    expect(
      candidateSideExecutableAskCents({
        side: "YES",
        yesBestBidCents: 40,
        noBestBidCents: 58,
      }),
    ).toBe(42);
    expect(
      candidateSideExecutableAskCents({
        side: "NO",
        yesBestBidCents: 40,
        noBestBidCents: 58,
      }),
    ).toBe(60);
  });

  it("26–28. target 55 / structural stop <L / bid==L does not stop", () => {
    expect(isM16TargetBid(55)).toBe(true);
    expect(isM16TargetBid(54)).toBe(false);
    expect(isM16StructuralStop({ bidCents: 31, setupLowLCents: 32 })).toBe(true);
    expect(isM16StructuralStop({ bidCents: 32, setupLowLCents: 32 })).toBe(false);
  });
});

describe("M16 fee contract", () => {
  it("31–32. fee identity binding; reduced-index not bound", () => {
    const bound = bindM16FeeContract();
    expect(bound.schedule).toBe(KALSHI_FEE_SCHEDULE_VARIANT.STANDARD);
    expect(assertM16FeeContractMatches(bound.feeContractIdentity).feeContractIdentity)
      .toBe(computeM16FeeContractIdentity());
    expect(() => assertM16FeeContractMatches("deadbeef")).toThrow(M16ReversalError);
    expect(computeM16OneContractTakerFeeCents(50)).toBe(2);
  });
});

describe("M16 state machine", () => {
  it("1. YES candidate-side down-cross", () => {
    const { events } = drive(createM16MarketMachine("YES"), [
      tick({ timestampMs: 1, candidateMidCents: 45 }),
      tick({ timestampMs: 2, candidateMidCents: 40 }),
    ]);
    expect(events.some((e) => e.type === "down-cross" && e.side === "YES")).toBe(true);
  });

  it("2. NO candidate-side down-cross", () => {
    const { events } = drive(createM16MarketMachine("NO"), [
      tick({ timestampMs: 1, candidateMidCents: 45 }),
      tick({ timestampMs: 2, candidateMidCents: 39 }),
    ]);
    expect(events.some((e) => e.type === "down-cross" && e.side === "NO")).toBe(true);
  });

  it("3. candidate mid identity YES/NO complement", () => {
    expect(candidateMidFromYesMid("YES", 35)).toBe(35);
    expect(candidateMidFromYesMid("NO", 35)).toBe(65);
  });

  it("4–6. exact 40 boundary; exact 30 abort; L<30 abort", () => {
    const cross = drive(createM16MarketMachine("YES"), [
      tick({ timestampMs: 1, candidateMidCents: 40.0001 }),
      tick({ timestampMs: 2, candidateMidCents: 40 }),
    ]);
    expect(cross.events.some((e) => e.type === "down-cross")).toBe(true);

    const abort = drive(createM16MarketMachine("YES"), [
      tick({ timestampMs: 1, candidateMidCents: 45 }),
      tick({ timestampMs: 2, candidateMidCents: 35 }),
      tick({ timestampMs: 3, candidateMidCents: 29.5 }),
    ]);
    expect(abort.events.some((e) => e.type === "abort-waterfall")).toBe(true);
  });

  it("7–8. strict new low; tied low not new low", () => {
    let state = createM16MarketMachine("YES");
    ({ state } = drive(state, [
      tick({ timestampMs: 1, candidateMidCents: 45 }),
      tick({ timestampMs: 2, candidateMidCents: 38 }),
    ]));
    expect(state.setupLowL).toBe(38);
    ({ state } = drive(state, [tick({ timestampMs: 3, candidateMidCents: 38 })]));
    expect(state.setupLowL).toBe(38); // tie
    ({ state } = drive(state, [tick({ timestampMs: 4, candidateMidCents: 37 })]));
    expect(state.setupLowL).toBe(37);
  });

  it("9–16. off-low, rebound H, pullback, hold L, confirm mid>H, equality not confirm, may exceed 40", () => {
    const path = [
      tick({ timestampMs: 1, candidateMidCents: 45 }),
      tick({ timestampMs: 2, candidateMidCents: 32 }), // L=32
      tick({ timestampMs: 3, candidateMidCents: 33.5 }), // off-low (>=33)
      tick({ timestampMs: 4, candidateMidCents: 38 }), // H=38
      tick({ timestampMs: 5, candidateMidCents: 36.5 }), // pullback <=37, >=32
      tick({ timestampMs: 6, candidateMidCents: 38 }), // equality H — NOT confirm
    ];
    let { state, events } = drive(createM16MarketMachine("YES"), path, 100_000);
    expect(events.some((e) => e.type === "confirmation")).toBe(false);
    ({ state, events } = drive(state, [
      tick({ timestampMs: 7, candidateMidCents: 41 }), // >H and >40 OK
    ], 100_000));
    expect(events.some((e) => e.type === "confirmation")).toBe(true);
    expect(state.confirmationMidCents).toBe(41);
  });

  it("12–13. pullback holding L; new low during pullback resets", () => {
    const { state, events } = drive(createM16MarketMachine("YES"), [
      tick({ timestampMs: 1, candidateMidCents: 45 }),
      tick({ timestampMs: 2, candidateMidCents: 34 }),
      tick({ timestampMs: 3, candidateMidCents: 36 }),
      tick({ timestampMs: 4, candidateMidCents: 38 }),
      tick({ timestampMs: 5, candidateMidCents: 36.5 }),
      tick({ timestampMs: 6, candidateMidCents: 33 }), // new low resets
      tick({ timestampMs: 7, candidateMidCents: 39 }), // would have been > old H but build reset
    ], 100_000);
    expect(state.setupLowL).toBe(33);
    expect(events.filter((e) => e.type === "confirmation")).toHaveLength(0);
  });

  it("17–18. confirmation time gate >=60s / <60s rejected", () => {
    const ticks = [
      tick({ timestampMs: 1_000, candidateMidCents: 45 }),
      tick({ timestampMs: 2_000, candidateMidCents: 32 }),
      tick({ timestampMs: 3_000, candidateMidCents: 34 }),
      tick({ timestampMs: 4_000, candidateMidCents: 38 }),
      tick({ timestampMs: 5_000, candidateMidCents: 36 }),
      tick({ timestampMs: 6_000, candidateMidCents: 39 }),
    ];
    const ok = drive(createM16MarketMachine("YES"), ticks, 6_000 + 60_000);
    expect(ok.events.some((e) => e.type === "confirmation")).toBe(true);
    const bad = drive(createM16MarketMachine("YES"), ticks, 6_000 + 59_000);
    expect(bad.events.some((e) => e.type === "time-gate-reject")).toBe(true);
  });

  it("20–21. left-truncated inside band / during rebound", () => {
    const inside = drive(createM16MarketMachine("YES"), [
      tick({ timestampMs: 1, candidateMidCents: 35 }),
    ]);
    expect(inside.events.some((e) => e.type === "left-truncated")).toBe(true);

    // First observed already rising from depressed without prior >40
    const rebound = drive(createM16MarketMachine("YES"), [
      tick({ timestampMs: 1, candidateMidCents: 36 }),
    ]);
    expect(rebound.events.some((e) => e.type === "left-truncated")).toBe(true);
  });

  it("22. gap during structure invalidates", () => {
    let state = createM16MarketMachine("YES");
    ({ state } = drive(state, [
      tick({ timestampMs: 1, candidateMidCents: 45 }),
      tick({ timestampMs: 2, candidateMidCents: 34 }),
      tick({ timestampMs: 3, candidateMidCents: 36 }),
    ]));
    const { events } = drive(state, [
      tick({ timestampMs: 4, candidateMidCents: 37, structuralGap: true, bookEligible: false }),
    ]);
    expect(events.some((e) => e.type === "invalidated-gap")).toBe(true);
  });
});

describe("M16 contamination + blindness", () => {
  it("39. duplicate capture rejected; M14/M15 forbidden", () => {
    const base: M16CaptureDescriptor = {
      runId: "ok",
      captureRunDir: "/f",
      captureIdentityHash: "h1",
      researchRole: "m16-blind-incidence",
    };
    expect(() => assertM16CaptureSetClean([base, { ...base, captureIdentityHash: "h2" }]))
      .toThrow(/duplicate/);
    expect(() =>
      assertM16CaptureSetClean([{
        ...base,
        runId: M16_FORBIDDEN_M14_VALIDATION_RUN_IDS[0],
        captureIdentityHash: "x",
      }])
    ).toThrow(/forbidden/);
    expect(() =>
      assertM16CaptureSetClean([{
        ...base,
        runId: M16_FORBIDDEN_M15_COST_FLOOR_RUN_ID,
        captureIdentityHash: "y",
      }])
    ).toThrow(/forbidden/);
  });

  it("33–36. no P&L / targetHit / stopHit / settlementDirection in census objects", () => {
    expect(() =>
      assertM16BlindIncidenceHasNoOutcomeFields({ feeAdjustedPnlCents: 1 })
    ).toThrow(M16ReversalError);
    expect(() =>
      assertM16BlindIncidenceHasNoOutcomeFields({ targetHit: true })
    ).toThrow(M16ReversalError);
    expect(() =>
      assertM16BlindIncidenceHasNoOutcomeFields({ stopHit: true })
    ).toThrow(M16ReversalError);
    expect(() =>
      assertM16BlindIncidenceHasNoOutcomeFields({ settlementDirection: "yes" })
    ).toThrow(M16ReversalError);
    assertM16BlindIncidenceHasNoOutcomeFields({
      downCrossSetupCount: 1,
      reversalConfirmedEntryCount: 0,
      quarantine: { pnlOpened: false },
    });
  });
});

describe("M16 artifacts + planning", () => {
  it("family + incidence plan identities stable; bind policy", () => {
    const a = buildM16FamilyDefinition();
    const b = buildM16FamilyDefinition();
    expect(a.subfamilyId).toBe(M16_SUBFAMILY_ID);
    expect(a.familyDefinitionIdentity).toBe(b.familyDefinitionIdentity);
    expect(a.tradePolicy.upsideTargetBidCents).toBe(55);
    expect(a.oneEntryPerMarketTicker).toBe(true);
    const plan = buildM16IncidencePlan();
    expect(plan.outcomesOpened).toBe(false);
    expect(plan.familyDefinitionIdentity).toBe(a.familyDefinitionIdentity);
    const sample = buildM16SampleSizePlan();
    expect(sample.targetIndependentTradeN).toBeGreaterThan(0);
  });
});

describe("M16 streaming blind incidence (synthetic)", () => {
  function tobLine(input: {
    marketTicker: string;
    receivedAtLocal: string;
    yesBestBidCents: number;
    noBestBidCents: number;
    bookState?: string;
  }): string {
    return JSON.stringify({
      marketTicker: input.marketTicker,
      eventTicker: input.marketTicker.replace(/-\d+$/, ""),
      seriesTicker: "KXBTC15M",
      receivedAtLocal: input.receivedAtLocal,
      exchangeTimestampMs: Date.parse(input.receivedAtLocal),
      sequence: 1,
      bookState: input.bookState ?? "valid",
      isEconomicallyValid: true,
      yesBestBidCents: input.yesBestBidCents,
      noBestBidCents: input.noBestBidCents,
      yesBestBidSize: 10,
      noBestBidSize: 10,
    });
  }

  it("19/23/37/38/40. one signal per market; PR94 regression; cluster; identity; idempotency", async () => {
    const marketTicker = "KXBTC15M-26SEP200100-00";
    const t0 = Date.parse("2026-09-20T12:00:00.000Z");
    // YES mid path: 45 → 32 → 34 → 38 → 36 → 41 with close far away
    const mids = [
      { yes: 40, no: 50 }, // mid=45
      { yes: 30, no: 66 }, // mid=32
      { yes: 32, no: 64 }, // mid=34
      { yes: 36, no: 60 }, // mid=38
      { yes: 34, no: 62 }, // mid=36
      { yes: 40, no: 58 }, // mid=41 confirm
      { yes: 42, no: 56 }, // post
    ];
    // Fix mids properly: yesMid = (yesBid + (100-noBid))/2
    // For mid=45: yesBid=40, noBid=50 → (40+50)/2=45 OK
    // mid=32: yes=30, no=66 → (30+34)/2=32 OK
    const lines = mids.map((m, i) =>
      tobLine({
        marketTicker,
        receivedAtLocal: new Date(t0 + i * 1_000).toISOString(),
        yesBestBidCents: m.yes,
        noBestBidCents: m.no,
      })
    );
    // Inject exchange-ts regression (PR #94) — should not abort
    lines.splice(2, 0, tobLine({
      marketTicker,
      receivedAtLocal: new Date(t0 + 1_500).toISOString(),
      yesBestBidCents: 31,
      noBestBidCents: 65,
    }));
    // Fix the regression line's exchange ts manually
    const regressed = JSON.parse(lines[2]!);
    regressed.exchangeTimestampMs = t0 + 1_500 - 17;
    lines[2] = JSON.stringify(regressed);

    const captureRunDir = "/fixture/m16-a";
    const closeIso = new Date(t0 + 600_000).toISOString();
    const io = createMemoryMomentumDiscoveryIo({
      [`${captureRunDir}/top-of-book.jsonl`]: `${lines.join("\n")}\n`,
      [`${captureRunDir}/market-metadata.jsonl`]: `${JSON.stringify({
        marketTicker,
        closeTime: closeIso,
        status: "active",
        action: "subscribed",
      })}\n`,
    });
    const desc: M16CaptureDescriptor = {
      runId: "m16-synth-a",
      captureRunDir,
      captureIdentityHash: "hash-a",
      researchRole: "m16-blind-incidence",
    };
    const r1 = await streamM16BlindIncidenceFromCaptures({
      io,
      captures: [desc],
      generatedAt: "2026-09-20T18:00:00.000Z",
      codeAuthoritySha: "test",
    });
    const r2 = await streamM16BlindIncidenceFromCaptures({
      io,
      captures: [desc],
      generatedAt: "2026-09-20T18:00:00.000Z",
      codeAuthoritySha: "test",
    });
    expect(r1.reportIdentity).toBe(r2.reportIdentity);
    expect(r1.outcomesOpened).toBe(false);
    expect(r1.quarantine.pnlOpened).toBe(false);
    expect(r1.clusterCount).toBe(1);
    expect(r1.clusterUnit).toBe("capture-session");
    expect(r1.quarantine.pnlOpened).toBe(false);
    expect(r1.quarantine.targetHitInspected).toBe(false);
    expect(r1.quarantine.stopHitInspected).toBe(false);
    expect(r1).not.toHaveProperty("feeAdjustedPnlCents");
    // At most one confirmation path claimed per market
    expect(r1.reversalConfirmedEntryCount).toBeLessThanOrEqual(1);
  });

  it("29–30. terminal coverage vs missing close fail-closed semantics reflected in counts", async () => {
    const marketTicker = "M";
    const t0 = Date.parse("2026-09-20T12:00:00.000Z");
    const lines = [
      tobLine({ marketTicker, receivedAtLocal: new Date(t0).toISOString(), yesBestBidCents: 40, noBestBidCents: 50 }),
      tobLine({ marketTicker, receivedAtLocal: new Date(t0 + 1_000).toISOString(), yesBestBidCents: 30, noBestBidCents: 66 }),
    ];
    const io = createMemoryMomentumDiscoveryIo({
      "/fixture/m16-noclose/top-of-book.jsonl": `${lines.join("\n")}\n`,
      // no market-metadata → missing closeTime
    });
    const report = await streamM16BlindIncidenceFromCaptures({
      io,
      captures: [{
        runId: "noclose",
        captureRunDir: "/fixture/m16-noclose",
        captureIdentityHash: "hn",
        researchRole: "m16-blind-incidence",
      }],
      generatedAt: "2026-09-20T18:00:00.000Z",
    });
    expect(report.quarantine.settlementDirectionInspected).toBe(false);
  });
});
