import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import {
  parseAtlasCandidateReference,
  parseLeadLagCandidateReference,
} from "@/lib/data/research/hypothesisEvidence/parseAtlasCandidateReference";

import {
  DEFAULT_CANDIDATE_PROMOTION_SCORE_THRESHOLD,
} from "./strategySynthesisTypes";
import type {
  ParsedHypothesisValidationEntry,
  StrategyPromotionStatus,
  StrategySynthesisCandidate,
  StrategySynthesisConfig,
  StrategySynthesisDirection,
  StrategySynthesisEntryConditions,
  StrategySynthesisValidationSummary,
} from "./strategySynthesisTypes";

export function buildStrategyId(hypothesisId: string): string {
  const sanitized = hypothesisId
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");

  return `synth-${sanitized}`;
}

export function deriveStrategyDirection(
  candidate: HypothesisCandidate,
): StrategySynthesisDirection {
  if (candidate.suggestedStrategyFamily === "calibration-no-fade") {
    return "fade-yes";
  }

  if (candidate.suggestedStrategyFamily === "calibration-yes-fade") {
    return "fade-no";
  }

  if (candidate.suggestedStrategyFamily === "delayed-reaction") {
    return "buy-yes";
  }

  const atlasRef = parseAtlasCandidateReference(candidate.candidateId);
  if (atlasRef?.direction === "over") {
    return "fade-yes";
  }
  if (atlasRef?.direction === "under") {
    return "fade-no";
  }

  return "buy-yes";
}

export function buildEntryConditions(input: {
  candidate: HypothesisCandidate;
  minCalibrationError: number;
}): StrategySynthesisEntryConditions {
  const atlasRef = parseAtlasCandidateReference(input.candidate.candidateId);
  const leadLagRef = parseLeadLagCandidateReference(input.candidate.candidateId);

  return {
    summary: input.candidate.proposedEntryCondition,
    marketCondition: input.candidate.marketCondition,
    atlasGroupId: atlasRef?.groupId ?? null,
    bucketId: atlasRef?.bucketId ?? null,
    calibrationDirection: atlasRef?.direction ?? null,
    minCalibrationError: atlasRef ? input.minCalibrationError : null,
    leadLagCandles: leadLagRef?.lag ?? null,
  };
}

export function buildValidationSummary(
  validation: ParsedHypothesisValidationEntry | null,
): StrategySynthesisValidationSummary {
  if (!validation) {
    return {
      robustnessScore: null,
      passes: false,
      observationCount: null,
      reasons: ["No validation record found for this hypothesis."],
      summary:
        "Validation is missing; strategy synthesis marked rejected until hypothesis-validation.json includes this hypothesis.",
    };
  }

  const scoreLabel =
    validation.robustnessScore === null
      ? "unsupported"
      : `${validation.robustnessScore}/100`;
  const passLabel = validation.passes ? "passed" : "failed";
  const observationLabel =
    validation.observationCount > 0
      ? ` across ${validation.observationCount} observations`
      : "";

  return {
    robustnessScore: validation.robustnessScore,
    passes: validation.passes,
    observationCount: validation.observationCount,
    reasons: validation.reasons,
    summary: `Robustness score ${scoreLabel}${observationLabel}; validation ${passLabel}.`,
  };
}

export function derivePromotionStatus(input: {
  candidate: HypothesisCandidate;
  validation: ParsedHypothesisValidationEntry | null;
  config: StrategySynthesisConfig;
}): StrategyPromotionStatus {
  if (!input.validation || !input.validation.passes) {
    return "rejected";
  }

  if (
    input.validation.robustnessScore
      >= input.config.candidatePromotionScoreThreshold
    && input.candidate.confidence === "high"
  ) {
    return "candidate";
  }

  return "experimental";
}

export function buildRiskNotes(input: {
  candidate: HypothesisCandidate;
  validation: ParsedHypothesisValidationEntry | null;
}): string[] {
  const notes = [
    input.candidate.expectedFailureMode,
    `Kill criterion: ${input.candidate.killCriterion}`,
    ...input.candidate.warnings,
  ];

  if (input.validation && !input.validation.passes) {
    notes.push(...input.validation.reasons);
  }

  return [...new Set(notes.filter((note) => note.trim().length > 0))];
}

export function synthesizeStrategyCandidate(input: {
  candidate: HypothesisCandidate;
  validation: ParsedHypothesisValidationEntry | null;
  minCalibrationError: number;
  config: StrategySynthesisConfig;
}): StrategySynthesisCandidate {
  const validationSummary = buildValidationSummary(input.validation);

  return {
    strategyId: buildStrategyId(input.candidate.candidateId),
    hypothesisId: input.candidate.candidateId,
    strategyFamily: input.candidate.suggestedStrategyFamily,
    direction: deriveStrategyDirection(input.candidate),
    entryConditions: buildEntryConditions({
      candidate: input.candidate,
      minCalibrationError: input.minCalibrationError,
    }),
    exitAssumption: input.candidate.proposedExitSettlementAssumption,
    requiredData: input.candidate.requiredData,
    riskNotes: buildRiskNotes({
      candidate: input.candidate,
      validation: input.validation,
    }),
    validationSummary,
    promotionStatus: derivePromotionStatus({
      candidate: input.candidate,
      validation: input.validation,
      config: input.config,
    }),
  };
}

export function resolveStrategySynthesisConfig(
  partial?: Partial<StrategySynthesisConfig>,
): StrategySynthesisConfig {
  return {
    candidatePromotionScoreThreshold:
      partial?.candidatePromotionScoreThreshold
      ?? DEFAULT_CANDIDATE_PROMOTION_SCORE_THRESHOLD,
  };
}
