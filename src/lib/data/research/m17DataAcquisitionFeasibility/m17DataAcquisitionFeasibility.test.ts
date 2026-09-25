import { describe, expect, it } from "vitest";

import {
  buildM17DataAcquisitionFeasibilityReport,
  serializeM17DataAcquisitionFeasibilityMarkdown,
} from "./index";

const FIXTURE_FACTS = {
  validSettlementJoins: 47_263,
  spentUtcDayCount: 34,
  localEvidenceSha256: {
    "retained-input-recovery-report.json": "a".repeat(64),
    "m16-er-purchase-manifest.json": "b".repeat(64),
    "m17-prep-brti-access-investigation.md": "c".repeat(64),
    "m17-prep-settlement-sample-mapping.md": "d".repeat(64),
    "m17-prep-brti-settlement-average-discrepancy-semantics.md": "e".repeat(64),
    "m17-prep-settlement-state-feasibility.md": "f".repeat(64),
    "m17-spent-hold-to-settlement-eval.md": "0".repeat(64),
  },
  localCoinbaseCandlesPresentOnSpentCalendar: false,
  localCoinbaseCandlesByteSize: 0,
  cryptostructRawContainsBrti: false as const,
  cryptostructRawContainsCoinbaseOhlc: false as const,
  kalshiHourHistoryDemonstratedLocally: true,
  kalshiMinuteHistoryRejectedLocally: true,
  offlineWindowReconstructionMatchedOfficial: false as const,
};

describe("m17 data acquisition feasibility", () => {
  it("classifies each missing input with an allowed enum and blocks strategy", () => {
    const report = buildM17DataAcquisitionFeasibilityReport({
      facts: FIXTURE_FACTS,
      generatedAtUtc: "2026-09-24T00:00:00.000Z",
      codeAuthoritySha: "deadbeef",
      baseMainSha: "1c17f6851c872b403b100bf342a95451a21ecfca",
    });

    expect(report.decisionStatus).toBe("strategy-remains-blocked");
    expect(report.purchaseMade).toBe(false);
    expect(report.subscriptionStarted).toBe(false);
    expect(report.captureStarted).toBe(false);
    expect(report.tradeOrOrderPlaced).toBe(false);
    expect(report.networkRequestsIncurringCost).toBe(0);
    expect(report.strategyPnlComputed).toBe(false);
    expect(report.strategyRuleInventedOrTuned).toBe(false);
    expect(report.pristineHoldoutPurchaseRecommended).toBe(false);

    const byId = Object.fromEntries(
      report.classifications.map((c) => [c.inputId, c.classification]),
    );
    expect(byId["coinbase-pre-entry-1m-ohlc-spent-calendar"]).toBe(
      "purchasable-historical",
    );
    expect(byId["historical-brti-raw-observations"]).toBe("purchasable-historical");
    expect(byId["historical-brti-banked-60-sample-path"]).toBe("unverified");
    expect(byId["exact-5hz-to-1hz-window-identity"]).toBe("unverified");
    expect(byId["frozen-yes-overpriced-enter-no-mapping"]).toBe("not-obtainable");

    expect(report.enablement.exploratoryEvalOn34SpentDays).toBe(false);
    expect(report.enablement.newExploratoryProspectiveStudy).toBe(true);
    expect(report.enablement.confirmatoryHoldoutEvaluation).toBe(false);
    expect(report.prospectiveExploratoryOption.authorized).toBe(false);
    expect(report.prospectiveExploratoryOption.executed).toBe(false);

    expect(report.coinbaseVolatilityContract.instrument).toBe("BTC-USD");
    expect(report.coinbaseVolatilityContract.lookbackBars).toBe(10);
    expect(report.coinbaseVolatilityContract.requiredCloseCount).toBe(11);

    expect(report.candidateProducts.length).toBeGreaterThanOrEqual(5);
    expect(report.publicEvidenceUrls.some((u) => u.includes("coinbase"))).toBe(true);
    expect(report.publicEvidenceUrls.some((u) => u.includes("cfbenchmarks"))).toBe(
      true,
    );
  });

  it("does not treat final settlement as a BRTI path substitute", () => {
    const report = buildM17DataAcquisitionFeasibilityReport({
      facts: FIXTURE_FACTS,
      generatedAtUtc: "2026-09-24T00:00:00.000Z",
      codeAuthoritySha: null,
      baseMainSha: "1c17f6851c872b403b100bf342a95451a21ecfca",
    });
    expect(report.brtiPathDistinctions.finalOfficialSettlementValue).toMatch(
      /cannot substitute/i,
    );
    expect(report.brtiPathDistinctions.sixtySampleBankedAverage).toMatch(
      /unverified/i,
    );
  });

  it("serializes markdown with decision and attestation", () => {
    const report = buildM17DataAcquisitionFeasibilityReport({
      facts: FIXTURE_FACTS,
      generatedAtUtc: "2026-09-24T00:00:00.000Z",
      codeAuthoritySha: "abc",
      baseMainSha: "1c17f6851c872b403b100bf342a95451a21ecfca",
    });
    const md = serializeM17DataAcquisitionFeasibilityMarkdown(report);
    expect(md).toContain("strategy-remains-blocked");
    expect(md).toContain("Purchase made: **false**");
    expect(md).toContain("Pristine holdout purchase recommended: **false**");
    expect(md).toContain("coinbase-pre-entry-1m-ohlc-spent-calendar");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("counts classifications exactly once each", () => {
    const report = buildM17DataAcquisitionFeasibilityReport({
      facts: FIXTURE_FACTS,
      generatedAtUtc: "2026-09-24T00:00:00.000Z",
      codeAuthoritySha: null,
      baseMainSha: "1c17f6851c872b403b100bf342a95451a21ecfca",
    });
    const sum = Object.values(report.classificationCounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.classifications.length);
    expect(report.classificationCounts["purchasable-historical"]).toBe(2);
    expect(report.classificationCounts.unverified).toBe(2);
    expect(report.classificationCounts["not-obtainable"]).toBe(1);
  });
});
