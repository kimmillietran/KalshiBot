import { heroActionClass, surfaces, textCaption } from "@/lib/design-system";
import type { TradeAction } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  actionHeroTone,
} from "../../formatting/decisionDisplay";

type DecisionActionHeroProps = {
  action: TradeAction;
  summary: string;
};

export function DecisionActionHero({ action, summary }: DecisionActionHeroProps) {
  const isNoTrade = action === "NO TRADE";

  return (
    <div
      className={cn(
        isNoTrade ? surfaces.dashedEmpty : surfaces.recommendation,
        "px-4 py-8 text-center",
      )}
    >
      <p className={cn(heroActionClass(actionHeroTone(action)), "mt-1")}>
        {action}
      </p>
      <p className={cn(textCaption, "mt-4 leading-relaxed")}>{summary}</p>
    </div>
  );
}
