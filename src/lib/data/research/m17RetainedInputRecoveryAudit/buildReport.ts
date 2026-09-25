/**
 * Build the retained-input recovery classification report (offline).
 */

import {
  M17_INPUT_RECOVERY_ANALYSIS_VERSION,
  M17_INPUT_RECOVERY_DISCLAIMER,
  M17_INPUT_RECOVERY_STUDY_ID,
  type M17InputAvailabilityClass,
  type M17InputClassification,
  type M17RetainedInputRecoveryReport,
} from "./types";
import { isUnsafeToDeriveBrtiFromSettlementLabel } from "./leakageGuards";

export type RecoveryAuditFacts = {
  retainedFrictionSampleCount: number;
  validSettlementJoinCount: number;
  rawZipDayCount: number;
  rawZipSha256ByDay: Record<string, string>;
  samplesSha256: string;
  labelsSha256: string;
  frictionSamplesPath: string;
  labelsPath: string;
  rawStorePath: string;
  acquisitionManifestPath: string;
  acquisitionManifestSha256: string;
  coinbaseCandlesPath: string | null;
  coinbaseCandlesByteSize: number;
  brtiOneCloseCaptureCount: number;
  brtiOneClosePaths: string[];
  settlementJoinMergeSha: string;
};

function emptyShas(): Record<string, string> {
  return {};
}

export function buildM17RetainedInputRecoveryReport(input: {
  facts: RecoveryAuditFacts;
  generatedAtUtc: string;
  codeAuthoritySha: string | null;
}): M17RetainedInputRecoveryReport {
  const f = input.facts;
  void isUnsafeToDeriveBrtiFromSettlementLabel();

  const classifications: M17InputClassification[] = [
    {
      inputId: "yes-bid-ask-or-midpoint-at-entry",
      classification: "derivable-offline",
      summary:
        "YES BBO (and midpoint) can be reconstructed offline from retained CryptoStruct "
        + "RAW-BBO-CHANGE zip members using the existing level-apply semantics. Not present "
        + "as columns on friction samples.jsonl, but proven recoverable (PR #113 derived "
        + `${f.retainedFrictionSampleCount} executable samples from the same raw store).`,
      evidencePaths: [f.rawStorePath, f.frictionSamplesPath],
      sha256Identities: {
        samplesSha256: f.samplesSha256,
        ...Object.fromEntries(
          Object.entries(f.rawZipSha256ByDay).slice(0, 3).map(([d, h]) => [
            `rawZip:${d}`,
            h,
          ]),
        ),
      },
      recordCoverage: {
        noted:
          "Full re-derivation of all rows not required for this audit; schema+streamer "
          + "prove offline recoverability for retained executable sample timestamps.",
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: f.retainedFrictionSampleCount,
      },
      leakageNote:
        "Derived from pre-entry book messages only; does not use expiration_value or result.",
    },
    {
      inputId: "executable-no-ask-at-entry",
      classification: "derivable-offline",
      summary:
        "Executable NO ask for buying NO is the complement cross 100 − YES best bid, "
        + "derivable from the same reconstructed BBO (existing M16/friction convention).",
      evidencePaths: [f.rawStorePath, f.frictionSamplesPath],
      sha256Identities: { samplesSha256: f.samplesSha256 },
      recordCoverage: {
        noted: "Same recoverability as YES BBO for retained executable samples.",
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: f.retainedFrictionSampleCount,
      },
      leakageNote: "Complement of contemporaneous YES bid only; no settlement-label input.",
    },
    {
      inputId: "entry-timestamp-and-market-expiration",
      classification: "present-direct",
      summary:
        "entryTimestampMs and marketTicker are present on retained friction samples; "
        + "close/expiration instant is also derivable from ticker HHMM (America/New_York) "
        + "and/or instrument.start in raw members when expiry is null.",
      evidencePaths: [f.frictionSamplesPath, f.rawStorePath],
      sha256Identities: { samplesSha256: f.samplesSha256 },
      recordCoverage: {
        noted: "Direct on retained friction sample rows.",
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: f.retainedFrictionSampleCount,
      },
      leakageNote: "Timestamps from admission clock / ticker calendar; not from settlement labels.",
    },
    {
      inputId: "time-remaining-at-entry",
      classification: "derivable-offline",
      summary:
        "timeRemainingMs = closeTimeMs − entryTimestampMs, using ticker-derived close "
        + "and retained entry timestamps.",
      evidencePaths: [f.frictionSamplesPath],
      sha256Identities: { samplesSha256: f.samplesSha256 },
      recordCoverage: {
        noted: "Derivable for every retained friction sample with parseable ticker close.",
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: f.retainedFrictionSampleCount,
      },
      leakageNote: "Uses only entry timestamp and market close identity; no post-close labels.",
    },
    {
      inputId: "coinbase-pre-entry-realized-volatility",
      classification: "absent",
      summary:
        "No retained Coinbase completed 1m OHLC covering the 34 M16-ER SPENT days. "
        + "The only local btc-candles-1m.jsonl under live-capture is empty (0 bytes) and "
        + "is not on the SPENT calendar. Deriving vol from settlement labels is forbidden.",
      evidencePaths: f.coinbaseCandlesPath ? [f.coinbaseCandlesPath] : [],
      sha256Identities: emptyShas(),
      recordCoverage: {
        noted: `coinbaseCandlesByteSize=${f.coinbaseCandlesByteSize}`,
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: 0,
      },
      leakageNote: "Must not backfill vol from expiration_value or official result.",
    },
    {
      inputId: "historical-brti-banked-settlement-sample-path",
      classification: "absent",
      summary:
        "CryptoStruct books do not include BRTI/CFB settlement-sample paths. Local "
        + "one-close synchronized captures exist only for a few Sep 24–25 closes "
        + `(count=${f.brtiOneCloseCaptureCount}), which do not cover the 34 SPENT days. `
        + "Synthesizing BRTI from settlement labels is unsafe and forbidden.",
      evidencePaths: f.brtiOneClosePaths,
      sha256Identities: emptyShas(),
      recordCoverage: {
        noted: "Absent for M16-ER SPENT calendar; insufficient off-calendar probes only.",
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: 0,
      },
      leakageNote: "isUnsafeToDeriveBrtiFromSettlementLabel() === true.",
    },
    {
      inputId: "source-and-receipt-timestamps",
      classification: "derivable-offline",
      summary:
        "RAW-BBO messages expose admission timestamp (ad_ts, ns) and exchange timestamp "
        + "on deltas (field index 5). Friction study used admission ms; both clocks are "
        + "recoverable offline from raw members.",
      evidencePaths: [f.rawStorePath],
      sha256Identities: {
        ...Object.fromEntries(
          Object.entries(f.rawZipSha256ByDay).slice(0, 1).map(([d, h]) => [
            `rawZip:${d}`,
            h,
          ]),
        ),
      },
      recordCoverage: {
        noted: "Present on raw book deltas; snapshots may lack exchange ts (field5=0).",
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: f.retainedFrictionSampleCount,
      },
      leakageNote: "Message clocks only; not settlement_ts / expiration_value.",
    },
    {
      inputId: "exact-5hz-to-1hz-window-identity",
      classification: "unsafe-to-derive",
      summary:
        "Official banked-sample field/window identity remains unresolved (PR #112/#116). "
        + "Limited one-close captures are insufficient to freeze 5Hz→60×1Hz mapping for "
        + "the SPENT calendar. Inventing a mapping from labels or completed averages is unsafe.",
      evidencePaths: [
        "docs/research/m17-settlement-state-research-design-draft.md",
        ...f.brtiOneClosePaths.slice(0, 2),
      ],
      sha256Identities: emptyShas(),
      recordCoverage: {
        noted: "Not frozen; cannot treat one-close evidence as calendar-wide authority.",
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: 0,
      },
      leakageNote: "Do not backsolve window identity from post-close expiration_value.",
    },
    {
      inputId: "official-settlement-label-post-entry",
      classification: "present-direct",
      summary:
        "PR #114 settlement-labels.jsonl provides official labels for post-entry "
        + `evaluation only (${f.validSettlementJoinCount} valid joins on retained samples).`,
      evidencePaths: [f.labelsPath],
      sha256Identities: { labelsSha256: f.labelsSha256 },
      recordCoverage: {
        noted: "Post-entry outcome label coverage from PR #124 join audit.",
        retainedFrictionSamples: f.retainedFrictionSampleCount,
        estimatedRecoverable: f.validSettlementJoinCount,
      },
      leakageNote:
        "Authorized as outcome label only — never as a pre-entry settlement-state feature.",
    },
  ];

  const classificationCounts: Record<M17InputAvailabilityClass, number> = {
    "present-direct": 0,
    "derivable-offline": 0,
    "present-but-insufficient": 0,
    absent: 0,
    "unsafe-to-derive": 0,
  };
  for (const c of classifications) {
    classificationCounts[c.classification] += 1;
  }

  const remainingBlockers = [
    "settlement-state-to-yes-overpriced-entry-mapping-unfrozen",
    "coinbase-pre-entry-realized-volatility-absent-on-spent-calendar",
    "historical-brti-banked-paths-absent-on-spent-calendar",
    "exact-5hz-to-1hz-window-identity-unfrozen-unsafe-to-derive",
  ];

  // Strategy mapping remains unfrozen → primary status. Local vol/BRTI also missing.
  const finalStatus = "blocked-missing-frozen-strategy-decision" as const;

  return {
    studyId: M17_INPUT_RECOVERY_STUDY_ID,
    analysisVersion: M17_INPUT_RECOVERY_ANALYSIS_VERSION,
    disclaimer: M17_INPUT_RECOVERY_DISCLAIMER,
    generatedAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    finalStatus,
    purchaseMade: false,
    networkRequestsMade: 0,
    strategyPnlComputed: false,
    strategyRuleModified: false,
    inputIdentities: {
      samplesSha256: f.samplesSha256,
      labelsSha256: f.labelsSha256,
      acquisitionManifestSha256: f.acquisitionManifestSha256,
      settlementJoinMergeSha: f.settlementJoinMergeSha,
      rawZipDayCount: String(f.rawZipDayCount),
      datasetProvenance: "SPENT_VALIDATION (M16-ER)",
    },
    availableArtifacts: [
      {
        path: f.frictionSamplesPath,
        role: "retained-friction-executable-samples",
        present: true,
        sha256: f.samplesSha256,
        notes: `${f.retainedFrictionSampleCount} rows`,
      },
      {
        path: f.labelsPath,
        role: "official-settlement-labels-pr114",
        present: true,
        sha256: f.labelsSha256,
        notes: "post-entry evaluation only",
      },
      {
        path: f.rawStorePath,
        role: "cryptostruct-m16-er-raw-zips",
        present: f.rawZipDayCount === 34,
        sha256: f.acquisitionManifestSha256,
        notes: `${f.rawZipDayCount} day zips; per-day SHAs in acquisition manifest`,
      },
      {
        path: f.acquisitionManifestPath,
        role: "acquisition-manifest",
        present: true,
        sha256: f.acquisitionManifestSha256,
        notes: "hashes for raw day zips",
      },
      {
        path: f.coinbaseCandlesPath ?? "(none)",
        role: "coinbase-1m-ohlc",
        present: f.coinbaseCandlesByteSize > 0,
        sha256: null,
        notes: `bytes=${f.coinbaseCandlesByteSize}`,
      },
      {
        path: "Documents/KalshiResearchArchive/one-close-settlement-fidelity",
        role: "one-close-brti-synchronized-captures",
        present: f.brtiOneCloseCaptureCount > 0,
        sha256: null,
        notes: `${f.brtiOneCloseCaptureCount} off-calendar closes; not SPENT 34-day coverage`,
      },
    ],
    classifications,
    classificationCounts,
    exploratoryEvalExecutableWithoutPurchase: false,
    remainingBlockers,
    offlineDerivationImplemented: [
      "applyCryptostructLevels",
      "deriveBboCentsFromBooks (YES mid + executable NO ask)",
      "parseCloseTimeMsFromTicker",
      "computeTimeRemainingMs",
      "parseCryptostructMessageTimestamps",
    ],
    confirmatoryNote:
      "No purchase was made. No strategy P&L was computed. Book-side features are "
      + "offline-derivable from retained CryptoStruct raw, but Coinbase vol and BRTI "
      + "paths for the SPENT calendar are absent, the 5Hz↔1Hz window identity is "
      + "unsafe to invent, and the frozen M17 settlement-state→entry mapping remains "
      + "unresolved — exploratory P&L stays blocked.",
  };
}
