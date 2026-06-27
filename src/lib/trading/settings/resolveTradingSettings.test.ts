import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_POSITION_SIZING_CONFIG } from "@/lib/trading/position-sizing/config";

import { DEFAULT_TRADING_SETTINGS, TRADING_SETTINGS_MODEL_VERSION } from "./config";
import { resolveTradingSettings } from "./resolveTradingSettings";
import type { TradingSettingsInput } from "./types";

describe("resolveTradingSettings", () => {
  it("returns documented defaults for missing input", () => {
    const resolved = resolveTradingSettings();

    expect(resolved).toEqual({
      bankrollDollars: null,
      minEdgePercent: DEFAULT_ENGINE_CONFIG.minEdgePercent,
      maxSpreadPercent: DEFAULT_ENGINE_CONFIG.maxSpreadPercent,
      kellyFraction: DEFAULT_POSITION_SIZING_CONFIG.kellyFraction,
      maxPositionFraction: DEFAULT_POSITION_SIZING_CONFIG.maxFraction,
      valid: true,
      warnings: [],
      modelVersion: TRADING_SETTINGS_MODEL_VERSION,
    });
  });

  it("accepts valid full input", () => {
    const input: TradingSettingsInput = {
      bankrollDollars: 2_500,
      minEdgePercent: 8,
      maxSpreadPercent: 12,
      kellyFraction: 0.2,
      maxPositionFraction: 0.08,
    };

    const resolved = resolveTradingSettings(input);

    expect(resolved).toEqual({
      bankrollDollars: 2_500,
      minEdgePercent: 8,
      maxSpreadPercent: 12,
      kellyFraction: 0.2,
      maxPositionFraction: 0.08,
      valid: true,
      warnings: [],
      modelVersion: TRADING_SETTINGS_MODEL_VERSION,
    });
  });

  it("rejects invalid bankroll without inventing a default", () => {
    const resolved = resolveTradingSettings({ bankrollDollars: -50 });

    expect(resolved.bankrollDollars).toBeNull();
    expect(resolved.valid).toBe(false);
    expect(resolved.warnings).toContain(
      "Invalid bankrollDollars — dollar sizing will be omitted.",
    );
  });

  it("accepts valid bankroll", () => {
    const resolved = resolveTradingSettings({ bankrollDollars: 1_000 });

    expect(resolved.bankrollDollars).toBe(1_000);
    expect(resolved.valid).toBe(true);
  });

  it("falls back for invalid minEdgePercent", () => {
    const resolved = resolveTradingSettings({ minEdgePercent: Number.NaN });

    expect(resolved.minEdgePercent).toBe(DEFAULT_TRADING_SETTINGS.minEdgePercent);
    expect(resolved.valid).toBe(false);
    expect(resolved.warnings[0]).toContain("minEdgePercent");
  });

  it("falls back for invalid maxSpreadPercent", () => {
    const resolved = resolveTradingSettings({ maxSpreadPercent: Number.POSITIVE_INFINITY });

    expect(resolved.maxSpreadPercent).toBe(DEFAULT_TRADING_SETTINGS.maxSpreadPercent);
    expect(resolved.valid).toBe(false);
    expect(resolved.warnings[0]).toContain("maxSpreadPercent");
  });

  it("falls back for invalid kellyFraction", () => {
    const resolved = resolveTradingSettings({ kellyFraction: 0 });

    expect(resolved.kellyFraction).toBe(DEFAULT_TRADING_SETTINGS.kellyFraction);
    expect(resolved.valid).toBe(false);
    expect(resolved.warnings[0]).toContain("kellyFraction");
  });

  it("falls back for invalid maxPositionFraction", () => {
    const resolved = resolveTradingSettings({ maxPositionFraction: 2 });

    expect(resolved.maxPositionFraction).toBe(
      DEFAULT_TRADING_SETTINGS.maxPositionFraction,
    );
    expect(resolved.valid).toBe(false);
    expect(resolved.warnings[0]).toContain("maxPositionFraction");
  });

  it("is deterministic for identical inputs", () => {
    const input: TradingSettingsInput = {
      bankrollDollars: 500,
      minEdgePercent: 6,
    };

    expect(resolveTradingSettings(input)).toEqual(resolveTradingSettings(input));
  });

  it("does not mutate input", () => {
    const input: TradingSettingsInput = {
      bankrollDollars: 750,
      minEdgePercent: 7,
      maxSpreadPercent: 10,
      kellyFraction: 0.3,
      maxPositionFraction: 0.05,
    };
    const snapshot = structuredClone(input);

    resolveTradingSettings(input);

    expect(input).toEqual(snapshot);
  });

  it("returns stable warnings for repeated invalid input", () => {
    const input: TradingSettingsInput = {
      bankrollDollars: Number.NaN,
      minEdgePercent: -1,
    };

    expect(resolveTradingSettings(input).warnings).toEqual(
      resolveTradingSettings(input).warnings,
    );
  });

  it("includes modelVersion", () => {
    expect(resolveTradingSettings().modelVersion).toBe("5.10.0");
  });
});
