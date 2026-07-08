import { describe, expect, it } from "vitest";

import { resolveKalshiContractQuotes } from "./resolveKalshiContractQuotes";

describe("resolveKalshiContractQuotes", () => {
  it("returns null when YES quotes are missing", () => {
    expect(resolveKalshiContractQuotes({})).toBeNull();
  });

  it("uses explicit NO quotes when provided", () => {
    const quotes = resolveKalshiContractQuotes({
      yesBidCents: 40,
      yesAskCents: 45,
      noBidCents: 50,
      noAskCents: 55,
    });

    expect(quotes?.noBidCents).toBe(50);
    expect(quotes?.noAskCents).toBe(55);
    expect(quotes?.noSideDerived).toBe(false);
  });
});
