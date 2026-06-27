import { describe, expect, it } from "vitest";

import { parseVolumeLabelDollars } from "./parseVolumeDollars";

describe("parseVolumeLabelDollars", () => {
  it("parses K and M suffix labels", () => {
    expect(parseVolumeLabelDollars("$503K")).toBe(503_000);
    expect(parseVolumeLabelDollars("$1.2M")).toBe(1_200_000);
  });

  it("returns null for empty or unknown labels", () => {
    expect(parseVolumeLabelDollars("—")).toBeNull();
    expect(parseVolumeLabelDollars("")).toBeNull();
    expect(parseVolumeLabelDollars("n/a")).toBeNull();
  });

  it("parses plain dollar amounts", () => {
    expect(parseVolumeLabelDollars("$500")).toBe(500);
  });
});
