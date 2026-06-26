/** Transition duration tokens — mirror CSS --duration-* variables. */
export const duration = {
  fast: "duration-[var(--duration-fast)]",
  normal: "duration-[var(--duration-normal)]",
  slow: "duration-[var(--duration-slow)]",
} as const;

/** Default transition for interactive primitives. */
export const transitionDefault = `transition-all ${duration.normal} ease-in-out`;

/** Probability bar fill animation. */
export const transitionBar = `transition-all ${duration.normal}`;
