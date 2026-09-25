/**
 * Exact marketTicker settlement join for M17-eligible entry records.
 * Rejects ambiguous identities; never matches by approximate time or price.
 */

import {
  classifySettlementLabel,
  type SettlementLabelRecord,
} from "@/lib/data/research/settlementFrictionCoverage";

import {
  M17_KNOWN_INCOMPLETE_MARKET_TICKER,
  M17_MINIMUM_INDEPENDENT_MARKETS_FOR_EXPLORATORY,
  M17_SETTLEMENT_JOIN_ANALYSIS_VERSION,
  M17_SETTLEMENT_JOIN_DISCLAIMER,
  M17_SETTLEMENT_JOIN_STUDY_ID,
  type M17EligibleEntryRecord,
  type M17JoinDisposition,
  type M17JoinedEntryResult,
  type M17SettlementJoinAuditReport,
  type M17SettlementJoinCounts,
  type M17SettlementJoinDecision,
} from "./types";

function isBlankTicker(ticker: string | null | undefined): boolean {
  return typeof ticker !== "string" || ticker.trim().length === 0;
}

function labelsConflict(
  a: SettlementLabelRecord,
  b: SettlementLabelRecord,
): boolean {
  const keys: (keyof SettlementLabelRecord)[] = [
    "result",
    "expirationValue",
    "floorStrike",
    "closeTime",
    "settlementTs",
  ];
  for (const key of keys) {
    if ((a[key] ?? null) !== (b[key] ?? null)) return true;
  }
  return false;
}

/**
 * Index labels by exact marketTicker. Duplicate tickers (agreeing or not)
 * are tracked so joins can fail closed rather than silently pick one.
 */
export function indexLabelsForM17Join(labels: readonly SettlementLabelRecord[]): {
  byTicker: Map<string, SettlementLabelRecord>;
  duplicateTickers: Set<string>;
  conflictingTickers: Set<string>;
} {
  const byTicker = new Map<string, SettlementLabelRecord>();
  const duplicateTickers = new Set<string>();
  const conflictingTickers = new Set<string>();
  for (const record of labels) {
    if (isBlankTicker(record.marketTicker)) continue;
    const prev = byTicker.get(record.marketTicker);
    if (!prev) {
      byTicker.set(record.marketTicker, record);
      continue;
    }
    duplicateTickers.add(record.marketTicker);
    if (labelsConflict(prev, record)) {
      conflictingTickers.add(record.marketTicker);
    }
  }
  return { byTicker, duplicateTickers, conflictingTickers };
}

function isStudyCompleteValidLabel(label: SettlementLabelRecord): boolean {
  const flags = classifySettlementLabel(label);
  return (
    flags.jointFinalizedAndNonEmptyExpiration
    && flags.validNumericExpirationValue
    && flags.finiteStrike
    && flags.parseableCloseTime
    && flags.parseableSettlementTs
  );
}

function isNonNumericExpiration(label: SettlementLabelRecord): boolean {
  const flags = classifySettlementLabel(label);
  return (
    flags.finalizedResult
    && flags.nonEmptyExpirationValue
    && !flags.validNumericExpirationValue
  );
}

/**
 * Classify one entry against the ticker-indexed label map.
 * Ambiguous / conflicting / duplicate tickers never yield joined-valid.
 */
export function joinEligibleEntryToSettlementLabel(input: {
  entry: M17EligibleEntryRecord;
  label: SettlementLabelRecord | undefined;
  conflictingTickers: ReadonlySet<string>;
  duplicateTickers: ReadonlySet<string>;
  knownIncompleteTicker?: string;
}): M17JoinedEntryResult {
  const knownIncomplete =
    input.knownIncompleteTicker ?? M17_KNOWN_INCOMPLETE_MARKET_TICKER;
  const ticker = input.entry.marketTicker;

  const base = {
    marketTicker: ticker,
    utcDayKey: input.entry.utcDayKey,
    entryTimestampMs: input.entry.entryTimestampMs,
    hasExecutableBookInputs: input.entry.hasExecutableBookInputs,
    officialResult: null as "yes" | "no" | null,
    expirationValue: null as string | null,
  };

  if (isBlankTicker(ticker)) {
    return { ...base, disposition: "ambiguous-market-identity" };
  }

  if (ticker === knownIncomplete) {
    return { ...base, disposition: "excluded-known-incomplete-ticker" };
  }

  if (
    input.conflictingTickers.has(ticker) || input.duplicateTickers.has(ticker)
  ) {
    return { ...base, disposition: "conflicting-or-duplicate-label" };
  }

  const label = input.label;
  if (!label) {
    return { ...base, disposition: "missing-label" };
  }

  if (label.marketTicker !== ticker) {
    return { ...base, disposition: "ambiguous-market-identity" };
  }

  if (isNonNumericExpiration(label)) {
    return { ...base, disposition: "non-numeric-expiration-value" };
  }

  if (!isStudyCompleteValidLabel(label)) {
    return { ...base, disposition: "normalization-or-import-validation-failure" };
  }

  const result = label.result === "yes" || label.result === "no" ? label.result : null;
  return {
    ...base,
    disposition: "joined-valid-official-label",
    officialResult: result,
    expirationValue:
      typeof label.expirationValue === "string" ? label.expirationValue : null,
  };
}

export function runM17SettlementJoinAudit(input: {
  entries: readonly M17EligibleEntryRecord[];
  labels: readonly SettlementLabelRecord[];
  generatedAtUtc: string;
  codeAuthoritySha: string | null;
  inputIdentities: Record<string, string>;
  knownIncompleteTicker?: string;
  claimedPriorEntryAuditNote?: string;
}): {
  results: M17JoinedEntryResult[];
  report: M17SettlementJoinAuditReport;
} {
  const knownIncomplete =
    input.knownIncompleteTicker ?? M17_KNOWN_INCOMPLETE_MARKET_TICKER;
  const indexed = indexLabelsForM17Join(input.labels);

  const results: M17JoinedEntryResult[] = [];
  for (const entry of input.entries) {
    results.push(
      joinEligibleEntryToSettlementLabel({
        entry,
        label: indexed.byTicker.get(entry.marketTicker),
        conflictingTickers: indexed.conflictingTickers,
        duplicateTickers: indexed.duplicateTickers,
        knownIncompleteTicker: knownIncomplete,
      }),
    );
  }

  const counts = summarizeJoinCounts(results);
  const coverageByDate = summarizeByDate(results);
  const coverageByMarketTop = summarizeByMarket(results, 25);

  let yes = 0;
  let no = 0;
  let unlabeledOrExcluded = 0;
  for (const r of results) {
    if (r.disposition === "joined-valid-official-label") {
      if (r.officialResult === "yes") yes += 1;
      else if (r.officialResult === "no") no += 1;
      else unlabeledOrExcluded += 1;
    } else {
      unlabeledOrExcluded += 1;
    }
  }

  const decision = buildDecision(counts, input.claimedPriorEntryAuditNote);

  const report: M17SettlementJoinAuditReport = {
    studyId: M17_SETTLEMENT_JOIN_STUDY_ID,
    analysisVersion: M17_SETTLEMENT_JOIN_ANALYSIS_VERSION,
    disclaimer: M17_SETTLEMENT_JOIN_DISCLAIMER,
    generatedAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    strategyDefinitionFixed: {
      name: "hold-to-settlement-terminal-mispricing",
      side: "NO",
      fee: "one-standard-taker",
      outcomeLabel: "official-expiration_value",
      avg60sDataWiredIntoGates: false,
    },
    inputIdentities: input.inputIdentities,
    excludedKnownIncompleteTicker: knownIncomplete,
    counts,
    coverageByDate,
    coverageByMarketTop,
    spentExploratoryOutcomeCounts: {
      label:
        "SPENT_VALIDATION exploratory descriptive only — do not tune strategy",
      yes,
      no,
      unlabeledOrExcluded,
    },
    decision,
    zeroNetworkConfirmation: {
      marketDataRequests: 0,
      websocketCaptures: 0,
      cryptostructPurchases: 0,
      trades: 0,
    },
  };

  return { results, report };
}

function summarizeJoinCounts(
  results: readonly M17JoinedEntryResult[],
): M17SettlementJoinCounts {
  const dispositions = countDispositions(results);
  const markets = new Set<string>();
  const dates = new Set<string>();
  const marketsJoined = new Set<string>();
  const datesJoined = new Set<string>();
  let executable = 0;
  let unambiguous = 0;

  for (const r of results) {
    if (!isBlankTicker(r.marketTicker)) {
      unambiguous += 1;
      markets.add(r.marketTicker);
    }
    if (r.utcDayKey) dates.add(r.utcDayKey);
    if (r.hasExecutableBookInputs) executable += 1;
    if (r.disposition === "joined-valid-official-label") {
      marketsJoined.add(r.marketTicker);
      datesJoined.add(r.utcDayKey);
    }
  }

  return {
    totalEligibleRecords: results.length,
    unambiguousMarketIdentity: unambiguous,
    ambiguousMarketIdentity: dispositions["ambiguous-market-identity"] ?? 0,
    validOfficialSettlementLabel:
      dispositions["joined-valid-official-label"] ?? 0,
    missingLabels: dispositions["missing-label"] ?? 0,
    normalizationOrImportValidationFailures:
      dispositions["normalization-or-import-validation-failure"] ?? 0,
    conflictingOrDuplicateLabels:
      dispositions["conflicting-or-duplicate-label"] ?? 0,
    excludedKnownIncompleteTicker:
      dispositions["excluded-known-incomplete-ticker"] ?? 0,
    nonNumericExpirationValue:
      dispositions["non-numeric-expiration-value"] ?? 0,
    validExecutableBookInputs: executable,
    validBtcSettlementPathInputs: 0,
    independentMarketsRepresented: markets.size,
    eligibleDatesRepresented: dates.size,
    independentMarketsWithValidJoin: marketsJoined.size,
    eligibleDatesWithValidJoin: datesJoined.size,
  };
}

function countDispositions(
  results: readonly M17JoinedEntryResult[],
): Partial<Record<M17JoinDisposition, number>> {
  const out: Partial<Record<M17JoinDisposition, number>> = {};
  for (const r of results) {
    out[r.disposition] = (out[r.disposition] ?? 0) + 1;
  }
  return out;
}

function summarizeByDate(results: readonly M17JoinedEntryResult[]) {
  const byDay = new Map<
    string,
    { eligible: number; joined: number; markets: Set<string> }
  >();
  for (const r of results) {
    const row = byDay.get(r.utcDayKey) ?? {
      eligible: 0,
      joined: 0,
      markets: new Set<string>(),
    };
    row.eligible += 1;
    if (!isBlankTicker(r.marketTicker)) row.markets.add(r.marketTicker);
    if (r.disposition === "joined-valid-official-label") row.joined += 1;
    byDay.set(r.utcDayKey, row);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([utcDayKey, row]) => ({
      utcDayKey,
      eligibleRecords: row.eligible,
      validJoinedRecords: row.joined,
      joinPercentage: row.eligible > 0 ? row.joined / row.eligible : 0,
      independentMarkets: row.markets.size,
    }));
}

function summarizeByMarket(
  results: readonly M17JoinedEntryResult[],
  topN: number,
) {
  const byMarket = new Map<
    string,
    {
      eligible: number;
      joined: number;
      dispositionSummary: Partial<Record<M17JoinDisposition, number>>;
    }
  >();
  for (const r of results) {
    if (isBlankTicker(r.marketTicker)) continue;
    const row = byMarket.get(r.marketTicker) ?? {
      eligible: 0,
      joined: 0,
      dispositionSummary: {},
    };
    row.eligible += 1;
    if (r.disposition === "joined-valid-official-label") row.joined += 1;
    row.dispositionSummary[r.disposition] =
      (row.dispositionSummary[r.disposition] ?? 0) + 1;
    byMarket.set(r.marketTicker, row);
  }
  return [...byMarket.entries()]
    .sort((a, b) => b[1].eligible - a[1].eligible || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([marketTicker, row]) => ({
      marketTicker,
      eligibleRecords: row.eligible,
      validJoinedRecords: row.joined,
      dispositionSummary: row.dispositionSummary,
    }));
}

function buildDecision(
  counts: M17SettlementJoinCounts,
  claimedPriorEntryAuditNote?: string,
): M17SettlementJoinDecision {
  const pct =
    counts.totalEligibleRecords > 0
      ? counts.validOfficialSettlementLabel / counts.totalEligibleRecords
      : 0;
  const meets =
    counts.independentMarketsWithValidJoin
    >= M17_MINIMUM_INDEPENDENT_MARKETS_FOR_EXPLORATORY;
  const dataOk = counts.validOfficialSettlementLabel > 0 && meets;

  return {
    settlementJoinPercentage: pct,
    meetsMinimumIndependentMarkets: meets,
    minimumIndependentMarketsRequired:
      M17_MINIMUM_INDEPENDENT_MARKETS_FOR_EXPLORATORY,
    dataAvailability: dataOk
      ? "sufficient-labels-on-spent-executable-samples"
      : "insufficient",
    exploratoryUsability: dataOk
      ? "sufficient-for-exploratory-m17-analysis"
      : "insufficient",
    confirmatoryValidity: "not-confirmatory-spent-validation",
    confirmatoryLimitation:
      `These ${counts.eligibleDatesRepresented} CryptoStruct days are classified `
      + "SPENT_VALIDATION (M16-ER). They may support discovery and exploratory "
      + "feasibility only; they are not an untouched pristine confirmatory / "
      + "holdout partition.",
    pristineValidationPurchaseNeeds: [
      "UTC days outside the M16-ER SPENT_VALIDATION calendar (not QUALITY_AUDIT_ONLY, not sealed M16-P)",
      "CryptoStruct KXBTC15M executable books with the same RAW-BBO-CHANGE adapter identity",
      "Official Kalshi settlement labels per marketTicker (result, expiration_value, floor_strike, close_time, settlement_ts) with study-complete field validity",
      "Explicit pristine / holdout reservation before any exploratory peek",
      "Optional: co-timed BRTI/settlement-sample paths only if the evaluation claims settlement-state causality (not required solely for label-join coverage)",
    ],
    claimedPriorEntryAuditNote:
      claimedPriorEntryAuditNote
      ?? "Claimed prior entry-filter output (20,923 records / 72 markets) was not "
        + "found among retained in-repo artifacts. This audit joins the retained "
        + "friction-study executable samples (prior BTC/executable/friction audit "
        + "corpus) to PR #114 settlement labels by exact marketTicker.",
  };
}

export function entriesFromFrictionSamples(
  samples: readonly {
    marketTicker: string;
    utcDayKey: string;
    entryTimestampMs: number;
  }[],
): M17EligibleEntryRecord[] {
  return samples.map((s) => ({
    marketTicker: s.marketTicker,
    utcDayKey: s.utcDayKey,
    entryTimestampMs: s.entryTimestampMs,
    hasExecutableBookInputs: true,
  }));
}
