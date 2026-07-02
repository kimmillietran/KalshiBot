import type {
  DiscoveredMarket,
  MarketDiscoverySamplingOptions,
  MarketDiscoverySamplingSummary,
} from "./discoveryTypes";
import { MarketDiscoveryError } from "./discoveryTypes";

function parseBoundaryDate(value: string, label: string): Date {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MarketDiscoveryError(`${label} is required`, "invalid-sampling-date");
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : trimmed;
  const parsedMs = Date.parse(normalized);

  if (!Number.isFinite(parsedMs)) {
    throw new MarketDiscoveryError(
      `${label} must be a valid ISO-8601 date`,
      "invalid-sampling-date",
    );
  }

  return new Date(parsedMs);
}

export function parseMarketDiscoverySamplingOptions(
  options: MarketDiscoverySamplingOptions = {},
): Required<Pick<MarketDiscoverySamplingOptions, "offset">> & MarketDiscoverySamplingOptions {
  if (options.limit !== undefined) {
    if (!Number.isInteger(options.limit) || options.limit < 0) {
      throw new MarketDiscoveryError(
        "limit must be a non-negative integer",
        "invalid-sampling-limit",
      );
    }
  }

  if (options.offset !== undefined) {
    if (!Number.isInteger(options.offset) || options.offset < 0) {
      throw new MarketDiscoveryError(
        "offset must be a non-negative integer",
        "invalid-sampling-offset",
      );
    }
  }

  const afterDate = options.after ? parseBoundaryDate(options.after, "after") : undefined;
  const beforeDate = options.before ? parseBoundaryDate(options.before, "before") : undefined;

  if (afterDate && beforeDate && afterDate.getTime() > beforeDate.getTime()) {
    throw new MarketDiscoveryError(
      "after must be less than or equal to before",
      "invalid-sampling-date-range",
    );
  }

  return {
    ...options,
    offset: options.offset ?? 0,
    afterDate,
    beforeDate,
  };
}

function resolveMarketReferenceTime(market: DiscoveredMarket): Date | null {
  const raw = market.closeTime ?? market.openTime;
  if (!raw) {
    return null;
  }

  const parsedMs = Date.parse(raw);
  return Number.isFinite(parsedMs) ? new Date(parsedMs) : null;
}

function applyDateFilters(
  markets: readonly DiscoveredMarket[],
  afterDate?: Date,
  beforeDate?: Date,
): DiscoveredMarket[] {
  if (!afterDate && !beforeDate) {
    return [...markets];
  }

  return markets.filter((market) => {
    const referenceTime = resolveMarketReferenceTime(market);
    if (!referenceTime) {
      return false;
    }

    if (afterDate && referenceTime.getTime() < afterDate.getTime()) {
      return false;
    }

    if (beforeDate && referenceTime.getTime() >= beforeDate.getTime()) {
      return false;
    }

    return true;
  });
}

export function applyMarketSamplingFilters(
  markets: readonly DiscoveredMarket[],
  rawOptions: MarketDiscoverySamplingOptions = {},
): {
  markets: DiscoveredMarket[];
  summary: MarketDiscoverySamplingSummary;
} {
  const options = parseMarketDiscoverySamplingOptions(rawOptions);
  const totalDiscovered = markets.length;
  const dateFiltered = applyDateFilters(
    markets,
    options.afterDate,
    options.beforeDate,
  );
  const offset = options.offset ?? 0;
  const sliced = dateFiltered.slice(offset);
  const limited =
    options.limit === undefined ? sliced : sliced.slice(0, options.limit);

  return {
    markets: limited,
    summary: {
      totalDiscovered,
      afterDateFilter: dateFiltered.length,
      offset,
      limit: options.limit ?? null,
      finalMarketCount: limited.length,
    },
  };
}

export function hasMarketDiscoverySamplingOptions(
  options: MarketDiscoverySamplingOptions = {},
): boolean {
  return (
    options.limit !== undefined
    || options.offset !== undefined
    || options.after !== undefined
    || options.before !== undefined
  );
}
