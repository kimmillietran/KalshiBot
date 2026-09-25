import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { comparePublishedAverage } from "./compareMembershipAverages";
import { exactDecimalEqual, meanDecimalStrings } from "./decimalMarketValue";
import { buildSettlementEstimateBundle } from "./settlementEstimate";

/**
 * Offline replay of retained one-close evidence (no network).
 * Reads committed/local research-result summaries when present.
 */
describe("retained v2/v3 evidence replay (offline)", () => {
  it("replays v3 published averages with exact decimal mean equality pattern", () => {
    // Values from the retained v3 close report (no live fetch).
    const avg60s = "84379.38516667";
    const settlementWindow = "84379.33416667";
    const official = "84379.39";
    const samples = Array.from({ length: 60 }, () => avg60s);
    const mean = meanDecimalStrings(samples, 8);
    expect(mean.meanRaw).toBe(avg60s);
    expect(exactDecimalEqual(mean.meanRaw!, avg60s)).toBe(true);

    const vsOfficialAvg = comparePublishedAverage({
      fieldName: "avg_60s_data",
      publishedRaw: avg60s,
      sampleValueRaws: samples,
      officialRaw: official,
    });
    expect(vsOfficialAvg.exactDecimalEqual).toBe(true);
    expect(vsOfficialAvg.numericEqual).toBe(true);
    expect(vsOfficialAvg.vsOfficial?.diagnosticRound2HalfEvenEqual).toBe(true);

    const vsOfficialSettlement = comparePublishedAverage({
      fieldName: "last_60s_windowed_average_15min",
      publishedRaw: settlementWindow,
      sampleValueRaws: Array.from({ length: 60 }, () => settlementWindow),
      officialRaw: official,
    });
    expect(vsOfficialSettlement.vsOfficial?.diagnosticRound2HalfEvenEqual).toBe(false);

    const bundle = buildSettlementEstimateBundle({
      expirationValueRaw: official,
      avg60sDataRaw: avg60s,
      avg60sDataCount: 60,
      last60sWindowedAverage15minRaw: settlementWindow,
      last60sWindowedCount: 60,
      postClose: true,
      avg60sMatchesVerified1HzMean: true,
    });
    expect(bundle.primary.source).toBe("expiration_value");
    expect(bundle.fields.avg_60s_data.status).toBe("empirical-candidate");
  });

  it("replays 04:15Z committed dual-field diagnostic numbers", () => {
    const avg60s = "83817.70733333";
    const settlementWindow = "83817.61766667";
    const official = "83817.71";
    const cmpAvg = comparePublishedAverage({
      fieldName: "avg_60s_data",
      publishedRaw: avg60s,
      sampleValueRaws: Array.from({ length: 60 }, () => avg60s),
      officialRaw: official,
    });
    const cmpSettlement = comparePublishedAverage({
      fieldName: "last_60s_windowed_average_15min",
      publishedRaw: settlementWindow,
      sampleValueRaws: Array.from({ length: 60 }, () => settlementWindow),
      officialRaw: official,
    });
    expect(cmpAvg.vsOfficial?.diagnosticRound2HalfEvenEqual).toBe(true);
    expect(cmpSettlement.vsOfficial?.diagnosticRound2HalfEvenEqual).toBe(false);
  });

  it("reads local v3 disposition when present without mutating it", () => {
    const path = "data/research-results/external-kalshi-data-audit/m17-prep-one-close-settlement-fidelity-v3/one-close-disposition.json";
    let raw: string | null = null;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      raw = null;
    }
    if (raw == null) {
      expect(true).toBe(true); // artifact may be gitignored / absent in CI
      return;
    }
    const disposition = JSON.parse(raw) as {
      live?: {
        officialExpirationRaw?: string;
        membershipComparisons?: Array<{
          fieldName: string;
          publishedRaw: string | null;
          exactDecimalEqual?: boolean | null;
          status?: string;
          sampleCount?: number;
        }>;
      };
    };
    expect(disposition.live?.officialExpirationRaw).toBe("84379.39");
    const avg = disposition.live?.membershipComparisons?.find((row) => row.fieldName === "avg_60s_data");
    expect(avg?.status).toBe("compared");
    expect(avg?.sampleCount).toBe(60);
  });
});
