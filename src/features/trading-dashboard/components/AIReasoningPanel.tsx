import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { labelClass, panelGap, surfaces, textCaption } from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
  MODEL_NOT_LIVE_LABEL,
} from "../constants";

type AIReasoningPanelProps = {
  decision: TradeDecision;
};

export function AIReasoningPanel({ decision }: AIReasoningPanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="AI Reasoning & Playbook"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <StatusBadge variant="neutral" emphasis>
            {MODEL_NOT_LIVE_LABEL}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        <p className={cn(textCaption)}>{decision.reasoning.summary}</p>

        <div className={cn(surfaces.inset, "space-y-3 px-3 py-3")}>
          {decision.reasoning.steps.map((step) => (
            <div key={step.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{step.summary}</p>
                <StatusBadge
                  variant={
                    step.outcome === "pass"
                      ? "success"
                      : step.outcome === "fail"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {step.phase} · {step.outcome}
                </StatusBadge>
              </div>
              {step.detail ? (
                <p className={cn(labelClass(), "normal-case")}>{step.detail}</p>
              ) : null}
            </div>
          ))}
        </div>

        <p className={cn(textCaption)}>
          Narrative reasoning and playbook checks will populate here after the
          probability model and LLM milestones ship.
        </p>
      </PanelBody>
    </GlassPanel>
  );
}
