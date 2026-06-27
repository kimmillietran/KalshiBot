import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { panelGap, surfaces, textCaption } from "@/lib/design-system";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_PENDING_MESSAGE,
  MODEL_NOT_LIVE_LABEL,
} from "../constants";

export function AIReasoningPanel() {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="AI Reasoning & Playbook"
        subtitle={MODEL_NOT_LIVE_LABEL}
        action={
          <StatusBadge variant="neutral" emphasis>
            Milestone 5
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col justify-center", panelGap)}>
        <div className={cn(surfaces.dashedEmpty, "px-4 py-8 text-center")}>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {DECISION_ENGINE_PENDING_MESSAGE}
          </p>
          <p className={cn(textCaption, "mt-3")}>
            Narrative reasoning and playbook checks will populate here after the
            recommendation engine is integrated.
          </p>
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
