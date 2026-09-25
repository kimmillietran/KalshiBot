/**
 * M17 retained-input recovery audit — offline classification only.
 * Does not purchase data, fetch network resources, or compute strategy P&L.
 */

export const M17_INPUT_RECOVERY_STUDY_ID =
  "kalshi-kxbtc15m-m17-retained-input-recovery-audit-v0" as const;

export const M17_INPUT_RECOVERY_ANALYSIS_VERSION =
  "m17-retained-input-recovery-audit-v0.1" as const;

export const M17_INPUT_RECOVERY_DISCLAIMER =
  "Offline retained-input recovery audit only. No CryptoStruct purchase, no network "
  + "requests, no captures, no trades. Does not modify the M17 strategy rule. Does not "
  + "compute strategy P&L while the settlement-state→entry mapping remains unfrozen or "
  + "required pre-entry inputs remain absent. Official settlement labels are "
  + "post-entry evaluation only.";

export type M17InputAvailabilityClass =
  | "present-direct"
  | "derivable-offline"
  | "present-but-insufficient"
  | "absent"
  | "unsafe-to-derive";

export type M17RequiredInputId =
  | "yes-bid-ask-or-midpoint-at-entry"
  | "executable-no-ask-at-entry"
  | "entry-timestamp-and-market-expiration"
  | "time-remaining-at-entry"
  | "coinbase-pre-entry-realized-volatility"
  | "historical-brti-banked-settlement-sample-path"
  | "source-and-receipt-timestamps"
  | "exact-5hz-to-1hz-window-identity"
  | "official-settlement-label-post-entry";

export type M17InputClassification = {
  inputId: M17RequiredInputId;
  classification: M17InputAvailabilityClass;
  summary: string;
  evidencePaths: string[];
  sha256Identities: Record<string, string>;
  recordCoverage: {
    noted: string;
    retainedFrictionSamples: number | null;
    estimatedRecoverable: number | null;
  };
  leakageNote: string;
};

export type M17InputRecoveryFinalStatus =
  | "ready-for-exploratory-eval-with-retained-data"
  | "blocked-missing-local-raw-inputs"
  | "blocked-missing-frozen-strategy-decision";

export type M17RetainedInputRecoveryReport = {
  studyId: typeof M17_INPUT_RECOVERY_STUDY_ID;
  analysisVersion: typeof M17_INPUT_RECOVERY_ANALYSIS_VERSION;
  disclaimer: typeof M17_INPUT_RECOVERY_DISCLAIMER;
  generatedAtUtc: string;
  codeAuthoritySha: string | null;
  finalStatus: M17InputRecoveryFinalStatus;
  purchaseMade: false;
  networkRequestsMade: 0;
  strategyPnlComputed: false;
  strategyRuleModified: false;
  inputIdentities: Record<string, string>;
  availableArtifacts: Array<{
    path: string;
    role: string;
    present: boolean;
    sha256: string | null;
    notes: string;
  }>;
  classifications: M17InputClassification[];
  classificationCounts: Record<M17InputAvailabilityClass, number>;
  exploratoryEvalExecutableWithoutPurchase: false;
  remainingBlockers: string[];
  offlineDerivationImplemented: string[];
  confirmatoryNote: string;
};
