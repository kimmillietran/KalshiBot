import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/common/MetricCard";
import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  iconSize,
  labelClass,
  panelGap,
  statGap,
  surfaces,
  textCaption,
} from "@/lib/design-system";
import type { TradingMockData } from "@/features/mock-data";
import { cn } from "@/lib/utils";

type TradeManagementPanelProps = {
  data: TradingMockData["tradeManagement"];
};

export function TradeManagementPanel({ data }: TradeManagementPanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Trade Management"
        subtitle="Position sizing & exit rules"
        action={
          <StatusBadge variant="neutral">
            {data.hasActiveTrade ? "Active" : "No active trade"}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        {!data.hasActiveTrade ? (
          <div className={cn(surfaces.dashedEmpty, "px-4 py-6 text-center")}>
            <p className="text-muted-foreground text-sm">No active trade</p>
            <p className={cn(textCaption, "mt-1")}>
              Guidance below shows the intended workflow when a setup triggers.
            </p>
          </div>
        ) : null}

        <div className={cn("grid grid-cols-1 sm:grid-cols-2", statGap)}>
          <MetricCard label="Suggested Entry" value={data.suggestedEntry} />
          <MetricCard
            label="Take Profit"
            value={data.takeProfit}
            tone="bullish"
          />
          <MetricCard
            label="Cut Loss"
            value={data.cutLoss}
            tone="bearish"
          />
          <MetricCard
            label="Do Not Chase Above"
            value={data.doNotChaseAbove}
            tone="caution"
          />
        </div>

        <div className={cn(surfaces.inset, "px-3 py-2")}>
          <p className={labelClass()}>Hold Into Expiration</p>
          <p className="mt-0.5 text-sm font-medium">{data.holdIntoExpiration}</p>
        </div>

        <Button className={cn("w-full", surfaces.primaryButton)} disabled>
          Enter Trade
          <ArrowRight className={iconSize.md} />
        </Button>
        <p className={cn(labelClass(), "text-center normal-case")}>
          Execution disabled in demo mode
        </p>
      </PanelBody>
    </GlassPanel>
  );
}
