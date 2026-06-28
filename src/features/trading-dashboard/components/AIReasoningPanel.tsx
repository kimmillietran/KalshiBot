import type { ReactNode } from "react";

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
  textSectionValue,
} from "@/lib/design-system";
import { summarizeTradeDecision } from "@/lib/trading/reasoning-presentation";
import type { TradeDecision } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

import {
  DECISION_ENGINE_CONNECTED_MESSAGE,
  POSITION_SIZING_UNAVAILABLE_MESSAGE,
  REASONING_ENGINE_ONLY_MESSAGE,
} from "../constants";

import { DecisionExportButton } from "./decision/DecisionExportButton";
import { TechnicalTraceList } from "./decision/TechnicalTraceList";

type AIReasoningPanelProps = {
  decision: TradeDecision;
};

function ReasoningSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <p className={labelClass()}>{title}</p>
      {children}
    </section>
  );
}

export function AIReasoningPanel({ decision }: AIReasoningPanelProps) {
  const presentation = summarizeTradeDecision(decision);

  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="Engine Reasoning"
        subtitle={DECISION_ENGINE_CONNECTED_MESSAGE}
        action={
          <div className="flex items-start gap-2">
            <DecisionExportButton decision={decision} />
            <StatusBadge variant="neutral" emphasis>
              {presentation.modelVersion}
            </StatusBadge>
          </div>
        }
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        <ReasoningSection title="Headline">
          <p className={cn(textSectionValue, "leading-snug")}>
            {presentation.headline}
          </p>
        </ReasoningSection>

        <ReasoningSection title="Summary">
          <p className={cn(textCaption, "normal-case leading-relaxed")}>
            {presentation.summary}
          </p>
        </ReasoningSection>

        {presentation.primaryReason ? (
          <ReasoningSection title="Primary Reason">
            <p className={cn(textCaption, "normal-case leading-relaxed")}>
              {presentation.primaryReason}
            </p>
          </ReasoningSection>
        ) : null}

        {presentation.supportingReasons.length > 0 ? (
          <ReasoningSection title="Supporting Reasons">
            <ul className={cn(surfaces.inset, "space-y-2 px-3 py-3")}>
              {presentation.supportingReasons.map((reason) => (
                <li
                  key={reason}
                  className={cn(textCaption, "normal-case leading-relaxed")}
                >
                  {reason}
                </li>
              ))}
            </ul>
          </ReasoningSection>
        ) : null}

        {decision.positionSize === null ? (
          <ReasoningSection title="Sizing unavailable">
            <p className={cn(textCaption, "normal-case leading-relaxed")}>
              {POSITION_SIZING_UNAVAILABLE_MESSAGE}
            </p>
          </ReasoningSection>
        ) : null}

        {presentation.riskNotes.length > 0 ? (
          <ReasoningSection title="Risk Notes">
            <ul className={cn(surfaces.inset, "space-y-2 px-3 py-3")}>
              {presentation.riskNotes.map((note) => (
                <li
                  key={note}
                  className={cn(textCaption, "normal-case leading-relaxed")}
                >
                  {note}
                </li>
              ))}
            </ul>
          </ReasoningSection>
        ) : null}

        <details className={cn(surfaces.inset, "group px-3 py-3")}>
          <summary
            className={cn(
              labelClass(),
              "cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden",
            )}
          >
            Technical Trace
          </summary>
          <div className="mt-3">
            <TechnicalTraceList trace={presentation.technicalTrace} />
          </div>
        </details>

        <p className={cn(textCaption)}>{REASONING_ENGINE_ONLY_MESSAGE}</p>
      </PanelBody>
    </GlassPanel>
  );
}
