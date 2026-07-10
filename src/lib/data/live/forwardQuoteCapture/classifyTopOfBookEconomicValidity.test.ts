import { describe, expect, it } from "vitest";

import { classifyTopOfBookEconomicValidity } from "./classifyTopOfBookEconomicValidity";

const BASE = {
  bookState: "valid",
  yesBestBidCents: 45,
  yesBestAskCents: 47,
  noBestBidCents: 53,
  noBestAskCents: 55,
  yesBestBidSize: 10,
  yesBestAskSize: 10,
  noBestBidSize: 10,
  noBestAskSize: 10,
};

describe("classifyTopOfBookEconomicValidity", () => {
  it("classifies economically-valid books", () => {
    const result = classifyTopOfBookEconomicValidity(BASE);
    expect(result.economicBookState).toBe("economically-valid");
    expect(result.isEconomicallyValid).toBe(true);
    expect(result.isParityUsable).toBe(true);
    expect(result.economicInvalidReasons).toEqual([]);
  });

  it("classifies crossed YES book", () => {
    const result = classifyTopOfBookEconomicValidity({
      ...BASE,
      yesBestBidCents: 54,
      yesBestAskCents: 30,
    });
    expect(result.economicBookState).toBe("sequence-valid-crossed");
    expect(result.yesBookCrossed).toBe(true);
    expect(result.isEconomicallyValid).toBe(false);
    expect(result.yesSignedSpreadCents).toBe(-24);
  });

  it("classifies crossed NO book", () => {
    const result = classifyTopOfBookEconomicValidity({
      ...BASE,
      noBestBidCents: 60,
      noBestAskCents: 40,
    });
    expect(result.economicBookState).toBe("sequence-valid-crossed");
    expect(result.noBookCrossed).toBe(true);
    expect(result.noSignedSpreadCents).toBe(-20);
  });

  it("classifies locked YES book", () => {
    const result = classifyTopOfBookEconomicValidity({
      ...BASE,
      yesBestBidCents: 50,
      yesBestAskCents: 50,
    });
    expect(result.economicBookState).toBe("sequence-valid-locked");
    expect(result.yesBookLocked).toBe(true);
    expect(result.yesSignedSpreadCents).toBe(0);
  });

  it("classifies missing bid/ask as insufficient-depth", () => {
    const result = classifyTopOfBookEconomicValidity({
      ...BASE,
      yesBestBidCents: null,
    });
    expect(result.economicBookState).toBe("insufficient-depth");
    expect(result.economicInvalidReasons).toContain("Missing YES bid.");
  });

  it("classifies awaiting snapshot", () => {
    const result = classifyTopOfBookEconomicValidity({
      ...BASE,
      bookState: "awaiting-snapshot",
    });
    expect(result.economicBookState).toBe("awaiting-snapshot");
    expect(result.isEconomicallyValid).toBe(false);
  });

  it("classifies out-of-range price as invalid-price", () => {
    const result = classifyTopOfBookEconomicValidity({
      ...BASE,
      yesBestBidCents: 101,
    });
    expect(result.economicBookState).toBe("invalid-price");
    expect(result.isEconomicallyValid).toBe(false);
  });

  it("preserves negative signed spreads for crossed books", () => {
    const result = classifyTopOfBookEconomicValidity({
      ...BASE,
      yesBestBidCents: 92,
      yesBestAskCents: 47,
    });
    expect(result.yesSignedSpreadCents).toBe(-45);
    expect(result.yesBookCrossed).toBe(true);
  });
});
