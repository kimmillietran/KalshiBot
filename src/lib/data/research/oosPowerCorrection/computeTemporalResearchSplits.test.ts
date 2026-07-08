import { describe, expect, it } from "vitest";

import {
  assertNoHoldoutLeakageIntoTrain,
  computeDefaultTemporalSplitRanges,
  monthBelongsToSplit,
  parseExplicitTemporalSplitSpec,
  resolveTemporalSplitRanges,
} from "./computeTemporalResearchSplits";

describe("computeTemporalResearchSplits", () => {
  it("applies deterministic 60/20/20 month split", () => {
    const ranges = computeDefaultTemporalSplitRanges([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);

    expect(ranges.trainMonths.length).toBeGreaterThanOrEqual(2);
    expect(ranges.holdoutMonths.length).toBeGreaterThanOrEqual(1);
    expect(assertNoHoldoutLeakageIntoTrain(ranges)).toBe(true);
  });

  it("parses explicit split flags", () => {
    const explicit = parseExplicitTemporalSplitSpec([
      "train=2025-10,2025-11",
      "validation=2025-12",
      "holdout=2026-01",
    ]);

    const { ranges, splitMode } = resolveTemporalSplitRanges({
      availableMonths: ["2025-10", "2025-11", "2025-12", "2026-01"],
      explicit,
    });

    expect(splitMode).toBe("explicit");
    expect(ranges.trainMonths).toEqual(["2025-10", "2025-11"]);
    expect(ranges.validationMonths).toEqual(["2025-12"]);
    expect(ranges.holdoutMonths).toEqual(["2026-01"]);
  });

  it("prevents holdout leakage into train", () => {
    expect(
      assertNoHoldoutLeakageIntoTrain({
        trainMonths: ["2025-10"],
        validationMonths: ["2025-11"],
        holdoutMonths: ["2025-12"],
      }),
    ).toBe(true);

    expect(
      assertNoHoldoutLeakageIntoTrain({
        trainMonths: ["2025-10", "2025-12"],
        validationMonths: ["2025-11"],
        holdoutMonths: ["2025-12"],
      }),
    ).toBe(false);
  });

  it("assigns months to splits without overlap in default mode", () => {
    const months = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05"];
    const { ranges } = resolveTemporalSplitRanges({ availableMonths: months });

    const assigned = new Set([
      ...ranges.trainMonths,
      ...ranges.validationMonths,
      ...ranges.holdoutMonths,
    ]);

    expect(assigned.size).toBe(months.length);
    expect(monthBelongsToSplit("2025-01", "train", ranges)).toBe(
      ranges.trainMonths.includes("2025-01"),
    );
  });
});
