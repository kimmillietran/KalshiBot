import { describe, expect, it } from "vitest";

import {
  buyUpDecision,
  guardFailureDecision,
  noTradePolicyDecision,
} from "../test-fixtures/engineDecisions";
import { mockPositionSize } from "../test-fixtures/positionSizingDecisions";
import {
  buildTradeDecisionExport,
  serializeTradeDecision,
} from "./serializeTradeDecision";

describe("serializeTradeDecision", () => {
  it("serializes BUY UP decision with model outputs", () => {
    const decision = buyUpDecision();
    const payload = buildTradeDecisionExport(decision);

    expect(payload.action).toBe("BUY UP");
    expect(payload.engineVersion).toBe(decision.engineVersion);
    expect(payload.probability).toEqual(decision.probability);
    expect(payload.expectedValue).toEqual(decision.expectedValue);
    expect(payload.positionSize).toEqual(decision.positionSize);
    expect(payload.reasoning.summary).toBe(decision.reasoning.summary);
    expect(payload.probability).not.toBeNull();
    expect(payload.positionSize?.recommendedFraction).toBeGreaterThan(0);
  });

  it("serializes NO TRADE decision with zero sizing object", () => {
    const decision = noTradePolicyDecision();
    const payload = buildTradeDecisionExport(decision);

    expect(payload.action).toBe("NO TRADE");
    expect(payload.probability).not.toBeNull();
    expect(payload.expectedValue).not.toBeNull();
    expect(payload.positionSize).not.toBeNull();
    expect(payload.positionSize?.recommendedFraction).toBe(0);
  });

  it("serializes guard failure with null model outputs", () => {
    const decision = guardFailureDecision();
    const payload = buildTradeDecisionExport(decision);

    expect(payload.action).toBe("NO TRADE");
    expect(payload.probability).toBeNull();
    expect(payload.expectedValue).toBeNull();
    expect(payload.positionSize).toBeNull();
    expect(payload.gatesTriggered).toEqual(["guard-market-present"]);
  });

  it("preserves positionSize null separately from zero allocation", () => {
    const guardPayload = buildTradeDecisionExport(guardFailureDecision());
    const zeroPayload = buildTradeDecisionExport(noTradePolicyDecision());

    expect(guardPayload.positionSize).toBeNull();
    expect(zeroPayload.positionSize).not.toBeNull();
    expect(zeroPayload.positionSize?.recommendedFraction).toBe(0);
  });

  it("preserves null model fields truthfully without inventing values", () => {
    const decision = guardFailureDecision();
    const json = serializeTradeDecision(decision);

    expect(json).toContain('"probability":null');
    expect(json).toContain('"expectedValue":null');
    expect(json).toContain('"positionSize":null');
    expect(json).not.toContain("undefined");
    expect(json).not.toMatch(/"probability":\{/);
  });

  it("produces deterministic output for identical decisions", () => {
    const decision = buyUpDecision();
    const first = serializeTradeDecision(decision);
    const second = serializeTradeDecision(decision);

    expect(second).toBe(first);
    expect(first).toMatch(/^\{"action":/);
  });

  it("includes gatesTriggered only when present on the decision", () => {
    const withGates = serializeTradeDecision(guardFailureDecision());
    const withoutGates = serializeTradeDecision(buyUpDecision());

    expect(withGates).toContain('"gatesTriggered"');
    expect(withoutGates).not.toContain('"gatesTriggered"');
  });

  it("does not embed UI-only or synthetic fields", () => {
    const decision = {
      ...buyUpDecision(),
      positionSize: mockPositionSize({ recommendedDollars: null }),
    };
    const payload = buildTradeDecisionExport(decision);

    expect(Object.keys(payload).sort()).toEqual([
      "action",
      "engineVersion",
      "expectedValue",
      "positionSize",
      "probability",
      "reasoning",
    ]);
    expect(payload.positionSize?.recommendedDollars).toBeNull();
  });
});
