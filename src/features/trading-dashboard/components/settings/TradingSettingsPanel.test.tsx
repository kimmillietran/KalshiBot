import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  TRADING_SETTINGS_FIELD_COPY,
  TRADING_SETTINGS_PANEL_TITLE,
} from "@/features/trading-dashboard/constants";
import { resolvedSettingsFromForm } from "@/features/trading-dashboard/test-fixtures/tradingSettings";
import { EMPTY_TRADING_SETTINGS_FORM } from "@/features/trading-dashboard/types/tradingSettingsForm";

import { TradingSettingsCard } from "./TradingSettingsCard";

describe("TradingSettingsCard", () => {
  it("renders empty default settings fields", () => {
    const resolved = resolvedSettingsFromForm();
    render(
      <TradingSettingsCard
        form={EMPTY_TRADING_SETTINGS_FORM}
        resolved={resolved}
        onFieldChange={vi.fn()}
      />,
    );

    expect(screen.getByText(TRADING_SETTINGS_PANEL_TITLE)).toBeInTheDocument();
    expect(screen.getByLabelText(TRADING_SETTINGS_FIELD_COPY.bankrollDollars.label)).toHaveValue("");
    expect(screen.getByLabelText(TRADING_SETTINGS_FIELD_COPY.minEdgePercent.label)).toHaveValue("");
    expect(screen.getByLabelText(TRADING_SETTINGS_FIELD_COPY.kellyFraction.label)).toHaveValue("");
    expect(resolved.valid).toBe(true);
    expect(resolved.warnings).toEqual([]);
  });

  it("shows resolver warnings for invalid input without React validation", () => {
    const form = { ...EMPTY_TRADING_SETTINGS_FORM, minEdgePercent: "not-a-number" };
    const resolved = resolvedSettingsFromForm(form);

    render(
      <TradingSettingsCard form={form} resolved={resolved} onFieldChange={vi.fn()} />,
    );

    expect(screen.getByText(/Invalid minEdgePercent/i)).toBeInTheDocument();
  });

  it("clears field warning after valid edit", () => {
    const onFieldChange = vi.fn();
    const invalidForm = { ...EMPTY_TRADING_SETTINGS_FORM, kellyFraction: "0" };
    const invalidResolved = resolvedSettingsFromForm(invalidForm);

    const { rerender } = render(
      <TradingSettingsCard
        form={invalidForm}
        resolved={invalidResolved}
        onFieldChange={onFieldChange}
      />,
    );

    expect(
      screen.getByText(/Invalid kellyFraction/i),
    ).toBeInTheDocument();

    const validForm = { ...invalidForm, kellyFraction: "0.25" };
    const validResolved = resolvedSettingsFromForm(validForm);
    rerender(
      <TradingSettingsCard
        form={validForm}
        resolved={validResolved}
        onFieldChange={onFieldChange}
      />,
    );

    expect(screen.queryByText(/Invalid kellyFraction/i)).not.toBeInTheDocument();
    expect(validResolved.valid).toBe(true);
  });
});
