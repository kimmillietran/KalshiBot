import { StatusBadge } from "@/components/common/StatusBadge";
import { labelClass, surfaces, textCaption } from "@/lib/design-system";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  formatGuardGateLabel,
  isGuardFailure,
} from "../../formatting/decisionDisplay";

type GuardFailureBannerProps = {
  decision: TradeDecision;
};

export function GuardFailureBanner({ decision }: GuardFailureBannerProps) {
  if (!isGuardFailure(decision)) {
    return null;
  }

  const failedStep = decision.reasoning.steps.find((step) => step.outcome === "fail");

  return (
    <div className={cn(surfaces.warning, "space-y-2 px-3 py-3")}>
      <div className="flex items-center justify-between gap-2">
        <p className={labelClass()}>Guard failure — NO TRADE</p>
        <StatusBadge variant="danger" emphasis>
          blocked
        </StatusBadge>
      </div>
      {decision.gatesTriggered?.map((gate) => (
        <p key={gate} className={cn(textCaption, "font-mono normal-case")}>
          Gate: {formatGuardGateLabel(gate)}
        </p>
      ))}
      {failedStep ? (
        <p className={cn(textCaption, "normal-case leading-relaxed")}>
          {failedStep.summary}
          {failedStep.detail ? ` — ${failedStep.detail}` : ""}
        </p>
      ) : null}
    </div>
  );
}
