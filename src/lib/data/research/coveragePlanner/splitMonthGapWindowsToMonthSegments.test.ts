import { describe, expect, it } from "vitest";

import { splitMonthGapWindowsToMonthSegments } from "./splitMonthGapWindowsToMonthSegments";

describe("splitMonthGapWindowsToMonthSegments", () => {
  it("splits multi-month windows into single-month segments", () => {
    const split = splitMonthGapWindowsToMonthSegments([
      {
        seriesTicker: "KXBTC15M",
        startMonth: "2026-01",
        endMonth: "2026-03",
        targetMonths: ["2026-01", "2026-02", "2026-03"],
      },
    ]);

    expect(split).toEqual([
      {
        seriesTicker: "KXBTC15M",
        startMonth: "2026-01",
        endMonth: "2026-01",
        targetMonths: ["2026-01"],
      },
      {
        seriesTicker: "KXBTC15M",
        startMonth: "2026-02",
        endMonth: "2026-02",
        targetMonths: ["2026-02"],
      },
      {
        seriesTicker: "KXBTC15M",
        startMonth: "2026-03",
        endMonth: "2026-03",
        targetMonths: ["2026-03"],
      },
    ]);
  });
});
