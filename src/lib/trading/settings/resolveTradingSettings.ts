import { resolveBankroll } from "@/lib/trading/bankroll";

import {
  DEFAULT_TRADING_SETTINGS,
  TRADING_SETTINGS_BOUNDS,
  TRADING_SETTINGS_MODEL_VERSION,
} from "./config";
import type { ResolvedTradingSettings, TradingSettingsInput } from "./types";

type NumericBounds = {
  min?: number;
  max?: number;
  minExclusive?: number;
};

type NumericResolution = {
  value: number;
  warnings: string[];
  invalid: boolean;
};

function isProvided(value: number | null | undefined): value is number | null {
  return value !== undefined;
}

function isFiniteInBounds(value: number, bounds: NumericBounds): boolean {
  if (!Number.isFinite(value)) {
    return false;
  }

  if (bounds.min !== undefined && value < bounds.min) {
    return false;
  }

  if (bounds.minExclusive !== undefined && value <= bounds.minExclusive) {
    return false;
  }

  if (bounds.max !== undefined && value > bounds.max) {
    return false;
  }

  return true;
}

function resolveNumericSetting(
  field: keyof typeof DEFAULT_TRADING_SETTINGS,
  inputValue: number | null | undefined,
  defaultValue: number,
  bounds: NumericBounds,
): NumericResolution {
  if (!isProvided(inputValue)) {
    return { value: defaultValue, warnings: [], invalid: false };
  }

  if (inputValue === null || !isFiniteInBounds(inputValue, bounds)) {
    return {
      value: defaultValue,
      warnings: [
        `Invalid ${field} — using default ${defaultValue}.`,
      ],
      invalid: true,
    };
  }

  return { value: inputValue, warnings: [], invalid: false };
}

function resolveBankrollSetting(
  inputValue: number | null | undefined,
): Pick<ResolvedTradingSettings, "bankrollDollars"> & {
  warnings: string[];
  invalid: boolean;
} {
  if (!isProvided(inputValue)) {
    return { bankrollDollars: null, warnings: [], invalid: false };
  }

  const resolved = resolveBankroll({ bankrollDollars: inputValue });

  if (resolved.configured) {
    return {
      bankrollDollars: resolved.bankrollDollars,
      warnings: [],
      invalid: false,
    };
  }

  return {
    bankrollDollars: null,
    warnings: [`Invalid bankrollDollars — dollar sizing will be omitted.`],
    invalid: true,
  };
}

/**
 * Normalizes partial user trading settings into validated values.
 * Never invents a bankroll; other fields fall back to documented defaults.
 */
export function resolveTradingSettings(
  input: TradingSettingsInput = {},
): ResolvedTradingSettings {
  const warnings: string[] = [];
  let invalid = false;

  const bankroll = resolveBankrollSetting(input.bankrollDollars);
  warnings.push(...bankroll.warnings);
  invalid ||= bankroll.invalid;

  const minEdge = resolveNumericSetting(
    "minEdgePercent",
    input.minEdgePercent,
    DEFAULT_TRADING_SETTINGS.minEdgePercent,
    TRADING_SETTINGS_BOUNDS.minEdgePercent,
  );
  warnings.push(...minEdge.warnings);
  invalid ||= minEdge.invalid;

  const maxSpread = resolveNumericSetting(
    "maxSpreadPercent",
    input.maxSpreadPercent,
    DEFAULT_TRADING_SETTINGS.maxSpreadPercent,
    TRADING_SETTINGS_BOUNDS.maxSpreadPercent,
  );
  warnings.push(...maxSpread.warnings);
  invalid ||= maxSpread.invalid;

  const kelly = resolveNumericSetting(
    "kellyFraction",
    input.kellyFraction,
    DEFAULT_TRADING_SETTINGS.kellyFraction,
    TRADING_SETTINGS_BOUNDS.kellyFraction,
  );
  warnings.push(...kelly.warnings);
  invalid ||= kelly.invalid;

  const maxPosition = resolveNumericSetting(
    "maxPositionFraction",
    input.maxPositionFraction,
    DEFAULT_TRADING_SETTINGS.maxPositionFraction,
    TRADING_SETTINGS_BOUNDS.maxPositionFraction,
  );
  warnings.push(...maxPosition.warnings);
  invalid ||= maxPosition.invalid;

  return {
    bankrollDollars: bankroll.bankrollDollars,
    minEdgePercent: minEdge.value,
    maxSpreadPercent: maxSpread.value,
    kellyFraction: kelly.value,
    maxPositionFraction: maxPosition.value,
    valid: !invalid,
    warnings,
    modelVersion: TRADING_SETTINGS_MODEL_VERSION,
  };
}

export {
  DEFAULT_TRADING_SETTINGS,
  TRADING_SETTINGS_BOUNDS,
  TRADING_SETTINGS_MODEL_VERSION,
} from "./config";

export type { ResolvedTradingSettings, TradingSettingsInput } from "./types";
