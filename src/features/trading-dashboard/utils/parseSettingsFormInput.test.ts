import { describe, expect, it } from "vitest";

import { EMPTY_TRADING_SETTINGS_FORM } from "../types/tradingSettingsForm";
import { parseSettingsFormInput } from "./parseSettingsFormInput";

describe("parseSettingsFormInput", () => {
  it("maps empty fields to undefined", () => {
    expect(parseSettingsFormInput(EMPTY_TRADING_SETTINGS_FORM)).toEqual({
      bankrollDollars: undefined,
      minEdgePercent: undefined,
      maxSpreadPercent: undefined,
      kellyFraction: undefined,
      maxPositionFraction: undefined,
    });
  });

  it("parses finite numeric strings", () => {
    expect(
      parseSettingsFormInput({
        ...EMPTY_TRADING_SETTINGS_FORM,
        bankrollDollars: " 1000 ",
        minEdgePercent: "7.5",
        kellyFraction: "0.25",
      }),
    ).toEqual({
      bankrollDollars: 1000,
      minEdgePercent: 7.5,
      maxSpreadPercent: undefined,
      kellyFraction: 0.25,
      maxPositionFraction: undefined,
    });
  });

  it("maps non-numeric strings to null", () => {
    expect(
      parseSettingsFormInput({
        ...EMPTY_TRADING_SETTINGS_FORM,
        bankrollDollars: "abc",
        maxSpreadPercent: "wide",
      }),
    ).toEqual({
      bankrollDollars: null,
      minEdgePercent: undefined,
      maxSpreadPercent: null,
      kellyFraction: undefined,
      maxPositionFraction: undefined,
    });
  });
});
