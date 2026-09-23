import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  candidateMidFromYesMid,
  createM16MarketMachine,
  stepM16MarketMachine,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16StateMachine";
import { yesMidCents } from "@/lib/data/research/kalshiTobMomentumFamily/midpointAndComplement";
import {
  M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY,
  M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY,
  M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
  M16_EXPECTED_FEE_CONTRACT_IDENTITY,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16ValidationAuthority";

import {
  adaptKalshiBotMirror,
  adaptRawBboChange,
  applyContinuityBreak,
  bboCentsFromYesBook,
  bookEligibleFromBbo,
  type CsObsRow,
  yesMidFromBids,
} from "./cryptostructM16AdapterRules";

const AUDIT = resolve(
  process.cwd(),
  "data/research-results/external-kalshi-data-audit",
);

function readJson(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(AUDIT, name), "utf8")) as Record<
    string,
    unknown
  >;
}

function row(
  ts: number,
  yb: number | null,
  nb: number | null,
  eligible: boolean,
  gap = false,
): CsObsRow {
  return {
    timestampMs: ts,
    yesBestBidCents: yb,
    noBestBidCents: nb,
    yesMidCents:
      yb != null && nb != null ? yesMidFromBids(yb, nb) : null,
    bookEligible: eligible,
    structuralGap: gap,
  };
}

describe("m16 cryptostruct source equivalence artifacts", () => {
  it("keeps M16 identities unchanged and selects a non-economic adapter", () => {
    const summary = readJson("m16-source-equivalence-summary.json");
    const ids = summary.m16IdentitiesUnchanged as Record<string, string>;
    expect(ids.familyDefinition).toBe(M16_EXPECTED_FAMILY_DEFINITION_IDENTITY);
    expect(ids.evidenceContract).toBe(M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY);
    expect(ids.dependencePlan).toBe(M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY);
    expect(ids.feeContract).toBe(M16_EXPECTED_FEE_CONTRACT_IDENTITY);
    expect(ids.prospectiveCohort).toBe(
      "a2b86dd7c7fc3864ce48c860b10cfea053bdde04e09723a4f6ae87adca31dd63",
    );
    expect(ids.scientificProtocolClaimedUnchanged).toBe(
      "1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824",
    );

    const selected = readJson("m16-cryptostruct-adapter-selected.json");
    expect(selected.economicCriterionUsed).toBe(false);
    expect(selected.selectedAdapter).toBe("RAW-BBO-CHANGE");
    expect(String(selected.adapterIdentity)).toMatch(/^[0-9a-f]{64}$/);
    expect(selected.adapterIdentity).toBe(
      "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d",
    );

    const boundaries = summary.scientificBoundaries as Record<string, unknown>;
    expect(boundaries.noPnlInspected).toBe(true);
    expect(boundaries.noNewPurchase).toBe(true);
    expect(boundaries.existingM16Unchanged).toBe(true);
    expect(summary.verdict).toBe("PASS WITH CAVEATS");
    expect(summary.externalReplicationFeasibility).toBe("YES WITH CAVEATS");
  });

  it("does not embed forbidden economic outcome fields in compact artifacts", () => {
    const files = [
      "m16-source-equivalence-summary.json",
      "m16-source-equivalence-events.json",
      "m16-cryptostruct-adapter-selected.json",
      "m16-source-equivalence-disagreements.json",
    ];
    const forbiddenExactKeys = [
      '"pnl"',
      '"realizedReturn"',
      '"targetHit"',
      '"stopHit"',
      '"settlement"',
      '"winRate"',
      '"mfe"',
      '"mae"',
      '"exitPrice"',
      '"pValue"',
      '"tStatistic"',
    ];
    for (const file of files) {
      const text = readFileSync(resolve(AUDIT, file), "utf8");
      for (const needle of forbiddenExactKeys) {
        expect(text.includes(needle)).toBe(false);
      }
    }
  });
});

describe("cryptostruct M16 adapter reconstruction", () => {
  it("derives complement NO bid and midpoint matching KalshiBot formula", () => {
    const bbo = bboCentsFromYesBook(0.35, 0.45);
    expect(bbo.yesBidCents).toBe(35);
    expect(bbo.yesAskCents).toBe(45);
    expect(bbo.noBidCents).toBe(55);
    expect(bbo.crossed).toBe(false);
    expect(bbo.locked).toBe(false);
    expect(yesMidFromBids(35, 55)).toBe(40);
    expect(yesMidCents({ yesBestBidCents: 35, noBestBidCents: 55 })).toBe(40);
    expect(bookEligibleFromBbo(false, false, false)).toBe(true);
    expect(bookEligibleFromBbo(true, false, false)).toBe(false);
    expect(bookEligibleFromBbo(false, true, false)).toBe(false);
    expect(bookEligibleFromBbo(false, false, true)).toBe(false);
  });

  it("RAW-BBO-CHANGE emits only when BBO/eligibility/gap changes", () => {
    const raw = [
      row(1, 40, 50, true),
      row(2, 40, 50, true), // unchanged — drop
      row(3, 39, 50, true), // change — keep
      row(4, 39, 50, false, true), // eligibility/gap — keep
    ];
    const out = adaptRawBboChange(raw);
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.timestampMs)).toEqual([1, 3, 4]);
  });

  it("KALSHIBOT-MIRROR collapses same-timestamp to last causal state", () => {
    const raw = [
      row(100, 40, 50, true),
      row(100, 39, 50, true), // same ms — wins
      row(101, 39, 50, true), // unchanged after collapse — drop
      row(102, 38, 50, true),
    ];
    const out = adaptKalshiBotMirror(raw);
    expect(out).toHaveLength(2);
    expect(out[0]?.timestampMs).toBe(100);
    expect(out[0]?.yesBestBidCents).toBe(39);
    expect(out[1]?.yesBestBidCents).toBe(38);
  });

  it("fail-closes on unexplained prevEventId break until snapshot", () => {
    const broken = applyContinuityBreak({
      lastEventId: "a",
      prevEventId: "z",
      isSnapshot: false,
      failClosed: false,
    });
    expect(broken.chainBreak).toBe(true);
    expect(broken.failClosed).toBe(true);

    const recovered = applyContinuityBreak({
      lastEventId: "z",
      prevEventId: "z",
      isSnapshot: true,
      failClosed: true,
    });
    expect(recovered.failClosed).toBe(false);
  });
});

describe("m16 canonical machine reuse for source equivalence", () => {
  it("uses complement midpoint and confirms on mid > H", () => {
    const yesMid = yesMidCents({ yesBestBidCents: 35, noBestBidCents: 55 });
    expect(yesMid).toBe(40);
    expect(candidateMidFromYesMid("NO", yesMid)).toBe(60);

    let yes = createM16MarketMachine("YES");
    const ticks = [
      { mid: 45, ts: 1_000 },
      { mid: 40, ts: 2_000 },
      { mid: 41, ts: 3_000 },
      { mid: 40, ts: 4_000 },
      { mid: 42, ts: 5_000 },
    ];
    const closeTimeMs = 5_000 + 120_000;
    const events = [];
    for (const t of ticks) {
      const stepped = stepM16MarketMachine({
        state: yes,
        tick: {
          timestampMs: t.ts,
          yesBestBidCents: 30,
          noBestBidCents: 50,
          candidateMidCents: t.mid,
          bookEligible: true,
          structuralGap: false,
        },
        closeTimeMs,
      });
      yes = stepped.state;
      events.push(...stepped.events);
    }
    expect(events.some((e) => e.type === "down-cross")).toBe(true);
    expect(events.some((e) => e.type === "confirmation")).toBe(true);
  });

  it("fail-closes on structural gap during active setup", () => {
    let yes = createM16MarketMachine("YES");
    yes = stepM16MarketMachine({
      state: yes,
      tick: {
        timestampMs: 1,
        yesBestBidCents: 50,
        noBestBidCents: 40,
        candidateMidCents: 45,
        bookEligible: true,
        structuralGap: false,
      },
      closeTimeMs: 1_000_000,
    }).state;
    yes = stepM16MarketMachine({
      state: yes,
      tick: {
        timestampMs: 2,
        yesBestBidCents: 40,
        noBestBidCents: 50,
        candidateMidCents: 40,
        bookEligible: true,
        structuralGap: false,
      },
      closeTimeMs: 1_000_000,
    }).state;
    const gap = stepM16MarketMachine({
      state: yes,
      tick: {
        timestampMs: 3,
        yesBestBidCents: 40,
        noBestBidCents: 50,
        candidateMidCents: 40,
        bookEligible: false,
        structuralGap: true,
      },
      closeTimeMs: 1_000_000,
    });
    expect(gap.events.some((e) => e.type === "invalidated-gap")).toBe(true);
  });
});
