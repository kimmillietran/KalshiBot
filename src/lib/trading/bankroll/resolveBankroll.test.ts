import { describe, expect, it } from "vitest";

import { BANKROLL_MODEL_VERSION, resolveBankroll } from "./resolveBankroll";

describe("resolveBankroll", () => {
  it("returns unconfigured when bankroll is undefined", () => {
    const resolved = resolveBankroll({});

    expect(resolved).toEqual({
      bankrollDollars: null,
      configured: false,
      reasoning: [
        "configured=false",
        "No bankroll supplied — dollar sizing omitted.",
      ],
      modelVersion: BANKROLL_MODEL_VERSION,
    });
  });

  it("returns unconfigured when bankroll is null", () => {
    const resolved = resolveBankroll({ bankrollDollars: null });

    expect(resolved.bankrollDollars).toBeNull();
    expect(resolved.configured).toBe(false);
  });

  it("returns unconfigured when bankroll is NaN", () => {
    const resolved = resolveBankroll({ bankrollDollars: Number.NaN });

    expect(resolved.bankrollDollars).toBeNull();
    expect(resolved.configured).toBe(false);
    expect(resolved.reasoning[1]).toContain("finite");
  });

  it("returns unconfigured when bankroll is Infinity", () => {
    const resolved = resolveBankroll({ bankrollDollars: Number.POSITIVE_INFINITY });

    expect(resolved.bankrollDollars).toBeNull();
    expect(resolved.configured).toBe(false);
    expect(resolved.reasoning[1]).toContain("finite");
  });

  it("returns unconfigured when bankroll is -Infinity", () => {
    const resolved = resolveBankroll({ bankrollDollars: Number.NEGATIVE_INFINITY });

    expect(resolved.bankrollDollars).toBeNull();
    expect(resolved.configured).toBe(false);
    expect(resolved.reasoning[1]).toContain("finite");
  });

  it("returns unconfigured when bankroll is zero", () => {
    const resolved = resolveBankroll({ bankrollDollars: 0 });

    expect(resolved.bankrollDollars).toBeNull();
    expect(resolved.configured).toBe(false);
    expect(resolved.reasoning[1]).toContain("greater than zero");
  });

  it("returns unconfigured when bankroll is negative", () => {
    const resolved = resolveBankroll({ bankrollDollars: -100 });

    expect(resolved.bankrollDollars).toBeNull();
    expect(resolved.configured).toBe(false);
    expect(resolved.reasoning[1]).toContain("greater than zero");
  });

  it("returns configured bankroll for positive values", () => {
    const resolved = resolveBankroll({ bankrollDollars: 1_000 });

    expect(resolved).toEqual({
      bankrollDollars: 1_000,
      configured: true,
      reasoning: [
        "configured=true bankroll=$1,000.00",
        "Valid bankroll available for Kelly dollar sizing.",
      ],
      modelVersion: BANKROLL_MODEL_VERSION,
    });
  });

  it("is deterministic for identical inputs", () => {
    const input = { bankrollDollars: 500 };

    expect(resolveBankroll(input)).toEqual(resolveBankroll(input));
  });

  it("defaults empty config to unconfigured", () => {
    expect(resolveBankroll()).toEqual(resolveBankroll({}));
  });
});
