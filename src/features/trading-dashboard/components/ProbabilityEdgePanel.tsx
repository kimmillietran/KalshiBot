import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { labelClass, panelGap, surfaces } from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
  MODEL_NOT_LIVE_LABEL,
  PROBABILITY_MODEL_PENDING_MESSAGE,
} from "../constants";

type ProbabilityEdgePanelProps = {
  decision: TradeDecision;
};

export function ProbabilityEdgePanel({ decision }: ProbabilityEdgePanelProps) {
  const guardSteps = decision.reasoning.steps.filter(
    (step) => step.phase === "guard",
  );

  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Probability & Edge"
        subtitle={MODEL_NOT_LIVE_LABEL}
        action={
          <StatusBadge variant="neutral" emphasis>
            {DECISION_ENGINE_CONNECTED_MESSAGE}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        <div className={cn(surfaces.dashedEmpty, "px-4 py-6 text-center")}>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {PROBABILITY_MODEL_PENDING_MESSAGE}
          </p>
        </div>

        <div className={cn(surfaces.inset, "space-y-2 px-3 py-3")}>
          <p className={labelClass()}>Engine guard trace</p>
          {guardSteps.map((step) => (
            <div
              key={step.id}
              className="flex items-start justify-between gap-2 text-xs"
            >
              <span className="text-muted-foreground">{step.summary}</span>
              <StatusBadge
                variant={
                  step.outcome === "pass"
                    ? "success"
                    : step.outcome === "fail"
                      ? "danger"
                      : "neutral"
                }
              >
                {step.outcome}
              </StatusBadge>
            </div>
          ))}
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
