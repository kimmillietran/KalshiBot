import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  labelClass,
  panelGap,
  surfaces,
  textCaption,
  toneClasses,
} from "@/lib/design-system";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_PENDING_MESSAGE,
  MODEL_NOT_LIVE_LABEL,
} from "../constants";

export function RecommendationPanel() {
  return (
    <GlassPanel variant="elevated" className="flex h-full flex-col">
      <PanelHeader
        title="Recommendation"
        subtitle={MODEL_NOT_LIVE_LABEL}
        action={
          <StatusBadge variant="neutral" emphasis>
            Milestone 5
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-1 flex-col justify-center", panelGap)}>
        <div className={cn(surfaces.dashedEmpty, "px-4 py-8 text-center")}>
          <p className={labelClass()}>Action</p>
          <p className="text-muted-foreground mt-2 text-2xl font-semibold tracking-tight">
            —
          </p>
          <p className={cn(textCaption, "mt-4")}>
            {DECISION_ENGINE_PENDING_MESSAGE}
          </p>
          <p className={cn(textCaption, toneClasses.demo.text, "mt-2")}>
            Live BTC price, Kalshi odds, and contract metadata remain active.
            Trade signals are intentionally withheld until the engine ships.
          </p>
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
