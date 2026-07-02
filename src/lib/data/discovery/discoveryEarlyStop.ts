import { parseMarketDiscoverySamplingOptions } from "./applyMarketSamplingFilters";
import type { MarketDiscoverySamplingOptions } from "./discoveryTypes";

export function canUseDiscoveryEarlyStop(
  sampling?: MarketDiscoverySamplingOptions,
): boolean {
  if (sampling?.limit === undefined) {
    return false;
  }

  return !sampling.after && !sampling.before;
}

export function getDiscoveryEarlyStopTarget(
  sampling: MarketDiscoverySamplingOptions,
): number {
  const parsed = parseMarketDiscoverySamplingOptions(sampling);
  return (parsed.offset ?? 0) + (parsed.limit ?? 0);
}

export function shouldStopDiscoveryPagination(input: {
  collectedCount: number;
  limitTarget: number;
}): boolean {
  return input.collectedCount >= input.limitTarget;
}

export function formatDiscoveryProgressMessage(message: string): string {
  return `[discover] ${message}`;
}
