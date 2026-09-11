import { describe, expect, it } from "vitest";

describe("Vitest environment selection (node default)", () => {
  it("runs .ts tests without a DOM document", () => {
    expect(typeof document).toBe("undefined");
  });
});
