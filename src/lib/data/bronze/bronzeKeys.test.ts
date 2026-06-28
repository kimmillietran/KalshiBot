import { describe, expect, it } from "vitest";

import {
  BRONZE_KEY_PREFIX,
  bronzeKeyFromRecord,
  buildBronzeRecordKey,
  isBronzeRecordKey,
  recordIdFromBronzeKey,
} from "./bronzeKeys";

describe("bronzeKeys", () => {
  it("builds deterministic keys from recordId", () => {
    expect(buildBronzeRecordKey("bronze-001")).toBe(
      `${BRONZE_KEY_PREFIX}bronze-001`,
    );
    expect(buildBronzeRecordKey("bronze-001")).toBe(
      buildBronzeRecordKey("bronze-001"),
    );
  });

  it("builds keys from raw historical records", () => {
    expect(
      bronzeKeyFromRecord({ recordId: "fetch-20260626-001" }),
    ).toBe(`${BRONZE_KEY_PREFIX}fetch-20260626-001`);
  });

  it("round-trips recordId from bronze keys", () => {
    const key = buildBronzeRecordKey("bronze-001");
    expect(recordIdFromBronzeKey(key)).toBe("bronze-001");
  });

  it("rejects empty recordId keys", () => {
    expect(() => buildBronzeRecordKey("")).toThrow("recordId is required");
    expect(() => buildBronzeRecordKey("   ")).toThrow("recordId is required");
  });

  it("validates bronze key prefix", () => {
    expect(isBronzeRecordKey(`${BRONZE_KEY_PREFIX}abc`)).toBe(true);
    expect(isBronzeRecordKey("invalid-key")).toBe(false);
    expect(isBronzeRecordKey(BRONZE_KEY_PREFIX)).toBe(false);
  });
});
