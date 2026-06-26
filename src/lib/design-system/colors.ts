import { chartTokens, semanticTokens } from "@/styles/tokens";

import { radiusCard } from "./radii";
import { cn } from "@/lib/utils";

/** Chart SVG color constants — sourced from design tokens. */
export const chartColors = chartTokens;

/** Semantic trading colors for non-Tailwind contexts (SVG, canvas). */
export const colors = semanticTokens;

/** Tailwind class maps for semantic tones used by primitives. */
export const toneClasses = {
  bullish: {
    text: "text-bullish",
    bg: "bg-bullish-subtle",
    border: "border-bullish-border",
    bar: "bg-bullish-muted",
    fill: "fill-bullish",
    icon: "bg-bullish-subtle text-bullish",
  },
  bearish: {
    text: "text-bearish",
    bg: "bg-bearish-subtle",
    border: "border-bearish-border",
    bar: "bg-bearish-muted",
    fill: "fill-bearish",
    icon: "bg-bearish-subtle text-bearish",
  },
  warning: {
    text: "text-warning",
    bg: "bg-warning-subtle",
    border: "border-warning-border",
    fill: "fill-warning",
    icon: "bg-warning-subtle text-warning",
  },
  caution: {
    text: "text-caution",
    bg: "bg-caution-subtle",
    border: "border-warning-border",
    fill: "fill-caution",
    icon: "bg-caution-subtle text-caution",
  },
  demo: {
    text: "text-demo",
    bg: "bg-demo-subtle",
    border: "border-demo-border",
  },
  info: {
    text: "text-info",
    bg: "bg-info-subtle",
    border: "border-info-border",
  },
  neutral: {
    text: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
  },
} as const;

/** Reusable surface compositions (callouts, cards, empty states). */
export const surfaces = {
  bullish: cn(radiusCard, "border", toneClasses.bullish.border, toneClasses.bullish.bg),
  bearish: cn(radiusCard, "border", toneClasses.bearish.border, toneClasses.bearish.bg),
  warning: cn(radiusCard, "border", toneClasses.warning.border, toneClasses.warning.bg),
  caution: cn(radiusCard, "border", toneClasses.caution.border, toneClasses.caution.bg),
  inset: cn(radiusCard, "border border-panel-border bg-panel-inset"),
  dashedEmpty: cn(
    radiusCard,
    "border border-dashed border-glass-border bg-panel-inset",
  ),
  rowDivider: "border-b border-panel-border",
  verticalDivider: "bg-glass-border w-px",
  recommendation: cn(
    toneClasses.bullish.border,
    "border bg-gradient-to-br from-bullish-hero via-card/60 to-card/40",
  ),
  primaryButton:
    "bg-bullish-muted text-white hover:bg-bullish disabled:opacity-50",
} as const;

export type Tone = keyof typeof toneClasses;
