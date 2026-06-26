import { describe, expect, it } from "vitest";

import {
  formatCents,
  formatPercent,
  formatSignedUsd,
  formatUsd,
} from "@/lib/utils/format";

describe("formatUsd", () => {
  it("formats a standard USD amount", () => {
    expect(formatUsd(64250.32)).toBe("$64,250.32");
  });

  it("formats compact USD without decimals", () => {
    expect(formatUsd(64250.32, true)).toBe("$64,250");
  });
});

describe("formatCents", () => {
  it("appends cent symbol", () => {
    expect(formatCents(63)).toBe("63¢");
  });
});

describe("formatPercent", () => {
  it("formats percent with two decimals by default", () => {
    expect(formatPercent(1.8)).toBe("1.80%");
  });

  it("formats small percent with three decimals", () => {
    expect(formatPercent(0.039)).toBe("0.039%");
  });

  it("adds plus sign when signed and positive", () => {
    expect(formatPercent(1.8, true)).toBe("+1.80%");
  });
});

describe("formatSignedUsd", () => {
  it("prefixes positive values with plus", () => {
    expect(formatSignedUsd(25.32)).toBe("+$25.32");
  });
});
