import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  iconSize,
  labelClass,
  panelGap,
  surfaces,
  textCaption,
} from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
  MODEL_NOT_LIVE_LABEL,
} from "../constants";

type TradeManagementPanelProps = {
  decision: TradeDecision;
};

export function TradeManagementPanel({ decision }: TradeManagementPanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Trade Management"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <StatusBadge variant="neutral">
            {decision.action}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        <div className={cn(surfaces.dashedEmpty, "px-4 py-6 text-center")}>
          <p className="text-muted-foreground text-sm">No active trade</p>
          <p className={cn(textCaption, "mt-2")}>
            {MODEL_NOT_LIVE_LABEL} — entry, exit, and sizing guidance will
            appear when the engine issues a directional signal.
          </p>
          <p className={cn(textCaption, "mt-2")}>{decision.reasoning.summary}</p>
        </div>

        <Button className={cn("w-full", surfaces.primaryButton)} disabled>
          Enter Trade
          <ArrowRight className={iconSize.md} />
        </Button>
        <p className={cn(labelClass(), "text-center normal-case")}>
          Execution disabled until trade signals ship
        </p>
      </PanelBody>
    </GlassPanel>
  );
}
