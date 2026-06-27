import { StatusBadge } from "@/components/common/StatusBadge";
import { labelClass, metricClass, surfaces, textCaption } from "@/lib/design-system";
import type { PositionSizeEstimate } from "@/lib/trading/position-sizing/types";
import { cn } from "@/lib/utils";

import {
  POSITION_SIZING_RECOMMENDED_POSITION_LABEL,
  POSITION_SIZING_UNAVAILABLE_MESSAGE,
  POSITION_SIZING_ZERO_REASON,
} from "../../constants";
import {
  formatFractionAsPercent,
  formatPositionSide,
  formatRecommendedDollars,
  formatRecommendedPercent,
  positionSizingDisplayState,
} from "../../formatting/positionSizingDisplay";
import { UnavailableMetric } from "./UnavailableMetric";

type PositionSizeSummaryProps = {
  positionSize: PositionSizeEstimate | null;
};

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={metricClass()}>{value}</span>
    </div>
  );
}

export function PositionSizeSummary({ positionSize }: PositionSizeSummaryProps) {
  const state = positionSizingDisplayState(positionSize);

  if (state === "unavailable" || positionSize === null) {
    return <UnavailableMetric message={POSITION_SIZING_UNAVAILABLE_MESSAGE} />;
  }

  const estimate = positionSize;
  const sideLabel = formatPositionSide(estimate.side);
  const recommendedPercent = formatRecommendedPercent(estimate.recommendedPercent);
  const recommendedDollars = formatRecommendedDollars(estimate.recommendedDollars);
  const kellyFraction = formatFractionAsPercent(estimate.cappedFraction);
  const rawKelly = formatFractionAsPercent(estimate.rawKellyFraction);

  return (
    <div className={cn(surfaces.inset, "space-y-2 px-3 py-3")}>
      <div className="flex items-center justify-between gap-2">
        <p className={labelClass()}>{POSITION_SIZING_RECOMMENDED_POSITION_LABEL}</p>
        <StatusBadge variant={state === "zero" ? "neutral" : "success"}>
          {recommendedPercent}
        </StatusBadge>
      </div>

      {state === "zero" ? (
        <p className={cn(textCaption, "normal-case leading-relaxed")}>
          Reason: {POSITION_SIZING_ZERO_REASON}
        </p>
      ) : null}

      <MetricRow label="Recommended %" value={recommendedPercent} />
      <MetricRow label="Recommended $" value={recommendedDollars} />
      <MetricRow label="Position side" value={sideLabel} />
      <MetricRow label="Kelly fraction" value={kellyFraction} />
      <MetricRow label="Raw Kelly" value={rawKelly} />
      <MetricRow label="Model version" value={estimate.modelVersion} />

      {estimate.reasoning.length > 0 ? (
        <div className="space-y-1 pt-1">
          <p className={labelClass()}>Sizing reasoning</p>
          {estimate.reasoning.map((line) => (
            <p key={line} className={cn(textCaption, "normal-case leading-relaxed")}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
