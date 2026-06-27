import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { panelGap } from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
} from "../constants";
import { actionBadgeVariant } from "../formatting/decisionDisplay";

import { DecisionActionHero } from "./decision/DecisionActionHero";
import { GuardFailureBanner } from "./decision/GuardFailureBanner";

type RecommendationPanelProps = {
  decision: TradeDecision;
};

export function RecommendationPanel({ decision }: RecommendationPanelProps) {
  return (
    <GlassPanel variant="elevated" className="flex h-full flex-col">
      <PanelHeader
        title="Decision"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <StatusBadge variant={actionBadgeVariant(decision.action)} emphasis>
            {decision.action}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-1 flex-col", panelGap)}>
        <DecisionActionHero
          action={decision.action}
          summary={decision.reasoning.summary}
        />
        <GuardFailureBanner decision={decision} />
      </PanelBody>
    </GlassPanel>
  );
}
