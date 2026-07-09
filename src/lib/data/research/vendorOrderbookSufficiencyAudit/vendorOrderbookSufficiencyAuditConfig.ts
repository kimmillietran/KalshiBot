import type {
  VendorOrderbookAuditConfig,
  VendorOrderbookAuditThresholds,
} from "./vendorOrderbookSufficiencyAuditTypes";
import { DEFAULT_VENDOR_ORDERBOOK_SAMPLES_ROOT } from "./vendorOrderbookSufficiencyAuditTypes";

export const VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_DISCLAIMER =
  "Third-party orderbook sufficiency audit only. This report evaluates whether vendor-provided Kalshi orderbook data could support executable microstructure research. Marketing claims are unverified until sample-proven. This is not a vendor importer, trading milestone, or strategy scanner.";

export const VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_CAVEATS = [
  "Do not treat marketing claims as sufficient.",
  "Vendor data must be sample-proven before any backfill importer is built.",
  "KXBTC15M ladder research remains blocked unless sample proves multiple strikes per event.",
  "Close-only or zero-spread-only vendor samples cannot support executable parity research.",
  "Vendor backfill importer should not be built until this audit promotes a source.",
  "Forward live capture should continue in parallel until vendor overlap is validated.",
  "This audit does not model latency, queue position, or partial fills.",
] as const;

export const DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG: VendorOrderbookAuditConfig = {
  samplesRoot: DEFAULT_VENDOR_ORDERBOOK_SAMPLES_ROOT,
  vendorSampleDirs: {
    predexon: "predexon",
    dome: "dome",
    allium: "allium",
    lychee: "lychee",
    synthesis: "synthesis",
    "official-kalshi": "official-kalshi",
  },
  thresholds: {
    medianSnapshotGapMsMax: 5000,
    p90SnapshotGapMsMax: 30000,
    nonZeroSpreadShareMin: 0.1,
    minDistinctMarkets: 1,
  },
};

export function createVendorOrderbookAuditConfig(
  overrides?: Partial<Omit<VendorOrderbookAuditConfig, "thresholds">> & {
    thresholds?: Partial<VendorOrderbookAuditThresholds>;
  },
): VendorOrderbookAuditConfig {
  return {
    ...DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG,
    ...overrides,
    vendorSampleDirs: {
      ...DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG.vendorSampleDirs,
      ...overrides?.vendorSampleDirs,
    },
    thresholds: {
      ...DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG.thresholds,
      ...overrides?.thresholds,
    },
  };
}
