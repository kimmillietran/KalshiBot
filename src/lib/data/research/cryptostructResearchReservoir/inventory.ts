/**
 * Sanitized CryptoStruct MCP / offline inventory snapshot.
 * No secrets, no signed URLs, no economic fields.
 */

import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  assertNoForbiddenReservoirFields,
  assertUtcDate,
  CryptostructReservoirError,
} from "./ledger";
import {
  CRYPTOSTRUCT_RESERVOIR_PROVIDER,
  CRYPTOSTRUCT_RESERVOIR_SERIES,
} from "./types";

export type CryptostructMcpToolBoundary = {
  discoveredNamespaces: readonly string[];
  cryptostructMcpConnected: boolean;
  readOnlyToolsExpected: readonly string[];
  mutatingToolsProhibited: readonly string[];
  readOnlyToolsCalled: readonly string[];
  mutatingToolsCalled: readonly string[];
  note: string;
};

export type CryptostructOwnedDateMeta = {
  utcDate: string;
  vendorFileId: string | null;
  ownershipStatus: "owned";
  byteSize: number | null;
  vendorChecksumSha256: string | null;
  formatVersion: string | null;
  availabilityStatus: string | null;
};

export type CryptostructSanitizedInventory = {
  schemaVersion: "cryptostruct-kxbtc15m-sanitized-inventory-v1";
  provider: typeof CRYPTOSTRUCT_RESERVOIR_PROVIDER;
  series: typeof CRYPTOSTRUCT_RESERVOIR_SERIES;
  queriedAtUtc: string;
  mcp: CryptostructMcpToolBoundary;
  product: {
    bundleOrProductId: string | null;
    series: typeof CRYPTOSTRUCT_RESERVOIR_SERIES;
    dataFormat: string;
    availableDateRange: {
      startInclusive: string | null;
      endInclusive: string | null;
    };
    sourcePages: readonly string[];
  };
  vendorCoveredUtcDates: readonly string[];
  ownedDates: readonly CryptostructOwnedDateMeta[];
  availableUnownedUtcDates: readonly string[];
  subscription: {
    readable: boolean;
    tier: string | null;
    availableCredits: number | null;
    autonomousPurchasePolicy: string | null;
    note: string;
  };
  creditsSpentThisTask: 0;
  filesPurchasedThisTask: 0;
  filesDownloadedThisTask: 0;
  filesRestoredThisTask: 0;
  inventoryContentSha256: string;
};

/** Expected CryptoStruct MCP surface (from vendor docs / prior agent use). Not called here. */
export const CRYPTOSTRUCT_MCP_EXPECTED_READ_ONLY = [
  "search_bundles",
  "get_bundle_coverage",
  "get_my_files",
  "get_my_subscription",
  "get_price_quote",
] as const;

export const CRYPTOSTRUCT_MCP_EXPECTED_MUTATING = [
  "preview_checkout",
  "create_checkout",
  "request_file_restore",
  "get_order_files",
  "autonomous_purchase",
] as const;

export function hashSanitizedInventory(
  body: Omit<CryptostructSanitizedInventory, "inventoryContentSha256">,
): string {
  return createHash("sha256").update(stableStringify(body)).digest("hex");
}

export function buildSanitizedInventory(
  input: Omit<CryptostructSanitizedInventory, "inventoryContentSha256">,
): CryptostructSanitizedInventory {
  assertNoForbiddenReservoirFields(input);
  const ownedDates = [...input.ownedDates].sort((a, b) =>
    a.utcDate.localeCompare(b.utcDate),
  );
  const vendorCoveredUtcDates = [...input.vendorCoveredUtcDates].sort();
  const availableUnownedUtcDates = [...input.availableUnownedUtcDates].sort();

  const seenOwned = new Set<string>();
  for (const d of ownedDates) {
    assertUtcDate(d.utcDate);
    if (seenOwned.has(d.utcDate)) {
      throw new CryptostructReservoirError(
        `duplicate owned date ${d.utcDate}`,
      );
    }
    seenOwned.add(d.utcDate);
  }
  for (const d of vendorCoveredUtcDates) assertUtcDate(d);
  for (const d of availableUnownedUtcDates) assertUtcDate(d);

  if (input.creditsSpentThisTask !== 0) {
    throw new CryptostructReservoirError("inventory must record zero credits spent");
  }
  if (
    input.filesPurchasedThisTask !== 0
    || input.filesDownloadedThisTask !== 0
    || input.filesRestoredThisTask !== 0
  ) {
    throw new CryptostructReservoirError(
      "inventory must record zero purchase/download/restore",
    );
  }

  const body = {
    ...input,
    ownedDates,
    vendorCoveredUtcDates,
    availableUnownedUtcDates,
  };
  return {
    ...body,
    inventoryContentSha256: hashSanitizedInventory(body),
  };
}

/**
 * Session inventory when CryptoStruct MCP is not connected.
 * Ownership reconstructed from KalshiBot acquisition/quality-audit authority only.
 */
export function buildOfflineRepoAuthorityInventory(input: {
  queriedAtUtc: string;
  ownedDates: readonly CryptostructOwnedDateMeta[];
  vendorCoveredUtcDates: readonly string[];
  availableUnownedUtcDates: readonly string[];
  productDateRange: {
    startInclusive: string | null;
    endInclusive: string | null;
  };
  discoveredNamespaces: readonly string[];
}): CryptostructSanitizedInventory {
  return buildSanitizedInventory({
    schemaVersion: "cryptostruct-kxbtc15m-sanitized-inventory-v1",
    provider: CRYPTOSTRUCT_RESERVOIR_PROVIDER,
    series: CRYPTOSTRUCT_RESERVOIR_SERIES,
    queriedAtUtc: input.queriedAtUtc,
    mcp: {
      discoveredNamespaces: [...input.discoveredNamespaces],
      cryptostructMcpConnected: false,
      readOnlyToolsExpected: [...CRYPTOSTRUCT_MCP_EXPECTED_READ_ONLY],
      mutatingToolsProhibited: [...CRYPTOSTRUCT_MCP_EXPECTED_MUTATING],
      readOnlyToolsCalled: [],
      mutatingToolsCalled: [],
      note:
        "CryptoStruct MCP was not present in the connected Cursor MCP catalog "
        + "for this session (namespaces: cursor, cursor-app-control, cursor-ide-browser). "
        + "Ownership/coverage reconstructed from repository acquisition + catalog-freeze "
        + "authority. No vendor mutating tools were callable or called.",
    },
    product: {
      bundleOrProductId: "kalshi-btc-15m-series-day-zip",
      series: CRYPTOSTRUCT_RESERVOIR_SERIES,
      dataFormat: "kalshi-btc-15m_YYYY-MM-DD.zip (.txt.zst members)",
      availableDateRange: input.productDateRange,
      sourcePages: [
        "https://cryptostruct.com/prediction-markets/kalshi-btc-15m",
        "https://cryptostruct.com/pricing",
      ],
    },
    vendorCoveredUtcDates: input.vendorCoveredUtcDates,
    ownedDates: input.ownedDates,
    availableUnownedUtcDates: input.availableUnownedUtcDates,
    subscription: {
      readable: false,
      tier: null,
      availableCredits: null,
      autonomousPurchasePolicy: null,
      note: "Subscription/credits not readable without CryptoStruct MCP connection",
    },
    creditsSpentThisTask: 0,
    filesPurchasedThisTask: 0,
    filesDownloadedThisTask: 0,
    filesRestoredThisTask: 0,
  });
}

/** Sanitized live MCP capture (no tokens, cookies, signed URLs, order IDs). */
export type CryptostructMcpLiveCapture = {
  schemaVersion: "cryptostruct-kxbtc15m-mcp-live-capture-v1";
  capturedAtUtc: string;
  toolsCalled: readonly string[];
  toolsIntentionallyNotCalled: readonly string[];
  product: {
    bundleId: number;
    seriesKey: string;
    label: string;
    priceEurPerDay: number;
    delivery: string;
    days: number;
    firstDay: string;
    lastDay: string;
    infoUrl: string;
    shopUrl: string;
  };
  vendorCoveredUtcDates: readonly string[];
  ownedDates: readonly CryptostructOwnedDateMeta[];
  subscription: {
    premium: boolean;
    status: string;
    tier: string;
    creditBalanceCents: number;
    availableCredits: number;
    autonomousPurchasePolicy: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
    dailySpentCentsAtCapture: number;
  };
  notes?: readonly string[];
};

/**
 * Inventory from authenticated CryptoStruct MCP read-only capture.
 * Mutating tools must remain empty; credits/purchases/downloads/restores stay zero.
 */
export function buildLiveMcpInventory(input: {
  queriedAtUtc: string;
  capture: CryptostructMcpLiveCapture;
  discoveredNamespaces: readonly string[];
  readOnlyToolsCalled: readonly string[];
}): CryptostructSanitizedInventory {
  const ownedSet = new Set(input.capture.ownedDates.map((d) => d.utcDate));
  const vendorCoveredUtcDates = [...input.capture.vendorCoveredUtcDates].sort();
  const availableUnownedUtcDates = vendorCoveredUtcDates.filter(
    (d) => !ownedSet.has(d),
  );
  const mutatingCalled = input.capture.toolsCalled.filter((t) =>
    (CRYPTOSTRUCT_MCP_EXPECTED_MUTATING as readonly string[]).includes(t),
  );
  if (mutatingCalled.length > 0) {
    throw new CryptostructReservoirError(
      `live MCP capture recorded mutating tools: ${mutatingCalled.join(",")}`,
    );
  }

  return buildSanitizedInventory({
    schemaVersion: "cryptostruct-kxbtc15m-sanitized-inventory-v1",
    provider: CRYPTOSTRUCT_RESERVOIR_PROVIDER,
    series: CRYPTOSTRUCT_RESERVOIR_SERIES,
    queriedAtUtc: input.queriedAtUtc,
    mcp: {
      discoveredNamespaces: [...input.discoveredNamespaces],
      cryptostructMcpConnected: true,
      readOnlyToolsExpected: [...CRYPTOSTRUCT_MCP_EXPECTED_READ_ONLY],
      mutatingToolsProhibited: [...CRYPTOSTRUCT_MCP_EXPECTED_MUTATING],
      readOnlyToolsCalled: [...input.readOnlyToolsCalled],
      mutatingToolsCalled: [],
      note:
        "Authenticated CryptoStruct MCP read-only inventory. "
        + "No create_checkout / preview_checkout / get_order_files / "
        + "request_file_restore. Snapshot strips tokens, cookies, signed URLs, "
        + "download tokens, and order identifiers.",
    },
    product: {
      bundleOrProductId: `${input.capture.product.seriesKey}:${input.capture.product.bundleId}`,
      series: CRYPTOSTRUCT_RESERVOIR_SERIES,
      dataFormat: "kalshi-btc-15m_YYYY-MM-DD.zip (.txt.zst members)",
      availableDateRange: {
        startInclusive: input.capture.product.firstDay,
        endInclusive: input.capture.product.lastDay,
      },
      sourcePages: [
        input.capture.product.infoUrl,
        input.capture.product.shopUrl,
        "https://cryptostruct.com/pricing",
      ],
    },
    vendorCoveredUtcDates,
    ownedDates: input.capture.ownedDates,
    availableUnownedUtcDates,
    subscription: {
      readable: true,
      tier: input.capture.subscription.tier,
      availableCredits: input.capture.subscription.availableCredits,
      autonomousPurchasePolicy:
        input.capture.subscription.autonomousPurchasePolicy,
      note:
        `Premium=${input.capture.subscription.premium}; `
        + `status=${input.capture.subscription.status}; `
        + `credit_balance_cents=${input.capture.subscription.creditBalanceCents}; `
        + `daily_spent_cents_at_capture=${input.capture.subscription.dailySpentCentsAtCapture}; `
        + `period_end=${input.capture.subscription.currentPeriodEnd}`,
    },
    creditsSpentThisTask: 0,
    filesPurchasedThisTask: 0,
    filesDownloadedThisTask: 0,
    filesRestoredThisTask: 0,
  });
}
