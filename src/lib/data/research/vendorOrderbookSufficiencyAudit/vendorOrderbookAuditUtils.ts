import { resolveEventTickerFromMarketTicker } from "@/lib/data/research/quoteFidelityGate/resolveEventTickerFromMarketTicker";

import {
  VendorOrderbookSufficiencyAuditError,
  VendorOrderbookSufficiencyAuditErrorCode,
  DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG_PATH,
  type VendorOrderbookAuditConfig,
  type VendorOrderbookSufficiencyAuditIo,
} from "./vendorOrderbookSufficiencyAuditTypes";
import { createVendorOrderbookAuditConfig } from "./vendorOrderbookSufficiencyAuditConfig";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseVendorOrderbookAuditConfig(
  raw: string,
): VendorOrderbookAuditConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VendorOrderbookSufficiencyAuditError(
      "Invalid vendor orderbook audit config JSON",
      VendorOrderbookSufficiencyAuditErrorCode.INVALID_JSON,
    );
  }

  if (!isRecord(parsed)) {
    throw new VendorOrderbookSufficiencyAuditError(
      "Vendor orderbook audit config must be an object",
      VendorOrderbookSufficiencyAuditErrorCode.INVALID_DOCUMENT,
    );
  }

  const thresholds = isRecord(parsed.thresholds) ? parsed.thresholds : {};
  const vendorSampleDirs = isRecord(parsed.vendorSampleDirs)
    ? Object.fromEntries(
      Object.entries(parsed.vendorSampleDirs).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    )
    : undefined;

  const thresholdOverrides: Partial<VendorOrderbookAuditConfig["thresholds"]> = {};
  if (typeof thresholds.medianSnapshotGapMsMax === "number") {
    thresholdOverrides.medianSnapshotGapMsMax = thresholds.medianSnapshotGapMsMax;
  }
  if (typeof thresholds.p90SnapshotGapMsMax === "number") {
    thresholdOverrides.p90SnapshotGapMsMax = thresholds.p90SnapshotGapMsMax;
  }
  if (typeof thresholds.nonZeroSpreadShareMin === "number") {
    thresholdOverrides.nonZeroSpreadShareMin = thresholds.nonZeroSpreadShareMin;
  }
  if (typeof thresholds.minDistinctMarkets === "number") {
    thresholdOverrides.minDistinctMarkets = thresholds.minDistinctMarkets;
  }

  return createVendorOrderbookAuditConfig({
    samplesRoot:
      typeof parsed.samplesRoot === "string"
        ? parsed.samplesRoot
        : undefined,
    vendorSampleDirs,
    thresholds: thresholdOverrides,
  });
}

export function loadVendorOrderbookAuditConfig(input: {
  configPath: string;
  io: VendorOrderbookSufficiencyAuditIo;
}): VendorOrderbookAuditConfig {
  if (!input.io.fileExists(input.configPath)) {
    return createVendorOrderbookAuditConfig();
  }

  return parseVendorOrderbookAuditConfig(input.io.readFile(input.configPath));
}

export function buildDefaultVendorAuditInputPaths(
  overrides?: Partial<{ configPath: string; samplesRoot: string }>,
) {
  return {
    configPath:
      overrides?.configPath ?? DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG_PATH,
    samplesRoot:
      overrides?.samplesRoot
      ?? createVendorOrderbookAuditConfig().samplesRoot,
  };
}

export function resolveEventTickerForSeries(input: {
  marketTicker: string;
  seriesTicker: string | null;
  eventTicker: string | null;
  floorStrike: number | null;
}): string | null {
  if (input.eventTicker) {
    return input.eventTicker;
  }

  if (input.seriesTicker === "KXBTC15M" || input.marketTicker.startsWith("KXBTC15M")) {
    return resolveEventTickerFromMarketTicker(input.marketTicker);
  }

  if (input.seriesTicker === "KXBTCD" || input.marketTicker.startsWith("KXBTCD")) {
    if (input.floorStrike !== null) {
      const suffix = input.marketTicker.lastIndexOf("-");
      if (suffix > 0) {
        return input.marketTicker.slice(0, suffix);
      }
    }
    return resolveEventTickerFromMarketTicker(input.marketTicker);
  }

  return resolveEventTickerFromMarketTicker(input.marketTicker);
}

export function groupEventsByStrikeCount(input: {
  rows: readonly { marketTicker: string; eventTicker: string | null }[];
}): {
  distinctEvents: number;
  eventsWith2PlusStrikes: number;
  eventsWith3PlusStrikes: number;
  maxStrikesPerEvent: number;
} {
  const events = new Map<string, Set<string>>();

  for (const row of input.rows) {
    if (!row.eventTicker) {
      continue;
    }

    const markets = events.get(row.eventTicker) ?? new Set<string>();
    markets.add(row.marketTicker);
    events.set(row.eventTicker, markets);
  }

  const strikeCounts = [...events.values()].map((markets) => markets.size);
  return {
    distinctEvents: events.size,
    eventsWith2PlusStrikes: strikeCounts.filter((count) => count >= 2).length,
    eventsWith3PlusStrikes: strikeCounts.filter((count) => count >= 3).length,
    maxStrikesPerEvent: strikeCounts.length > 0 ? Math.max(...strikeCounts) : 0,
  };
}
