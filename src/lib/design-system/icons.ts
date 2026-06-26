/** Standard icon sizes — mirror CSS --icon-* variables. */
export const iconSize = {
  sm: "size-3",
  md: "size-4",
  lg: "size-5",
} as const;

export type IconSize = keyof typeof iconSize;
