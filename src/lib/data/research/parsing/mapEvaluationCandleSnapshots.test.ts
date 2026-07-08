import { describe, expect, it } from "vitest";

import { mapEvaluationCandleSnapshots } from "./mapEvaluationCandleSnapshots";

describe("mapEvaluationCandleSnapshots", () => {
  it("maps valid replay candle arrays", () => {
    expect(
      mapEvaluationCandleSnapshots([
        {
          timestamp: 1_000,
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
        },
      ]),
    ).toEqual([
      {
        timestamp: 1_000,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
      },
    ]);
  });

  it("skips invalid candle rows", () => {
    expect(mapEvaluationCandleSnapshots([{ timestamp: 1 }, null, "bad"])).toEqual([]);
    expect(mapEvaluationCandleSnapshots(null)).toEqual([]);
  });
});
