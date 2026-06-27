import { ProbabilityBar } from "@/components/common/ProbabilityBar";
import { labelClass, metricClass, panelGap, surfaces } from "@/lib/design-system";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import { cn } from "@/lib/utils";

import { PROBABILITY_UNAVAILABLE_MESSAGE } from "../../constants";
import {
  formatConfidencePercent,
  formatProbabilityPercent,
} from "../../formatting/decisionDisplay";
import { UnavailableMetric } from "./UnavailableMetric";

type ProbabilitySummaryProps = {
  probability: ProbabilityEstimate | null;
};

export function ProbabilitySummary({ probability }: ProbabilitySummaryProps) {
  if (!probability) {
    return <UnavailableMetric message={PROBABILITY_UNAVAILABLE_MESSAGE} />;
  }

  const upPercent = probability.probabilityUp * 100;
  const downPercent = probability.probabilityDown * 100;

  return (
    <div className={cn(surfaces.inset, "space-y-3 px-3 py-3")}>
      <div className="flex items-center justify-between gap-2">
        <p className={labelClass()}>Model probability</p>
        <span className={cn(metricClass(), "text-xs")}>
          v{probability.modelVersion}
        </span>
      </div>
      <div className={panelGap}>
        <ProbabilityBar label="UP" value={upPercent} tone="up" highlight />
        <ProbabilityBar label="DOWN" value={downPercent} tone="down" />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">P(up)</span>
        <span className={metricClass()}>
          {formatProbabilityPercent(probability.probabilityUp)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">P(down)</span>
        <span className={metricClass()}>
          {formatProbabilityPercent(probability.probabilityDown)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className={metricClass()}>
          {formatConfidencePercent(probability.confidence)}
        </span>
      </div>
    </div>
  );
}
