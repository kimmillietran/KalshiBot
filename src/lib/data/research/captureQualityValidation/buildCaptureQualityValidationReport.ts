import {
  createCaptureQualityValidationConfig,
  resolveRecommendedNextAction,
} from "./captureQualityValidationConfig";
import type {
  CaptureQualityValidationIo,
  CaptureQualityValidationReport,
  CaptureQualityValidationSummary,
} from "./captureQualityValidationTypes";
import { CAPTURE_QUALITY_VALIDATION_CAVEATS, CAPTURE_QUALITY_VALIDATION_DISCLAIMER } from "./captureQualityValidationTypes";
import { validateCaptureQuality } from "./validateCaptureQuality";

function buildSummary(runs: ReturnType<typeof validateCaptureQuality>): CaptureQualityValidationSummary {
  const validatedRuns = runs.filter((run) => !run.skipped);
  const latestRun = validatedRuns.at(-1) ?? null;

  return {
    runsScanned: runs.length,
    runsValidated: validatedRuns.length,
    runsSkipped: runs.filter((run) => run.skipped).length,
    legacyFormatRuns: validatedRuns.filter((run) => run.formatClassification === "legacy-format")
      .length,
    economicStateFormatRuns: validatedRuns.filter(
      (run) => run.formatClassification === "economic-state-format",
    ).length,
    mixedFormatRuns: validatedRuns.filter((run) => run.formatClassification === "mixed-format")
      .length,
    healthMismatchRuns: validatedRuns.filter((run) => run.healthMismatches.length > 0).length,
    economicStateMismatchRuns: validatedRuns.filter(
      (run) => run.economicStateMismatches.length > 0,
    ).length,
    latestRunId: latestRun?.runId ?? null,
    latestRunEconomicallyValidShare: latestRun?.economicallyValidShare ?? null,
    latestRunParityUsableRecords: latestRun?.recomputed.parityUsableTopOfBookRecords ?? 0,
    latestRunEnoughForParityResearch: latestRun?.enoughForParityResearch ?? false,
    recommendedNextAction: "pending",
  };
}

/** Builds the full capture quality validation report across all scanned runs. */
export function buildCaptureQualityValidationReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config?: ReturnType<typeof createCaptureQualityValidationConfig>;
  io: CaptureQualityValidationIo;
}): CaptureQualityValidationReport {
  const config = input.config ?? createCaptureQualityValidationConfig();
  const runs = validateCaptureQuality({ config, io: input.io });
  const summary = buildSummary(runs);
  summary.recommendedNextAction = resolveRecommendedNextAction(summary);

  const warnings = [
    ...runs.flatMap((run) => run.warnings.map((warning) => `${run.runId}: ${warning}`)),
  ];

  if (runs.length === 0) {
    warnings.push(`No capture runs found under ${config.forwardQuotesDir}`);
  }

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: CAPTURE_QUALITY_VALIDATION_DISCLAIMER,
    caveats: [...CAPTURE_QUALITY_VALIDATION_CAVEATS],
    config,
    summary,
    runs,
    warnings,
  };
}
