import { describe, expect, it } from "vitest";

import { mapKalshiStatusToLifecycle } from "./lifecycle";
import { MarketLifecycle } from "../types";

describe("mapKalshiStatusToLifecycle", () => {
  const openTime = "2026-06-26T23:15:00Z";
  const closeTime = "2026-06-26T23:30:00Z";

  it("maps an in-window active market to ACTIVE", () => {
    expect(
      mapKalshiStatusToLifecycle({
        vendorStatus: "active",
        openTime,
        closeTime,
        nowMs: Date.parse("2026-06-26T23:20:00Z"),
      }),
    ).toBe(MarketLifecycle.ACTIVE);
  });

  it("maps pre-open temporal context to UPCOMING regardless of vendor label", () => {
    expect(
      mapKalshiStatusToLifecycle({
        vendorStatus: "initialized",
        openTime,
        closeTime,
        nowMs: Date.parse("2026-06-26T23:10:00Z"),
      }),
    ).toBe(MarketLifecycle.UPCOMING);
  });

  it("maps post-close temporal context to CLOSED", () => {
    expect(
      mapKalshiStatusToLifecycle({
        vendorStatus: "active",
        openTime,
        closeTime,
        nowMs: Date.parse("2026-06-26T23:35:00Z"),
      }),
    ).toBe(MarketLifecycle.CLOSED);
  });

  it("maps settled vendor status to SETTLED", () => {
    expect(
      mapKalshiStatusToLifecycle({
        vendorStatus: "settled",
        openTime,
        closeTime,
        nowMs: Date.parse("2026-06-26T23:20:00Z"),
      }),
    ).toBe(MarketLifecycle.SETTLED);
  });

  it("maps unknown vendor status to UNKNOWN when temporal context is inconclusive", () => {
    expect(
      mapKalshiStatusToLifecycle({
        vendorStatus: "mystery_status",
        openTime,
        closeTime,
        nowMs: Date.parse("2026-06-26T23:20:00Z"),
      }),
    ).toBe(MarketLifecycle.UNKNOWN);
  });
});
