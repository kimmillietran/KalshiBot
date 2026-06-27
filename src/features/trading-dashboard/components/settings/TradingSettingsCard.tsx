import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import type { ResolvedTradingSettings } from "@/lib/trading/settings";

import {
  TRADING_SETTINGS_PANEL_SUBTITLE,
  TRADING_SETTINGS_PANEL_TITLE,
} from "../../constants";
import type {
  TradingSettingsFieldKey,
  TradingSettingsFormState,
} from "../../types/tradingSettingsForm";

import { TradingSettingsPanel as TradingSettingsFields } from "./TradingSettingsPanel";

type TradingSettingsCardProps = {
  form: TradingSettingsFormState;
  resolved: ResolvedTradingSettings;
  onFieldChange: (field: TradingSettingsFieldKey, value: string) => void;
};

export function TradingSettingsCard({
  form,
  resolved,
  onFieldChange,
}: TradingSettingsCardProps) {
  return (
    <GlassPanel>
      <PanelHeader
        title={TRADING_SETTINGS_PANEL_TITLE}
        subtitle={TRADING_SETTINGS_PANEL_SUBTITLE}
      />
      <PanelBody className="pt-0">
        <TradingSettingsFields
          form={form}
          resolved={resolved}
          onFieldChange={onFieldChange}
        />
      </PanelBody>
    </GlassPanel>
  );
}
