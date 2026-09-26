import { describe, expect, it } from "vitest";

import {
  classifyHalfSpreadMismatchRow,
  regeneratedExecutableNoAskCents,
  regeneratedHalfSpreadFromYesBbo,
  summarizeHalfSpreadMismatchClasses,
  type HalfSpreadMismatchRow,
} from "./classifyHalfSpreadMismatches";

function row(
  partial: Partial<HalfSpreadMismatchRow> & {
    halfSpreadMismatch: NonNullable<HalfSpreadMismatchRow["halfSpreadMismatch"]>;
  },
): HalfSpreadMismatchRow {
  return {
    utcDayKey: "2026-09-21",
    marketTicker: "KXBTC15M-26SEP211200-50",
    entryTimestampMs: 1_790_000_000_000,
    yesBidCents: 40,
    yesAskCents: 44,
    noAskCents: 60,
    halfSpreadCents: 2,
    retainedEntryHalfSpreadCents: partial.halfSpreadMismatch.retainedHalfSpreadCents,
    retainedExecutableNoAskCents: 60,
    ...partial,
  };
}

describe("half-spread mismatch classification", () => {
  it("labels definition mismatches with stable executable NO ask as Class A", () => {
    const classified = classifyHalfSpreadMismatchRow(row({
      yesBidCents: 40,
      yesAskCents: 46,
      noAskCents: 60,
      halfSpreadCents: 3,
      retainedExecutableNoAskCents: 60,
      halfSpreadMismatch: {
        retainedHalfSpreadCents: 2.5,
        regeneratedHalfSpreadCents: 3,
      },
    }));
    expect(classified?.classification).toBe("class-a-definition");
    expect(classified?.executableNoAskStable).toBe(true);
    expect(classified?.regeneratedExecutableNoAskCents).toBe(60);
  });

  it("labels mismatches with unstable NO ask / missing bid as Class B", () => {
    const classified = classifyHalfSpreadMismatchRow(row({
      yesBidCents: 41,
      yesAskCents: 46,
      noAskCents: 59,
      halfSpreadCents: 2.5,
      retainedExecutableNoAskCents: 60,
      halfSpreadMismatch: {
        retainedHalfSpreadCents: 2,
        regeneratedHalfSpreadCents: 2.5,
      },
    }));
    expect(classified?.classification).toBe("class-b-recovery-uncertainty");
    expect(classified?.executableNoAskStable).toBe(false);
  });

  it("fails closed to Class B when retained executable NO ask is absent", () => {
    const classified = classifyHalfSpreadMismatchRow(row({
      yesBidCents: 40,
      yesAskCents: 46,
      noAskCents: 60,
      halfSpreadCents: 3,
      retainedExecutableNoAskCents: null,
      halfSpreadMismatch: {
        retainedHalfSpreadCents: 2.5,
        regeneratedHalfSpreadCents: 3,
      },
    }));
    expect(classified?.classification).toBe("class-b-recovery-uncertainty");
    expect(classified?.executableNoAskStable).toBe(false);
  });

  it("keeps Class A and Class B counts distinct in the summary", () => {
    const summary = summarizeHalfSpreadMismatchClasses([
      row({
        yesBidCents: 40,
        noAskCents: 60,
        retainedExecutableNoAskCents: 60,
        halfSpreadMismatch: {
          retainedHalfSpreadCents: 2,
          regeneratedHalfSpreadCents: 3,
        },
      }),
      row({
        marketTicker: "KXBTC15M-26SEP211215-50",
        yesBidCents: 42,
        noAskCents: 58,
        retainedExecutableNoAskCents: 60,
        halfSpreadMismatch: {
          retainedHalfSpreadCents: 1,
          regeneratedHalfSpreadCents: 2,
        },
      }),
      {
        utcDayKey: "2026-09-21",
        marketTicker: "KXBTC15M-26SEP211230-50",
        entryTimestampMs: 1,
        yesBidCents: 40,
        yesAskCents: 42,
        noAskCents: 60,
        halfSpreadCents: 1,
        retainedEntryHalfSpreadCents: 1,
        halfSpreadMismatch: null,
      },
    ]);
    expect(summary.mismatchRows).toBe(2);
    expect(summary.classADefinition).toBe(1);
    expect(summary.classBRecoveryUncertainty).toBe(1);
    expect(summary.classBRows).toHaveLength(1);
    expect(summary.executableNoAskStableAmongClassA).toBe(1);
  });

  it("derives recovery half-spread and executable NO ask from YES BBO", () => {
    expect(regeneratedHalfSpreadFromYesBbo(40, 45)).toBe(2.5);
    expect(regeneratedExecutableNoAskCents(40)).toBe(60);
  });
});
