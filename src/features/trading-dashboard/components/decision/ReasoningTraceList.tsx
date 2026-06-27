import { StatusBadge } from "@/components/common/StatusBadge";
import { labelClass, surfaces } from "@/lib/design-system";
import type { ReasoningStep } from "@/types/domain/trading";
import { cn } from "@/lib/utils";

type ReasoningTraceListProps = {
  steps: readonly ReasoningStep[];
  title?: string;
};

function stepBadgeVariant(
  outcome: ReasoningStep["outcome"],
): "success" | "danger" | "neutral" {
  if (outcome === "pass") return "success";
  if (outcome === "fail") return "danger";
  return "neutral";
}

export function ReasoningTraceList({ steps, title }: ReasoningTraceListProps) {
  return (
    <div className={cn(surfaces.inset, "space-y-3 px-3 py-3")}>
      {title ? <p className={labelClass()}>{title}</p> : null}
      {steps.map((step) => (
        <div key={step.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{step.summary}</p>
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
