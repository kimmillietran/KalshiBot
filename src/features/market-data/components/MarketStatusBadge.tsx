"use client";

import { StatusBadge } from "@/components/common/StatusBadge";

import { FALLBACK_MARKET_STATUS } from "../fallback";
import type { MarketDataStatus, MarketLifecycle } from "../types";
import { formatLifecycleLabel } from "../utils";

const STATUS_CONFIG: Record<
  MarketDataStatus,
  { label: string; variant: "success" | "warning" | "danger" | "demo" | "neutral" }
> = {
  loading: { label: "Loading market…", variant: "neutral" },
  live: { label: "KALSHI LIVE", variant: "success" },
  stale: { label: "STALE", variant: "warning" },
  fallback: { label: FALLBACK_MARKET_STATUS, variant: "demo" },
  "no-market": { label: "NO MARKET", variant: "neutral" },
};

type MarketStatusBadgeProps = {
  status: MarketDataStatus;
  lifecycle?: MarketLifecycle;
};

export function MarketStatusBadge({ status, lifecycle }: MarketStatusBadgeProps) {
  const { label, variant } = STATUS_CONFIG[status];
  const display =
    status === "live" && lifecycle ? formatLifecycleLabel(lifecycle) : label;

  return (
    <StatusBadge variant={variant} dot>
      {display}
    </StatusBadge>
  );
}
