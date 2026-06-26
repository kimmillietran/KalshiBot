"use client";

import { cn } from "@/lib/utils";
import { transitionDefault } from "@/lib/design-system";

import type { PriceDirection } from "../types";

type LivePriceProps = {
  direction: PriceDirection;
  className?: string;
  children: React.ReactNode;
};

/** Subtle flash when the live BTC price ticks up or down. */
export function LivePrice({ direction, className, children }: LivePriceProps) {
  return (
    <span
      className={cn(
        "rounded-sm px-0.5",
        transitionDefault,
        direction === "up" && "animate-price-flash-up",
        direction === "down" && "animate-price-flash-down",
        className,
      )}
    >
      {children}
    </span>
  );
}
