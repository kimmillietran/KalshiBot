/**
 * TypeScript mirrors of CSS tokens in tokens.css.
 * Use for SVG attributes, inline styles, and runtime values where
 * Tailwind classes are not available.
 *
 * Keep in sync with src/styles/tokens.css (--chart-* and semantic colors).
 */

export const chartTokens = {
  lineUp: "#34d399",
  lineDown: "#f87171",
  areaUp: "#10b981",
  areaDown: "#ef4444",
  target: "#f59e0b",
  targetLabel: "#fbbf24",
  grid: "rgb(255 255 255 / 0.06)",
  gridOpacity: 0.06,
  labelUpBg: "#065f46",
  labelDownBg: "#7f1d1d",
  dotStroke: "#0a0a0a",
  areaFillOpacity: 0.25,
  targetStrokeOpacity: 0.9,
} as const;

export const semanticTokens = {
  bullish: "#34d399",
  bearish: "#f87171",
  warning: "#fbbf24",
  caution: "#fbbf24",
  demo: "#c4b5fd",
  info: "#38bdf8",
} as const;

export type ChartTokens = typeof chartTokens;
export type SemanticTokens = typeof semanticTokens;
