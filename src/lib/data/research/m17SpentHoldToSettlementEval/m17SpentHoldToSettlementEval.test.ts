import { describe, expect, it } from "vitest";

import type { SettlementLabelRecord } from "@/lib/data/research/settlementFrictionCoverage";
import { M17_KNOWN_INCOMPLETE_MARKET_TICKER } from "@/lib/data/research/m17SettlementJoinAudit";

import {
  assertNoSettlementLabelLeakage,
  buildM17FrozenDecisionInventory,
  computeNoHoldToSettlementFeeAdjustedReturnCents,
  computeNoHoldToSettlementGrossReturnCents,
  computeOneStandardTakerFeeCents,
  listMissingFrozenDecisionsBlockingPnl,
  runM17SpentHoldToSettlementEval,
  serializeM17SpentHoldToSettlementMarkdown,
  summarizeFeatureAvailability,
} from "./index";

function label(
  partial: Partial<SettlementLabelRecord> & { marketTicker: string },
): SettlementLabelRecord {
  return {
    result: "yes",
    expirationValue: "65000.12",
    floorStrike: 65000,
    closeTime: "2026-08-14T00:00:00Z",
    settlementTs: "2026-08-14T00:00:01Z",
    ...partial,
  };
}

describe("economics — one-fee hold-to-settlement", () => {
  it("charges one standard taker fee (not a flat 4¢ round-trip)", () => {
    const fee = computeOneStandardTakerFeeCents(40);
    expect(fee).toBeGreaterThan(0);
    expect(fee).toBeLessThan(4);
  });

  it("computes NO hold-to-settlement gross and fee-adjusted returns", () => {
    const win = computeNoHoldToSettlementFeeAdjustedReturnCents({
      noAskCents: 40,
      settledOutcome: "no",
    });
    expect(win.grossReturnCents).toBe(60);
    expect(win.feeAdjustedReturnCents).toBe(60 - win.feeCents);

    const loss = computeNoHoldToSettlementGrossReturnCents({
      noAskCents: 40,
      settledOutcome: "yes",
    });
    expect(loss).toBe(-40);
  });
});

describe("leakage guards", () => {
  it("rejects expiration_value used as pre-entry input", () => {
    const result = assertNoSettlementLabelLeakage({
      marketTicker: "KXBTC15M-A",
      entryTimestampMs: 1_000,
      closeTimeMs: 2_000,
      usedExpirationValueAsPreEntryInput: true,
      usedPostCloseMessagePreEntry: false,
      usedCompletedSettlementToBuildPreEntryEstimate: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toContain("expiration-value-used-as-pre-entry-input");
    }
  });

  it("rejects post-close and completed-settlement leakage", () => {
    const result = assertNoSettlementLabelLeakage({
      marketTicker: "KXBTC15M-A",
      entryTimestampMs: 1_500,
      closeTimeMs: 1_000,
      usedExpirationValueAsPreEntryInput: false,
      usedPostCloseMessagePreEntry: true,
      usedCompletedSettlementToBuildPreEntryEstimate: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          "post-close-message-used-pre-entry",
          "completed-settlement-used-to-build-pre-entry-estimate",
          "entry-after-close",
        ]),
      );
    }
  });

  it("accepts clean pre-entry identity", () => {
    const result = assertNoSettlementLabelLeakage({
      marketTicker: "KXBTC15M-A",
      entryTimestampMs: 1_000,
      closeTimeMs: 2_000,
      usedExpirationValueAsPreEntryInput: false,
      usedPostCloseMessagePreEntry: false,
      usedCompletedSettlementToBuildPreEntryEstimate: false,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("feature completeness and provenance", () => {
  it("reports zero settlement-state and regime features on friction sample schema", () => {
    const summary = summarizeFeatureAvailability({
      samples: [
        {
          marketTicker: "KXBTC15M-A",
          utcDayKey: "2026-08-14",
          entryTimestampMs: 1,
          entryFrictionCents: 2,
        },
      ],
      validOfficialSettlementJoin: 1,
      incompleteTickerExcluded: 0,
      nonNumericExpirationExcluded: 0,
    });
    expect(summary.yesMidpointPresent).toBe(0);
    expect(summary.settlementStatePathPresent).toBe(0);
    expect(summary.completeRequiredFeaturesForEntry).toBe(0);
  });
});

describe("runM17SpentHoldToSettlementEval", () => {
  it("stops before P&L when frozen entry mapping is missing", () => {
    const missing = listMissingFrozenDecisionsBlockingPnl(
      buildM17FrozenDecisionInventory(),
    );
    expect(missing).toContain(
      "settlement-state-to-yes-overpriced-entry-mapping",
    );
    expect(missing).toContain("historical-brti-banked-paths-on-spent-cs-days");

    const report = runM17SpentHoldToSettlementEval({
      samples: [
        {
          marketTicker: "KXBTC15M-A",
          utcDayKey: "2026-08-14",
          entryTimestampMs: 1,
        },
        {
          marketTicker: M17_KNOWN_INCOMPLETE_MARKET_TICKER,
          utcDayKey: "2026-08-14",
          entryTimestampMs: 2,
        },
        {
          marketTicker: "KXBTC15M-COMMA",
          utcDayKey: "2026-08-15",
          entryTimestampMs: 3,
        },
      ],
      labels: [
        label({ marketTicker: "KXBTC15M-A", result: "no" }),
        label({
          marketTicker: M17_KNOWN_INCOMPLETE_MARKET_TICKER,
          floorStrike: null,
        }),
        label({
          marketTicker: "KXBTC15M-COMMA",
          expirationValue: "79,604.96",
        }),
      ],
      generatedAtUtc: "2026-09-25T01:00:00.000Z",
      codeAuthoritySha: "test",
      inputIdentities: {
        datasetProvenance: "SPENT_VALIDATION (M16-ER)",
        holdoutProvenance: "not-holdout",
      },
    });

    expect(report.completionStatus).toBe("blocked-missing-frozen-decisions");
    expect(report.datasetProvenance).toBe("SPENT_VALIDATION (M16-ER)");
    expect(report.performance.status).toBe("blocked");
    expect(report.performance.noEntriesSimulated).toBe(0);
    expect(report.performance.averageReturnCents).toBeNull();
    expect(report.featureAvailability.validOfficialSettlementJoin).toBe(1);
    expect(report.featureAvailability.incompleteTickerExcluded).toBe(1);
    expect(report.featureAvailability.nonNumericExpirationExcluded).toBe(1);
    expect(report.featureAvailability.completeRequiredFeaturesForEntry).toBe(0);
    expect(report.candidatePopulation.claimedPriorEntryArtifact).toBe(
      "unavailable-not-found-in-retained-artifacts",
    );
    expect(report.candidatePopulation.recomputedUnderFrozenRegimeFilters).toBeNull();
    expect(report.pristinePurchaseRecommendation.justifiedNow).toBe(false);
    expect(report.confirmatoryBoundary.canJustifyLiveTrading).toBe(false);
    expect(report.strategyDefinitionUsed.avg60sDataWiredIntoGates).toBe(false);
    expect(report.zeroNetworkConfirmation.marketDataRequests).toBe(0);
    expect(report.zeroNetworkConfirmation.orderPlacements).toBe(0);

    const md = serializeM17SpentHoldToSettlementMarkdown(report);
    expect(md).toContain("blocked-missing-frozen-decisions");
    expect(md).toContain("SPENT_VALIDATION");
    expect(md).toContain("not evidence of live profitability");
    expect(md).toContain("Justified now: no");
  });

  it("keeps SPENT vs holdout provenance explicit", () => {
    const report = runM17SpentHoldToSettlementEval({
      samples: [
        {
          marketTicker: "KXBTC15M-A",
          utcDayKey: "2026-08-14",
          entryTimestampMs: 1,
        },
      ],
      labels: [label({ marketTicker: "KXBTC15M-A" })],
      generatedAtUtc: "2026-09-25T01:00:00.000Z",
      codeAuthoritySha: "test",
      inputIdentities: { fixture: "unit" },
    });
    expect(report.confirmatoryBoundary.isSpentExploratory).toBe(true);
    expect(report.confirmatoryBoundary.canEstablishOutOfSamplePerformance).toBe(
      false,
    );
  });
});
