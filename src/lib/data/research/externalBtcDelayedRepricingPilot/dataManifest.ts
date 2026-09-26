/**
 * Data manifest + credit quote for the smallest fixed pilot.
 * Read-only inventory; does not purchase or download chargeable data.
 */

import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { FROZEN_PILOT_SPEC, PILOT_UTC_DAYS } from "./pilotSpec";

export const DEFAULT_KALSHI_RAW_ROOT =
  "/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/m16-er/raw";

export const DEFAULT_COINBASE_DEST_ROOT =
  "/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/coinbase-btc-usd/raw";

const COINBASE_AVG_COMPRESSED_BYTES = Math.round(1_345_675_991_628 / 997);

export type PilotDataManifest = {
  studyId: string;
  generatedAtIso: string;
  selectionRule: string;
  venue: {
    venueCode: "coinbase";
    instrumentCode: "BTC-USD";
    instrumentId: 15050;
  };
  kalshi: {
    seriesKey: "kalshi-btc-15m";
    bundleId: 9000000001;
    messageTypes: ReadonlyArray<number>;
  };
  utcDates: readonly string[];
  files: Array<{
    utcDay: string;
    kind: "kalshi-series-day-zip" | "coinbase-btc-usd-tick";
    path: string;
    presentLocally: boolean;
    sizeBytesLocal: number | null;
    estimatedCompressedBytes: number | null;
    required: boolean;
  }>;
  totals: {
    kalshiPresentCount: number;
    coinbasePresentCount: number;
    kalshiLocalBytes: number;
    coinbaseEstimatedCompressedBytes: number;
    missingCoinbaseDays: string[];
  };
  creditQuote: {
    currency: "EUR";
    priceEurPerDay: 1;
    daysToAcquire: number;
    totalEur: number;
    totalCents: number;
    cashChargeEur: number;
    alreadyOwnedCoinbaseDays: number;
    creditBalanceCentsAtQuote: number;
    creditCoverCents: number;
    agentSpendWould: "approval";
    agentSpendReason: "approval_mode";
    purchaseAuthorizedInThisTask: false;
    quoteSource: "cryptostruct get_price_quote + preview_checkout (read-only)";
  };
  downloadMethod: {
    whenAuthorized:
      "preview_checkout → create_checkout (approval_url) → get_checkout_status → get_order_files → HTTP download of .txt.zst";
    localDestination: string;
    doNotRunInThisTask: true;
  };
  premiumTermsObserved: {
    premiumActive: true;
    creditBalanceCents: number;
    agentSpendMode: "approve";
    note:
      "Credits never spend without consent; default create_checkout returns approval_required.";
  };
};

export function buildPilotDataManifest(input?: {
  kalshiRawRoot?: string;
  coinbaseDestRoot?: string;
  creditBalanceCents?: number;
  generatedAtIso?: string;
}): PilotDataManifest {
  const kalshiRawRoot = input?.kalshiRawRoot ?? DEFAULT_KALSHI_RAW_ROOT;
  const coinbaseDestRoot = input?.coinbaseDestRoot ?? DEFAULT_COINBASE_DEST_ROOT;
  const creditBalanceCents = input?.creditBalanceCents ?? 1600;
  const files: PilotDataManifest["files"] = [];

  let kalshiLocalBytes = 0;
  let kalshiPresentCount = 0;
  let coinbasePresentCount = 0;
  const missingCoinbaseDays: string[] = [];

  for (const utcDay of PILOT_UTC_DAYS) {
    const kalshiPath = join(kalshiRawRoot, `kalshi-btc-15m_${utcDay}.zip`);
    const kalshiPresent = existsSync(kalshiPath);
    const kalshiSize = kalshiPresent ? statSync(kalshiPath).size : null;
    if (kalshiPresent && kalshiSize !== null) {
      kalshiPresentCount += 1;
      kalshiLocalBytes += kalshiSize;
    }
    files.push({
      utcDay,
      kind: "kalshi-series-day-zip",
      path: kalshiPath,
      presentLocally: kalshiPresent,
      sizeBytesLocal: kalshiSize,
      estimatedCompressedBytes: kalshiSize,
      required: true,
    });

    const coinbasePath = join(
      coinbaseDestRoot,
      `coinbase-BTC-USD-${utcDay}.txt.zst`,
    );
    const coinbasePresent = existsSync(coinbasePath);
    const coinbaseSize = coinbasePresent ? statSync(coinbasePath).size : null;
    if (coinbasePresent) {
      coinbasePresentCount += 1;
    } else {
      missingCoinbaseDays.push(utcDay);
    }
    files.push({
      utcDay,
      kind: "coinbase-btc-usd-tick",
      path: coinbasePath,
      presentLocally: coinbasePresent,
      sizeBytesLocal: coinbaseSize,
      estimatedCompressedBytes: coinbaseSize ?? COINBASE_AVG_COMPRESSED_BYTES,
      required: true,
    });
  }

  const daysToAcquire = missingCoinbaseDays.length;
  const totalCents = daysToAcquire * 100;

  return {
    studyId: FROZEN_PILOT_SPEC.studyId,
    generatedAtIso: input?.generatedAtIso ?? new Date().toISOString(),
    selectionRule: FROZEN_PILOT_SPEC.daySelection.rule,
    venue: {
      venueCode: "coinbase",
      instrumentCode: "BTC-USD",
      instrumentId: 15050,
    },
    kalshi: {
      seriesKey: "kalshi-btc-15m",
      bundleId: 9000000001,
      messageTypes: [0, 1, 2],
    },
    utcDates: [...PILOT_UTC_DAYS],
    files,
    totals: {
      kalshiPresentCount,
      coinbasePresentCount,
      kalshiLocalBytes,
      coinbaseEstimatedCompressedBytes: daysToAcquire * COINBASE_AVG_COMPRESSED_BYTES
        + files
          .filter((f) => f.kind === "coinbase-btc-usd-tick" && f.presentLocally)
          .reduce((sum, f) => sum + (f.sizeBytesLocal ?? 0), 0),
      missingCoinbaseDays,
    },
    creditQuote: {
      currency: "EUR",
      priceEurPerDay: 1,
      daysToAcquire,
      totalEur: daysToAcquire,
      totalCents,
      cashChargeEur: 0,
      alreadyOwnedCoinbaseDays: coinbasePresentCount,
      creditBalanceCentsAtQuote: creditBalanceCents,
      creditCoverCents: Math.min(totalCents, creditBalanceCents),
      agentSpendWould: "approval",
      agentSpendReason: "approval_mode",
      purchaseAuthorizedInThisTask: false,
      quoteSource: "cryptostruct get_price_quote + preview_checkout (read-only)",
    },
    downloadMethod: {
      whenAuthorized:
        "preview_checkout → create_checkout (approval_url) → get_checkout_status → get_order_files → HTTP download of .txt.zst",
      localDestination: coinbaseDestRoot,
      doNotRunInThisTask: true,
    },
    premiumTermsObserved: {
      premiumActive: true,
      creditBalanceCents,
      agentSpendMode: "approve",
      note:
        "Credits never spend without consent; default create_checkout returns approval_required.",
    },
  };
}

export function sha256HexOfUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
