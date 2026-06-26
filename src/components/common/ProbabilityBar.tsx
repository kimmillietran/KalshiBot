import { toneClasses } from "@/lib/design-system/colors";
import { shadowHighlightRing } from "@/lib/design-system/shadows";
import { transitionBar } from "@/lib/design-system/motion";
import { radiusFull } from "@/lib/design-system/radii";
import { labelClass } from "@/lib/design-system/typography";
import { cn } from "@/lib/utils";

type ProbabilityBarProps = {
  label: string;
  value: number;
  /** Highlight when this side has the edge. */
  highlight?: boolean;
  tone?: "up" | "down" | "neutral";
  showValue?: boolean;
};

const barToneClass = {
  up: toneClasses.bullish.bar,
  down: toneClasses.bearish.bar,
  neutral: "bg-muted-foreground/50",
} as const;

const labelHighlightClass = {
  up: toneClasses.bullish.text,
  down: toneClasses.bearish.text,
  neutral: "",
} as const;

export function ProbabilityBar({
  label,
  value,
  highlight = false,
  tone = "neutral",
  showValue = true,
}: ProbabilityBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span
          className={cn(
            "font-medium",
            highlight && labelHighlightClass[tone],
          )}
        >
          {label}
        </span>
        {showValue ? (
          <span className="font-mono font-semibold">{value}%</span>
        ) : null}
      </div>
      <div className={cn("bg-muted/40 h-2 overflow-hidden", radiusFull)}>
        <div
          className={cn(
            "h-full",
            radiusFull,
            transitionBar,
            barToneClass[tone],
            highlight && shadowHighlightRing,
          )}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

type ProbabilityCompareProps = {
  kalshiUp: number;
  kalshiDown: number;
  modelUp: number;
  modelDown: number;
};

export function ProbabilityCompare({
  kalshiUp,
  kalshiDown,
  modelUp,
  modelDown,
}: ProbabilityCompareProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-3">
        <p className={labelClass()}>Kalshi says</p>
        <ProbabilityBar label="UP" value={kalshiUp} tone="up" />
        <ProbabilityBar label="DOWN" value={kalshiDown} tone="down" />
      </div>
      <div className="space-y-3">
        <p className={labelClass()}>Model says</p>
        <ProbabilityBar label="UP" value={modelUp} tone="up" highlight />
        <ProbabilityBar label="DOWN" value={modelDown} tone="down" />
      </div>
    </div>
  );
}
