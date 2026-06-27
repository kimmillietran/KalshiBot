import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { surfaces } from "@/lib/design-system";
import type { MarketFeatureVector } from "@/lib/features/types";
import { cn } from "@/lib/utils";

import { DECISION_ENGINE_CONNECTED_MESSAGE, FEATURES_UNAVAILABLE_MESSAGE } from "../constants";

import { UnavailableMetric } from "./decision/UnavailableMetric";

type MarketStructurePanelProps = {
  features: MarketFeatureVector | null;
};

type StructureRowProps = {
  label: string;
  value: string;
  variant?: "success" | "danger" | "warning" | "info" | "neutral";
};

function StructureRow({
  label,
  value,
  variant = "neutral",
}: StructureRowProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 py-2.5 last:border-0",
        surfaces.rowDivider,
      )}
    >
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <StatusBadge variant={variant} className="text-right normal-case">
        {value}
      </StatusBadge>
    </div>
  );
}

function trendVariant(
  direction: MarketFeatureVector["trend"]["direction"],
): StructureRowProps["variant"] {
  if (direction === "bullish") return "success";
  if (direction === "bearish") return "danger";
  return "neutral";
}

function momentumVariant(changePercent: number): StructureRowProps["variant"] {
  if (changePercent > 0) return "success";
  if (changePercent < 0) return "danger";
  return "neutral";
}

export function MarketStructurePanel({ features }: MarketStructurePanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Market Structure"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <StatusBadge variant="neutral" emphasis>
            {features ? "live features" : "unavailable"}
          </StatusBadge>
        }
      />
      <PanelBody>
        {!features ? (
          <UnavailableMetric message={FEATURES_UNAVAILABLE_MESSAGE} />
        ) : (
          <>
            <StructureRow
              label="Trend"
              value={features.trend.direction}
              variant={trendVariant(features.trend.direction)}
            />
            <StructureRow
              label="Momentum"
              value={`${features.momentum.changePercent.toFixed(2)}%`}
              variant={momentumVariant(features.momentum.changePercent)}
            />
            <StructureRow
              label="Distance to target"
              value={`${features.distanceToTarget.signed.toFixed(2)} USD`}
              variant={features.distanceToTarget.isAboveTarget ? "success" : "danger"}
            />
            <StructureRow
              label="Volatility"
              value={`σ ${features.volatility.stdDev.toFixed(2)}`}
              variant="warning"
            />
            <StructureRow
              label="Liquidity"
              value={features.liquidity.quality}
              variant="info"
            />
            <StructureRow
              label="Time remaining"
              value={`${features.timeRemaining.minutes.toFixed(1)} min`}
              variant="neutral"
            />
          </>
        )}
      </PanelBody>
    </GlassPanel>
  );
}
