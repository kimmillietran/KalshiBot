import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { iconSize, labelClass, toneClasses } from "@/lib/design-system";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  /** Optional helper line under the value. */
  hint?: string;
  /** Optional period-over-period delta, e.g. "+2.4%". */
  delta?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ComponentType<{ className?: string }>;
};

export function StatCard({
  label,
  value,
  hint,
  delta,
  trend = "neutral",
  icon: Icon,
}: StatCardProps) {
  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : null;

  const trendClass = {
    up: toneClasses.bullish.text,
    down: toneClasses.bearish.text,
    neutral: toneClasses.neutral.text,
  }[trend];

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {Icon ? <Icon className={iconSize.md} /> : null}
          <span className={labelClass("normal-case")}>{label}</span>
        </CardDescription>
        <CardTitle className="font-mono text-2xl font-semibold tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-xs">
        {delta ? (
          <span className={cn("inline-flex items-center gap-1 font-medium", trendClass)}>
            {TrendIcon ? <TrendIcon className={iconSize.sm} /> : null}
            {delta}
          </span>
        ) : null}
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}
