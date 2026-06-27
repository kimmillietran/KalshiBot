import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { panelGap } from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import { DECISION_ENGINE_CONNECTED_MESSAGE } from "../constants";
import { isGuardFailure } from "../formatting/decisionDisplay";

import { ExpectedValueSummary } from "./decision/ExpectedValueSummary";
import { GuardFailureBanner } from "./decision/GuardFailureBanner";
import { ProbabilitySummary } from "./decision/ProbabilitySummary";
import { ReasoningTraceList } from "./decision/ReasoningTraceList";

type ProbabilityEdgePanelProps = {
  decision: TradeDecision;
};

export function ProbabilityEdgePanel({ decision }: ProbabilityEdgePanelProps) {
  const guardFailed = isGuardFailure(decision);
  const guardSteps = decision.reasoning.steps.filter(
    (step) => step.phase === "guard",
  );

  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Probability & Edge"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <StatusBadge variant="neutral" emphasis>
            {decision.action}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        {guardFailed ? (
          <>
            <GuardFailureBanner decision={decision} />
            <ReasoningTraceList steps={guardSteps} title="Guard trace" />
          </>
        ) : (
          <>
            <ProbabilitySummary probability={decision.probability} />
            <ExpectedValueSummary expectedValue={decision.expectedValue} />
          </>
        )}
      </PanelBody>
    </GlassPanel>
  );
}
