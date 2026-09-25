/**
 * M17 settlement-join audit — coverage only on retained SPENT executable samples.
 * Not confirmatory validation; does not tune strategy gates.
 */

export const M17_SETTLEMENT_JOIN_STUDY_ID =
  "kalshi-kxbtc15m-m17-settlement-join-audit-v0" as const;

export const M17_SETTLEMENT_JOIN_ANALYSIS_VERSION =
  "m17-settlement-join-audit-v0.1" as const;

export const M17_SETTLEMENT_JOIN_DISCLAIMER =
  "Settlement-JOIN coverage only on retained SPENT_VALIDATION (M16-ER) executable " +
  "friction samples. Exact marketTicker join; no outcome imputation. Not confirmatory " +
  "validation; not alpha; no threshold tuning; BRTI/settlement-state path coverage not " +
  "measured. Descriptive outcome counts (if present) are SPENT/exploratory only.";

/** Known incomplete ticker from PR #114 backfill (normalization / missing floorStrike). */
export const M17_KNOWN_INCOMPLETE_MARKET_TICKER =
  "KXBTC15M-26AUG140315-15" as const;

export const M17_MINIMUM_INDEPENDENT_MARKETS_FOR_EXPLORATORY = 5 as const;

export type M17EligibleEntryRecord = {
  marketTicker: string;
  utcDayKey: string;
  entryTimestampMs: number;
  /** Friction retained samples already passed executable-book gates. */
  hasExecutableBookInputs: boolean;
};

export type M17JoinDisposition =
  | "joined-valid-official-label"
  | "missing-label"
  | "excluded-known-incomplete-ticker"
  | "normalization-or-import-validation-failure"
  | "conflicting-or-duplicate-label"
  | "ambiguous-market-identity"
  | "non-numeric-expiration-value";

export type M17JoinedEntryResult = {
  marketTicker: string;
  utcDayKey: string;
  entryTimestampMs: number;
  disposition: M17JoinDisposition;
  hasExecutableBookInputs: boolean;
  /** Official result when disposition is joined-valid; never invented. */
  officialResult: "yes" | "no" | null;
  expirationValue: string | null;
};

export type M17SettlementJoinCounts = {
  totalEligibleRecords: number;
  unambiguousMarketIdentity: number;
  ambiguousMarketIdentity: number;
  validOfficialSettlementLabel: number;
  missingLabels: number;
  normalizationOrImportValidationFailures: number;
  conflictingOrDuplicateLabels: number;
  excludedKnownIncompleteTicker: number;
  nonNumericExpirationValue: number;
  validExecutableBookInputs: number;
  /** Historical BRTI/BTC settlement-path inputs are not present on these records. */
  validBtcSettlementPathInputs: number;
  independentMarketsRepresented: number;
  eligibleDatesRepresented: number;
  independentMarketsWithValidJoin: number;
  eligibleDatesWithValidJoin: number;
};

export type M17SettlementJoinDecision = {
  settlementJoinPercentage: number;
  meetsMinimumIndependentMarkets: boolean;
  minimumIndependentMarketsRequired: number;
  dataAvailability: "sufficient-labels-on-spent-executable-samples" | "insufficient";
  exploratoryUsability: "sufficient-for-exploratory-m17-analysis" | "insufficient";
  confirmatoryValidity: "not-confirmatory-spent-validation";
  confirmatoryLimitation: string;
  pristineValidationPurchaseNeeds: string[];
  claimedPriorEntryAuditNote: string;
};

export type M17SettlementJoinAuditReport = {
  studyId: typeof M17_SETTLEMENT_JOIN_STUDY_ID;
  analysisVersion: typeof M17_SETTLEMENT_JOIN_ANALYSIS_VERSION;
  disclaimer: typeof M17_SETTLEMENT_JOIN_DISCLAIMER;
  generatedAtUtc: string;
  codeAuthoritySha: string | null;
  strategyDefinitionFixed: {
    name: "hold-to-settlement-terminal-mispricing";
    side: "NO";
    fee: "one-standard-taker";
    outcomeLabel: "official-expiration_value";
    avg60sDataWiredIntoGates: false;
  };
  inputIdentities: Record<string, string>;
  excludedKnownIncompleteTicker: typeof M17_KNOWN_INCOMPLETE_MARKET_TICKER;
  counts: M17SettlementJoinCounts;
  coverageByDate: Array<{
    utcDayKey: string;
    eligibleRecords: number;
    validJoinedRecords: number;
    joinPercentage: number;
    independentMarkets: number;
  }>;
  coverageByMarketTop: Array<{
    marketTicker: string;
    eligibleRecords: number;
    validJoinedRecords: number;
    dispositionSummary: Partial<Record<M17JoinDisposition, number>>;
  }>;
  /** SPENT/exploratory descriptive only — not for strategy selection. */
  spentExploratoryOutcomeCounts: {
    label: "SPENT_VALIDATION exploratory descriptive only — do not tune strategy";
    yes: number;
    no: number;
    unlabeledOrExcluded: number;
  };
  decision: M17SettlementJoinDecision;
  zeroNetworkConfirmation: {
    marketDataRequests: 0;
    websocketCaptures: 0;
    cryptostructPurchases: 0;
    trades: 0;
  };
};
