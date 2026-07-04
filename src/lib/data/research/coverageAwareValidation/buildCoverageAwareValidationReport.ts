import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  buildCoverageAwareEntry,
  resolveCoverageThresholds,
} from "./classifyCoverageAwareValidation";
import type {
  BuildCoverageAwareValidationReportInput,
  CoverageAwareValidationEntry,
  CoverageAwareValidationIo,
  CoverageAwareValidationReport,
  CoverageAwareValidationSummary,
  ParsedCoverageAwareValidationInputs,
} from "./coverageAwareValidationTypes";

function buildSummary(entries: readonly CoverageAwareValidationEntry[]): CoverageAwareValidationSummary {
  return {
    totalHypotheses: entries.length,
    rejectedCount: entries.filter((entry) => entry.classification === "rejected").length,
    inconclusiveInsufficientCoverageCount: entries.filter(
      (entry) => entry.classification === "inconclusive-insufficient-coverage",
    ).length,
    inconclusiveRegimeSparseCount: entries.filter(
      (entry) => entry.classification === "inconclusive-regime-sparse",
    ).length,
    promisingNeedsMoreHistoryCount: entries.filter(
      (entry) => entry.classification === "promising-needs-more-history",
    ).length,
    robustEnoughToTestCount: entries.filter(
      (entry) => entry.classification === "robust-enough-to-test",
    ).length,
  };
}

/** Builds advisory coverage-aware validation diagnostics for each hypothesis. */
export function buildCoverageAwareValidationReport(
  input: BuildCoverageAwareValidationReportInput,
): CoverageAwareValidationReport {
  const thresholds = resolveCoverageThresholds(input.coveragePlan);
  const crossValidationByHypothesisId = new Map(
    input.crossValidationEntries
      .filter((entry) => entry.targetType === "hypothesis")
      .map((entry) => [entry.targetId, entry]),
  );
  const validationByHypothesisId = new Map(
    input.validations.map((validation) => [validation.hypothesisId, validation]),
  );
  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );

  const hypothesisIds = [...new Set([
    ...input.validations.map((validation) => validation.hypothesisId),
    ...input.candidates.map((candidate) => candidate.candidateId),
  ])].sort();

  const entries: CoverageAwareValidationEntry[] = hypothesisIds.map((hypothesisId) => {
    const validation = validationByHypothesisId.get(hypothesisId);
    const candidate = candidateById.get(hypothesisId);
    const crossValidation = crossValidationByHypothesisId.get(hypothesisId) ?? null;

    if (!validation) {
      return {
        hypothesisId,
        hypothesis: candidate?.hypothesis ?? hypothesisId,
        sourceArtifact: candidate?.sourceArtifact ?? "unknown",
        classification: "inconclusive-insufficient-coverage",
        metrics: {
          observationCount: 0,
          uniqueTradingDays: 0,
          monthCount: 0,
          regimeCoverage: {
            regimesWithData: 0,
            regimesWithEdge: 0,
            sparseRegimes: ["low", "medium", "high"],
          },
          robustnessScore: 0,
          largestDayPercent: 0,
          singleDayDominated: false,
          crossValidationPasses: crossValidation?.overallPasses ?? null,
        },
        missingCoverageExplanation:
          "No hypothesis-validation record found; coverage cannot be judged.",
        recommendedImportWindows: input.coveragePlan?.recommendedImportWindows ?? [],
        advisoryNotes: [
          "Advisory classification only; hypothesis-validation scores and promotion logic are unchanged.",
          "Run hypothesis validation after expanding historical imports.",
        ],
      };
    }

    const classified = buildCoverageAwareEntry({
      validation,
      crossValidation,
      thresholds,
      coveragePlan: input.coveragePlan,
    });

    return {
      hypothesisId,
      hypothesis: validation.hypothesis,
      sourceArtifact: validation.sourceArtifact,
      classification: classified.classification,
      metrics: classified.metrics,
      missingCoverageExplanation: classified.missingCoverageExplanation,
      recommendedImportWindows: classified.recommendedImportWindows,
      advisoryNotes: classified.advisoryNotes,
    };
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    thresholds,
    summary: buildSummary(entries),
    entries,
  };
}

export function serializeCoverageAwareValidationReport(
  report: CoverageAwareValidationReport,
): string {
  return stableStringify(report);
}

export function buildCoverageAwareValidationReportFromInputs(input: {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: BuildCoverageAwareValidationReportInput["inputPaths"];
  io: CoverageAwareValidationIo;
  parsedInputs: ParsedCoverageAwareValidationInputs;
}): CoverageAwareValidationReport {
  return buildCoverageAwareValidationReport({
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    candidates: input.parsedInputs.candidates,
    validations: input.parsedInputs.validations,
    crossValidationEntries: input.parsedInputs.crossValidationEntries,
    coveragePlan: input.parsedInputs.coveragePlan,
  });
}
