import { describe, expect, it } from "vitest";

import {
  avg60sIsEmpiricalCandidateAgainstOfficial,
  buildSettlementEstimateBundle,
} from "./settlementEstimate";

describe("buildSettlementEstimateBundle", () => {
  it("marks expiration_value authoritative post-close when present", () => {
    const bundle = buildSettlementEstimateBundle({
      expirationValueRaw: "84379.39",
      avg60sDataRaw: "84379.38516667",
      avg60sDataCount: 60,
      last60sWindowedAverage15minRaw: "84379.33416667",
      last60sWindowedCount: 60,
      postClose: true,
      avg60sMatchesVerified1HzMean: true,
    });
    expect(bundle.primary.status).toBe("authoritative");
    expect(bundle.primary.source).toBe("expiration_value");
    expect(bundle.primary.vendorConfirmed).toBe(true);
    expect(bundle.fields.avg_60s_data.status).toBe("empirical-candidate");
    expect(bundle.fields.avg_60s_data.vendorConfirmed).toBe(false);
    expect(bundle.fields.last_60s_windowed_average_15min.status).toBe("insufficient-evidence");
    expect(bundle.note).toMatch(/never vendor-confirmed/i);
  });

  it("uses avg_60s_data as empirical-candidate when post-close official is missing but evidence is complete", () => {
    const bundle = buildSettlementEstimateBundle({
      expirationValueRaw: null,
      avg60sDataRaw: "84379.38516667",
      avg60sDataCount: 60,
      last60sWindowedAverage15minRaw: "84379.33416667",
      last60sWindowedCount: 60,
      postClose: true,
      avg60sMatchesVerified1HzMean: true,
    });
    expect(bundle.primary.status).toBe("empirical-candidate");
    expect(bundle.primary.source).toBe("avg_60s_data");
    expect(bundle.primary.vendorConfirmed).toBe(false);
    expect(bundle.primary.rounding).toBe("diagnostic-half-even");
  });

  it("reports intermediate before count 60", () => {
    const bundle = buildSettlementEstimateBundle({
      expirationValueRaw: null,
      avg60sDataRaw: "84300.00",
      avg60sDataCount: 12,
      last60sWindowedAverage15minRaw: "84300.00",
      last60sWindowedCount: 12,
      postClose: false,
      avg60sMatchesVerified1HzMean: false,
    });
    expect(bundle.primary.status).toBe("intermediate");
    expect(bundle.fields.avg_60s_data.status).toBe("intermediate");
    expect(bundle.fields.expiration_value.status).toBe("unavailable");
  });

  it("reports insufficient-evidence when count 60 but 1Hz mean agreement is missing", () => {
    const bundle = buildSettlementEstimateBundle({
      expirationValueRaw: null,
      avg60sDataRaw: "84379.38516667",
      avg60sDataCount: 60,
      last60sWindowedAverage15minRaw: null,
      last60sWindowedCount: null,
      postClose: false,
      avg60sMatchesVerified1HzMean: false,
    });
    expect(bundle.primary.status).toBe("insufficient-evidence");
    expect(bundle.fields.avg_60s_data.vendorConfirmed).toBe(false);
  });

  it("never selects last_60s_windowed_average_15min as primary empirical candidate", () => {
    const bundle = buildSettlementEstimateBundle({
      expirationValueRaw: null,
      avg60sDataRaw: null,
      avg60sDataCount: null,
      last60sWindowedAverage15minRaw: "84379.33416667",
      last60sWindowedCount: 60,
      postClose: true,
      avg60sMatchesVerified1HzMean: false,
    });
    expect(bundle.primary.source).not.toBe("last_60s_windowed_average_15min");
    expect(bundle.fields.last_60s_windowed_average_15min.status).toBe("insufficient-evidence");
  });

  it("keeps field estimates separate without substitution", () => {
    const bundle = buildSettlementEstimateBundle({
      expirationValueRaw: "84379.39",
      avg60sDataRaw: "84379.38516667",
      avg60sDataCount: 60,
      last60sWindowedAverage15minRaw: "84379.33416667",
      last60sWindowedCount: 60,
      postClose: true,
      avg60sMatchesVerified1HzMean: true,
    });
    expect(bundle.fields.expiration_value.value).toBe("84379.39");
    expect(bundle.fields.avg_60s_data.value).toBe("84379.38516667");
    expect(bundle.fields.last_60s_windowed_average_15min.value).toBe("84379.33416667");
  });
});

describe("avg60sIsEmpiricalCandidateAgainstOfficial", () => {
  it("requires count 60, verified 1Hz mean, and diagnostic 2dp match", () => {
    expect(avg60sIsEmpiricalCandidateAgainstOfficial({
      avg60sDataRaw: "84379.38516667",
      avg60sDataCount: 60,
      expirationValueRaw: "84379.39",
      avg60sMatchesVerified1HzMean: true,
    })).toBe(true);
    expect(avg60sIsEmpiricalCandidateAgainstOfficial({
      avg60sDataRaw: "84379.33416667",
      avg60sDataCount: 60,
      expirationValueRaw: "84379.39",
      avg60sMatchesVerified1HzMean: true,
    })).toBe(false);
  });
});

describe("no trading / strategy-gate coupling", () => {
  it("settlementEstimate module has no order-placement or strategy-gate imports", async () => {
    const source = await import("node:fs").then((fs) => (
      fs.readFileSync(
        new URL("./settlementEstimate.ts", import.meta.url),
        "utf8",
      )
    ));
    expect(source).not.toMatch(/placeOrder|strategyGate|executeTrade|submitOrder/);
    expect(source).not.toMatch(/from \"@\/features\/trading/);
    expect(source).toMatch(/Research-only/);
    expect(source).toMatch(/vendorConfirmed: false/);
  });
});
