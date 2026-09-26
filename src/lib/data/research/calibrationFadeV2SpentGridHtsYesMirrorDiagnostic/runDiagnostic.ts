import {
  buildDayClusterStats,
  computeCr2TwoSidedMeanInference,
  leaveOneDayOutMeans,
  medianOf,
} from "../calibrationFadeV2SpentGridHtsExploratory/inference";
import { computeEntryTakerFeeCents } from "../calibrationFadeV2SpentGridHtsExploratory/payoff";
import type { EvaluableTrade } from "../calibrationFadeV2SpentGridHtsExploratory/types";

import {
  classifyYesAskSize,
  computeYesHoldToSettlementPnl,
  pairedSideIdentityResidualCents,
  verifyNoSideTradeConsistent,
} from "./payoff";
import {
  CF_V2_NO_GRID_EXPECTED,
  CF_V2_NO_GRID_STUDY_ID,
  CF_V2_YES_MIRROR_DIAGNOSTIC_ANALYSIS_VERSION,
  CF_V2_YES_MIRROR_DIAGNOSTIC_DISCLAIMER,
  CF_V2_YES_MIRROR_DIAGNOSTIC_STUDY_ID,
  type NoSideTradeRow,
  type PairedMirrorRow,
  type YesMirrorDiagnosticReport,
  type YesMirrorUnevaluableReason,
} from "./types";

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function toEvaluableTradeShape(row: PairedMirrorRow): EvaluableTrade {
  return {
    marketTicker: row.marketTicker,
    utcDayKey: row.utcDayKey,
    entryTimestampMs: row.entryTimestampMs,
    closeTimeMs: null,
    timeRemainingMs: 0,
    yesBidCents: row.yesBidCents,
    yesAskCents: row.yesAskCents,
    yesMidpoint: (row.yesBidCents + row.yesAskCents) / 2 / 100,
    noAskCents: row.noAskCents,
    yesBidSize: row.yesBidSize,
    yesAskSize: row.yesAskSize,
    annualizedRealizedVolatility: null,
    halfSpreadMismatchPresent: false,
    classBReconstructionUncertain: false,
    retainedEntryHalfSpreadCents: null,
    settlementResult: row.settlementResult,
    entryFeeCents: row.yesFeeCents,
    grossPnlCents: row.yesGrossPnlCents,
    netPnlCents: row.yesNetPnlCents,
    labelCloseTime: null,
    labelSettlementTs: null,
  };
}

export function interpretYesMirrorDiagnostic(input: {
  dataOk: boolean;
  dataNote?: string;
  n: number;
  g: number;
  meanNetPnlCents: number;
  ci95LowerCents: number | null;
  ci95UpperCents: number | null;
}): { status: string; rationale: string; meritsFreshPeriodTestDesign: boolean } {
  if (!input.dataOk) {
    return {
      status: "insufficient-evidence-or-data-limitation",
      rationale: input.dataNote ?? "Data integrity / cohort verification failed.",
      meritsFreshPeriodTestDesign: false,
    };
  }
  if (input.n < 50 || input.g < 10) {
    return {
      status: "insufficient-evidence-or-data-limitation",
      rationale:
        `N=${input.n}, G=${input.g}: inadequate incidence for interpretation `
        + "(distinct from evidence of negative economics).",
      meritsFreshPeriodTestDesign: false,
    };
  }
  if (
    input.ci95UpperCents != null
    && Number.isFinite(input.ci95UpperCents)
    && input.ci95UpperCents <= 0
  ) {
    return {
      status: "no-support-for-pursuing-yes-mirror",
      rationale:
        `CI upper bound ${input.ci95UpperCents.toFixed(4)}¢ ≤ 0. Nonpositive economics `
        + "under CR2 assumptions — no support for pursuing this YES mirror. "
        + "CIs do not remove outcome-informed selection bias.",
      meritsFreshPeriodTestDesign: false,
    };
  }
  if (input.meanNetPnlCents <= 0) {
    return {
      status: "no-support-for-pursuing-yes-mirror",
      rationale:
        `Mean YES net ${input.meanNetPnlCents.toFixed(4)}¢ ≤ 0. Nonpositive economics — `
        + "no support for pursuing this YES mirror"
        + (input.ci95LowerCents != null
          && input.ci95UpperCents != null
          && input.ci95LowerCents < 0
          && input.ci95UpperCents > 0
          ? " (CI spans zero; uncertainty retained)."
          : "."),
      meritsFreshPeriodTestDesign: false,
    };
  }
  if (
    input.meanNetPnlCents >= 1
    && input.g >= 15
    && input.ci95LowerCents != null
    && input.ci95LowerCents > 0
  ) {
    return {
      status: "exploratory-promise-only",
      rationale:
        `Mean ${input.meanNetPnlCents.toFixed(4)}¢ ≥ +1¢, G≥15, CI lower > 0. `
        + "Exploratory promise only — subject to execution limitations and "
        + "outcome-informed selection; not confirmation.",
      meritsFreshPeriodTestDesign: true,
    };
  }
  return {
    status: "inconclusive-or-below-material-bar",
    rationale:
      input.meanNetPnlCents >= 1
        ? `Positive mean ${input.meanNetPnlCents.toFixed(4)}¢ meets the +1¢ screening `
          + "level but remains uncertain (CR2 CI does not clear zero and/or G/CI "
          + "conditions fail). Inconclusive — not exploratory promise."
        : `Positive mean ${input.meanNetPnlCents.toFixed(4)}¢ but below the +1¢ `
          + "material exploratory bar and/or CI unavailable.",
    meritsFreshPeriodTestDesign: false,
  };
}

export type RunYesMirrorDiagnosticInput = {
  generatedAtUtc: string;
  codeAuthoritySha: string;
  selectedEntriesSha256: string;
  perMarketTradesSha256: string;
  noTrades: readonly NoSideTradeRow[];
};

export type RunYesMirrorDiagnosticOutput = {
  report: YesMirrorDiagnosticReport;
  pairedRows: PairedMirrorRow[];
};

export function runYesMirrorDiagnostic(
  input: RunYesMirrorDiagnosticInput,
): RunYesMirrorDiagnosticOutput {
  const hashesVerified =
    input.selectedEntriesSha256 === CF_V2_NO_GRID_EXPECTED.selectedEntriesSha256
    && input.perMarketTradesSha256 === CF_V2_NO_GRID_EXPECTED.perMarketTradesSha256;

  const reproducedNoMean =
    input.noTrades.length === 0
      ? Number.NaN
      : input.noTrades.reduce((s, t) => s + t.netPnlCents, 0) / input.noTrades.length;

  const noMeanMatches =
    input.noTrades.length === CF_V2_NO_GRID_EXPECTED.nMarkets
    && Math.abs(reproducedNoMean - CF_V2_NO_GRID_EXPECTED.meanNetPnlCents) < 1e-12;

  const unevaluableReasons: Record<string, number> = {};
  const paired: PairedMirrorRow[] = [];

  for (const trade of input.noTrades) {
    if (!verifyNoSideTradeConsistent(trade)) {
      bump(unevaluableReasons, "no-side-inconsistent-with-fee-payoff" satisfies string);
      continue;
    }
    if (
      typeof trade.yesAskCents !== "number"
      || !Number.isFinite(trade.yesAskCents)
    ) {
      bump(unevaluableReasons, "missing-yes-ask" satisfies YesMirrorUnevaluableReason);
      continue;
    }
    if (
      !Number.isInteger(trade.yesAskCents)
      || trade.yesAskCents <= 0
      || trade.yesAskCents >= 100
    ) {
      bump(unevaluableReasons, "invalid-yes-ask" satisfies YesMirrorUnevaluableReason);
      continue;
    }
    if (trade.noAskCents !== 100 - trade.yesBidCents) {
      bump(
        unevaluableReasons,
        "no-ask-complement-mismatch" satisfies YesMirrorUnevaluableReason,
      );
      continue;
    }
    if (trade.settlementResult !== "yes" && trade.settlementResult !== "no") {
      bump(unevaluableReasons, "missing-settlement" satisfies YesMirrorUnevaluableReason);
      continue;
    }

    const yesFeeCents = computeEntryTakerFeeCents(trade.yesAskCents);
    const yesPnl = computeYesHoldToSettlementPnl({
      yesAskCents: trade.yesAskCents,
      settlementResult: trade.settlementResult,
      entryFeeCents: yesFeeCents,
    });
    const residual = pairedSideIdentityResidualCents({
      yesBidCents: trade.yesBidCents,
      yesAskCents: trade.yesAskCents,
      noAskCents: trade.noAskCents,
      yesFeeCents,
      noFeeCents: trade.entryFeeCents,
      yesNetPnlCents: yesPnl.netPnlCents,
      noNetPnlCents: trade.netPnlCents,
    });
    const identityHolds = Number.isFinite(residual) && Math.abs(residual) < 1e-12;
    if (!identityHolds) {
      bump(unevaluableReasons, "identity-violation" satisfies YesMirrorUnevaluableReason);
      // Still record for investigation? User said investigate mismatches, do not silently
      // tolerate — exclude from paired economics but count.
      continue;
    }

    paired.push({
      marketTicker: trade.marketTicker,
      utcDayKey: trade.utcDayKey,
      entryTimestampMs: trade.entryTimestampMs,
      settlementResult: trade.settlementResult,
      yesBidCents: trade.yesBidCents,
      yesAskCents: trade.yesAskCents,
      noAskCents: trade.noAskCents,
      yesSpreadCents: trade.yesAskCents - trade.yesBidCents,
      yesAskSize: trade.yesAskSize,
      yesBidSize: trade.yesBidSize,
      yesAskSizeStatus: classifyYesAskSize(trade.yesAskSize),
      yesFeeCents,
      noFeeCents: trade.entryFeeCents,
      yesGrossPnlCents: yesPnl.grossPnlCents,
      yesNetPnlCents: yesPnl.netPnlCents,
      noGrossPnlCents: trade.grossPnlCents,
      noNetPnlCents: trade.netPnlCents,
      identityResidualCents: residual,
      identityHolds: true,
    });
  }

  const n = paired.length;
  const g = new Set(paired.map((r) => r.utcDayKey)).size;
  const meanYes =
    n === 0 ? Number.NaN : paired.reduce((s, r) => s + r.yesNetPnlCents, 0) / n;
  const meanNo =
    n === 0 ? Number.NaN : paired.reduce((s, r) => s + r.noNetPnlCents, 0) / n;
  const meanSpread =
    n === 0 ? Number.NaN : paired.reduce((s, r) => s + r.yesSpreadCents, 0) / n;
  const meanYesFee =
    n === 0 ? Number.NaN : paired.reduce((s, r) => s + r.yesFeeCents, 0) / n;
  const meanNoFee =
    n === 0 ? Number.NaN : paired.reduce((s, r) => s + r.noFeeCents, 0) / n;
  // Identity: E[yes] = -E[spread] - E[yesFee] - E[noFee] - E[no]
  const meanYesFromIdentity = -meanSpread - meanYesFee - meanNoFee - meanNo;

  const yesWins = paired.filter((r) => r.settlementResult === "yes").length;
  const evalTrades = paired.map(toEvaluableTradeShape);

  let inference = null as ReturnType<typeof computeCr2TwoSidedMeanInference> | null;
  if (n >= 2 && g >= 2) {
    try {
      inference = computeCr2TwoSidedMeanInference(evalTrades);
    } catch {
      inference = null;
    }
  }

  const liqGe1 = paired.filter((r) => r.yesAskSizeStatus === "ok-ge-1");
  let sensitivity = null as YesMirrorDiagnosticReport["liquidity"]["sensitivityAskSizeGe1"];
  if (liqGe1.length >= 2 && new Set(liqGe1.map((r) => r.utcDayKey)).size >= 2) {
    try {
      const sensInf = computeCr2TwoSidedMeanInference(liqGe1.map(toEvaluableTradeShape));
      sensitivity = {
        n: liqGe1.length,
        g: sensInf.g,
        meanNetPnlCents: sensInf.sampleMeanCents,
        ci95LowerCents: sensInf.ci95LowerCents,
        ci95UpperCents: sensInf.ci95UpperCents,
      };
    } catch {
      sensitivity = {
        n: liqGe1.length,
        g: new Set(liqGe1.map((r) => r.utcDayKey)).size,
        meanNetPnlCents:
          liqGe1.reduce((s, r) => s + r.yesNetPnlCents, 0) / liqGe1.length,
        ci95LowerCents: null,
        ci95UpperCents: null,
      };
    }
  } else if (liqGe1.length > 0) {
    sensitivity = {
      n: liqGe1.length,
      g: new Set(liqGe1.map((r) => r.utcDayKey)).size,
      meanNetPnlCents:
        liqGe1.reduce((s, r) => s + r.yesNetPnlCents, 0) / liqGe1.length,
      ci95LowerCents: null,
      ci95UpperCents: null,
    };
  }

  const dataOk = hashesVerified && noMeanMatches && n > 0;
  const interpretation = interpretYesMirrorDiagnostic({
    dataOk,
    dataNote: !hashesVerified
      ? "Source cohort artifact hashes do not match PR #134 recorded digests."
      : !noMeanMatches
        ? "Reproduced NO mean / N does not match PR #134 recorded precision."
        : n === 0
          ? "No paired evaluable rows."
          : undefined,
    n,
    g,
    meanNetPnlCents: meanYes,
    ci95LowerCents: inference?.ci95LowerCents ?? null,
    ci95UpperCents: inference?.ci95UpperCents ?? null,
  });

  const report: YesMirrorDiagnosticReport = {
    studyId: CF_V2_YES_MIRROR_DIAGNOSTIC_STUDY_ID,
    analysisVersion: CF_V2_YES_MIRROR_DIAGNOSTIC_ANALYSIS_VERSION,
    disclaimer: CF_V2_YES_MIRROR_DIAGNOSTIC_DISCLAIMER,
    generatedAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    priorExposure: {
      noGridStudyId: CF_V2_NO_GRID_STUDY_ID,
      noGridResultSummary:
        "PR #134: N=321, G=24, mean net −8.6417¢, CR2 95% CI [−12.2485, −5.0350]¢, "
        + "status evidence-against-positive-mean (buy NO grid HTS).",
      yesMirrorSelectedAfterObservingNoResult: true,
      isIndependentMechanismTest: false,
      isPreOutcomePreregistration: false,
      attemptedHistory: [
        "no-grid-hts-exploratory-v0 (PR #134)",
        "yes-mirror-diagnostic-v0 (this study; selected after observing #134)",
      ],
    },
    cohort: {
      sourceSelectedEntriesSha256: input.selectedEntriesSha256,
      sourcePerMarketTradesSha256: input.perMarketTradesSha256,
      hashesVerified,
      originalN: input.noTrades.length,
      originalG: new Set(input.noTrades.map((t) => t.utcDayKey)).size,
      reproducedNoMeanNetPnlCents: reproducedNoMean,
      noMeanMatchesRecordedPrecision: noMeanMatches,
      pairedN: n,
      pairedG: g,
      unevaluableCount: input.noTrades.length - n,
      unevaluableReasons,
      cohortDiffersFromOriginal321: n !== CF_V2_NO_GRID_EXPECTED.nMarkets,
    },
    accounting: {
      identityFormula:
        "yesNetPnl + noNetPnl = -(yesAskCents - yesBidCents) - yesFeeCents - noFeeCents",
      identityHoldsForAllPairedRows:
        paired.every((r) => r.identityHolds)
        && (unevaluableReasons["identity-violation"] ?? 0) === 0,
      identityViolationCount: unevaluableReasons["identity-violation"] ?? 0,
      meanNoNetPnlCents: meanNo,
      meanYesSpreadCents: meanSpread,
      meanYesFeeCents: meanYesFee,
      meanNoFeeCents: meanNoFee,
      meanYesNetFromIdentityCents: meanYesFromIdentity,
      meanYesNetDirectCents: meanYes,
      identityDerivedVsDirectResidualCents: meanYesFromIdentity - meanYes,
    },
    economics: {
      n,
      g,
      meanNetPnlCents: meanYes,
      medianNetPnlCents: medianOf(paired.map((r) => r.yesNetPnlCents)),
      totalNetPnlCents: paired.reduce((s, r) => s + r.yesNetPnlCents, 0),
      meanGrossPnlCents:
        n === 0 ? Number.NaN : paired.reduce((s, r) => s + r.yesGrossPnlCents, 0) / n,
      meanEntryPriceCents:
        n === 0 ? Number.NaN : paired.reduce((s, r) => s + r.yesAskCents, 0) / n,
      yesSettlementRate: n === 0 ? Number.NaN : yesWins / n,
      inference,
      perDay: buildDayClusterStats(evalTrades),
      leaveOneDayOutMeansCents: leaveOneDayOutMeans(evalTrades),
    },
    liquidity: {
      yesAskSizeGe1: paired.filter((r) => r.yesAskSizeStatus === "ok-ge-1").length,
      yesAskSizeKnownInsufficient: paired.filter(
        (r) => r.yesAskSizeStatus === "known-insufficient",
      ).length,
      yesAskSizeMissing: paired.filter((r) => r.yesAskSizeStatus === "missing").length,
      note:
        "YES purchases require YES ASK size. Original 315/321 yesBidSize≥1 check is NOT "
        + "evidence of YES-ask fillability. Quote-age / exchange-vs-receive latency are "
        + "not present on the #134 trade artifacts.",
      sensitivityAskSizeGe1: sensitivity,
    },
    interpretation,
    executionLimitations: [
      "Simulated P&L at observed yesAskCents — not verified live fills",
      "Quote-age / source-vs-receipt timestamps unavailable on #134 cohort artifacts",
      "Cohort frozen from #134; no reselection of later timestamps for liquidity",
      "Outcome-informed selection after observing NO-grid failure",
      "M17 settlement-state remains paused; avg_60s_data not used",
    ],
    attestation: {
      purchaseOccurred: false,
      subscriptionOccurred: false,
      tradeOrOrderOccurred: false,
      liveCaptureStarted: false,
      originalNoOutputsModified: false,
      simulatedPnlAtObservedQuotes: true,
      thresholdSweepPerformed: false,
      favorite085ExperimentRun: false,
      continuousCrossingRun: false,
    },
  };

  return { report, pairedRows: paired };
}
