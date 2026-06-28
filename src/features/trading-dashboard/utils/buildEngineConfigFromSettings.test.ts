import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { evaluate } from "@/lib/trading/evaluate";
import { DEFAULT_POSITION_SIZING_CONFIG } from "@/lib/trading/position-sizing/config";

import {
  buyUpDecision,
  buyUpSnapshot,
  buyUpWithBankrollDecision,
} from "../test-fixtures/engineDecisions";
import {
  resolvedSettingsFromForm,
  resolvedSettingsFromInput,
} from "../test-fixtures/tradingSettings";
import { buildEngineConfigFromSettings } from "./buildEngineConfigFromSettings";

describe("buildEngineConfigFromSettings", () => {
  it("maps resolved defaults without inventing bankroll", () => {
    const resolved = resolvedSettingsFromInput();

    expect(buildEngineConfigFromSettings(resolved)).toEqual({
      ...DEFAULT_ENGINE_CONFIG,
      minEdgePercent: resolved.minEdgePercent,
      maxSpreadPercent: resolved.maxSpreadPercent,
      kellyFraction: resolved.kellyFraction,
      maxPositionFraction: resolved.maxPositionFraction,
    });
  });

  it("includes bankroll when resolved", () => {
    const resolved = resolvedSettingsFromInput({ bankrollDollars: 1_500 });

    expect(buildEngineConfigFromSettings(resolved).bankrollDollars).toBe(1_500);
  });

  it("omits bankroll when unresolved", () => {
    const resolved = resolvedSettingsFromInput({ bankrollDollars: -1 });

    expect(buildEngineConfigFromSettings(resolved).bankrollDollars).toBeUndefined();
  });

  it("omits bankroll when form input is invalid", () => {
    const resolved = resolvedSettingsFromForm({ bankrollDollars: "-50" });

    expect(resolved.valid).toBe(false);
    expect(buildEngineConfigFromSettings(resolved).bankrollDollars).toBeUndefined();
  });
});

describe("settings engine wiring", () => {
  it("updates recommended dollars when bankroll is configured", () => {
    const baseline = buyUpDecision();
    const fraction = baseline.positionSize?.recommendedFraction ?? 0;
    expect(fraction).toBeGreaterThan(0);

    const resolved = resolvedSettingsFromInput({
      bankrollDollars: 500 / fraction,
    });
    const withBankroll = evaluate(
      buyUpSnapshot(),
      buildEngineConfigFromSettings(resolved),
    );

    expect(withBankroll.positionSize?.recommendedDollars).toBeCloseTo(500, 2);
    expect(resolved.bankrollDollars).not.toBeNull();
  });

  it("changes recommendation percent when Kelly fraction changes", () => {
    const lowKelly = resolvedSettingsFromInput({ kellyFraction: 0.1 });
    const highKelly = resolvedSettingsFromInput({ kellyFraction: 0.5 });
    const snapshot = buyUpSnapshot();

    const lowDecision = evaluate(snapshot, buildEngineConfigFromSettings(lowKelly));
    const highDecision = evaluate(snapshot, buildEngineConfigFromSettings(highKelly));

    expect(highDecision.positionSize?.recommendedPercent ?? 0).toBeGreaterThan(
      lowDecision.positionSize?.recommendedPercent ?? 0,
    );
  });

  it("clamps output when max position cap is reduced", () => {
    const resolved = resolvedSettingsFromInput({
      kellyFraction: 1,
      maxPositionFraction: 0.02,
    });
    const config = buildEngineConfigFromSettings(resolved);
    const decision = evaluate(buyUpSnapshot(), config);

    expect(decision.positionSize?.recommendedFraction).toBeLessThanOrEqual(0.02);
    expect(config.maxPositionFraction).toBe(0.02);
    expect(config.kellyFraction).toBe(1);
  });

  it("uses documented defaults for empty settings input", () => {
    const resolved = resolvedSettingsFromInput();
    const config = buildEngineConfigFromSettings(resolved);

    expect(config.minEdgePercent).toBe(DEFAULT_ENGINE_CONFIG.minEdgePercent);
    expect(config.maxSpreadPercent).toBe(DEFAULT_ENGINE_CONFIG.maxSpreadPercent);
    expect(config.kellyFraction).toBe(DEFAULT_POSITION_SIZING_CONFIG.kellyFraction);
    expect(config.maxPositionFraction).toBe(
      DEFAULT_POSITION_SIZING_CONFIG.maxFraction,
    );
    expect(config.bankrollDollars).toBeUndefined();
  });

  it("is deterministic for identical resolved settings", () => {
    const resolved = resolvedSettingsFromInput({
      bankrollDollars: 750,
      minEdgePercent: 6,
      kellyFraction: 0.3,
    });

    expect(buildEngineConfigFromSettings(resolved)).toEqual(
      buildEngineConfigFromSettings(resolved),
    );
  });

  it("matches buyUpWithBankrollDecision wiring through resolved settings", () => {
    const baseline = buyUpDecision();
    const fraction = baseline.positionSize?.recommendedFraction ?? 0;
    const targetDollars = 250;

    const resolved = resolvedSettingsFromInput({
      bankrollDollars: targetDollars / fraction,
    });
    const wired = evaluate(buyUpSnapshot(), buildEngineConfigFromSettings(resolved));
    const fixture = buyUpWithBankrollDecision(targetDollars);

    expect(wired.positionSize?.recommendedDollars).toBeCloseTo(
      fixture.positionSize?.recommendedDollars ?? 0,
      2,
    );
    expect(wired.positionSize?.recommendedFraction).toBe(
      fixture.positionSize?.recommendedFraction,
    );
  });

  it("forces NO TRADE when resolved minEdgePercent is very high", () => {
    const baseline = evaluate(
      buyUpSnapshot(),
      buildEngineConfigFromSettings(resolvedSettingsFromInput()),
    );
    expect(baseline.action).toBe("BUY UP");

    const strict = resolvedSettingsFromInput({ minEdgePercent: 100 });
    const decision = evaluate(
      buyUpSnapshot(),
      buildEngineConfigFromSettings(strict),
    );

    expect(decision.action).toBe("NO TRADE");
  });

  it("triggers spread guard when resolved maxSpreadPercent is strict", () => {
    const snapshot = {
      ...buyUpSnapshot(),
      pricing: {
        yesBidCents: 10,
        yesAskCents: 50,
        yesMidCents: 30,
        noBidCents: 37,
        noAskCents: 39,
        noMidCents: 38,
        liquidityQuality: "Good" as const,
        volumeDollars: 500_000,
      },
    };
    const resolved = resolvedSettingsFromInput({ maxSpreadPercent: 5 });
    const decision = evaluate(snapshot, buildEngineConfigFromSettings(resolved));

    expect(decision.gatesTriggered).toEqual(["guard-spread-maximum"]);
    expect(decision.action).toBe("NO TRADE");
  });
});
