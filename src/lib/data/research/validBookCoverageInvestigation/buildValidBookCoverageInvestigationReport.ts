import { investigateValidBookCoverage } from "./investigateValidBookCoverage";
import {
  DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_HTML_PATH,
  DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_OUTPUT_PATH,
  DEFAULT_VALID_BOOK_COVERAGE_INPUT_PATHS,
  VALID_BOOK_COVERAGE_CAVEATS,
  VALID_BOOK_COVERAGE_DISCLAIMER,
  type ValidBookCoverageInvestigationIo,
  type ValidBookCoverageInvestigationReport,
} from "./validBookCoverageInvestigationTypes";

export function buildValidBookCoverageInvestigationReport(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: typeof DEFAULT_VALID_BOOK_COVERAGE_INPUT_PATHS;
  io: ValidBookCoverageInvestigationIo;
}): ValidBookCoverageInvestigationReport {
  const investigation = investigateValidBookCoverage({
    io: input.io,
    forwardQuotesDir: input.inputPaths.forwardQuotesDir,
  });

  const primaryRun = investigation.runs.find((run) => run.scanned) ?? null;

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    disclaimer: VALID_BOOK_COVERAGE_DISCLAIMER,
    caveats: VALID_BOOK_COVERAGE_CAVEATS,
    inputPaths: input.inputPaths,
    summary: investigation.summary,
    aggregateValidityBreakdown: investigation.aggregateValidityBreakdown,
    aggregateCrossedImpliedAsk: investigation.aggregateCrossedImpliedAsk,
    yesNoPairing: investigation.yesNoPairing,
    throttle: primaryRun?.throttle ?? {
      topOfBookThrottleMs: null,
      recordsNearThrottleIntervalCount: 0,
      invalidShareNearThrottleEmits: null,
      invalidToValidTransitionsCaptured: 0,
      validToInvalidTransitionsCaptured: 0,
      firstEconomicallyValidBriefWindowSuspected: false,
      recommendedCapturePolicyFixes: [],
    },
    invalidSamples: investigation.invalidSamples,
    runs: investigation.runs,
    warnings: investigation.warnings,
  };
}

export {
  DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_HTML_PATH,
  DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_OUTPUT_PATH,
  DEFAULT_VALID_BOOK_COVERAGE_INPUT_PATHS,
};
