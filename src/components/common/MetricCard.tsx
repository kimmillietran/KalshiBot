import { toneClasses } from "@/lib/design-system/colors";
import { radiusCard } from "@/lib/design-system/radii";
import { statCardPadding } from "@/lib/design-system/spacing";
import { labelClass, textMetric } from "@/lib/design-system/typography";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  subValue?: string;
  tone?: "default" | "bullish" | "bearish" | "caution";
  className?: string;
};

const valueToneClass = {
  default: "",
  bullish: toneClasses.bullish.text,
  bearish: toneClasses.bearish.text,
  caution: toneClasses.caution.text,
} as const;

export function MetricCard({
  label,
  value,
  subValue,
  tone = "default",
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "border-panel-border bg-panel-inset border",
        radiusCard,
        statCardPadding,
        className,
      )}
    >
      <p className={labelClass()}>{label}</p>
      <p className={cn(textMetric, valueToneClass[tone])}>{value}</p>
      {subValue ? (
        <p className="text-muted-foreground mt-0.5 text-xs">{subValue}</p>
      ) : null}
    </div>
  );
}
