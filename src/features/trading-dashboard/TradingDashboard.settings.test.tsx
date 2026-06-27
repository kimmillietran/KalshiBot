import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as trading from "@/lib/trading";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import { DEFAULT_POSITION_SIZING_CONFIG } from "@/lib/trading/position-sizing/config";

import { TradingDashboard } from "@/features/trading-dashboard";
import {
  POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL,
  TRADING_SETTINGS_FIELD_COPY,
  TRADING_SETTINGS_PANEL_TITLE,
} from "@/features/trading-dashboard/constants";
import type { TradingSettingsFieldKey } from "@/features/trading-dashboard/types/tradingSettingsForm";
import { renderWithDashboard } from "@/test/test-utils";

function getSettingsPanel(): HTMLElement {
  const heading = screen.getByRole("heading", { name: TRADING_SETTINGS_PANEL_TITLE });
  const panel = heading.closest(".border-glass-border");
  expect(panel).toBeTruthy();
  return panel as HTMLElement;
}

function getSettingsInput(field: TradingSettingsFieldKey) {
  return within(getSettingsPanel()).getByLabelText(
    TRADING_SETTINGS_FIELD_COPY[field].label,
  );
}

describe("TradingDashboard settings wiring", () => {
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("renders the trading settings panel with session-only defaults", async () => {
    renderWithDashboard(<TradingDashboard />);

    expect(screen.getByText(TRADING_SETTINGS_PANEL_TITLE)).toBeInTheDocument();
    expect(
      getSettingsInput("bankrollDollars"),
    ).toHaveValue("");

    await waitFor(() => {
      expect(screen.getAllByText("NO TRADE").length).toBeGreaterThan(0);
      expect(screen.getByText(POSITION_SIZING_DOLLARS_UNAVAILABLE_LABEL)).toBeInTheDocument();
    });
  });

  it("passes resolved settings into evaluate() when fields change", async () => {
    const evaluateSpy = vi.spyOn(trading, "evaluate");
    renderWithDashboard(<TradingDashboard />);

    await waitFor(() => {
      expect(evaluateSpy).toHaveBeenCalled();
    });

    fireEvent.change(getSettingsInput("bankrollDollars"), {
      target: { value: "1000" },
    });

    await waitFor(() => {
      const lastConfig = evaluateSpy.mock.calls.at(-1)?.[1];
      expect(lastConfig?.bankrollDollars).toBe(1000);
    });

    fireEvent.change(getSettingsInput("kellyFraction"), {
      target: { value: "0.4" },
    });

    await waitFor(() => {
      const lastConfig = evaluateSpy.mock.calls.at(-1)?.[1];
      expect(lastConfig?.kellyFraction).toBe(0.4);
      expect(lastConfig?.minEdgePercent).toBe(DEFAULT_ENGINE_CONFIG.minEdgePercent);
    });

    fireEvent.change(getSettingsInput("maxPositionFraction"), {
      target: { value: "0.05" },
    });

    await waitFor(() => {
      const lastConfig = evaluateSpy.mock.calls.at(-1)?.[1];
      expect(lastConfig?.maxPositionFraction).toBe(0.05);
      expect(lastConfig?.kellyFraction).toBe(0.4);
    });
  });

  it("shows resolver warnings for invalid dashboard input", async () => {
    renderWithDashboard(<TradingDashboard />);

    fireEvent.change(getSettingsInput("maxSpreadPercent"), {
      target: { value: "200" },
    });

    await waitFor(() => {
      expect(within(getSettingsPanel()).getByText(/maxSpreadPercent/i)).toBeInTheDocument();
    });
  });

  it("rerenders engine output deterministically after settings changes", async () => {
    const evaluateSpy = vi.spyOn(trading, "evaluate");
    renderWithDashboard(<TradingDashboard />);

    await waitFor(() => {
      expect(evaluateSpy.mock.calls.length).toBeGreaterThan(0);
    });

    const firstCallCount = evaluateSpy.mock.calls.length;

    fireEvent.change(getSettingsInput("minEdgePercent"), {
      target: { value: "7" },
    });

    await waitFor(() => {
      expect(evaluateSpy.mock.calls.length).toBeGreaterThan(firstCallCount);
      const configs = evaluateSpy.mock.calls.map((call) => call[1]?.minEdgePercent);
      expect(configs.at(-1)).toBe(7);
      expect(configs.filter((value) => value === 7).length).toBeGreaterThan(0);
    });
  });

  it("does not duplicate sizing defaults in the dashboard layer", async () => {
    const evaluateSpy = vi.spyOn(trading, "evaluate");
    renderWithDashboard(<TradingDashboard />);

    await waitFor(() => {
      expect(evaluateSpy).toHaveBeenCalled();
    });

    const config = evaluateSpy.mock.calls.at(-1)?.[1];
    expect(config?.kellyFraction).toBe(DEFAULT_POSITION_SIZING_CONFIG.kellyFraction);
    expect(config?.maxPositionFraction).toBe(DEFAULT_POSITION_SIZING_CONFIG.maxFraction);
  });
});
