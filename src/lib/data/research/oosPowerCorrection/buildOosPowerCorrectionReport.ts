import { stableStringify } from "@/lib/trading/config/hashConfig";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";

import { evaluateOosPowerCandidates, loadOosPowerCorrectionInputs } from "./evaluateOosPowerCandidates";
import type {
  BuildOosPowerCorrectionReportInput,
  OosPowerCorrectionConfig,
  OosPowerCorrectionReport,
  OosPowerCorrectionSummary,
} from "./oosPowerCorrectionTypes";
import {
  DEFAULT_OOS_BLOCK_BOOTSTRAP_ITERATIONS,
  DEFAULT_OOS_BLOCK_BOOTSTRAP_SEED,
  DEFAULT_OOS_CORRECTION_ALPHA,
  DEFAULT_OOS_MIN_EFFECT_CENTS,
  DEFAULT_OOS_TARGET_POWER,
} from "./oosPowerCorrectionTypes";

function defaultConfig(partial?: Partial<OosPowerCorrectionConfig>): OosPowerCorrectionConfig {
  return {
    alpha: partial?.alpha ?? DEFAULT_OOS_CORRECTION_ALPHA,
    targetPower: partial?.targetPower ?? DEFAULT_OOS_TARGET_POWER,
    minEffectCents: partial?.minEffectCents ?? DEFAULT_OOS_MIN_EFFECT_CENTS,
    correctionMethod: partial?.correctionMethod ?? "benjaminiYekutieli",
    blockKey: "market-day",
    officialOnly: partial?.officialOnly ?? false,
    blockBootstrapIterations:
      partial?.blockBootstrapIterations ?? DEFAULT_OOS_BLOCK_BOOTSTRAP_ITERATIONS,
    blockBootstrapSeed: partial?.blockBootstrapSeed ?? DEFAULT_OOS_BLOCK_BOOTSTRAP_SEED,
    explicitSplit: partial?.explicitSplit ?? null,
  };
}

function buildSummary(
  entries: OosPowerCorrectionReport["entries"],
  correctionMethod: OosPowerCorrectionConfig["correctionMethod"],
  blockBootstrapScaffolded: boolean,
): OosPowerCorrectionSummary {
  return {
    candidateCount: entries.length,
    testedCount: entries.filter((entry) => entry.finalStatisticalVerdict !== "skipped").length,
    skippedCount: entries.filter((entry) => entry.finalStatisticalVerdict === "skipped").length,
    passesUncorrectedCount: entries.filter((entry) => entry.passesUncorrected).length,
    passesCorrectedCount: entries.filter((entry) => entry.passesCorrected).length,
    underpoweredCount: entries.filter((entry) => entry.finalStatisticalVerdict === "underpowered").length,
    insufficientDataCount: entries.filter(
      (entry) => entry.finalStatisticalVerdict === "insufficient-data",
    ).length,
    finalPassCount: entries.filter((entry) => entry.finalStatisticalVerdict === "pass").length,
    dependenceWarningCount: entries.filter((entry) => entry.dependenceWarnings.length > 0).length,
    correctionMethod,
    blockBootstrapScaffolded,
  };
}

const LIMITATIONS = [
  "Raw observation counts overstate independent information when markets and days overlap.",
  "Effective sample size is a conservative heuristic (min of raw n, market-day blocks, unique markets).",
  "Holdout inference uses signed calibration-edge probability samples, not M11.6 trade-replay PnL.",
  "Benjamini-Yekutieli is conservative but does not model block dependence explicitly.",
  "Block-bootstrap reality check is scaffolded; BY is the active correction path.",
  "MDE assumes approximate normality of per-observation edge samples in probability units.",
  "This overlay does not regenerate hypotheses; train split is evaluative only.",
  "Holdout verdicts require sufficient holdout-month observations per bucket.",
  "Positive M11.6 in-sample replay does not imply corrected statistical pass here.",
] as const;

/** Builds the OOS power and dependence correction report. */
export function buildOosPowerCorrectionReport(
  input: BuildOosPowerCorrectionReportInput,
): OosPowerCorrectionReport {
  const config = defaultConfig(input.config);
  const loaded = loadOosPowerCorrectionInputs(input.io, input.inputPaths);

  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(
    {
      readFile: input.io.readFile,
      fileExists: input.io.fileExists,
      readdir: input.io.readdir,
      isDirectory: input.io.isDirectory,
    },
    input.inputPaths.regimeTagsPath,
  );

  const evaluated = evaluateOosPowerCandidates({
    candidates: loaded.candidates,
    observations: loaded.observations,
    tradeReplayByHypothesisId: loaded.tradeReplayByHypothesisId,
    regimeVolatilityByMarket,
    config,
  });

  const summary = buildSummary(
    evaluated.entries,
    config.correctionMethod,
    evaluated.blockBootstrapScaffolded,
  );

  const investigatorNotes = [
    "Statistical overlay only — does not modify hypothesis generation or promotion.",
    `Correction method: ${config.correctionMethod}.`,
    `Split mode: ${evaluated.splitSummary.splitMode}.`,
    `Train months: ${evaluated.splitSummary.trainMonths.join(", ") || "none"}.`,
    `Validation months: ${evaluated.splitSummary.validationMonths.join(", ") || "none"}.`,
    `Holdout months: ${evaluated.splitSummary.holdoutMonths.join(", ") || "none"}.`,
  ];

  if (!loaded.inputStatus.hypothesisCandidatesPresent) {
    investigatorNotes.push("hypothesis-candidates.json missing; no candidates evaluated.");
  }

  if (!loaded.inputStatus.hypothesisTradeReplayPresent) {
    investigatorNotes.push("hypothesis-trade-replay.json missing; power uses observation edges only.");
  }

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: loaded.inputStatus,
    config,
    splitSummary: evaluated.splitSummary,
    summary,
    entries: evaluated.entries,
    investigatorNotes,
    limitations: [...LIMITATIONS],
  };
}

export function serializeOosPowerCorrectionReport(report: OosPowerCorrectionReport): string {
  return stableStringify(report);
}
