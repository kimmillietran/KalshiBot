import { describe, expect, it } from "vitest";

import { tradingMockData } from "./tradingMock";

describe("tradingMockData", () => {
  it("includes BTC price in command bar", () => {
    expect(tradingMockData.commandBar.btcPrice).toBeGreaterThan(0);
  });

  it("includes target price and distance fields", () => {
    expect(tradingMockData.market.targetPrice).toBe(64225);
    expect(tradingMockData.market.distanceFromTarget).toBeDefined();
  });

  it("includes up and down contracts", () => {
    expect(tradingMockData.contracts.up.label).toBe("UP");
    expect(tradingMockData.contracts.down.label).toBe("DOWN");
    expect(tradingMockData.contracts.up.price).toBe(63);
    expect(tradingMockData.contracts.down.price).toBe(38);
  });

  it("includes model probabilities", () => {
    expect(tradingMockData.model.probabilityUp).toBe(74);
    expect(tradingMockData.model.probabilityDown).toBe(26);
  });

  it("includes a BUY UP recommendation", () => {
    expect(tradingMockData.recommendation.action).toBe("BUY UP");
    expect(tradingMockData.recommendation.edge).toBe("+11%");
  });

  it("includes chart data points", () => {
    expect(tradingMockData.chart.points.length).toBeGreaterThan(0);
    expect(tradingMockData.chart.targetPrice).toBe(64225);
  });
});
