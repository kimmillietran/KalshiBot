"use client";

import { StatusBadge } from "@/components/common/StatusBadge";

import type { MarketDataStatus } from "../types";

const STATUS_CONFIG: Record<
  MarketDataStatus,
  { label: string; variant: "success" | "warning" | "danger" | "demo" | "neutral" }
> = {
  loading: { label: "Loading market…", variant: "neutral" },
  live: { label: "KALSHI LIVE", variant: "success" },
  stale: { label: "STALE", variant: "warning" },
  fallback: { label: "FALLBACK", variant: "demo" },
  "no-market": { label: "NO MARKET", variant: "neutral" },
};

type MarketStatusBadgeProps = {
  status: MarketDataStatus;
  marketStatus?: string;
};

export function MarketStatusBadge({ status, marketStatus }: MarketStatusBadgeProps) {
  const { label, variant } = STATUS_CONFIG[status];
  const display =
    status === "live" && marketStatus ? marketStatus.toUpperCase() : label;

  return (
    <StatusBadge variant={variant} dot>
      {display}
    </StatusBadge>
  );
}
