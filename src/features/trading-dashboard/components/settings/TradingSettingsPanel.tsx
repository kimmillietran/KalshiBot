import { useId } from "react";

import {
  labelClass,
  panelGap,
  radiusCard,
  surfaces,
  textCaption,
  toneClasses,
} from "@/lib/design-system";
import type { ResolvedTradingSettings } from "@/lib/trading/settings";
import { cn } from "@/lib/utils";

import { TRADING_SETTINGS_FIELD_COPY } from "../../constants";
import type {
  TradingSettingsFieldKey,
  TradingSettingsFormState,
} from "../../types/tradingSettingsForm";
import { settingsFieldWarnings } from "../../utils/settingsFieldWarnings";

type TradingSettingsFieldProps = {
  field: TradingSettingsFieldKey;
  value: string;
  onChange: (value: string) => void;
  warnings: readonly string[];
};

export function TradingSettingsField({
  field,
  value,
  onChange,
  warnings,
}: TradingSettingsFieldProps) {
  const fieldId = useId();
  const copy = TRADING_SETTINGS_FIELD_COPY[field];
  const fieldWarnings = settingsFieldWarnings(warnings, field);

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className={labelClass()}>
        {copy.label}
      </label>
      <input
        id={fieldId}
        name={field}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          radiusCard,
          "border-panel-border bg-panel-inset text-foreground w-full border px-3 py-2 text-sm",
          "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      />
      <p className={cn(textCaption, "normal-case leading-relaxed")}>{copy.helper}</p>
      {fieldWarnings.map((warning) => (
        <p
          key={warning}
          className={cn(textCaption, toneClasses.warning.text, "normal-case leading-relaxed")}
          role="alert"
        >
          {warning}
        </p>
      ))}
    </div>
  );
}

type TradingSettingsPanelProps = {
  form: TradingSettingsFormState;
  resolved: ResolvedTradingSettings;
  onFieldChange: (field: TradingSettingsFieldKey, value: string) => void;
};

export function TradingSettingsPanel({
  form,
  resolved,
  onFieldChange,
}: TradingSettingsPanelProps) {
  const fields: TradingSettingsFieldKey[] = [
    "bankrollDollars",
    "minEdgePercent",
    "maxSpreadPercent",
    "kellyFraction",
    "maxPositionFraction",
  ];

  return (
    <div className={cn(surfaces.inset, panelGap, "grid px-4 py-4 sm:grid-cols-2 xl:grid-cols-5")}>
      {fields.map((field) => (
        <TradingSettingsField
          key={field}
          field={field}
          value={form[field]}
          warnings={resolved.warnings}
          onChange={(value) => onFieldChange(field, value)}
        />
      ))}
    </div>
  );
}
