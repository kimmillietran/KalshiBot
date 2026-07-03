import {
  HYPOTHESIS_LIFECYCLE_STAGE_ORDER,
  type BuildHypothesisLifecycleReportInput,
  type HypothesisLifecycleEntry,
  type HypothesisLifecycleReport,
  type HypothesisLifecycleStageState,
  type HypothesisLifecycleStageStatus,
  type HypothesisPipelineStatus,
  type HypothesisPromotionDecision,
  type HypothesisValidationOutcome,
  type ParsedHypothesisLifecycleInputs,
  type ParsedHypothesisCandidate,
  type ParsedHypothesisValidation,
  type ParsedSynthesizedStrategy,
} from "./hypothesisLifecycleTypes";
import { sortHypothesisCandidates } from "./loadHypothesisLifecycleInputs";

const STAGE_LABELS: Record<(typeof HYPOTHESIS_LIFECYCLE_STAGE_ORDER)[number], string> = {
  generated: "Generated",
  evidenceReport: "Evidence Report",
  robustnessValidation: "Robustness Validation",
  strategySynthesized: "Strategy Synthesized",
  backtested: "Backtested",
  promotionDecision: "Promoted / Rejected",
};

function uniqueWarnings(warnings: readonly string[]): string[] {
  return [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))].sort();
}

function resolveValidationOutcome(
  validation: ParsedHypothesisValidation | undefined,
): HypothesisValidationOutcome {
  if (!validation) {
    return "pending";
  }

  return validation.passes ? "passed" : "failed";
}

function resolvePromotionDecision(input: {
  validation: ParsedHypothesisValidation | undefined;
  synthesis: ParsedSynthesizedStrategy | undefined;
}): HypothesisPromotionDecision {
  if (input.synthesis) {
    if (input.synthesis.promotionStatus === "candidate") {
      return "candidate";
    }
    if (input.synthesis.promotionStatus === "rejected") {
      return "rejected";
    }
    return "experimental";
  }

  if (input.validation?.passes) {
    return "pending";
  }

  if (input.validation && !input.validation.passes) {
    return "rejected";
  }

  return "pending";
}

function resolveOverallStatus(input: {
  validationOutcome: HypothesisValidationOutcome;
  promotionDecision: HypothesisPromotionDecision;
  synthesis: ParsedSynthesizedStrategy | undefined;
  backtestCount: number;
  evidencePresent: boolean;
}): HypothesisPipelineStatus {
  if (input.promotionDecision === "rejected") {
    return "rejected";
  }

  if (input.promotionDecision === "candidate" && input.backtestCount > 0) {
    return "promoted";
  }

  if (input.backtestCount > 0) {
    return "backtested";
  }

  if (input.synthesis) {
    return "synthesized";
  }

  if (input.validationOutcome === "passed" || input.validationOutcome === "failed") {
    return "validated";
  }

  if (input.evidencePresent) {
    return "evidence_ready";
  }

  return "generated";
}

function buildStageStates(input: {
  candidate: ParsedHypothesisCandidate;
  candidatesGeneratedAt: string;
  evidenceHtmlPresent: boolean;
  evidenceHtmlModifiedAt: string | null;
  validation: ParsedHypothesisValidation | undefined;
  validationGeneratedAt: string | null;
  synthesis: ParsedSynthesizedStrategy | undefined;
  synthesisGeneratedAt: string | null;
  backtestCount: number;
  harnessCompletedAt: string | null;
  validationOutcome: HypothesisValidationOutcome;
  promotionDecision: HypothesisPromotionDecision;
}): HypothesisLifecycleStageState[] {
  const generatedStatus: HypothesisLifecycleStageStatus = "completed";
  const evidenceStatus: HypothesisLifecycleStageStatus = input.evidenceHtmlPresent
    ? "completed"
    : "missing";
  const validationStatus: HypothesisLifecycleStageStatus = !input.validation
    ? "missing"
    : input.validationOutcome === "failed"
      ? "failed"
      : "completed";
  const synthesisStatus: HypothesisLifecycleStageStatus = !input.synthesis
    ? input.validationOutcome === "failed"
      ? "missing"
      : "missing"
    : "completed";
  const backtestStatus: HypothesisLifecycleStageStatus =
    input.backtestCount > 0
      ? "completed"
      : input.synthesis
        ? "partial"
        : "missing";
  const promotionStatus: HypothesisLifecycleStageStatus =
    input.promotionDecision === "pending"
      ? input.validationOutcome === "failed"
        ? "failed"
        : "partial"
      : input.promotionDecision === "rejected"
        ? "failed"
        : "completed";

  return HYPOTHESIS_LIFECYCLE_STAGE_ORDER.map((stageId) => {
    switch (stageId) {
      case "generated":
        return {
          stageId,
          label: STAGE_LABELS[stageId],
          status: generatedStatus,
          timestamp: input.candidatesGeneratedAt,
          detail: input.candidate.suggestedStrategyFamily,
        };
      case "evidenceReport":
        return {
          stageId,
          label: STAGE_LABELS[stageId],
          status: evidenceStatus,
          timestamp: input.evidenceHtmlModifiedAt,
          detail: input.evidenceHtmlPresent ? "Evidence HTML available" : "Evidence report missing",
        };
      case "robustnessValidation":
        return {
          stageId,
          label: STAGE_LABELS[stageId],
          status: validationStatus,
          timestamp: input.validationGeneratedAt,
          detail: input.validation
            ? `Score ${input.validation.robustnessScore} (${input.validationOutcome})`
            : "Validation not run",
        };
      case "strategySynthesized":
        return {
          stageId,
          label: STAGE_LABELS[stageId],
          status: synthesisStatus,
          timestamp: input.synthesisGeneratedAt,
          detail: input.synthesis
            ? input.synthesis.strategyId
            : "No synthesized strategy",
        };
      case "backtested":
        return {
          stageId,
          label: STAGE_LABELS[stageId],
          status: backtestStatus,
          timestamp: input.harnessCompletedAt,
          detail:
            input.backtestCount > 0
              ? `${input.backtestCount} successful harness run${input.backtestCount === 1 ? "" : "s"}`
              : "Harness backtests pending",
        };
      case "promotionDecision":
        return {
          stageId,
          label: STAGE_LABELS[stageId],
          status: promotionStatus,
          timestamp:
            input.promotionDecision === "pending"
              ? null
              : input.synthesisGeneratedAt ?? input.validationGeneratedAt,
          detail: input.promotionDecision,
        };
      default:
        return {
          stageId,
          label: STAGE_LABELS[stageId],
          status: "missing" as const,
          timestamp: null,
          detail: null,
        };
    }
  });
}

function buildEntry(
  candidate: ParsedHypothesisCandidate,
  inputs: ParsedHypothesisLifecycleInputs,
): HypothesisLifecycleEntry {
  const validation = inputs.validation?.validations.find(
    (entry) => entry.hypothesisId === candidate.candidateId,
  );
  const synthesis = inputs.synthesis?.strategies.find(
    (entry) => entry.hypothesisId === candidate.candidateId,
  );
  const backtestCount =
    inputs.harnessOutputCountByHypothesisId.get(candidate.candidateId) ?? 0;
  const validationOutcome = resolveValidationOutcome(validation);
  const promotionDecision = resolvePromotionDecision({ validation, synthesis });
  const warnings = uniqueWarnings([
    ...candidate.warnings,
    ...(validationOutcome === "failed"
      ? validation?.reasons ?? ["Robustness validation failed."]
      : []),
    ...(synthesis?.riskNotes ?? []),
  ]);

  const timestamps = {
    generatedAt: inputs.candidates?.generatedAt ?? null,
    evidenceReportAt: inputs.evidenceHtmlModifiedAt,
    validationAt: inputs.validation?.generatedAt ?? null,
    synthesisAt: inputs.synthesis?.generatedAt ?? null,
    backtestAt: backtestCount > 0 ? inputs.harnessSummary?.completedAt ?? null : null,
    promotionAt:
      promotionDecision === "pending"
        ? null
        : inputs.synthesis?.generatedAt ?? inputs.validation?.generatedAt ?? null,
  };

  return {
    hypothesisId: candidate.candidateId,
    title: candidate.hypothesis,
    status: resolveOverallStatus({
      validationOutcome,
      promotionDecision,
      synthesis,
      backtestCount,
      evidencePresent: inputs.evidenceHtmlPresent,
    }),
    robustnessScore: validation?.robustnessScore ?? synthesis?.validationSummary.robustnessScore ?? null,
    linkedStrategyId: synthesis?.strategyId ?? null,
    validationOutcome,
    promotionDecision,
    timestamps,
    warnings,
    stages: buildStageStates({
      candidate,
      candidatesGeneratedAt: inputs.candidates?.generatedAt ?? "",
      evidenceHtmlPresent: inputs.evidenceHtmlPresent,
      evidenceHtmlModifiedAt: inputs.evidenceHtmlModifiedAt,
      validation,
      validationGeneratedAt: inputs.validation?.generatedAt ?? null,
      synthesis,
      synthesisGeneratedAt: inputs.synthesis?.generatedAt ?? null,
      backtestCount,
      harnessCompletedAt: inputs.harnessSummary?.completedAt ?? null,
      validationOutcome,
      promotionDecision,
    }),
  };
}

function summarizeEntries(entries: readonly HypothesisLifecycleEntry[]) {
  return {
    totalHypotheses: entries.length,
    promotedCount: entries.filter((entry) => entry.status === "promoted").length,
    rejectedCount: entries.filter((entry) => entry.status === "rejected").length,
    pendingCount: entries.filter((entry) => entry.promotionDecision === "pending").length,
    backtestedCount: entries.filter((entry) => entry.status === "backtested" || entry.status === "promoted").length,
    missingValidationCount: entries.filter((entry) => entry.validationOutcome === "pending").length,
  };
}

/** Builds a deterministic hypothesis lifecycle dashboard report. */
export function buildHypothesisLifecycleReport(
  input: BuildHypothesisLifecycleReportInput,
): HypothesisLifecycleReport {
  const candidates = sortHypothesisCandidates(input.inputs.candidates?.candidates ?? []);
  const entries = candidates.map((candidate) => buildEntry(candidate, input.inputs));

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    inputPaths: input.inputPaths,
    summary: summarizeEntries(entries),
    entries,
  };
}

export function buildHypothesisLifecycleReportFromInputs(
  generatedAt: string,
  outputPath: string,
  inputPaths: BuildHypothesisLifecycleReportInput["inputPaths"],
  inputs: ParsedHypothesisLifecycleInputs,
): HypothesisLifecycleReport {
  return buildHypothesisLifecycleReport({
    generatedAt,
    outputPath,
    inputPaths,
    inputs,
  });
}
