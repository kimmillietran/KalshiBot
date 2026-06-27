import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DASHBOARD_SETTINGS_PATHS = [
  "src/features/trading-dashboard/hooks/useTradingSettingsForm.ts",
  "src/features/trading-dashboard/utils/parseSettingsFormInput.ts",
  "src/features/trading-dashboard/utils/settingsFieldWarnings.ts",
  "src/features/trading-dashboard/components/settings/TradingSettingsPanel.tsx",
  "src/features/trading-dashboard/components/settings/TradingSettingsCard.tsx",
  "src/features/trading-dashboard/components/TradingDashboard.tsx",
];

describe("dashboard settings wiring avoids duplicated validation", () => {
  it("delegates normalization to resolveTradingSettings only", () => {
    for (const path of DASHBOARD_SETTINGS_PATHS) {
      const source = readFileSync(path, "utf8");

      expect(source).not.toMatch(/TRADING_SETTINGS_BOUNDS/);
      expect(source).not.toMatch(/DEFAULT_TRADING_SETTINGS/);
      expect(source).not.toMatch(/isFiniteInBounds/);
    }
  });

  it("calls resolveTradingSettings from the settings form hook", () => {
    const source = readFileSync(
      "src/features/trading-dashboard/hooks/useTradingSettingsForm.ts",
      "utf8",
    );

    expect(source).toContain("resolveTradingSettings(");
  });
});
