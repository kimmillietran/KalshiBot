import { EXPECTED_SETTLEMENT_SAMPLE_COUNT } from "./compareMembershipAverages";
import {
  compareMarketDecimals,
  roundHalfEven2DecimalString,
} from "./decimalMarketValue";

/**
 * Research-only settlement estimate. Not an official Kalshi field binding,
 * not a trading signal, and not connected to order placement or strategy gates.
 */
export type SettlementEstimate = {
  value: string | null;
  source: "expiration_value" | "avg_60s_data" | "last_60s_windowed_average_15min" | null;
  status:
    | "authoritative"
    | "empirical-candidate"
    | "intermediate"
    | "insufficient-evidence"
    | "unavailable";
  sampleCount: number | null;
  rounding: "vendor-confirmed" | "diagnostic-half-even" | "unverified" | null;
  vendorConfirmed: boolean;
};

export type SettlementEstimateInputs = {
  /** Post-close official label when retrieved. */
  expirationValueRaw: string | null;
  avg60sDataRaw: string | null;
  avg60sDataCount: number | null;
  last60sWindowedAverage15minRaw: string | null;
  last60sWindowedCount: number | null;
  /** True only after the frozen close instant (and typically after metadata retrieval). */
  postClose: boolean;
  /**
   * When true, avg_60s_data has been checked against a verified 60-sample 1Hz
   * reconstruction (exact decimal). Required for empirical-candidate.
   */
  avg60sMatchesVerified1HzMean: boolean | null;
};

export type SettlementEstimateBundle = {
  /** Primary research estimate following the selection rules below. */
  primary: SettlementEstimate;
  /** Always reported separately — never silently substituted into primary. */
  fields: {
    expiration_value: SettlementEstimate;
    avg_60s_data: SettlementEstimate;
    last_60s_windowed_average_15min: SettlementEstimate;
  };
  note: string;
};

function fieldEstimate(input: {
  value: string | null;
  source: SettlementEstimate["source"];
  status: SettlementEstimate["status"];
  sampleCount: number | null;
  rounding: SettlementEstimate["rounding"];
  vendorConfirmed: boolean;
}): SettlementEstimate {
  return {
    value: input.value,
    source: input.source,
    status: input.status,
    sampleCount: input.sampleCount,
    rounding: input.rounding,
    vendorConfirmed: input.vendorConfirmed,
  };
}

/**
 * Build research-only settlement estimates.
 *
 * Rules (non-substituting):
 * 1. After close, `expiration_value` is authoritative when present.
 * 2. `avg_60s_data` at count 60 with verified 1Hz mean agreement may be an
 *    empirical-candidate (never labeled official / vendor-confirmed).
 * 3. `last_60s_windowed_average_15min` is diagnostic only — never the empirical candidate.
 * 4. Before sufficient evidence: intermediate or insufficient-evidence.
 */
export function buildSettlementEstimateBundle(
  input: SettlementEstimateInputs,
): SettlementEstimateBundle {
  const expirationPresent = input.expirationValueRaw != null && input.expirationValueRaw.trim() !== "";
  const avgPresent = input.avg60sDataRaw != null && input.avg60sDataRaw.trim() !== "";
  const settlementPresent = input.last60sWindowedAverage15minRaw != null
    && input.last60sWindowedAverage15minRaw.trim() !== "";

  const expiration: SettlementEstimate = expirationPresent && input.postClose
    ? fieldEstimate({
      value: input.expirationValueRaw,
      source: "expiration_value",
      status: "authoritative",
      sampleCount: null,
      rounding: "vendor-confirmed",
      vendorConfirmed: true,
    })
    : fieldEstimate({
      value: expirationPresent ? input.expirationValueRaw : null,
      source: expirationPresent ? "expiration_value" : null,
      status: expirationPresent && !input.postClose ? "intermediate" : "unavailable",
      sampleCount: null,
      rounding: expirationPresent ? "vendor-confirmed" : null,
      vendorConfirmed: false,
    });

  const avgCountOk = input.avg60sDataCount === EXPECTED_SETTLEMENT_SAMPLE_COUNT;
  const avgEmpiricalReady = avgPresent
    && avgCountOk
    && input.avg60sMatchesVerified1HzMean === true;

  let avgStatus: SettlementEstimate["status"];
  if (!avgPresent) {
    avgStatus = "unavailable";
  } else if (avgEmpiricalReady) {
    avgStatus = "empirical-candidate";
  } else if (input.avg60sDataCount != null && input.avg60sDataCount > 0 && input.avg60sDataCount < EXPECTED_SETTLEMENT_SAMPLE_COUNT) {
    avgStatus = "intermediate";
  } else if (avgPresent && avgCountOk && input.avg60sMatchesVerified1HzMean !== true) {
    avgStatus = "insufficient-evidence";
  } else {
    avgStatus = "insufficient-evidence";
  }

  const avg60s: SettlementEstimate = fieldEstimate({
    value: avgPresent ? input.avg60sDataRaw : null,
    source: avgPresent ? "avg_60s_data" : null,
    status: avgStatus,
    sampleCount: input.avg60sDataCount,
    rounding: avgEmpiricalReady ? "diagnostic-half-even" : avgPresent ? "unverified" : null,
    vendorConfirmed: false,
  });

  // Diagnostic field only — never selected as empirical settlement candidate.
  let settlementWindowStatus: SettlementEstimate["status"];
  if (!settlementPresent) {
    settlementWindowStatus = "unavailable";
  } else if (
    input.last60sWindowedCount != null
    && input.last60sWindowedCount > 0
    && input.last60sWindowedCount < EXPECTED_SETTLEMENT_SAMPLE_COUNT
  ) {
    settlementWindowStatus = "intermediate";
  } else {
    settlementWindowStatus = "insufficient-evidence";
  }

  const last60s: SettlementEstimate = fieldEstimate({
    value: settlementPresent ? input.last60sWindowedAverage15minRaw : null,
    source: settlementPresent ? "last_60s_windowed_average_15min" : null,
    status: settlementWindowStatus,
    sampleCount: input.last60sWindowedCount,
    rounding: settlementPresent ? "unverified" : null,
    vendorConfirmed: false,
  });

  let primary: SettlementEstimate;
  if (expiration.status === "authoritative") {
    primary = expiration;
  } else if (avg60s.status === "empirical-candidate") {
    primary = avg60s;
  } else if (avg60s.status === "intermediate") {
    primary = avg60s;
  } else if (avg60s.status === "insufficient-evidence") {
    primary = avg60s;
  } else {
    primary = fieldEstimate({
      value: null,
      source: null,
      status: "unavailable",
      sampleCount: null,
      rounding: null,
      vendorConfirmed: false,
    });
  }

  return {
    primary,
    fields: {
      expiration_value: expiration,
      avg_60s_data: avg60s,
      last_60s_windowed_average_15min: last60s,
    },
    note:
      "Research-only settlement estimates. expiration_value is authoritative post-close when present. "
      + "avg_60s_data may be an empirical-candidate when count=60 and verified 1Hz mean agreement holds; "
      + "it is never vendor-confirmed. last_60s_windowed_average_15min is diagnostic only and is never "
      + "selected as the empirical settlement candidate. Not for trading, strategy gates, or P&L.",
  };
}

/** Helper: does published avg match official under diagnostic half-even 2dp only? */
export function diagnosticHalfEven2MatchesOfficial(
  publishedRaw: string | null,
  officialRaw: string | null,
): boolean {
  if (publishedRaw == null || officialRaw == null) {
    return false;
  }
  return compareMarketDecimals(publishedRaw, officialRaw).diagnosticRound2HalfEvenEqual;
}

export function avg60sIsEmpiricalCandidateAgainstOfficial(input: {
  avg60sDataRaw: string | null;
  avg60sDataCount: number | null;
  expirationValueRaw: string | null;
  avg60sMatchesVerified1HzMean: boolean;
}): boolean {
  if (!input.avg60sMatchesVerified1HzMean) {
    return false;
  }
  if (input.avg60sDataCount !== EXPECTED_SETTLEMENT_SAMPLE_COUNT) {
    return false;
  }
  if (input.avg60sDataRaw == null || input.expirationValueRaw == null) {
    return false;
  }
  // Empirical pattern observed across closes: diagnostic 2dp agreement with official.
  // This does NOT set vendorConfirmed.
  const rounded = roundHalfEven2DecimalString(input.avg60sDataRaw);
  const officialRounded = roundHalfEven2DecimalString(input.expirationValueRaw);
  return rounded != null && officialRounded != null && rounded === officialRounded;
}
