import { describe, expect, it } from "vitest";

import {
  canUseDiscoveryEarlyStop,
  formatDiscoveryProgressMessage,
  getDiscoveryEarlyStopTarget,
  shouldStopDiscoveryPagination,
} from "./discoveryEarlyStop";
import { MarketDiscoveryError } from "./discoveryTypes";

describe("discoveryEarlyStop", () => {
  it("allows early stop when limit is set without date filters", () => {
    expect(canUseDiscoveryEarlyStop({ limit: 50 })).toBe(true);
    expect(canUseDiscoveryEarlyStop({ offset: 100, limit: 50 })).toBe(true);
    expect(canUseDiscoveryEarlyStop({ limit: 0 })).toBe(true);
  });

  it("disables early stop without limit or with date filters", () => {
    expect(canUseDiscoveryEarlyStop()).toBe(false);
    expect(canUseDiscoveryEarlyStop({ offset: 10 })).toBe(false);
    expect(canUseDiscoveryEarlyStop({ limit: 50, after: "2026-01-01" })).toBe(false);
    expect(canUseDiscoveryEarlyStop({ limit: 50, before: "2026-02-01" })).toBe(false);
  });

  it("computes offset + limit early-stop targets", () => {
    expect(getDiscoveryEarlyStopTarget({ limit: 50 })).toBe(50);
    expect(getDiscoveryEarlyStopTarget({ offset: 100, limit: 50 })).toBe(150);
    expect(getDiscoveryEarlyStopTarget({ limit: 0 })).toBe(0);
  });

  it("rejects invalid sampling targets", () => {
    expect(() => getDiscoveryEarlyStopTarget({ limit: -1 })).toThrow(MarketDiscoveryError);
  });

  it("stops pagination once the collection target is met", () => {
    expect(shouldStopDiscoveryPagination({ collectedCount: 50, limitTarget: 50 })).toBe(true);
    expect(shouldStopDiscoveryPagination({ collectedCount: 49, limitTarget: 50 })).toBe(false);
    expect(shouldStopDiscoveryPagination({ collectedCount: 0, limitTarget: 0 })).toBe(true);
  });

  it("formats progress messages with discover prefix", () => {
    expect(formatDiscoveryProgressMessage("page=1 collected=100 limitTarget=50")).toBe(
      "[discover] page=1 collected=100 limitTarget=50",
    );
  });
});
