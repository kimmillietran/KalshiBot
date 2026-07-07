import { describe, expect, it } from "vitest";

import { DataQualityFlag } from "@/lib/data/schemas";

import {
  findDerivedExpirationValueInDatasetSnapshots,
  findSettlementInDatasetSnapshots,
  formatMissingSettlementDiagnostic,
  readSettlementOutcomeFromRecord,
  readSettlementQualityFlagsFromRecord,
  settlementHasDerivedExpirationValue,
} from "./readResearchOutputSettlement";

describe("readSettlementOutcomeFromRecord", () => {
  it("accepts yes/no settlement results", () => {
    expect(readSettlementOutcomeFromRecord({ result: "yes" })).toBe(1);
    expect(readSettlementOutcomeFromRecord({ result: "no" })).toBe(0);
    expect(readSettlementOutcomeFromRecord({ result: "maybe" })).toBeNull();
  });
});

describe("findSettlementInDatasetSnapshots", () => {
  it("reads settlement from the last expanded candle-replay snapshot", () => {
    const resolution = findSettlementInDatasetSnapshots([
      {
        ticker: "KXBTC15M-MARKET-A",
        settlement: null,
        kalshiCandles: [{ yesBidCents: 40, yesAskCents: 60 }],
      },
      {
        ticker: "KXBTC15M-MARKET-A",
        settlement: null,
        kalshiCandles: [
          { yesBidCents: 40, yesAskCents: 60 },
          { yesBidCents: 70, yesAskCents: 80 },
        ],
      },
      {
        ticker: "KXBTC15M-MARKET-A",
        settlement: { result: "no", ticker: "KXBTC15M-MARKET-A" },
        kalshiCandles: [
          { yesBidCents: 40, yesAskCents: 60 },
          { yesBidCents: 70, yesAskCents: 80 },
          { yesBidCents: 10, yesAskCents: 20 },
        ],
      },
    ]);

    expect(resolution).toEqual({
      outcome: 0,
      snapshotIndex: 2,
    });
  });

  it("returns null when no snapshot carries settlement", () => {
    expect(
      findSettlementInDatasetSnapshots([
        { ticker: "KXBTC15M-MARKET-A", settlement: null },
      ]),
    ).toEqual({
      outcome: null,
      snapshotIndex: null,
    });
  });
});

describe("formatMissingSettlementDiagnostic", () => {
  it("names the dataset field path checked", () => {
    expect(formatMissingSettlementDiagnostic("KXBTC15M-MARKET-A", 15)).toContain(
      "dataset.snapshots[0..14].settlement.result",
    );
  });
});

describe("readSettlementQualityFlagsFromRecord", () => {
  it("reads qualityFlags and quality_flags aliases", () => {
    expect(
      readSettlementQualityFlagsFromRecord({
        qualityFlags: ["derived-expiration-value"],
      }),
    ).toEqual(["derived-expiration-value"]);
    expect(
      readSettlementQualityFlagsFromRecord({
        quality_flags: ["missing-bid-ask"],
      }),
    ).toEqual(["missing-bid-ask"]);
  });
});

describe("findDerivedExpirationValueInDatasetSnapshots", () => {
  it("detects derived expiration_value on the resolved settlement snapshot", () => {
    const snapshots = [
      { settlement: null },
      {
        settlement: {
          result: "yes",
          qualityFlags: [DataQualityFlag.DERIVED_EXPIRATION_VALUE],
        },
      },
    ];

    expect(
      findDerivedExpirationValueInDatasetSnapshots(
        snapshots,
        DataQualityFlag.DERIVED_EXPIRATION_VALUE,
      ),
    ).toBe(true);
    expect(
      settlementHasDerivedExpirationValue(snapshots[1]?.settlement, DataQualityFlag.DERIVED_EXPIRATION_VALUE),
    ).toBe(true);
  });
});
