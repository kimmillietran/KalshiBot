import { Check } from "lucide-react";

import {
  GlassPanel,
  PanelBody,
  PanelHeader,
} from "@/components/common/GlassPanel";
import {
  iconSize,
  labelClass,
  panelGap,
  toneClasses,
} from "@/lib/design-system";
import type { TradingMockData } from "@/features/mock-data";
import { cn } from "@/lib/utils";

type AIReasoningPanelProps = {
  data: TradingMockData["reasoning"];
};

export function AIReasoningPanel({ data }: AIReasoningPanelProps) {
  return (
    <GlassPanel className="h-full">
      <PanelHeader
        title="AI Reasoning & Playbook"
        subtitle="Why this setup qualifies"
      />
      <PanelBody className={cn("flex flex-col", panelGap)}>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {data.summary}
        </p>

        <div>
          <p className={cn(labelClass(), "mb-2")}>Playbook Checklist</p>
          <ul className="space-y-2">
            {data.playbook.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full",
                    item.checked
                      ? toneClasses.bullish.icon
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.checked ? <Check className={iconSize.sm} /> : null}
                </span>
                <span
                  className={
                    item.checked ? "text-foreground" : "text-muted-foreground"
                  }
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </PanelBody>
    </GlassPanel>
  );
}
