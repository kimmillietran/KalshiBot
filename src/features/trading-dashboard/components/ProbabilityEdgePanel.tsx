import { MetricCard } from "@/components/common/MetricCard";
import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { ProbabilityCompare } from "@/components/common/ProbabilityBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  panelGap,
  statGap,
  surfaces,
  textCaption,
  toneClasses,
} from "@/lib/design-system";
import { formatCents } from "@/lib/utils/format";
import type { TradingMockData } from "@/features/mock-data";
import { cn } from "@/lib/utils";

type ProbabilityEdgePanelProps = {
  contracts: TradingMockData["contracts"];
  model: TradingMockData["model"];
};

export function ProbabilityEdgePanel({
  contracts,
  model,
}: ProbabilityEdgePanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Probability & Edge"
        subtitle="Kalshi implied vs model fair value"
        action={
          <StatusBadge variant="success" emphasis>
            Edge: +{model.edgePercent}% UP
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        <ProbabilityCompare
          kalshiUp={contracts.up.impliedProbability}
          kalshiDown={contracts.down.impliedProbability}
          modelUp={model.probabilityUp}
          modelDown={model.probabilityDown}
        />

        <div className={cn(surfaces.bullish, "p-3")}>
          <div className="flex items-center justify-between gap-2">
            <p className={cn("text-sm font-semibold", toneClasses.bullish.text)}>
              +{model.edgePercent}% UP Edge
            </p>
            <StatusBadge variant="success" emphasis>
              {model.evLabel}
            </StatusBadge>
          </div>
          <p className={cn(textCaption, "mt-1")}>
            Model sees UP underpriced relative to Kalshi&apos;s 63¢ market.
          </p>
        </div>

        <div className={cn("grid grid-cols-2", statGap)}>
          <MetricCard
            label="Fair Value"
            value={formatCents(model.fairValueUp)}
            tone="bullish"
          />
          <MetricCard
            label="Current UP"
            value={formatCents(contracts.up.price)}
          />
          <MetricCard
            label="Mispricing"
            value={`+${model.mispricingCents}¢`}
            tone="bullish"
          />
          <MetricCard label="EV" value={model.evLabel} tone="bullish" />
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
