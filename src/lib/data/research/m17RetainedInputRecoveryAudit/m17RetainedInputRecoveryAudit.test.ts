import { describe, expect, it } from "vitest";

import {
  applyCryptostructLevels,
  assertRecoveryFeaturesArePreEntryOnly,
  buildM17RetainedInputRecoveryReport,
  computeTimeRemainingMs,
  deriveBboCentsFromBooks,
  isUnsafeToDeriveBrtiFromSettlementLabel,
  parseCloseTimeMsFromTicker,
  parseCryptostructMessageTimestamps,
  serializeM17RetainedInputRecoveryMarkdown,
} from "./index";

describe("offline book derivers", () => {
  it("derives YES midpoint and executable NO ask from levels", () => {
    const books = { bids: new Map<number, number>(), asks: new Map<number, number>() };
    applyCryptostructLevels(
      books,
      [
        [0, "0.40", "10"],
        [1, "0.42", "8"],
      ],
      true,
    );
    const bbo = deriveBboCentsFromBooks(books);
    expect(bbo).not.toBeNull();
    expect(bbo!.yesBidCents).toBe(40);
    expect(bbo!.yesAskCents).toBe(42);
    expect(bbo!.yesMidpoint).toBeCloseTo(0.41, 10);
    expect(bbo!.noAskCents).toBe(60);
  });

  it("parses close time and time remaining without settlement labels", () => {
    const close = parseCloseTimeMsFromTicker("KXBTC15M-26AUG141430-30");
    expect(close).toBe(Date.parse("2026-08-14T18:30:00.000Z"));
    const rem = computeTimeRemainingMs({
      entryTimestampMs: (close as number) - 600_000,
      closeTimeMs: close as number,
    });
    expect(rem).toBe(600_000);
  });

  it("separates admission and exchange timestamps", () => {
    const ts = parseCryptostructMessageTimestamps([
      1,
      1,
      "0",
      "eid",
      1_000_000_000,
      900_000_000,
      [[0, "0.5", "1"]],
    ]);
    expect(ts).toEqual({
      admissionTsNs: 1_000_000_000,
      exchangeTsNs: 900_000_000,
      admissionTsMs: 1000,
      exchangeTsMs: 900,
    });
  });
});

describe("leakage guards", () => {
  it("rejects settlement labels in pre-entry features", () => {
    const bad = assertRecoveryFeaturesArePreEntryOnly({
      usedExpirationValue: true,
      usedOfficialResult: false,
      usedPostCloseMessage: false,
      usedCompletedSettlementAverage: false,
      entryTimestampMs: 1,
      closeTimeMs: 2,
    });
    expect(bad.ok).toBe(false);
    expect(isUnsafeToDeriveBrtiFromSettlementLabel()).toBe(true);
  });

  it("accepts book-only pre-entry sources", () => {
    const ok = assertRecoveryFeaturesArePreEntryOnly({
      usedExpirationValue: false,
      usedOfficialResult: false,
      usedPostCloseMessage: false,
      usedCompletedSettlementAverage: false,
      entryTimestampMs: 1,
      closeTimeMs: 2,
    });
    expect(ok).toEqual({ ok: true });
  });
});

describe("buildM17RetainedInputRecoveryReport", () => {
  it("reports blocked status without computing P&L or recommending purchase", () => {
    const report = buildM17RetainedInputRecoveryReport({
      generatedAtUtc: "2026-09-25T02:00:00.000Z",
      codeAuthoritySha: "test",
      facts: {
        retainedFrictionSampleCount: 47307,
        validSettlementJoinCount: 47263,
        rawZipDayCount: 34,
        rawZipSha256ByDay: { "2026-08-14": "abc" },
        samplesSha256: "samples",
        labelsSha256: "labels",
        frictionSamplesPath:
          "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl",
        labelsPath:
          "data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl",
        rawStorePath: "data/external-samples/cryptostruct/m16-er/raw",
        acquisitionManifestPath:
          "data/research-results/external-kalshi-data-audit/m16-er-acquisition-manifest.json",
        acquisitionManifestSha256: "manifest",
        coinbaseCandlesPath:
          "data/live-capture/forward-quotes/2026-09-22T18-00-05-364Z/btc-candles-1m.jsonl",
        coinbaseCandlesByteSize: 0,
        brtiOneCloseCaptureCount: 2,
        brtiOneClosePaths: [
          "Documents/KalshiResearchArchive/one-close-settlement-fidelity/v2",
        ],
        settlementJoinMergeSha: "1bd0d631eea173445a919207772b6141af28a26f",
      },
    });

    expect(report.finalStatus).toBe("blocked-missing-frozen-strategy-decision");
    expect(report.purchaseMade).toBe(false);
    expect(report.networkRequestsMade).toBe(0);
    expect(report.strategyPnlComputed).toBe(false);
    expect(report.exploratoryEvalExecutableWithoutPurchase).toBe(false);
    expect(report.classificationCounts.absent).toBeGreaterThanOrEqual(2);
    expect(report.classificationCounts["derivable-offline"]).toBeGreaterThanOrEqual(3);
    expect(report.classificationCounts["present-direct"]).toBeGreaterThanOrEqual(2);
    expect(report.classificationCounts["unsafe-to-derive"]).toBeGreaterThanOrEqual(1);
    expect(
      report.classifications.find((c) => c.inputId === "coinbase-pre-entry-realized-volatility")
        ?.classification,
    ).toBe("absent");
    expect(
      report.classifications.find(
        (c) => c.inputId === "historical-brti-banked-settlement-sample-path",
      )?.classification,
    ).toBe("absent");

    const md = serializeM17RetainedInputRecoveryMarkdown(report);
    expect(md).toContain("No purchase was made");
    expect(md).toContain("blocked-missing-frozen-strategy-decision");
    expect(md).not.toMatch(/\bauthorize a new data purchase\b/i);
  });
});
