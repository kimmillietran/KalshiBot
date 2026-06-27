import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { panelGap, surfaces, textCaption } from "@/lib/design-system";
import { cn } from "@/lib/utils";

import {
  MODEL_NOT_LIVE_LABEL,
  PROBABILITY_MODEL_PENDING_MESSAGE,
} from "../constants";

export function ProbabilityEdgePanel() {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Probability & Edge"
        subtitle={MODEL_NOT_LIVE_LABEL}
        action={
          <StatusBadge variant="neutral" emphasis>
            Preview
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col justify-center", panelGap)}>
        <div className={cn(surfaces.dashedEmpty, "px-4 py-8 text-center")}>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {PROBABILITY_MODEL_PENDING_MESSAGE}
          </p>
          <p className={cn(textCaption, "mt-3")}>
            Static demo probabilities are hidden so they cannot contradict live
            Kalshi odds in the adjacent panel.
          </p>
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
