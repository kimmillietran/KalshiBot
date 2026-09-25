/**
 * Build the M17 data-acquisition feasibility report from offline facts +
 * publicly documented product properties (no live purchase/fetch).
 */

import {
  M17_ACQUISITION_FEASIBILITY_ANALYSIS_VERSION,
  M17_ACQUISITION_FEASIBILITY_DISCLAIMER,
  M17_ACQUISITION_FEASIBILITY_STUDY_ID,
  type M17AcquisitionAvailabilityClass,
  type M17AcquisitionCandidateProduct,
  type M17AcquisitionInputClassification,
  type M17DataAcquisitionFeasibilityReport,
} from "./types";

export type AcquisitionFeasibilityFacts = {
  validSettlementJoins: number;
  spentUtcDayCount: number;
  localEvidenceSha256: Record<string, string>;
  localCoinbaseCandlesPresentOnSpentCalendar: boolean;
  localCoinbaseCandlesByteSize: number;
  cryptostructRawContainsBrti: false;
  cryptostructRawContainsCoinbaseOhlc: false;
  kalshiHourHistoryDemonstratedLocally: boolean;
  kalshiMinuteHistoryRejectedLocally: boolean;
  offlineWindowReconstructionMatchedOfficial: false;
};

const PUBLIC_URLS = {
  coinbaseExchangeCandles:
    "https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles",
  coinbaseAdvancedPublicCandles:
    "https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles",
  cfbBrtiProduct: "https://www.cfbenchmarks.com/data/indices/BRTI",
  cfbHistoryValues: "https://docs.cfbenchmarks.com/api/rest/historical-values/",
  cfbRestApi: "https://docs.cfbenchmarks.com/api/",
  kalshiCfbPassthrough: "https://docs.kalshi.com/cfbenchmarks/rest-passthrough",
  kalshiCfbWs: "https://docs.kalshi.com/websockets/cfbenchmarks-value",
  kalshiCryptoHelp: "https://help.kalshi.com/en/articles/13823838-crypto-markets",
  kalshiBtcTerms: "https://assets.kalshi.com/contract_terms/BTC.pdf",
} as const;

function emptyCounts(): Record<M17AcquisitionAvailabilityClass, number> {
  return {
    "available-existing": 0,
    "derivable-existing": 0,
    "purchasable-historical": 0,
    "prospective-only": 0,
    unverified: 0,
    "not-obtainable": 0,
  };
}

export function buildM17DataAcquisitionFeasibilityReport(input: {
  facts: AcquisitionFeasibilityFacts;
  generatedAtUtc: string;
  codeAuthoritySha: string | null;
  baseMainSha: string;
}): M17DataAcquisitionFeasibilityReport {
  const f = input.facts;
  const shas = f.localEvidenceSha256;

  const classifications: M17AcquisitionInputClassification[] = [
    {
      inputId: "coinbase-pre-entry-1m-ohlc-spent-calendar",
      classification: "purchasable-historical",
      summary:
        "No retained Coinbase completed 1m OHLC covers the 34 M16-ER SPENT UTC days "
        + "(local live-capture candles file is empty / off-calendar). CryptoStruct "
        + "KXBTC15M day ZIPs do not contain Coinbase OHLC. Public Coinbase Exchange "
        + "REST `GET /products/BTC-USD/candles?granularity=60` documents historical "
        + "buckets with `security: []` (no API key in the OpenAPI). Classification uses "
        + "`purchasable-historical` for historical acquisition feasibility; public docs "
        + "indicate a no-cost authenticating-free path, but bulk research ToS / rate "
        + "limits / completeness for all 34 days remain unverified without fetching "
        + "(fetch not performed).",
      alreadyExistsLocally: false,
      derivableFromRetainedRaw: false,
      purchasableHistorically: true,
      prospectiveOnly: false,
      evidencePaths: [
        "docs/research/m17-retained-input-recovery-audit.md",
        "data/research-results/external-kalshi-data-audit/m17-prep-retained-input-recovery-audit/retained-input-recovery-report.json",
        "src/lib/data/research/completedCandleWindowIntegrity/completedCandleWindowIntegrityTypes.ts",
      ],
      publicEvidenceUrls: [
        PUBLIC_URLS.coinbaseExchangeCandles,
        PUBLIC_URLS.coinbaseAdvancedPublicCandles,
      ],
      sha256Identities: {
        retainedInputRecoveryReportSha256:
          shas["retained-input-recovery-report.json"] ?? "",
        m16ErPurchaseManifestSha256: shas["m16-er-purchase-manifest.json"] ?? "",
      },
      blockersAfterAcquire: [
        "candle-timestamp-open-vs-close-alignment-with-frozen-vol-contract-unverified",
        "historical-candle-completeness-for-all-34-spent-days-unverified-without-fetch",
        "does-not-provide-brti-path-or-5hz-1hz-identity",
        "does-not-freeze-yes-overpriced-enter-no-mapping",
      ],
    },
    {
      inputId: "historical-brti-raw-observations",
      classification: "purchasable-historical",
      summary:
        "Raw BRTI observations are not in CryptoStruct book ZIPs. Kalshi CFB REST "
        + "passthrough historically accepted `timespan=HOUR` for one authorized SPENT "
        + "hour (18,000 in-hour 200ms ticks) and rejected `MINUTE`; CF Benchmarks "
        + "`GET /api/v1/history/values` publicly requires index authorization plus "
        + "`STREAM_HISTORICAL_VALUES` (license contact; pricing unverified). Returned "
        + "ticks are raw index values with event timestamps—not venue banked averages "
        + "and not contemporaneous receipt times. Final `expiration_value` labels cannot "
        + "substitute for a pre-entry path.",
      alreadyExistsLocally: false,
      derivableFromRetainedRaw: false,
      purchasableHistorically: true,
      prospectiveOnly: false,
      evidencePaths: [
        "docs/research/m17-prep-brti-access-investigation.md",
        "docs/research/m17-prep-settlement-sample-mapping.md",
        "docs/research/m17-prep-settlement-state-feasibility.md",
      ],
      publicEvidenceUrls: [
        PUBLIC_URLS.kalshiCfbPassthrough,
        PUBLIC_URLS.cfbHistoryValues,
        PUBLIC_URLS.cfbBrtiProduct,
      ],
      sha256Identities: {
        brtiAccessInvestigationSha256:
          shas["m17-prep-brti-access-investigation.md"] ?? "",
        settlementSampleMappingSha256:
          shas["m17-prep-settlement-sample-mapping.md"] ?? "",
      },
      blockersAfterAcquire: [
        "hour-scale-calendar-coverage-for-34-spent-days-not-yet-acquired",
        "historical-ticks-lack-provider-receipt-timestamps-causal-backtest-unsafe",
        "exact-5hz-to-1hz-window-identity-still-unverified",
        "does-not-freeze-yes-overpriced-enter-no-mapping",
        "cfb-direct-license-pricing-and-redistribution-unverified",
      ],
    },
    {
      inputId: "historical-brti-banked-60-sample-path",
      classification: "unverified",
      summary:
        "No inspected public product sells a membership-labeled historical "
        + "“60 official settlement samples” series with bank membership and "
        + "receipt timestamps. Live Kalshi WS exposes "
        + "`last_60s_windowed_average_15min` (venue-computed average) prospectively; "
        + "historical HOUR bodies yield raw 5Hz ticks only. Offline fixed-window "
        + "reconstructions of the retained HOUR body disagreed with official "
        + "`expiration_value`. Do not synthesize a banked path from settlement labels.",
      alreadyExistsLocally: false,
      derivableFromRetainedRaw: false,
      purchasableHistorically: "unverified",
      prospectiveOnly: false,
      evidencePaths: [
        "docs/research/m17-prep-settlement-sample-mapping.md",
        "docs/research/m17-prep-brti-settlement-average-discrepancy-semantics.md",
        "docs/research/m17-retained-input-recovery-audit.md",
      ],
      publicEvidenceUrls: [
        PUBLIC_URLS.kalshiCfbWs,
        PUBLIC_URLS.kalshiCryptoHelp,
      ],
      sha256Identities: {
        settlementSampleMappingSha256:
          shas["m17-prep-settlement-sample-mapping.md"] ?? "",
        discrepancySemanticsSha256:
          shas["m17-prep-brti-settlement-average-discrepancy-semantics.md"] ?? "",
      },
      blockersAfterAcquire: [
        "no-verified-historical-banked-sample-product",
        "window-identity-required-before-reconstruction-from-raw-ticks",
        "final-settlement-label-not-a-path-substitute",
      ],
    },
    {
      inputId: "exact-5hz-to-1hz-window-identity",
      classification: "unverified",
      summary:
        "Public Kalshi Help states 60 RTI prices at one-second intervals in the final "
        + "minute averaged for `expiration_value`. Upstream BRTI publishes ~200ms. "
        + "Authoritative rules for which 5Hz field/phase becomes each 1Hz sample, exact "
        + "60-sample membership (open/closed boundaries), timestamp domain, and rounding "
        + "stage remain unresolved after local offline disagreement vs official. "
        + "Purchasing raw BRTI does not by itself resolve this identity.",
      alreadyExistsLocally: false,
      derivableFromRetainedRaw: false,
      purchasableHistorically: false,
      prospectiveOnly: false,
      evidencePaths: [
        "docs/research/m17-prep-settlement-sample-mapping.md",
        "docs/research/m17-prep-brti-settlement-average-discrepancy-semantics.md",
        "docs/research/m17-prep-settlement-state-feasibility.md",
      ],
      publicEvidenceUrls: [
        PUBLIC_URLS.kalshiCryptoHelp,
        PUBLIC_URLS.kalshiBtcTerms,
        PUBLIC_URLS.cfbBrtiProduct,
      ],
      sha256Identities: {
        settlementStateFeasibilitySha256:
          shas["m17-prep-settlement-state-feasibility.md"] ?? "",
        discrepancySemanticsSha256:
          shas["m17-prep-brti-settlement-average-discrepancy-semantics.md"] ?? "",
      },
      blockersAfterAcquire: [
        "authoritative-5hz-to-1hz-specification-still-missing",
        "cannot-freeze-banked-path-reconstruction-without-it",
      ],
    },
    {
      inputId: "frozen-yes-overpriced-enter-no-mapping",
      classification: "not-obtainable",
      summary:
        "The rule mapping settlement-state arithmetic to “YES overpriced → enter NO” "
        + "is a frozen-strategy decision, not a purchasable data product. This audit "
        + "does not invent or tune that mapping. Acquisition of Coinbase/BRTI alone "
        + "cannot supply it.",
      alreadyExistsLocally: false,
      derivableFromRetainedRaw: false,
      purchasableHistorically: false,
      prospectiveOnly: false,
      evidencePaths: [
        "docs/research/m17-spent-hold-to-settlement-eval.md",
        "docs/research/m17-retained-input-recovery-audit.md",
      ],
      publicEvidenceUrls: [],
      sha256Identities: {
        spentHoldEvalSha256: shas["m17-spent-hold-to-settlement-eval.md"] ?? "",
      },
      blockersAfterAcquire: [
        "strategy-mapping-remains-unfrozen-independent-of-data-purchase",
      ],
    },
  ];

  const classificationCounts = emptyCounts();
  for (const c of classifications) {
    classificationCounts[c.classification] += 1;
  }

  const candidateProducts: M17AcquisitionCandidateProduct[] = [
    {
      provider: "Coinbase Exchange",
      productOrFeedName: "REST GET /products/{product_id}/candles (BTC-USD, granularity=60)",
      inputIdsAddressed: ["coinbase-pre-entry-1m-ohlc-spent-calendar"],
      historicalVsProspective: "historical",
      dateRangeAvailable:
        "Public docs: historical rates in grouped buckets; max 300 candles/request; "
        + "completeness for Aug–Sep 2026 SPENT days unverified without fetch",
      resolutionAndSampleRate: "1-minute OHLC buckets",
      rawFieldsProvided:
        "Documented response items: time (bucket start), low, high, open, close, volume",
      sourceTimestamps: "bucket start time (Exchange docs); close-time derived unverified",
      receiptTimestamps: "HTTP response time only; not a historical receipt clock",
      includesBrtiOrCfbValues: "no",
      documents5hzTo1hzSemantics: "no",
      sameMarketBookAdapterAsM16Er: "no — different venue/product from CryptoStruct books",
      expectedCostOrPricing:
        "Public OpenAPI lists security: [] for this endpoint (no auth). Monetary price "
        + "USD 0 per docs; rate-limit / ToS for bulk research unverified",
      licensingOrRedistribution: "Coinbase API terms — redistribution unverified in this audit",
      supportsLeakageSafeM17Exploratory:
        "Yes for pre-entry vol if only completed minutes strictly before entry are used; "
        + "does not enable settlement-state path evaluation alone",
      blockersRemainingAfterAcquire: [
        "open-vs-close-timestamp-alignment",
        "34-day completeness unverified",
        "BRTI/window/mapping still missing",
      ],
      evidenceUrlsOrPaths: [PUBLIC_URLS.coinbaseExchangeCandles],
      notes:
        "App live path already uses api.exchange.coinbase.com candles; no SPENT-calendar "
        + "archive retained.",
    },
    {
      provider: "Coinbase Advanced Trade (public)",
      productOrFeedName: "GET /api/v3/brokerage/market/products/{product_id}/candles",
      inputIdsAddressed: ["coinbase-pre-entry-1m-ohlc-spent-calendar"],
      historicalVsProspective: "historical",
      dateRangeAvailable: "Documented historical interval via start/end UNIX; coverage unverified",
      resolutionAndSampleRate: "granularity parameter (1m among options — verify at use time)",
      rawFieldsProvided: "start, low, high, open, close, volume (documented)",
      sourceTimestamps: "start = UNIX start of time interval (documented)",
      receiptTimestamps: "unverified",
      includesBrtiOrCfbValues: "no",
      documents5hzTo1hzSemantics: "no",
      sameMarketBookAdapterAsM16Er: "no",
      expectedCostOrPricing: "Public candles endpoint documented; cost unverified beyond public access",
      licensingOrRedistribution: "Coinbase API terms — unverified here",
      supportsLeakageSafeM17Exploratory: "Same as Exchange candles if instrument/timezone match",
      blockersRemainingAfterAcquire: [
        "confirm product_id BTC-USD parity with Exchange feed used in vol contract",
        "BRTI/window/mapping still missing",
      ],
      evidenceUrlsOrPaths: [PUBLIC_URLS.coinbaseAdvancedPublicCandles],
      notes: "Alternate public path; Exchange endpoint is the contract-aligned primary candidate.",
    },
    {
      provider: "Kalshi (CF Benchmarks REST passthrough)",
      productOrFeedName: "GET /trade-api/v2/cfbenchmarks/history/values?id=BRTI",
      inputIdsAddressed: [
        "historical-brti-raw-observations",
      ],
      historicalVsProspective: "historical",
      dateRangeAvailable:
        "Demonstrated locally for one HOUR on 2026-08-30; full 34-day calendar not acquired; "
        + "MINUTE timespan rejected in prior probe",
      resolutionAndSampleRate: "Raw ~5Hz (200ms) ticks in successful HOUR body",
      rawFieldsProvided: "CFB payload ticks {time, value} under Kalshi data envelope (retained schema)",
      sourceTimestamps: "tick event time present; not publication/receipt time",
      receiptTimestamps: "absent on historical HOUR body (causal limitation)",
      includesBrtiOrCfbValues: "yes — raw BRTI index values",
      documents5hzTo1hzSemantics: "no — ticks only; window identity not encoded",
      sameMarketBookAdapterAsM16Er: "no — index feed, not CryptoStruct book adapter",
      expectedCostOrPricing:
        "Uses existing Kalshi API credentials; no separate CFB key. HTTP budget / rate limits "
        + "apply; not a CryptoStruct credit purchase. Direct CFB license pricing N/A for this path",
      licensingOrRedistribution:
        "Kalshi API + upstream CFB terms; redistribution unverified",
      supportsLeakageSafeM17Exploratory:
        "Mechanical retrospective inspection possible on event time; not causal execution "
        + "backtest; banked path still unverified",
      blockersRemainingAfterAcquire: [
        "5hz-to-1hz identity",
        "receipt timestamps",
        "strategy mapping",
        "calendar coverage acquisition not authorized in this audit",
      ],
      evidenceUrlsOrPaths: [
        PUBLIC_URLS.kalshiCfbPassthrough,
        "docs/research/m17-prep-brti-access-investigation.md",
      ],
      notes: "Do not treat one-hour access proof as 34-day coverage.",
    },
    {
      provider: "CF Benchmarks",
      productOrFeedName: "REST GET /api/v1/history/values (STREAM_HISTORICAL_VALUES)",
      inputIdsAddressed: ["historical-brti-raw-observations"],
      historicalVsProspective: "historical",
      dateRangeAvailable:
        "Docs: timespan+timestamp windows; delay up to ~15 minutes for most recent; "
        + "SPENT-calendar entitlement unverified",
      resolutionAndSampleRate: "Index historical values; BRTI cadence ~200ms (product page) — field set unverified without entitled response",
      rawFieldsProvided: "unverified beyond docs describing historical values payload envelope",
      sourceTimestamps: "sorted by time ascending (docs); receipt timestamps unverified",
      receiptTimestamps: "unverified",
      includesBrtiOrCfbValues: "yes when authorized for BRTI",
      documents5hzTo1hzSemantics: "no",
      sameMarketBookAdapterAsM16Er: "no",
      expectedCostOrPricing:
        "Commercial license required; contact licensing@cfbenchmarks.com — dollar price unverified",
      licensingOrRedistribution:
        "Commercial license; STREAM_HISTORICAL_VALUES entitlement required; redistribution restricted (typical) — exact terms unverified",
      supportsLeakageSafeM17Exploratory:
        "Potentially for exploratory mechanical studies if license permits research use — unverified",
      blockersRemainingAfterAcquire: [
        "license/entitlement not obtained in this audit",
        "5hz-to-1hz still unresolved",
        "strategy mapping unfrozen",
      ],
      evidenceUrlsOrPaths: [
        PUBLIC_URLS.cfbHistoryValues,
        PUBLIC_URLS.cfbRestApi,
        PUBLIC_URLS.cfbBrtiProduct,
      ],
      notes: "No vendor contact or purchase in this audit.",
    },
    {
      provider: "Kalshi WebSocket",
      productOrFeedName: "cfbenchmarks_value / cfbenchmarks_value_5hz + last_60s_windowed_average_15min",
      inputIdsAddressed: [
        "historical-brti-banked-60-sample-path",
        "exact-5hz-to-1hz-window-identity",
      ],
      historicalVsProspective: "prospective",
      dateRangeAvailable: "Live only — cannot backfill SPENT calendar",
      resolutionAndSampleRate: "~1Hz value channel; sibling 5Hz channel for supported coins",
      rawFieldsProvided:
        "index value, trailing averages, received_at (unix ms), window average fields on live channel",
      sourceTimestamps: "provider/index time fields as documented on WS schema",
      receiptTimestamps: "received_at on live frames (documented)",
      includesBrtiOrCfbValues: "yes",
      documents5hzTo1hzSemantics:
        "Documents live window average fields; does not freeze historical 5Hz→1Hz reconstruction rule",
      sameMarketBookAdapterAsM16Er: "no",
      expectedCostOrPricing: "Kalshi API credentials; no CryptoStruct credits",
      licensingOrRedistribution: "Kalshi API terms — unverified",
      supportsLeakageSafeM17Exploratory:
        "Supports a new prospective exploratory study with contemporaneous receipt times; "
        + "not historical SPENT coverage",
      blockersRemainingAfterAcquire: [
        "prospective-only — not 34 SPENT days",
        "strategy mapping still required for P&L",
      ],
      evidenceUrlsOrPaths: [PUBLIC_URLS.kalshiCfbWs],
      notes: "Prospective capture described only; not authorized or executed here.",
    },
    {
      provider: "CryptoStruct",
      productOrFeedName: "KXBTC15M RAW-BBO-CHANGE day ZIPs (M16-ER retained)",
      inputIdsAddressed: [],
      historicalVsProspective: "historical",
      dateRangeAvailable: "34 purchased SPENT UTC days (already retained)",
      resolutionAndSampleRate: "Order-book change stream (not 1m OHLC / not BRTI)",
      rawFieldsProvided: "Book levels + admission/exchange timestamps — BRTI/OHLC fields absent",
      sourceTimestamps: "exchange timestamps present",
      receiptTimestamps: "admission timestamps present",
      includesBrtiOrCfbValues: "no",
      documents5hzTo1hzSemantics: "no",
      sameMarketBookAdapterAsM16Er: "yes — this is the M16-ER adapter",
      expectedCostOrPricing: "Already purchased for M16-ER (34 credits); no new purchase authorized",
      licensingOrRedistribution: "Vendor terms for retained raw — follow existing M16 ledger",
      supportsLeakageSafeM17Exploratory:
        "Supports book-side features only; insufficient for vol/BRTI/window/mapping",
      blockersRemainingAfterAcquire: [
        "no Coinbase OHLC in product",
        "no BRTI in product",
      ],
      evidenceUrlsOrPaths: [
        "data/research-results/external-kalshi-data-audit/m16-er-purchase-manifest.json",
        "data/research-results/external-kalshi-data-audit/m16-er-acquisition-manifest.json",
      ],
      notes: "In-repo manifests do not list a CryptoStruct BRTI or Coinbase candle add-on for these days.",
    },
    {
      provider: "Kalshi market settlement labels",
      productOrFeedName: "markets.expiration_value / settlement result (retained label backfill)",
      inputIdsAddressed: [],
      historicalVsProspective: "historical",
      dateRangeAvailable: "Joined to retained friction universe (47,263 valid joins)",
      resolutionAndSampleRate: "Final scalar settlement label per market — not a path",
      rawFieldsProvided: "expiration_value / result — not raw BRTI observations",
      sourceTimestamps: "market close / settlement metadata as retained",
      receiptTimestamps: "n/a for path reconstruction",
      includesBrtiOrCfbValues: "final label only — not observations",
      documents5hzTo1hzSemantics: "no",
      sameMarketBookAdapterAsM16Er: "n/a",
      expectedCostOrPricing: "Already retained via prior authorized pulls",
      licensingOrRedistribution: "Kalshi data terms",
      supportsLeakageSafeM17Exploratory:
        "Post-entry evaluation labels only; synthesizing BRTI from labels is forbidden",
      blockersRemainingAfterAcquire: [
        "cannot substitute for pre-entry banked path",
      ],
      evidenceUrlsOrPaths: [
        "docs/research/m17-settlement-join-audit.md",
        PUBLIC_URLS.kalshiCryptoHelp,
      ],
      notes: "Available-existing for outcomes; not-obtainable as a historical path via this field.",
    },
  ];

  const enablement = {
    exploratoryEvalOn34SpentDays: false,
    exploratoryEvalOn34SpentDaysNote:
      "Even after historical Coinbase candles + raw BRTI HOUR coverage, the unfrozen "
      + "YES-overpriced→enter-NO mapping and unresolved 5Hz→1Hz bank membership block "
      + "leakage-safe settlement-state exploratory P&L on the 34 SPENT days. Do not "
      + "treat prospective capture as SPENT coverage.",
    newExploratoryProspectiveStudy: true,
    newExploratoryProspectiveStudyNote:
      "A small prospective synchronized capture (Kalshi BRTI WS + books + Coinbase 1m) "
      + "could support a new exploratory study with receipt timestamps. Not authorized "
      + "or executed in this audit. Still requires a separately frozen entry mapping "
      + "before P&L.",
    confirmatoryHoldoutEvaluation: false,
    confirmatoryHoldoutEvaluationNote:
      "Do not purchase pristine validation/holdout data for confirmatory evaluation. "
      + "Confirmatory holdout remains out of scope for this feasibility audit.",
  };

  const remainingBlockers = [
    "coinbase-1m-ohlc-absent-locally-on-spent-calendar",
    "historical-brti-calendar-coverage-not-acquired",
    "banked-60-sample-path-product-unverified",
    "exact-5hz-to-1hz-window-identity-unverified",
    "frozen-yes-overpriced-enter-no-mapping-absent",
    "no-strategy-pnl-until-mapping-and-window-identity-resolved",
  ];

  return {
    studyId: M17_ACQUISITION_FEASIBILITY_STUDY_ID,
    analysisVersion: M17_ACQUISITION_FEASIBILITY_ANALYSIS_VERSION,
    disclaimer: M17_ACQUISITION_FEASIBILITY_DISCLAIMER,
    generatedAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    baseMainSha: input.baseMainSha,
    decisionStatus: "strategy-remains-blocked",
    purchaseMade: false,
    subscriptionStarted: false,
    captureStarted: false,
    tradeOrOrderPlaced: false,
    networkRequestsIncurringCost: 0,
    strategyPnlComputed: false,
    strategyRuleInventedOrTuned: false,
    pristineHoldoutPurchaseRecommended: false,
    retainedDatasetFacts: {
      validSettlementJoins: f.validSettlementJoins,
      spentUtcDayCount: f.spentUtcDayCount,
      yesBboDerivableFromCryptostruct: true,
      executableNoAskAs100MinusYesBid: true,
      entryTimestampsAndExpirationPresent: true,
      sourceAndExchangeTimestampsPresent: true,
    },
    coinbaseVolatilityContract: {
      instrument: "BTC-USD",
      timezone: "UTC bucket timestamps (Exchange candle time); wall-clock entry times compared in ms",
      candleCloseConvention:
        "Exchange docs: `time` is bucket start. Frozen research contract uses "
        + "exchange-completed-1m-ohlc with requiredCloseCount=11 / lookbackBars=10. "
        + "Whether research close-time equals start+60s is an alignment assumption — "
        + "mark unverified until pinned against the live BFF candle identity.",
      lookbackBars: 10,
      requiredCloseCount: 11,
      returnIntervalMs: 60_000,
      excludeInProgressMinute: true,
      notes:
        `Local spent-calendar candles present=${f.localCoinbaseCandlesPresentOnSpentCalendar}; `
        + `local candle file bytes=${f.localCoinbaseCandlesByteSize}. `
        + `CryptoStruct contains Coinbase OHLC=${f.cryptostructRawContainsCoinbaseOhlc}.`,
    },
    brtiPathDistinctions: {
      rawBrtiObservations:
        "Purchasable/accessible historically via Kalshi HOUR passthrough (demonstrated) "
        + "or CFB STREAM_HISTORICAL_VALUES (licensed). Not present in CryptoStruct ZIPs. "
        + `localHourDemo=${f.kalshiHourHistoryDemonstratedLocally}; `
        + `minuteRejected=${f.kalshiMinuteHistoryRejectedLocally}.`,
      vendorComputed1hzOr5hzSeries:
        "Live Kalshi WS ~1Hz and 5Hz channels are prospective. Historical HOUR body is "
        + "raw 5Hz ticks—not a vendor-labeled 1Hz settlement series.",
      sixtySampleBankedAverage:
        "Live venue field last_60s_windowed_average_15min is prospective. Historical "
        + "membership-labeled banked path product unverified. "
        + `offlineReconstructionMatchedOfficial=${f.offlineWindowReconstructionMatchedOfficial}.`,
      finalOfficialSettlementValue:
        "Available in retained settlement labels for joined markets; post-entry only; "
        + "cannot substitute for a historical pre-entry path.",
    },
    classifications,
    classificationCounts,
    candidateProducts,
    estimatedMinimumAcquisitionNeeded: [
      "Historical Coinbase BTC-USD 1m completed OHLC covering all 34 SPENT UTC days "
        + "(public Exchange candles candidate; no-cost per public OpenAPI — still an "
        + "acquisition action, not performed here)",
      "Historical raw BRTI observations covering pre-entry windows for the exploratory "
        + "universe (Kalshi HOUR passthrough and/or licensed CFB history) — still "
        + "insufficient alone",
      "Authoritative 5Hz→1Hz / 60-sample membership specification (documentation/vendor "
        + "clarification — not a SKU purchase)",
      "Separately frozen YES-overpriced→enter-NO mapping (strategy decision — not data)",
    ],
    enablement,
    prospectiveExploratoryOption: {
      described: true,
      authorized: false,
      executed: false,
      summary:
        "If historical banked-path reconstruction remains blocked, a small prospective "
        + "exploratory capture could co-record Kalshi BRTI (1Hz/5Hz + window average), "
        + "CryptoStruct-or-Kalshi books, and Coinbase 1m candles with local receipt times. "
        + "That would enable a new exploratory prospective study only. It would not "
        + "provide historical coverage of the 34 SPENT days and must not be auto-authorized.",
    },
    remainingBlockers,
    localEvidenceSha256: shas,
    publicEvidenceUrls: Object.values(PUBLIC_URLS),
  };
}
