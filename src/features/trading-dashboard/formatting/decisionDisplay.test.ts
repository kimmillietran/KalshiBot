import { describe, expect, it } from "vitest";

import {
  actionBadgeVariant,
  actionHeroTone,
  formatProbabilityPercent,
  formatSignedCents,
  isGuardFailure,
} from "./decisionDisplay";
import { guardFailureDecision, buyUpDecision } from "../test-fixtures/engineDecisions";

describe("decisionDisplay", () => {
  it("maps action tones for dashboard styling", () => {
    expect(actionHeroTone("BUY UP")).toBe("bullish");
    expect(actionHeroTone("BUY DOWN")).toBe("bearish");
    expect(actionHeroTone("NO TRADE")).toBe("caution");
    expect(actionBadgeVariant("BUY UP")).toBe("success");
    expect(actionBadgeVariant("BUY DOWN")).toBe("danger");
  });

  it("formats probability and EV without recomputing model values", () => {
    expect(formatProbabilityPercent(0.742)).toBe("74.2%");
    expect(formatSignedCents(12.5)).toBe("+12.50¢");
  });

  it("detects guard failure decisions", () => {
    expect(isGuardFailure(guardFailureDecision())).toBe(true);
    expect(isGuardFailure(buyUpDecision())).toBe(false);
  });
});
