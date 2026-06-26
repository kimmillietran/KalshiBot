import { cn } from "@/lib/utils";

/** Uppercase micro-label (command bar keys, stat labels, section headers). */
export const textLabel = "text-label text-muted-foreground";

/** Mono numeric display (prices, probabilities, cents). */
export const textMetric = "text-metric";

/** Panel section title. */
export const textPanelTitle = "text-panel-title";

/** Panel subtitle / helper line. */
export const textPanelSubtitle = "text-muted-foreground text-xs";

/** Hero recommendation action text. */
export const textHeroAction =
  "font-heading text-4xl font-black tracking-tight sm:text-5xl";

/** Large command-bar price display. */
export const textCommandPrice = "font-mono text-2xl font-bold tracking-tight";

/** Contract price in odds panel. */
export const textContractPrice = "font-mono text-3xl font-bold tracking-tight";

/** Chart axis / tick labels (SVG-safe). */
export const textChartAxis = "text-label fill-muted-foreground";

/** Fine print captions. */
export const textCaption = "text-muted-foreground text-xs";

/** Section value in command bar (market name, expiration). */
export const textSectionValue = "text-sm font-semibold";

/** Mono value in command bar metadata. */
export const textMonoValue = "font-mono text-sm font-semibold";

/**
 * Compose a label class with optional overrides.
 * Prefer this over repeating raw Tailwind strings in components.
 */
export function labelClass(...extra: (string | undefined)[]): string {
  return cn(textLabel, ...extra);
}

export function metricClass(...extra: (string | undefined)[]): string {
  return cn(textMetric, ...extra);
}

export function heroActionClass(
  tone: "bullish" | "bearish" | "caution" = "bullish",
  ...extra: (string | undefined)[]
): string {
  const toneClass = {
    bullish: "text-bullish",
    bearish: "text-bearish",
    caution: "text-caution",
  }[tone];

  return cn(textHeroAction, toneClass, ...extra);
}
