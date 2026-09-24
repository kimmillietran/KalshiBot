import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { computeKalshiScheduleFeeCents, KALSHI_FEE_SCHEDULE_ROLE, KALSHI_FEE_SCHEDULE_VARIANT } from "@/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents";
import { buildM16ErFeeContract, M16_ER_ADAPTER_IDENTITY } from "@/lib/data/research/m16ExternalReplication";

import {
  SettlementFrictionCoverageError,
  assertSettlementFrictionAdapterIdentity,
  assertSettlementFrictionFeeIdentity,
  buildSettlementFrictionConfig,
  classifySettlementLabel,
  computeEntryFriction,
  computeOneContractStandardTakerFeeCents,
  computeRoundTripFriction,
  evaluateFrictionQuoteGates,
  loadEligibleCalendarAuthority,
  matchResponseQuote,
  runSettlementFrictionCoverageStudy,
  selectCadenceSamples,
  serializeSettlementFrictionArtifacts,
  sortQuotesChronologically,
  summarizeSettlementLabelCoverage,
  type NormalizedQuoteEvent,
  type SettlementLabelRecord,
} from "./index";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadQuotes(): NormalizedQuoteEvent[] {
  return readFileSync(join(FIXTURE_DIR, "quotes.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as NormalizedQuoteEvent);
}

function loadLabels(): SettlementLabelRecord[] {
  return readFileSync(join(FIXTURE_DIR, "labels.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SettlementLabelRecord);
}

describe("eligible calendar authority", () => {
  it("recomputes set equality and accepts matching 34-day fixtures", () => {
    const cal = loadEligibleCalendarAuthority({
      repoRoot: FIXTURE_DIR,
      dayClustersPath: join(FIXTURE_DIR, "day-clusters.json"),
      reservoirStatusPath: join(FIXTURE_DIR, "reservoir-status.json"),
    });
    expect(cal.eligibleUtcDays).toHaveLength(34);
    expect(cal.m16ErDaysContentSha256).toBe(cal.spentDaysContentSha256);
  });

  it("fails closed on duplicates", () => {
    const base = JSON.parse(
      readFileSync(join(FIXTURE_DIR, "day-clusters.json"), "utf8"),
    ) as { days: Array<{ utcDayKey: string; n: number }> };
    const dup = {
      days: [...base.days, { utcDayKey: "2026-08-14", n: 1 }],
    };
    const tmp = join(FIXTURE_DIR, "day-clusters-dup.runtime.json");
    writeFileSync(tmp, JSON.stringify(dup));
    try {
      expect(() =>
        loadEligibleCalendarAuthority({
          repoRoot: FIXTURE_DIR,
          dayClustersPath: tmp,
          reservoirStatusPath: join(FIXTURE_DIR, "reservoir-status.json"),
        }),
      ).toThrow(/duplicate utcDayKey/);
    } finally {
      unlinkSync(tmp);
    }
  });

  it("fails closed when sets diverge", () => {
    const badClusters = {
      days: [
        ...JSON.parse(readFileSync(join(FIXTURE_DIR, "day-clusters.json"), "utf8")).days.slice(0, 33),
        { utcDayKey: "2099-01-01", n: 1 },
      ],
    };
    const tmp = join(FIXTURE_DIR, "day-clusters-mismatch.runtime.json");
    writeFileSync(tmp, JSON.stringify(badClusters));
    try {
      expect(() =>
        loadEligibleCalendarAuthority({
          repoRoot: FIXTURE_DIR,
          dayClustersPath: tmp,
          reservoirStatusPath: join(FIXTURE_DIR, "reservoir-status.json"),
        }),
      ).toThrow(/eligible calendar mismatch/);
    } finally {
      unlinkSync(tmp);
    }
  });
});

describe("identities", () => {
  it("binds full M16-ER fee and adapter identities", () => {
    const fee = buildM16ErFeeContract();
    expect(fee.feeContractIdentity).toBe(
      "2c1059ecc142dd6ca9b82375e03fd84b42f55ce6d6f1435a667111eea2d0548f",
    );
    assertSettlementFrictionFeeIdentity(fee.feeContractIdentity);
    assertSettlementFrictionAdapterIdentity(M16_ER_ADAPTER_IDENTITY);
    expect(() => assertSettlementFrictionFeeIdentity("deadbeef")).toThrow(
      SettlementFrictionCoverageError,
    );
    expect(() => assertSettlementFrictionAdapterIdentity("bad")).toThrow(
      SettlementFrictionCoverageError,
    );
    const cfg = buildSettlementFrictionConfig();
    expect(cfg.configurationIdentity).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("costs and gates", () => {
  it("computes fee rounding and separates entry vs round-trip without mid drift", () => {
    const expectedFee = computeKalshiScheduleFeeCents({
      quantity: 1,
      priceCents: 50,
      role: KALSHI_FEE_SCHEDULE_ROLE.TAKER,
      schedule: KALSHI_FEE_SCHEDULE_VARIANT.STANDARD,
    });
    expect(computeOneContractStandardTakerFeeCents(50)).toBe(expectedFee);

    const entryQuote = {
      marketTicker: "T",
      timestampMs: 1_000,
      yesBestBidCents: 48,
      noBestBidCents: 50,
      yesBestAskCents: 50,
      yesBestBidSize: 5,
      yesBestAskSize: 5,
      quoteAgeMs: 0,
      bookState: "valid",
      isEconomicallyValid: true,
    };
    const exitQuote = {
      ...entryQuote,
      timestampMs: 6_000,
      yesBestBidCents: 46,
      noBestBidCents: 52,
      yesBestAskCents: 48,
    };
    const entry = computeEntryFriction(entryQuote);
    expect(entry).not.toBeNull();
    // mid = 50 + (48-50)/2 = 49; half = 1
    expect(entry!.entryMidCents).toBe(49);
    expect(entry!.entryHalfSpreadCents).toBe(1);
    expect(entry!.entryFrictionCents).toBe(1 + expectedFee);

    const rt = computeRoundTripFriction({ entryQuote, exitQuote });
    expect(rt).not.toBeNull();
    // exit mid = 50 + (46-52)/2 = 47; response half = 47-46 = 1
    expect(rt!.responseHalfSpreadCents).toBe(1);
    expect(rt!.roundTripFrictionCents).toBe(
      1 + 1 + expectedFee + computeOneContractStandardTakerFeeCents(46),
    );
  });

  it("rejects crossed, locked, stale, and insufficient size", () => {
    expect(
      evaluateFrictionQuoteGates({
        marketTicker: "T",
        timestampMs: 1,
        yesBestBidCents: 52,
        noBestBidCents: 50,
        yesBestAskCents: 50,
        yesBestBidSize: 5,
        yesBestAskSize: 5,
        quoteAgeMs: 0,
        bookState: "valid",
        isEconomicallyValid: true,
      }).reasons,
    ).toContain("crossed-book");

    expect(
      evaluateFrictionQuoteGates({
        marketTicker: "T",
        timestampMs: 1,
        yesBestBidCents: 50,
        noBestBidCents: 50,
        yesBestAskCents: 50,
        yesBestBidSize: 5,
        yesBestAskSize: 5,
        quoteAgeMs: 0,
        bookState: "valid",
        isEconomicallyValid: true,
      }).reasons,
    ).toContain("locked-book");

    expect(
      evaluateFrictionQuoteGates({
        marketTicker: "T",
        timestampMs: 1,
        yesBestBidCents: 48,
        noBestBidCents: 50,
        yesBestAskCents: 50,
        yesBestBidSize: 0,
        yesBestAskSize: 5,
        quoteAgeMs: 0,
        bookState: "valid",
        isEconomicallyValid: true,
      }).reasons,
    ).toContain("insufficient-size");

    expect(
      evaluateFrictionQuoteGates({
        marketTicker: "T",
        timestampMs: 1,
        yesBestBidCents: 48,
        noBestBidCents: 50,
        yesBestAskCents: 50,
        yesBestBidSize: 5,
        yesBestAskSize: 5,
        quoteAgeMs: 5000,
        bookState: "valid",
        isEconomicallyValid: true,
      }).reasons,
    ).toContain("stale-quote");
  });
});

describe("sampling and response match", () => {
  it("sorts chronologically and samples first-per-bucket", () => {
    const sorted = sortQuotesChronologically([
      { timestampMs: 120_000 },
      { timestampMs: 10_000 },
      { timestampMs: 70_000 },
    ]);
    expect(sorted.map((q) => q.timestampMs)).toEqual([10_000, 70_000, 120_000]);
    const selected = selectCadenceSamples({
      sortedEligibleQuotes: [
        { timestampMs: 10_000 },
        { timestampMs: 20_000 },
        { timestampMs: 70_000 },
      ],
    });
    expect(selected.map((q) => q.timestampMs)).toEqual([10_000, 70_000]);
  });

  it("matches response without future leakage into earlier windows", () => {
    const quotes = [
      { timestampMs: 1_000, ok: true },
      { timestampMs: 5_900, ok: true },
      { timestampMs: 6_100, ok: true },
      { timestampMs: 6_400, ok: false },
    ];
    const matched = matchResponseQuote({
      entryTimestampMs: 1_000,
      horizonMs: 5_000,
      toleranceMs: 250,
      sortedCandidates: quotes,
      isEligible: (q) => q.ok,
    });
    expect(matched?.timestampMs).toBe(6_100);
    expect(
      matchResponseQuote({
        entryTimestampMs: 1_000,
        horizonMs: 5_000,
        toleranceMs: 250,
        sortedCandidates: quotes,
        isEligible: () => false,
      }),
    ).toBeNull();
  });
});

describe("settlement join", () => {
  it("reports coverage denominators and duplicate labels", () => {
    const labels = loadLabels();
    const summary = summarizeSettlementLabelCoverage({
      denominatorTickers: ["KXBTC15M-FIXTURE-A", "KXBTC15M-FIXTURE-B", "KXBTC15M-FIXTURE-Z"],
      labels,
    });
    expect(summary.denominatorTickers).toBe(3);
    expect(summary.finalizedResultCount).toBe(2);
    expect(summary.jointFinalizedAndNonEmptyExpirationCount).toBe(1);
    expect(summary.duplicateTickerCount).toBe(1);
    expect(classifySettlementLabel(labels[0]!).validNumericExpirationValue).toBe(true);
  });
});

describe("end-to-end hermetic study", () => {
  it("runs fixture quotes/labels and serializes repeatable artifacts", () => {
    const calendar = loadEligibleCalendarAuthority({
      repoRoot: FIXTURE_DIR,
      dayClustersPath: join(FIXTURE_DIR, "day-clusters.json"),
      reservoirStatusPath: join(FIXTURE_DIR, "reservoir-status.json"),
    });
    const feeId = buildM16ErFeeContract().feeContractIdentity;
    const result = runSettlementFrictionCoverageStudy({
      calendar,
      quotes: loadQuotes(),
      labels: loadLabels(),
      expectedFeeContractIdentity: feeId,
      expectedAdapterIdentity: M16_ER_ADAPTER_IDENTITY,
      codeAuthoritySha: "fixture-code-sha",
      generatedAtUtc: "2026-09-23T00:00:00.000Z",
      locallyAvailableUtcDays: ["2026-08-14"],
    });
    expect(result.completionStatus).toBe("partial");
    expect(result.successfullyProcessedUtcDayCount).toBe(1);
    expect(result.eligibleUtcDayCount).toBe(34);
    expect(result.samples.length).toBeGreaterThanOrEqual(1);
    expect(result.settlementCoverage.brtiPathCoverageNote).toContain("Not measured");

    const arts1 = serializeSettlementFrictionArtifacts(result);
    const arts2 = serializeSettlementFrictionArtifacts(result);
    expect(arts1.manifestContentSha256).toBe(arts2.manifestContentSha256);
    expect(arts1.samplesJsonl).toBe(arts2.samplesJsonl);
    expect(arts1.reportMarkdown).toContain("Settlement friction");
    expect(arts1.reportMarkdown.endsWith("\n")).toBe(true);
    expect(arts1.reportMarkdown.endsWith("\n\n")).toBe(false);
  });

  it("rejects ineligible days in quote stream", () => {
    const calendar = loadEligibleCalendarAuthority({
      repoRoot: FIXTURE_DIR,
      dayClustersPath: join(FIXTURE_DIR, "day-clusters.json"),
      reservoirStatusPath: join(FIXTURE_DIR, "reservoir-status.json"),
    });
    const quotes = loadQuotes();
    quotes[0]!.utcDayKey = "2099-01-01";
    expect(() =>
      runSettlementFrictionCoverageStudy({
        calendar,
        quotes,
        labels: [],
        expectedFeeContractIdentity: buildM16ErFeeContract().feeContractIdentity,
        expectedAdapterIdentity: M16_ER_ADAPTER_IDENTITY,
        codeAuthoritySha: null,
        generatedAtUtc: "2026-09-23T00:00:00.000Z",
        locallyAvailableUtcDays: ["2026-08-14"],
      }),
    ).toThrow(/ineligible UTC day/);
  });
});
