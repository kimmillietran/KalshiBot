"use client";

import { useCallback, useMemo, useState } from "react";

import { resolveTradingSettings } from "@/lib/trading/settings";
import type { ResolvedTradingSettings } from "@/lib/trading/settings";

import {
  EMPTY_TRADING_SETTINGS_FORM,
  type TradingSettingsFieldKey,
  type TradingSettingsFormState,
} from "../types/tradingSettingsForm";
import { parseSettingsFormInput } from "../utils/parseSettingsFormInput";

export type TradingSettingsFormStateResult = {
  form: TradingSettingsFormState;
  resolved: ResolvedTradingSettings;
  setField: (field: TradingSettingsFieldKey, value: string) => void;
};

/** Session-only raw form state; normalization is delegated to `resolveTradingSettings()`. */
export function useTradingSettingsForm(): TradingSettingsFormStateResult {
  const [form, setForm] = useState<TradingSettingsFormState>(
    EMPTY_TRADING_SETTINGS_FORM,
  );

  const resolved = useMemo(
    () => resolveTradingSettings(parseSettingsFormInput(form)),
    [form],
  );

  const setField = useCallback((field: TradingSettingsFieldKey, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  }, []);

  return { form, resolved, setField };
}
