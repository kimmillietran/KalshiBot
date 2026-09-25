/**
 * Build per-row feature coverage from recovered book rows + Coinbase bars.
 */

import { M17_CITED_REGIME_FILTERS } from "../m17SpentHoldToSettlementEval/types";
import { assertPreentryFeaturesAreCausal } from "./leakageGuards";
import {
  computePreentryRealizedVolatility,
  type CompletedMinuteBar,
} from "./preentryVolatility";
import {
  M17_PREENTRY_COINBASE_PUBLIC_SOURCE,
  M17_PREENTRY_FEATURE_RECOVERY_ANALYSIS_VERSION,
  M17_PREENTRY_FEATURE_RECOVERY_DISCLAIMER,
  M17_PREENTRY_FEATURE_RECOVERY_STUDY_ID,
  M17_PREENTRY_VOLATILITY_CONTRACT,
  type CandleDayCoverage,
  type FeatureCoverageCounts,
  type M17PreentryFeatureRecoveryReport,
  type PreentryBookFeatureRow,
  type PreentryFeatureRow,
} from "./types";

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export function enrichBookRowWithVolatility(input: {
  book: PreentryBookFeatureRow;
  barsAscendingByClose: readonly CompletedMinuteBar[];
  candlesAvailable: boolean;
}): PreentryFeatureRow {
  const bookOk = input.book.bookFeatureStatus === "ok"
    && typeof input.book.yesBidCents === "number"
    && typeof input.book.yesAskCents === "number"
    && typeof input.book.yesMidpoint === "number"
    && typeof input.book.noAskCents === "number"
    && Number.isFinite(input.book.yesBidCents)
    && Number.isFinite(input.book.yesAskCents)
    && Number.isFinite(input.book.yesMidpoint)
    && Number.isFinite(input.book.noAskCents);

  const timeOk = typeof input.book.timeRemainingMs === "number"
    && Number.isFinite(input.book.timeRemainingMs)
    && typeof input.book.closeTimeMs === "number"
    && Number.isFinite(input.book.closeTimeMs);

  let vol = computePreentryRealizedVolatility({
    barsAscendingByClose: input.barsAscendingByClose,
    entryTimestampMs: input.book.entryTimestampMs,
  });

  if (!input.candlesAvailable && vol.status === "candles-unavailable") {
    // keep
  } else if (!input.candlesAvailable && input.barsAscendingByClose.length === 0) {
    vol = {
      annualizedRealizedVolatility: null,
      status: "candles-unavailable",
      candleCount: 0,
      selectedOpenTimeMs: [],
      selectedCandles: [],
    };
  }

  const leakage = assertPreentryFeaturesAreCausal({
    entryTimestampMs: input.book.entryTimestampMs,
    closeTimeMs: input.book.closeTimeMs,
    bookTimestampMs: input.book.entryTimestampMs,
    candleCloseTimeMs: vol.selectedCandles.map((c) => c.timestamp),
    usedSettlementLabel: false,
    usedExpirationValue: false,
  });

  const volatilityOk = vol.status === "ok"
    && vol.annualizedRealizedVolatility != null
    && leakage.safe;

  let citedHighVolRegime: boolean | null = null;
  if (volatilityOk && vol.annualizedRealizedVolatility != null) {
    citedHighVolRegime =
      vol.annualizedRealizedVolatility
      >= M17_CITED_REGIME_FILTERS.volatilityMinInclusive;
  }

  return {
    ...input.book,
    annualizedRealizedVolatility: vol.annualizedRealizedVolatility,
    volatilityFeatureStatus: leakage.safe ? vol.status : "estimate-unavailable",
    volatilityCandleCount: vol.candleCount,
    volatilitySelectedOpenTimeMs: vol.selectedOpenTimeMs,
    marketFeaturesComplete: bookOk,
    timeFeaturesComplete: timeOk,
    volatilityFeatureComplete: volatilityOk,
    marketTimeVolFeaturesComplete: bookOk && timeOk && volatilityOk,
    citedHighVolRegime,
  };
}

export function summarizeFeatureCoverage(
  rows: readonly PreentryFeatureRow[],
): FeatureCoverageCounts {
  const markets = new Set<string>();
  const days = new Set<string>();
  let bookOk = 0;
  let halfSpreadMismatch = 0;
  let timeRemainingPresent = 0;
  let volatilityOk = 0;
  let marketTimeVolComplete = 0;
  let citedHighVolTrue = 0;
  let citedHighVolFalse = 0;
  let citedHighVolUnknown = 0;

  for (const row of rows) {
    markets.add(row.marketTicker);
    days.add(row.utcDayKey);
    if (row.marketFeaturesComplete) bookOk += 1;
    if (row.halfSpreadMismatch) halfSpreadMismatch += 1;
    if (row.timeFeaturesComplete) timeRemainingPresent += 1;
    if (row.volatilityFeatureComplete) volatilityOk += 1;
    if (row.marketTimeVolFeaturesComplete) marketTimeVolComplete += 1;
    if (row.citedHighVolRegime === true) citedHighVolTrue += 1;
    else if (row.citedHighVolRegime === false) citedHighVolFalse += 1;
    else citedHighVolUnknown += 1;
  }

  return {
    rows: rows.length,
    markets: markets.size,
    utcDays: days.size,
    bookOk,
    halfSpreadMismatch,
    timeRemainingPresent,
    volatilityOk,
    marketTimeVolComplete,
    citedHighVolTrue,
    citedHighVolFalse,
    citedHighVolUnknown,
  };
}

export type BuildM17PreentryFeatureRecoveryReportInput = {
  generatedAtUtc: string;
  codeAuthoritySha: string;
  baseMainSha: string;
  samplesPath: string;
  samplesSha256: string;
  samplesRowCount: number;
  rawZipDir: string;
  rawZipCount: number;
  adapterId: string;
  adapterIdentity: string;
  bookFeaturesPath: string | null;
  bookFeaturesSha256: string | null;
  candlesDir: string | null;
  rows: readonly PreentryFeatureRow[];
  candleCoverageByDay: readonly CandleDayCoverage[];
  coinbaseRetrieval: M17PreentryFeatureRecoveryReport["coinbaseRetrieval"];
  exclusions?: readonly string[];
};

export function buildM17PreentryFeatureRecoveryReport(
  input: BuildM17PreentryFeatureRecoveryReportInput,
): M17PreentryFeatureRecoveryReport {
  const coverage = summarizeFeatureCoverage(input.rows);
  const bookStatusCounts: Record<string, number> = {};
  const volatilityStatusCounts: Record<string, number> = {};
  const byDay = new Map<string, {
    utcDayKey: string;
    rows: number;
    bookOk: number;
    halfSpreadMismatch: number;
    volatilityOk: number;
    marketTimeVolComplete: number;
  }>();

  for (const row of input.rows) {
    bump(bookStatusCounts, row.bookFeatureStatus);
    bump(volatilityStatusCounts, row.volatilityFeatureStatus);
    const day = byDay.get(row.utcDayKey) ?? {
      utcDayKey: row.utcDayKey,
      rows: 0,
      bookOk: 0,
      halfSpreadMismatch: 0,
      volatilityOk: 0,
      marketTimeVolComplete: 0,
    };
    day.rows += 1;
    if (row.marketFeaturesComplete) day.bookOk += 1;
    if (row.halfSpreadMismatch) day.halfSpreadMismatch += 1;
    if (row.volatilityFeatureComplete) day.volatilityOk += 1;
    if (row.marketTimeVolFeaturesComplete) day.marketTimeVolComplete += 1;
    byDay.set(row.utcDayKey, day);
  }

  return {
    studyId: M17_PREENTRY_FEATURE_RECOVERY_STUDY_ID,
    analysisVersion: M17_PREENTRY_FEATURE_RECOVERY_ANALYSIS_VERSION,
    disclaimer: M17_PREENTRY_FEATURE_RECOVERY_DISCLAIMER,
    generatedAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    baseMainSha: input.baseMainSha,
    volatilityContract: M17_PREENTRY_VOLATILITY_CONTRACT,
    coinbasePublicSource: M17_PREENTRY_COINBASE_PUBLIC_SOURCE,
    inputs: {
      samplesPath: input.samplesPath,
      samplesSha256: input.samplesSha256,
      samplesRowCount: input.samplesRowCount,
      rawZipDir: input.rawZipDir,
      rawZipCount: input.rawZipCount,
      adapterId: input.adapterId,
      adapterIdentity: input.adapterIdentity,
      bookFeaturesPath: input.bookFeaturesPath,
      bookFeaturesSha256: input.bookFeaturesSha256,
      candlesDir: input.candlesDir,
    },
    coinbaseRetrieval: input.coinbaseRetrieval,
    candleCoverageByDay: [...input.candleCoverageByDay],
    coverage,
    coverageByUtcDay: [...byDay.values()].sort((a, b) =>
      a.utcDayKey.localeCompare(b.utcDayKey)
    ),
    missingness: {
      bookStatusCounts,
      volatilityStatusCounts,
      exclusions: [...(input.exclusions ?? [])],
    },
    attestation: {
      purchaseOccurred: false,
      subscriptionOccurred: false,
      tradeOrOrderOccurred: false,
      strategyPnlComputed: false,
      strategyResultClaimed: false,
      m17EntryRuleModifiedOrFrozen: false,
      o6SettlementFidelityResolved: false,
      settlementOutcomesUsedForRankingOrTuning: false,
      liveCaptureStarted: false,
      brtiOrBankedOr5hzIdentityInferred: false,
    },
  };
}
