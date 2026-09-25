/**
 * Read-only fetch of Coinbase Exchange public BTC-USD 1m candles for M16-ER
 * SPENT UTC days. Unauthenticated, no-cost path only. Stops on paywall,
 * credentials, unclear terms, or unexpected access limits.
 *
 * Writes gitignored JSONL under the recovery work directory. No strategy P&L.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CoinbaseHistoricalHttpAdapter } from "@/lib/data/importers/btc/coinbase/CoinbaseHistoricalHttpAdapter";
import { createCoinbaseHistoricalImporter } from "@/lib/data/importers/btc/coinbase/CoinbaseHistoricalImporter";
import { BtcHistoricalInterval } from "@/lib/data/importers/btc/btcHistoricalImporterTypes";
import {
  M17_PREENTRY_COINBASE_PUBLIC_SOURCE,
  M17_PREENTRY_VOLATILITY_CONTRACT,
} from "@/lib/data/research/m17PreentryFeatureRecovery";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

const SAMPLES = join(
  ROOT,
  "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl",
);

const OUT_DIR = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery/work/coinbase-candles-1m",
);

const META_PATH = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery/work/coinbase-candles-meta.json",
);

function listSpentUtcDays(samplesPath: string): string[] {
  const days = new Set<string>();
  for (const line of readFileSync(samplesPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { utcDayKey?: string };
    if (typeof row.utcDayKey === "string") days.add(row.utcDayKey);
  }
  return [...days].sort();
}

function dayBoundsUtc(utcDayKey: string): { start: string; end: string } {
  // Include prior UTC day for lookback near midnight, and next day start exclusive.
  const dayStart = Date.parse(`${utcDayKey}T00:00:00.000Z`);
  const startMs = dayStart - 24 * 60 * 60 * 1000;
  const endMs = dayStart + 24 * 60 * 60 * 1000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

function countGaps(openTimeMsSorted: number[]): number {
  let gaps = 0;
  for (let i = 1; i < openTimeMsSorted.length; i += 1) {
    const delta = openTimeMsSorted[i]! - openTimeMsSorted[i - 1]!;
    if (delta !== 60_000) gaps += 1;
  }
  return gaps;
}

async function probePublicAccess(adapter: CoinbaseHistoricalHttpAdapter): Promise<{
  ok: boolean;
  status?: number;
  blocker: string | null;
}> {
  const end = new Date();
  const start = new Date(end.getTime() - 5 * 60_000);
  try {
    await adapter.fetchCandles({
      productId: "BTC-USD",
      granularity: 60,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
    return { ok: true, blocker: null };
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: number }).status)
        : undefined;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        status,
        blocker:
          `Coinbase Exchange candles returned HTTP ${status}; credentials or `
          + "access restriction encountered — stopping retrieval.",
      };
    }
    if (status === 402 || status === 429) {
      return {
        ok: false,
        status,
        blocker:
          `Coinbase Exchange candles returned HTTP ${status}; unexpected access `
          + "limit or payment signal — stopping retrieval.",
      };
    }
    return {
      ok: false,
      status,
      blocker:
        `Coinbase Exchange candles probe failed: `
        + (error instanceof Error ? error.message : String(error)),
    };
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const days = listSpentUtcDays(SAMPLES);
  console.log(
    `fetching Coinbase BTC-USD 1m for ${days.length} SPENT days → ${OUT_DIR}`,
  );
  console.log(
    `source ${M17_PREENTRY_COINBASE_PUBLIC_SOURCE.baseUrl}`
      + `${M17_PREENTRY_COINBASE_PUBLIC_SOURCE.path} (unauthenticated)`,
  );

  const adapter = new CoinbaseHistoricalHttpAdapter({ fetchImpl: fetch });
  const probe = await probePublicAccess(adapter);
  if (!probe.ok) {
    const meta = {
      attempted: true,
      usableWithoutCost: false,
      authenticationRequired: probe.status === 401 || probe.status === 403,
      purchaseOrSubscriptionEncountered: probe.status === 402,
      blocker: probe.blocker,
      retrievedUtcDays: 0,
      totalCandles: 0,
      timestampConvention: "not-retrieved",
      candleCloseOffsetMs: M17_PREENTRY_VOLATILITY_CONTRACT.candleCloseOffsetMs,
      days: [],
    };
    writeFileSync(META_PATH, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    console.error(probe.blocker);
    process.exitCode = 2;
    return;
  }

  const importer = createCoinbaseHistoricalImporter({ httpClient: adapter });
  const dayMetas: Array<Record<string, unknown>> = [];
  let totalCandles = 0;

  for (const utcDayKey of days) {
    const outPath = join(OUT_DIR, `${utcDayKey}.jsonl`);
    if (existsSync(outPath)) {
      const existing = readFileSync(outPath, "utf8")
        .split("\n")
        .filter((l) => l.trim()).length;
      console.log(`${utcDayKey}: skip existing (${existing} rows)`);
      const opens: number[] = [];
      for (const line of readFileSync(outPath, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const row = JSON.parse(line) as { openTimeMs: number };
        opens.push(row.openTimeMs);
      }
      opens.sort((a, b) => a - b);
      const sha = createHash("sha256").update(readFileSync(outPath)).digest("hex");
      dayMetas.push({
        utcDayKey,
        candleCount: opens.length,
        expectedMinuteCount: opens.length > 0
          ? Math.floor((opens[opens.length - 1]! - opens[0]!) / 60_000) + 1
          : 0,
        gapCount: countGaps(opens),
        firstOpenTimeMs: opens[0] ?? null,
        lastOpenTimeMs: opens[opens.length - 1] ?? null,
        sha256: sha,
        localPath: relative(ROOT, outPath),
        skippedExisting: true,
      });
      totalCandles += opens.length;
      continue;
    }

    const bounds = dayBoundsUtc(utcDayKey);
    console.log(`${utcDayKey}: ${bounds.start} → ${bounds.end}`);
    const bars = await importer.getHistoricalBars({
      symbol: "BTC-USD",
      interval: BtcHistoricalInterval.ONE_MINUTE,
      startTime: bounds.start,
      endTime: bounds.end,
    });

    const lines: string[] = [];
    const opens: number[] = [];
    for (const bar of bars) {
      const openTimeMs = Date.parse(bar.openTime);
      const closeTimeMs = Date.parse(bar.closeTime);
      opens.push(openTimeMs);
      lines.push(
        JSON.stringify({
          openTimeMs,
          closeTimeMs,
          openTime: bar.openTime,
          closeTime: bar.closeTime,
          open: bar.openUsd,
          high: bar.highUsd,
          low: bar.lowUsd,
          close: bar.closeUsd,
          volume: bar.volume,
          provider: "coinbase-exchange",
          productId: "BTC-USD",
          sourceRecordType: "exchange-completed-1m-ohlc",
          granularitySeconds: 60,
        }),
      );
    }
    opens.sort((a, b) => a - b);
    writeFileSync(outPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
    const sha = createHash("sha256").update(readFileSync(outPath)).digest("hex");
    const expected =
      opens.length > 0
        ? Math.floor((opens[opens.length - 1]! - opens[0]!) / 60_000) + 1
        : 0;
    dayMetas.push({
      utcDayKey,
      candleCount: opens.length,
      expectedMinuteCount: expected,
      gapCount: countGaps(opens),
      firstOpenTimeMs: opens[0] ?? null,
      lastOpenTimeMs: opens[opens.length - 1] ?? null,
      sha256: sha,
      localPath: relative(ROOT, outPath),
      skippedExisting: false,
    });
    totalCandles += opens.length;
    console.log(`${utcDayKey}: wrote ${opens.length} candles sha=${sha.slice(0, 12)}`);
  }

  const meta = {
    attempted: true,
    usableWithoutCost: true,
    authenticationRequired: false,
    purchaseOrSubscriptionEncountered: false,
    blocker: null,
    retrievedUtcDays: dayMetas.length,
    totalCandles,
    timestampConvention:
      "exchange-bucket-start-open; close=open+59999ms (frozen research)",
    candleCloseOffsetMs: M17_PREENTRY_VOLATILITY_CONTRACT.candleCloseOffsetMs,
    source: M17_PREENTRY_COINBASE_PUBLIC_SOURCE,
    days: dayMetas,
    filesOnDisk: existsSync(OUT_DIR) ? readdirSync(OUT_DIR).length : 0,
  };
  writeFileSync(META_PATH, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  console.log(`wrote meta ${META_PATH}; totalCandles=${totalCandles}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
