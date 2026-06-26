"use client";

import { StatusBadge } from "@/components/common/StatusBadge";

import type { BtcFeedStatus } from "../types";

const STATUS_CONFIG: Record<
  BtcFeedStatus,
  { label: string; variant: "success" | "warning" | "danger" | "demo" | "neutral" }
> = {
  loading: { label: "Loading BTC…", variant: "neutral" },
  live: { label: "LIVE", variant: "success" },
  stale: { label: "STALE", variant: "warning" },
  error: { label: "FEED ERROR", variant: "danger" },
  fallback: { label: "FALLBACK", variant: "demo" },
};

export function FeedStatusBadge({ status }: { status: BtcFeedStatus }) {
  const { label, variant } = STATUS_CONFIG[status];
  return (
    <StatusBadge variant={variant} dot>
      {label}
    </StatusBadge>
  );
}
