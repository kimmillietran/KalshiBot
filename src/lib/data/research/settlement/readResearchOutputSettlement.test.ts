import { describe, expect, it } from "vitest";

import {
  findSettlementInDatasetSnapshots,
  formatMissingSettlementDiagnostic,
  readSettlementOutcomeFromRecord,
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
