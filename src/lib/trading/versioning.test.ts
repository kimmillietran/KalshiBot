import { describe, expect, it } from "vitest";

import { ENGINE_VERSION } from "@/lib/trading/versioning";

describe("ENGINE_VERSION", () => {
  it("is a semver string aligned with milestone 5.7B", () => {
    expect(ENGINE_VERSION).toBe("5.7.0");
  });
});
