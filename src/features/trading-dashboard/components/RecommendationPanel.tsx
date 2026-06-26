import { Star } from "lucide-react";

import { MetricCard } from "@/components/common/MetricCard";
import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  heroActionClass,
  iconSize,
  labelClass,
  panelGap,
  surfaces,
  textCaption,
  toneClasses,
} from "@/lib/design-system";
import type { TradingMockData } from "@/features/mock-data";
import { cn } from "@/lib/utils";

type RecommendationPanelProps = {
  data: TradingMockData["recommendation"];
};

export function RecommendationPanel({ data }: RecommendationPanelProps) {
  const isBuyUp = data.action === "BUY UP";
  const isBuyDown = data.action === "BUY DOWN";
  const heroTone = isBuyUp ? "bullish" : isBuyDown ? "bearish" : "caution";

  return (
    <GlassPanel
      variant="elevated"
      className={cn("flex h-full flex-col", surfaces.recommendation)}
    >
      <PanelHeader title="Recommendation" subtitle="Model-driven decision" />
      <PanelBody className={cn("flex flex-1 flex-col", panelGap)}>
        <div className="text-center">
          <p className={cn(labelClass(), "mb-1 tracking-widest")}>Action</p>
          <p className={heroActionClass(heroTone)}>{data.action}</p>
          <div className="mt-2 flex items-center justify-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  iconSize.md,
                  i < data.stars
                    ? cn(toneClasses.warning.fill, toneClasses.warning.text)
                    : "text-muted-foreground/30",
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <StatusBadge variant="success" emphasis>
            Confidence: {data.confidence}
          </StatusBadge>
          <StatusBadge variant="success" emphasis>
            Edge: {data.edge}
          </StatusBadge>
          <StatusBadge variant="success" emphasis>
            {data.ev}
          </StatusBadge>
        </div>

        <p className={cn(textCaption, surfaces.caution, "px-3 py-2 text-center")}>
          {data.actionStatus}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Take Profit"
            value={data.takeProfitZone}
            tone="bullish"
          />
          <MetricCard
            label="Stop Loss"
            value={data.stopLoss}
            tone="bearish"
          />
          <MetricCard label="Entry Zone" value={data.entryZone} />
          <MetricCard
            label="Risk Level"
            value={data.riskLevel}
            tone="caution"
          />
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
