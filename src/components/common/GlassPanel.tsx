import {
  panelHeaderPadding,
  panelPadding,
} from "@/lib/design-system/spacing";
import { radiusPanel } from "@/lib/design-system/radii";
import { shadowElevatedRing, shadowGlass } from "@/lib/design-system/shadows";
import { textPanelSubtitle, textPanelTitle } from "@/lib/design-system/typography";
import { cn } from "@/lib/utils";

type GlassPanelProps = React.ComponentProps<"div"> & {
  /** Slightly stronger glass effect for hero panels (chart, recommendation). */
  variant?: "default" | "elevated";
};

export function GlassPanel({
  className,
  variant = "default",
  children,
  ...props
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "border-glass-border bg-card/60 overflow-hidden border backdrop-blur-md",
        radiusPanel,
        shadowGlass,
        variant === "elevated" &&
          cn(
            "bg-gradient-to-br from-card/80 via-card/60 to-card/40",
            shadowElevatedRing,
          ),
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-panel-border flex items-start justify-between gap-3 border-b",
        panelHeaderPadding,
      )}
    >
      <div>
        <h3 className={textPanelTitle}>{title}</h3>
        {subtitle ? (
          <p className={cn(textPanelSubtitle, "mt-0.5")}>{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function PanelBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(panelPadding, className)}>{children}</div>;
}
