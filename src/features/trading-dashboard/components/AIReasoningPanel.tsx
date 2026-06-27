import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { panelGap, textCaption } from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
  REASONING_ENGINE_ONLY_MESSAGE,
} from "../constants";

import { ReasoningTraceList } from "./decision/ReasoningTraceList";

type AIReasoningPanelProps = {
  decision: TradeDecision;
};

export function AIReasoningPanel({ decision }: AIReasoningPanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Engine Reasoning"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <StatusBadge variant="neutral" emphasis>
            {decision.engineVersion}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        <p className={cn(textCaption)}>{decision.reasoning.summary}</p>
        <ReasoningTraceList steps={decision.reasoning.steps} title="Pipeline trace" />
        <p className={cn(textCaption)}>{REASONING_ENGINE_ONLY_MESSAGE}</p>
      </PanelBody>
    </GlassPanel>
  );
}
