import { MarketLifecycle } from "../types";

type LifecycleContext = {
  vendorStatus: string;
  openTime: string;
  closeTime: string;
  nowMs?: number;
};

const SETTLED_STATUSES = new Set(["settled", "determined", "finalized"]);
const CLOSED_STATUSES = new Set(["closed", "inactive", "expired"]);
const ACTIVE_STATUSES = new Set(["active", "open"]);
const UPCOMING_STATUSES = new Set(["initialized", "unopened", "created"]);

/**
 * Maps Kalshi vendor status plus temporal context into the domain lifecycle.
 * Vendor strings must not escape this module.
 */
export function mapKalshiStatusToLifecycle({
  vendorStatus,
  openTime,
  closeTime,
  nowMs = Date.now(),
}: LifecycleContext): MarketLifecycle {
  const normalized = vendorStatus.trim().toLowerCase();
  const openMs = Date.parse(openTime);
  const closeMs = Date.parse(closeTime);

  if (SETTLED_STATUSES.has(normalized)) {
    return MarketLifecycle.SETTLED;
  }

  if (!Number.isNaN(closeMs) && nowMs >= closeMs) {
    return MarketLifecycle.CLOSED;
  }

  if (!Number.isNaN(openMs) && nowMs < openMs) {
    return MarketLifecycle.UPCOMING;
  }

  if (ACTIVE_STATUSES.has(normalized)) {
    return MarketLifecycle.ACTIVE;
  }

  if (UPCOMING_STATUSES.has(normalized)) {
    return MarketLifecycle.UPCOMING;
  }

  if (CLOSED_STATUSES.has(normalized)) {
    return MarketLifecycle.CLOSED;
  }

  return MarketLifecycle.UNKNOWN;
}
