import { tradingMockData } from "@/features/mock-data";

import { dashboardBottomPadding, dashboardSectionGap, gridGap } from "@/lib/design-system";
import { cn } from "@/lib/utils";

import { AIReasoningPanel } from "./AIReasoningPanel";
import { BtcChartPanel } from "./BtcChartPanel";
import { CommandBar } from "./CommandBar";
import { MarketOddsPanel } from "./MarketOddsPanel";
import { MarketStructurePanel } from "./MarketStructurePanel";
import { ProbabilityEdgePanel } from "./ProbabilityEdgePanel";
import { RecommendationPanel } from "./RecommendationPanel";
import { TradeManagementPanel } from "./TradeManagementPanel";

export function TradingDashboard() {
  const data = tradingMockData;

  return (
    <div className={cn(dashboardSectionGap, dashboardBottomPadding)}>
      <CommandBar />

      {/* Main row: chart 2/3, recommendation 1/3 */}
      <div className={cn("grid grid-cols-1 xl:grid-cols-3", gridGap, "items-stretch")}>
        <div className="xl:col-span-2">
          <BtcChartPanel />
        </div>
        <div className="min-h-[420px]">
          <RecommendationPanel data={data.recommendation} />
        </div>
      </div>

      {/* Odds, probability, structure */}
      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
          gridGap,
          "items-stretch",
        )}
      >
        <MarketOddsPanel />
        <ProbabilityEdgePanel
          contracts={data.contracts}
          model={data.model}
        />
        <MarketStructurePanel data={data.structure} />
      </div>

      {/* Trade management + reasoning */}
      <div className={cn("grid grid-cols-1 lg:grid-cols-2", gridGap, "items-stretch")}>
        <TradeManagementPanel data={data.tradeManagement} />
        <AIReasoningPanel data={data.reasoning} />
      </div>
    </div>
  );
}
