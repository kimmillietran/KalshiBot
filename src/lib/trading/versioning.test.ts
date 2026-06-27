import { describe, expect, it } from "vitest";

import { ENGINE_VERSION } from "@/lib/trading/versioning";

describe("ENGINE_VERSION", () => {
  it("is a semver string aligned with milestone 5.4B", () => {
    expect(ENGINE_VERSION).toBe("5.4.0");
  });
});
