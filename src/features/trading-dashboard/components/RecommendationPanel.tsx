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
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
  MODEL_NOT_LIVE_LABEL,
} from "../constants";

type RecommendationPanelProps = {
  decision: TradeDecision;
};

export function RecommendationPanel({ decision }: RecommendationPanelProps) {
  const isNoTrade = decision.action === "NO TRADE";

  return (
    <GlassPanel variant="elevated" className="flex h-full flex-col">
      <PanelHeader
        title="Recommendation"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <StatusBadge variant={isNoTrade ? "neutral" : "success"} emphasis>
            {decision.action}
          </StatusBadge>
        }
      />
      <PanelBody className={cn("flex flex-1 flex-col justify-center", panelGap)}>
        <div className={cn(surfaces.dashedEmpty, "px-4 py-8 text-center")}>
          <p className={labelClass()}>Action</p>
          <p
            className={cn(
              "mt-2 text-2xl font-semibold tracking-tight",
              isNoTrade ? "text-muted-foreground" : toneClasses.bullish.text,
            )}
          >
            {decision.action}
          </p>
          <p className={cn(textCaption, "mt-4")}>{decision.reasoning.summary}</p>
          <p className={cn(textCaption, toneClasses.demo.text, "mt-2")}>
            {MODEL_NOT_LIVE_LABEL} — probability model deferred. Guards and live
            feeds are connected; trade signals remain withheld until the model
            ships.
          </p>
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
