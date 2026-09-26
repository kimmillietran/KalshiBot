import { buildFrozenStudyManifest } from "./manifest";
import {
  buildDayClusterStats,
  computeCr2TwoSidedMeanInference,
  leaveOneDayOutMeans,
  medianOf,
} from "./inference";
import { interpretExploratoryResult } from "./interpret";
import { joinSettlementOutcomes } from "./payoff";
import { selectEarliestEligibleEntries } from "./selectEntries";
import {
  CF_V2_SPENT_GRID_DATASET_PROVENANCE,
  CF_V2_SPENT_GRID_HTS_ANALYSIS_VERSION,
  CF_V2_SPENT_GRID_HTS_DISCLAIMER,
  CF_V2_SPENT_GRID_HTS_STUDY_ID,
  type CfV2SpentGridHtsReport,
  type PreentryFeatureRow,
  type SettlementLabelRow,
} from "./types";

export type RunStudyInput = {
  generatedAtUtc: string;
  codeAuthoritySha: string;
  inputHashesVerified: boolean;
  features: readonly PreentryFeatureRow[];
  labels: readonly SettlementLabelRow[];
  /** When true, exclude Class B uncertain selected entries before outcome join. */
  classBSensitivityExclude?: boolean;
  sealedCalibrationFadeArtifactsPresent?: boolean;
};

export type RunStudyOutput = {
  report: CfV2SpentGridHtsReport;
  evaluableTrades: ReturnType<typeof joinSettlementOutcomes>["evaluable"];
  selectedEntries: ReturnType<typeof selectEarliestEligibleEntries>["selected"];
  classBSensitivity:
    | {
        excludedCount: number;
        n: number;
        g: number;
        meanNetPnlCents: number;
        ci95LowerCents: number | null;
        ci95UpperCents: number | null;
      }
    | null;
};

export function runCalibrationFadeV2SpentGridHtsStudy(
  input: RunStudyInput,
): RunStudyOutput {
  const manifest = buildFrozenStudyManifest({
    codeAuthoritySha: input.codeAuthoritySha,
    generatedAtUtc: input.generatedAtUtc,
    inputHashesVerified: input.inputHashesVerified,
  });

  const selection = selectEarliestEligibleEntries(input.features);
  const selected = input.classBSensitivityExclude
    ? selection.selected.filter((e) => !e.classBReconstructionUncertain)
    : selection.selected;

  const join = joinSettlementOutcomes(selected, input.labels);
  const trades = join.evaluable;

  const n = trades.length;
  const g = new Set(trades.map((t) => t.utcDayKey)).size;
  const meanNet =
    n === 0 ? Number.NaN : trades.reduce((s, t) => s + t.netPnlCents, 0) / n;
  const meanGross =
    n === 0 ? Number.NaN : trades.reduce((s, t) => s + t.grossPnlCents, 0) / n;
  const meanFee =
    n === 0 ? Number.NaN : trades.reduce((s, t) => s + t.entryFeeCents, 0) / n;
  const meanEntry =
    n === 0 ? Number.NaN : trades.reduce((s, t) => s + t.noAskCents, 0) / n;
  const noWins = trades.filter((t) => t.settlementResult === "no").length;

  let inference = null as ReturnType<typeof computeCr2TwoSidedMeanInference> | null;
  if (n >= 2 && g >= 2) {
    try {
      inference = computeCr2TwoSidedMeanInference(trades);
    } catch {
      inference = null;
    }
  }

  const interpretation = interpretExploratoryResult({
    dataIntegrityOk: input.inputHashesVerified,
    dataIntegrityNote: input.inputHashesVerified
      ? undefined
      : "Input SHA-256 verification failed; economic interpretation blocked.",
    n,
    g,
    meanNetPnlCents: meanNet,
    inference,
  });

  // Optional Class B sensitivity (predeclared): recompute if any Class B present
  // and we are not already in exclude mode.
  let classBSensitivity: RunStudyOutput["classBSensitivity"] = null;
  const classBCount = selection.selected.filter((e) => e.classBReconstructionUncertain).length;
  if (!input.classBSensitivityExclude && classBCount > 0) {
    const sens = runCalibrationFadeV2SpentGridHtsStudy({
      ...input,
      classBSensitivityExclude: true,
    });
    classBSensitivity = {
      excludedCount: classBCount,
      n: sens.report.economics.n,
      g: sens.report.economics.g,
      meanNetPnlCents: sens.report.economics.meanNetPnlCents,
      ci95LowerCents: sens.report.economics.inference?.ci95LowerCents ?? null,
      ci95UpperCents: sens.report.economics.inference?.ci95UpperCents ?? null,
    };
  }

  const sizeKnown = selection.selected.filter(
    (e) => e.yesBidSize != null && e.yesBidSize >= 1,
  ).length;

  const report: CfV2SpentGridHtsReport = {
    studyId: CF_V2_SPENT_GRID_HTS_STUDY_ID,
    analysisVersion: CF_V2_SPENT_GRID_HTS_ANALYSIS_VERSION,
    disclaimer: CF_V2_SPENT_GRID_HTS_DISCLAIMER,
    generatedAtUtc: input.generatedAtUtc,
    codeAuthoritySha: input.codeAuthoritySha,
    datasetProvenance: CF_V2_SPENT_GRID_DATASET_PROVENANCE,
    manifest,
    coverage: {
      rowsScanned: selection.rowsScanned,
      eligibleRows: selection.eligibleRows,
      selectedMarkets: selection.selected.length,
      evaluableMarkets: n,
      unevaluableMarkets: join.unevaluable.length,
      exclusionCounts: {
        ...selection.exclusionCounts,
        ...Object.fromEntries(
          Object.entries(join.reasonCounts).map(([k, v]) => [`label:${k}`, v]),
        ),
        ...(input.classBSensitivityExclude
          ? { "class-b-sensitivity-excluded": classBCount }
          : {}),
      },
      selectedWithHalfSpreadMismatch: selection.selected.filter(
        (e) => e.halfSpreadMismatchPresent,
      ).length,
      selectedClassBUncertain: classBCount,
    },
    economics: {
      n,
      g,
      meanNetPnlCents: meanNet,
      medianNetPnlCents: medianOf(trades.map((t) => t.netPnlCents)),
      totalNetPnlCents: trades.reduce((s, t) => s + t.netPnlCents, 0),
      meanGrossPnlCents: meanGross,
      meanFeeCents: meanFee,
      meanEntryPriceCents: meanEntry,
      noSettlementRate: n === 0 ? Number.NaN : noWins / n,
      inference,
      perDay: buildDayClusterStats(trades),
      leaveOneDayOutMeansCents: leaveOneDayOutMeans(trades),
    },
    interpretation,
    executionLimitations: [
      "Simulated P&L at observed displayed noAskCents — not confirmed live fills",
      "Quote-age / exchange-vs-receive freshness not present on preentry-feature rows",
      `${sizeKnown}/${selection.selected.length} selected entries have yesBidSize ≥ 1; `
        + "remaining size evidence missing or <1",
      "Population is the retained 60s friction-admission grid, not continuous quote coverage",
      "Hold-to-settlement charges one STANDARD taker entry fee only (no exit/round-trip fee)",
    ],
    priorEvidenceNotes: [
      input.sealedCalibrationFadeArtifactsPresent
        ? "Sealed calibration-fade-v2 forward-validation artifacts were present in this checkout."
        : "Sealed calibration-fade-v2 forward-validation / atlas artifacts are absent under "
          + "data/research-results/calibration-fade-v2/ in this checkout — cannot verify the "
          + "reported five-market unfavorable calibration-gap result with zero executable "
          + "fee-adjusted evaluations against retained report files here.",
      "Hypothesis config minimumEvidenceRequirements.minimumIndependentCandidateMarkets = 5; "
        + "classificationRules include forward-rejects-hypothesis — design intent only without "
        + "sealed run artifacts.",
      "M16-ER fee-adjusted mean ≈ −4.427¢ (N=461, G=34) is a different strategy family "
        + "(documented in m17-prep-m16p-suspension.md); not this grid variant.",
      "All 34 SPENT days are SPENT_VALIDATION; no pristine subset.",
    ],
    attestation: {
      purchaseOccurred: false,
      subscriptionOccurred: false,
      tradeOrOrderOccurred: false,
      liveCaptureStarted: false,
      continuousCrossingHypothesisModified: false,
      thresholdSweepPerformed: false,
      avg60sUsedAsStrategyFeature: false,
      simulatedPnlAtObservedQuotes: true,
    },
  };

  return {
    report,
    evaluableTrades: trades,
    selectedEntries: selection.selected,
    classBSensitivity,
  };
}
