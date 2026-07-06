import { describe, expect, it } from "vitest";

import { parseCalendarMonth } from "./coveragePlannerDateUtils";
import { resolveCoverageHorizonBounds } from "./resolveCoverageHorizonBounds";

describe("parseCalendarMonth", () => {
  it("accepts valid YYYY-MM values", () => {
    expect(parseCalendarMonth("2025-01")).toBe("2025-01");
    expect(parseCalendarMonth("2026-12")).toBe("2026-12");
  });

  it("rejects invalid month formats", () => {
    expect(() => parseCalendarMonth("2025-13")).toThrow(/Expected YYYY-MM/);
    expect(() => parseCalendarMonth("25-01")).toThrow(/Expected YYYY-MM/);
    expect(() => parseCalendarMonth("2025/01")).toThrow(/Expected YYYY-MM/);
  });
});

describe("resolveCoverageHorizonBounds", () => {
  it("keeps observed horizon when no configured earliest month is provided", () => {
    const horizon = resolveCoverageHorizonBounds({
      observedMonths: ["2026-03", "2026-05"],
    });

    expect(horizon).toMatchObject({
      configuredEarliestMonth: null,
      observedEarliestMonth: "2026-03",
      effectiveEarliestMonth: "2026-03",
      latestMonth: "2026-05",
      horizonExpandedByConfig: false,
      horizonMonths: ["2026-03", "2026-04", "2026-05"],
    });
  });

  it("expands the horizon when configured earliest month is earlier than observed", () => {
    const horizon = resolveCoverageHorizonBounds({
      observedMonths: ["2026-03", "2026-05"],
      configuredEarliestMonth: "2025-01",
    });

    expect(horizon.effectiveEarliestMonth).toBe("2025-01");
    expect(horizon.horizonExpandedByConfig).toBe(true);
    expect(horizon.horizonMonths[0]).toBe("2025-01");
    expect(horizon.horizonMonths).toContain("2026-02");
  });

  it("does not truncate observed history when configured earliest month is later", () => {
    const horizon = resolveCoverageHorizonBounds({
      observedMonths: ["2025-06", "2026-05"],
      configuredEarliestMonth: "2026-01",
    });

    expect(horizon.effectiveEarliestMonth).toBe("2025-06");
    expect(horizon.horizonExpandedByConfig).toBe(false);
    expect(horizon.horizonMonths[0]).toBe("2025-06");
  });
});
