"use client";

import { dashboardBottomPadding, dashboardSectionGap, gridGap } from "@/lib/design-system";
import { cn } from "@/lib/utils";

import { useTradeDecision } from "../hooks/useTradeDecision";
import { useTradingSettingsForm } from "../hooks/useTradingSettingsForm";

import { AIReasoningPanel } from "./AIReasoningPanel";
import { BtcChartPanel } from "./BtcChartPanel";
import { CommandBar } from "./CommandBar";
import { MarketOddsPanel } from "./MarketOddsPanel";
import { MarketStructurePanel } from "./MarketStructurePanel";
import { ProbabilityEdgePanel } from "./ProbabilityEdgePanel";
import { RecommendationPanel } from "./RecommendationPanel";
import { TradingSettingsCard } from "./settings/TradingSettingsCard";
import { TradeManagementPanel } from "./TradeManagementPanel";

export function TradingDashboard() {
  const { form, resolved, setField } = useTradingSettingsForm();
  const { decision } = useTradeDecision(resolved);

  return (
    <div className={cn(dashboardSectionGap, dashboardBottomPadding)}>
      <CommandBar />

      <TradingSettingsCard
        form={form}
        resolved={resolved}
        onFieldChange={setField}
      />

      <div className={cn("grid grid-cols-1 xl:grid-cols-3", gridGap, "items-stretch")}>
        <div className="xl:col-span-2">
          <BtcChartPanel />
        </div>
        <div className="min-h-[420px]">
          <RecommendationPanel decision={decision} />
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
          gridGap,
          "items-stretch",
        )}
      >
        <MarketOddsPanel />
        <ProbabilityEdgePanel decision={decision} />
        <MarketStructurePanel features={decision.features} />
      </div>

      <div className={cn("grid grid-cols-1 lg:grid-cols-2", gridGap, "items-stretch")}>
        <TradeManagementPanel decision={decision} />
        <AIReasoningPanel decision={decision} />
      </div>
    </div>
  );
}
