import { cva, type VariantProps } from "class-variance-authority";

import { toneClasses } from "@/lib/design-system/colors";
import { radiusBadge } from "@/lib/design-system/radii";
import { textLabel } from "@/lib/design-system/typography";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  cn(
    "inline-flex items-center gap-1.5 border px-2 py-0.5",
    radiusBadge,
    textLabel,
  ),
  {
    variants: {
      variant: {
        success: cn(
          toneClasses.bullish.border,
          toneClasses.bullish.bg,
          toneClasses.bullish.text,
        ),
        danger: cn(
          toneClasses.bearish.border,
          toneClasses.bearish.bg,
          toneClasses.bearish.text,
        ),
        warning: cn(
          toneClasses.warning.border,
          toneClasses.warning.bg,
          toneClasses.warning.text,
        ),
        neutral: cn(
          toneClasses.neutral.border,
          toneClasses.neutral.bg,
          toneClasses.neutral.text,
        ),
        info: cn(
          toneClasses.info.border,
          toneClasses.info.bg,
          toneClasses.info.text,
        ),
        demo: cn(
          toneClasses.demo.border,
          toneClasses.demo.bg,
          toneClasses.demo.text,
        ),
      },
      emphasis: {
        true: "px-2.5 py-1 text-xs tracking-wide",
        false: "",
      },
    },
    defaultVariants: {
      variant: "neutral",
      emphasis: false,
    },
  },
);

const dotColorMap = {
  success: "bg-bullish",
  danger: "bg-bearish",
  warning: "bg-warning",
  info: "bg-info",
  demo: "bg-demo",
  neutral: "bg-muted-foreground",
} as const;

type StatusBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusBadgeVariants> & {
    dot?: boolean;
  };

export function StatusBadge({
  className,
  variant,
  emphasis,
  dot = false,
  children,
  ...props
}: StatusBadgeProps) {
  const resolvedVariant = variant ?? "neutral";

  return (
    <span
      className={cn(statusBadgeVariants({ variant, emphasis }), className)}
      {...props}
    >
      {dot ? (
        <span
          className={cn(
            "size-1.5 rounded-full",
            dotColorMap[resolvedVariant],
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
