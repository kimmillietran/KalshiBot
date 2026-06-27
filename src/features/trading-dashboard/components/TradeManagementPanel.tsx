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
  panelGap,
  surfaces,
  textCaption,
} from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
  EXECUTION_DISABLED_MESSAGE,
} from "../constants";
import { actionBadgeVariant } from "../formatting/decisionDisplay";

type TradeManagementPanelProps = {
  decision: TradeDecision;
};

function tradeGuidanceCopy(action: TradeDecision["action"]): string {
  switch (action) {
    case "BUY UP":
      return "Engine policy selected BUY UP. Execution remains disabled — review odds and reasoning before any manual trade.";
    case "BUY DOWN":
      return "Engine policy selected BUY DOWN. Execution remains disabled — review odds and reasoning before any manual trade.";
    default:
      return "No directional signal from the engine. Entry guidance is withheld until policy approves a side.";
  }
}

export function TradeManagementPanel({ decision }: TradeManagementPanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Trade Management"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <StatusBadge variant={actionBadgeVariant(decision.action)}>
            {decision.action}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        <div className={cn(surfaces.dashedEmpty, "px-4 py-6 text-center")}>
          <p className="text-muted-foreground text-sm">No active trade</p>
          <p className={cn(textCaption, "mt-2 leading-relaxed")}>
            {tradeGuidanceCopy(decision.action)}
          </p>
          <p className={cn(textCaption, "mt-2")}>{decision.reasoning.summary}</p>
        </div>

        <Button className={cn("w-full", surfaces.primaryButton)} disabled>
          Enter Trade
          <ArrowRight className={iconSize.md} />
        </Button>
        <p className={cn(textCaption, "text-center")}>{EXECUTION_DISABLED_MESSAGE}</p>
      </PanelBody>
    </GlassPanel>
  );
}
