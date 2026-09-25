/**
 * Assemble M17 pre-entry feature-coverage report from regenerated book features
 * + Coinbase 1m candles. No strategy P&L / entry simulation.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildM17PreentryFeatureRecoveryReport,
  enrichBookRowWithVolatility,
  serializeM17PreentryFeatureRecoveryMarkdown,
  type CandleDayCoverage,
  type CompletedMinuteBar,
  type PreentryBookFeatureRow,
  type PreentryFeatureRow,
} from "@/lib/data/research/m17PreentryFeatureRecovery";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), "../.."));

const OUT_DIR = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery",
);
const WORK_DIR = join(OUT_DIR, "work");
const BOOK_PATH = join(WORK_DIR, "book-features.jsonl");
const CANDLES_DIR = join(WORK_DIR, "coinbase-candles-1m");
const CANDLES_META = join(WORK_DIR, "coinbase-candles-meta.json");
const SAMPLES = join(
  ROOT,
  "data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl",
);
const RAW_DIR = join(
  ROOT,
  "data/external-samples/cryptostruct/m16-er/raw",
);

const ADAPTER_ID = "RAW-BBO-CHANGE";
const ADAPTER_IDENTITY =
  "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d";

const BASE_MAIN_SHA = "e35f5b6"; // overwritten from git at runtime

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitSha(rev: string): string {
  return execSync(`git rev-parse ${rev}`, { cwd: ROOT, encoding: "utf8" }).trim();
}

function loadBarsForDay(utcDayKey: string): CompletedMinuteBar[] {
  const path = join(CANDLES_DIR, `${utcDayKey}.jsonl`);
  if (!existsSync(path)) return [];
  const bars: CompletedMinuteBar[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      openTimeMs: number;
      closeTimeMs: number;
      open: number;
      high: number;
      low: number;
      close: number;
    };
    bars.push({
      openTimeMs: row.openTimeMs,
      closeTimeMs: row.closeTimeMs,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
    });
  }
  bars.sort((a, b) => a.closeTimeMs - b.closeTimeMs);
  return bars;
}

function loadAllBarsIndex(
  days: string[],
): Map<string, CompletedMinuteBar[]> {
  const byDay = new Map<string, CompletedMinuteBar[]>();
  for (const day of days) {
    byDay.set(day, loadBarsForDay(day));
  }
  return byDay;
}

/**
 * Merge adjacent day bars so early-UTC entries can use prior-day lookback
 * candles stored under the previous day's fetch window.
 */
function barsForEntry(
  byDay: Map<string, CompletedMinuteBar[]>,
  utcDayKey: string,
): CompletedMinuteBar[] {
  const days = [...byDay.keys()].sort();
  const idx = days.indexOf(utcDayKey);
  const merged: CompletedMinuteBar[] = [];
  const seen = new Set<number>();
  for (const day of days.slice(Math.max(0, idx - 1), idx + 2)) {
    for (const bar of byDay.get(day) ?? []) {
      if (seen.has(bar.openTimeMs)) continue;
      seen.add(bar.openTimeMs);
      merged.push(bar);
    }
  }
  merged.sort((a, b) => a.closeTimeMs - b.closeTimeMs);
  return merged;
}

function main(): void {
  if (!existsSync(BOOK_PATH)) {
    throw new Error(
      `Missing book features at ${BOOK_PATH}. Run streamM17PreentryBookFeatures.py first.`,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const samplesSha = sha256File(SAMPLES);
  const samplesRowCount = readFileSync(SAMPLES, "utf8")
    .split("\n")
    .filter((l) => l.trim()).length;
  const rawZipCount = existsSync(RAW_DIR)
    ? readdirSync(RAW_DIR).filter((n) => n.endsWith(".zip")).length
    : 0;
  const bookSha = sha256File(BOOK_PATH);

  const bookRows: PreentryBookFeatureRow[] = [];
  for (const line of readFileSync(BOOK_PATH, "utf8").split("\n")) {
    if (!line.trim()) continue;
    bookRows.push(JSON.parse(line) as PreentryBookFeatureRow);
  }

  const days = [...new Set(bookRows.map((r) => r.utcDayKey))].sort();
  const byDay = loadAllBarsIndex(days);
  const candlesAvailable = [...byDay.values()].some((b) => b.length > 0);

  const enriched: PreentryFeatureRow[] = [];
  for (const book of bookRows) {
    enriched.push(
      enrichBookRowWithVolatility({
        book,
        barsAscendingByClose: barsForEntry(byDay, book.utcDayKey),
        candlesAvailable,
      }),
    );
  }

  const candleCoverageByDay: CandleDayCoverage[] = [];
  let candlesMeta: {
    attempted?: boolean;
    usableWithoutCost?: boolean | null;
    authenticationRequired?: boolean;
    purchaseOrSubscriptionEncountered?: boolean;
    blocker?: string | null;
    retrievedUtcDays?: number;
    totalCandles?: number;
    timestampConvention?: string;
    days?: Array<{
      utcDayKey: string;
      candleCount: number;
      expectedMinuteCount: number;
      gapCount: number;
      firstOpenTimeMs: number | null;
      lastOpenTimeMs: number | null;
      sha256: string | null;
      localPath: string | null;
    }>;
  } = {};

  if (existsSync(CANDLES_META)) {
    candlesMeta = JSON.parse(readFileSync(CANDLES_META, "utf8")) as typeof candlesMeta;
    for (const day of candlesMeta.days ?? []) {
      candleCoverageByDay.push({
        utcDayKey: day.utcDayKey,
        candleCount: day.candleCount,
        expectedMinuteCount: day.expectedMinuteCount,
        gapCount: day.gapCount,
        firstOpenTimeMs: day.firstOpenTimeMs,
        lastOpenTimeMs: day.lastOpenTimeMs,
        sha256: day.sha256,
        localPath: day.localPath,
      });
    }
  } else {
    for (const day of days) {
      const bars = byDay.get(day) ?? [];
      candleCoverageByDay.push({
        utcDayKey: day,
        candleCount: bars.length,
        expectedMinuteCount: bars.length > 0
          ? Math.floor(
            (bars[bars.length - 1]!.openTimeMs - bars[0]!.openTimeMs) / 60_000,
          ) + 1
          : 0,
        gapCount: 0,
        firstOpenTimeMs: bars[0]?.openTimeMs ?? null,
        lastOpenTimeMs: bars[bars.length - 1]?.openTimeMs ?? null,
        sha256: null,
        localPath: existsSync(join(CANDLES_DIR, `${day}.jsonl`))
          ? relative(ROOT, join(CANDLES_DIR, `${day}.jsonl`))
          : null,
      });
    }
  }

  const codeAuthoritySha = gitSha("HEAD");
  let baseMainSha = BASE_MAIN_SHA;
  try {
    baseMainSha = gitSha("origin/main");
  } catch {
    try {
      baseMainSha = gitSha("main");
    } catch {
      // keep stub
    }
  }

  const report = buildM17PreentryFeatureRecoveryReport({
    generatedAtUtc: new Date().toISOString(),
    codeAuthoritySha,
    baseMainSha,
    samplesPath: SAMPLES.replace(`${ROOT}/`, ""),
    samplesSha256: samplesSha,
    samplesRowCount,
    rawZipDir: RAW_DIR.replace(`${ROOT}/`, ""),
    rawZipCount,
    adapterId: ADAPTER_ID,
    adapterIdentity: ADAPTER_IDENTITY,
    bookFeaturesPath: BOOK_PATH.replace(`${ROOT}/`, ""),
    bookFeaturesSha256: bookSha,
    candlesDir: existsSync(CANDLES_DIR)
      ? CANDLES_DIR.replace(`${ROOT}/`, "")
      : null,
    rows: enriched,
    candleCoverageByDay,
    coinbaseRetrieval: {
      attempted: Boolean(candlesMeta.attempted),
      usableWithoutCost: candlesMeta.usableWithoutCost ?? null,
      authenticationRequired: Boolean(candlesMeta.authenticationRequired),
      purchaseOrSubscriptionEncountered: Boolean(
        candlesMeta.purchaseOrSubscriptionEncountered,
      ),
      blocker: candlesMeta.blocker ?? null,
      retrievedUtcDays: candlesMeta.retrievedUtcDays ?? candleCoverageByDay.filter((d) => d.candleCount > 0).length,
      totalCandles: candlesMeta.totalCandles
        ?? candleCoverageByDay.reduce((s, d) => s + d.candleCount, 0),
      timestampConvention:
        (candlesMeta.timestampConvention as
          | "exchange-bucket-start-open; close=open+59999ms (frozen research)"
          | "not-retrieved"
          | undefined)
        ?? (candlesAvailable
          ? "exchange-bucket-start-open; close=open+59999ms (frozen research)"
          : "not-retrieved"),
    },
    exclusions: [
      "Settlement labels / expiration_value never used as features",
      "Post-close book updates excluded by admission-timestamp matching",
      "In-progress and future candles excluded (closeTimeMs < entryTimestampMs)",
      "Strategy P&L and entry simulation out of scope",
    ],
  });

  const featuresOut = join(WORK_DIR, "preentry-features.jsonl");
  writeFileSync(
    featuresOut,
    `${enriched.map((r) => JSON.stringify(r)).join("\n")}${enriched.length ? "\n" : ""}`,
    "utf8",
  );

  writeFileSync(
    join(OUT_DIR, "preentry-feature-recovery-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(OUT_DIR, "preentry-feature-recovery-report.md"),
    serializeM17PreentryFeatureRecoveryMarkdown(report),
    "utf8",
  );
  writeFileSync(
    join(OUT_DIR, "summary.json"),
    `${JSON.stringify({
      studyId: report.studyId,
      analysisVersion: report.analysisVersion,
      coverage: report.coverage,
      coinbaseRetrieval: report.coinbaseRetrieval,
      attestation: report.attestation,
      generatedAtUtc: report.generatedAtUtc,
    }, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `rows=${report.coverage.rows} bookOk=${report.coverage.bookOk} `
      + `volOk=${report.coverage.volatilityOk} `
      + `complete=${report.coverage.marketTimeVolComplete} `
      + `mismatch=${report.coverage.halfSpreadMismatch}`,
  );
  console.log(`wrote ${OUT_DIR}`);
}

main();
