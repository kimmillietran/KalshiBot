import { StatusBadge } from "@/components/common/StatusBadge";
import { labelClass, surfaces } from "@/lib/design-system";
import type { ReasoningTraceItem } from "@/lib/trading/reasoning-presentation";
import { cn } from "@/lib/utils";

type TechnicalTraceListProps = {
  trace: readonly ReasoningTraceItem[];
};

function stepBadgeVariant(
  outcome: ReasoningTraceItem["outcome"],
): "success" | "danger" | "neutral" {
  if (outcome === "pass") return "success";
  if (outcome === "fail") return "danger";
  return "neutral";
}

export function TechnicalTraceList({ trace }: TechnicalTraceListProps) {
  return (
    <div className={cn(surfaces.inset, "space-y-3 px-3 py-3")}>
      {trace.map((step) => (
        <div key={step.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{step.label}</p>
            <StatusBadge variant={stepBadgeVariant(step.outcome)}>
              {step.phase} · {step.outcome}
            </StatusBadge>
          </div>
          {step.detail ? (
            <p className={cn(labelClass(), "normal-case leading-relaxed")}>
              {step.detail}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
