import { MarketLifecycle as FeatureMarketLifecycle } from "@/features/market-data/types";
import { MarketLifecycle as DomainMarketLifecycle } from "@/types/domain/trading";

const LIFECYCLE_MAP: Record<FeatureMarketLifecycle, DomainMarketLifecycle> = {
  [FeatureMarketLifecycle.UPCOMING]: DomainMarketLifecycle.UPCOMING,
  [FeatureMarketLifecycle.ACTIVE]: DomainMarketLifecycle.ACTIVE,
  [FeatureMarketLifecycle.CLOSED]: DomainMarketLifecycle.CLOSED,
  [FeatureMarketLifecycle.SETTLED]: DomainMarketLifecycle.SETTLED,
  [FeatureMarketLifecycle.UNKNOWN]: DomainMarketLifecycle.UNKNOWN,
};

export function mapFeatureLifecycleToDomain(
  lifecycle: FeatureMarketLifecycle,
): DomainMarketLifecycle {
  return LIFECYCLE_MAP[lifecycle];
}
