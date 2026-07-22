import { describe, expect, it } from "vitest";

import { kalshiOrderbookSnapshotMessageSchema } from "./schemas";

const BASE_SNAPSHOT = {
  type: "orderbook_snapshot" as const,
  sid: 1,
  seq: 126,
  msg: {
    market_ticker: "KXBTC15M-TEST",
    market_id: "test-market",
    yes_dollars_fp: [["0.4500", "10.00"]] as [string, string][],
    no_dollars_fp: [["0.5000", "12.00"]] as [string, string][],
  },
};

describe("kalshiOrderbookSnapshotMessageSchema command id", () => {
  it("parses ordinary snapshots without an id", () => {
    const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse(BASE_SNAPSHOT);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBeUndefined();
      expect(parsed.data.sid).toBe(1);
      expect(parsed.data.seq).toBe(126);
      expect(parsed.data.msg.market_ticker).toBe("KXBTC15M-TEST");
    }
  });

  it("parses and preserves a valid positive command id", () => {
    const parsed = kalshiOrderbookSnapshotMessageSchema.safeParse({
      ...BASE_SNAPSHOT,
      id: 3,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe(3);
    }
  });

  it("rejects malformed command ids", () => {
    expect(
      kalshiOrderbookSnapshotMessageSchema.safeParse({ ...BASE_SNAPSHOT, id: 0 }).success,
    ).toBe(false);
    expect(
      kalshiOrderbookSnapshotMessageSchema.safeParse({ ...BASE_SNAPSHOT, id: -1 }).success,
    ).toBe(false);
    expect(
      kalshiOrderbookSnapshotMessageSchema.safeParse({ ...BASE_SNAPSHOT, id: 1.5 }).success,
    ).toBe(false);
    expect(
      kalshiOrderbookSnapshotMessageSchema.safeParse({ ...BASE_SNAPSHOT, id: "3" }).success,
    ).toBe(false);
  });

  it("continues to enforce sid, seq, and orderbook fields", () => {
    expect(
      kalshiOrderbookSnapshotMessageSchema.safeParse({
        ...BASE_SNAPSHOT,
        sid: 0,
      }).success,
    ).toBe(false);
    expect(
      kalshiOrderbookSnapshotMessageSchema.safeParse({
        ...BASE_SNAPSHOT,
        seq: -1,
      }).success,
    ).toBe(false);
    expect(
      kalshiOrderbookSnapshotMessageSchema.safeParse({
        ...BASE_SNAPSHOT,
        msg: { ...BASE_SNAPSHOT.msg, market_ticker: "" },
      }).success,
    ).toBe(false);
  });
});
