import { describe, expect, it } from "vitest";

import { normalizeHistoricalCoveragePlanArgv } from "../lib/cliArgvSchemas";
import { parseHistoricalCoveragePlanConfigFromArgv } from "./buildHistoricalCoveragePlanTypes";

describe("parseHistoricalCoveragePlanConfigFromArgv", () => {
  it("accepts --earliest-month in YYYY-MM format", () => {
    const config = parseHistoricalCoveragePlanConfigFromArgv(
      normalizeHistoricalCoveragePlanArgv(["--earliest-month=2025-01"]),
    );

    expect(config.earliestMonth).toBe("2025-01");
  });

  it("leaves earliestMonth unset when flag is absent", () => {
    const config = parseHistoricalCoveragePlanConfigFromArgv(
      normalizeHistoricalCoveragePlanArgv([]),
    );

    expect(config.earliestMonth).toBeUndefined();
  });

  it("rejects invalid earliest-month values", () => {
    expect(() =>
      parseHistoricalCoveragePlanConfigFromArgv(
        normalizeHistoricalCoveragePlanArgv(["--earliest-month", "2025-13"]),
      ),
    ).toThrow(/Expected YYYY-MM/);
  });
});
