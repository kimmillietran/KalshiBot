import { describe, expect, it } from "vitest";

import { ENGINE_VERSION } from "@/lib/trading/versioning";

describe("ENGINE_VERSION", () => {
  it("is a semver string aligned with milestone 5.3A", () => {
    expect(ENGINE_VERSION).toBe("5.3.0");
  });
});
