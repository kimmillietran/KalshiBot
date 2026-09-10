import { z } from "zod";

import type { CandidatePromotionReport } from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";

import {
  CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
  CandidatePreregistrationEligibilityError,
  type CandidatePreregistrationEligibilityIo,
  type CandidatePreregistrationEligibilityResult,
} from "./candidatePreregistrationEligibilityTypes";
import {
  computePromotionAccepted,
  hashArtifactContent,
  hashCandidateDefinitionContent,
  hashValidationEntryContent,
  isAcceptedPromotionDecision,
  selectPromotionEntryForHypothesis,
} from "./promotionEvidenceIdentity";

const promotionDecisionSchema = z.enum([
  "rejected",
  "exploratory",
  "needs-more-data",
  "candidate",
  "production-watchlist",
]);

const promotionEntrySchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
  decision: promotionDecisionSchema,
  explanation: z.string(),
  supportingMetrics: z.object({
    robustnessScore: z.number().finite().nullable(),
    validationPasses: z.boolean().nullable(),
    observationCount: z.number().finite().nullable(),
    synthesisPromotionStatus: z.string().nullable(),
    harnessMarketRuns: z.number(),
    harnessSuccessfulRuns: z.number(),
    harnessFailedRuns: z.number(),
    totalTradeCount: z.number(),
    netPnlCents: z.number().finite().nullable(),
    singleDayConcentrationPercent: z.number().finite().nullable(),
    singleDayDominated: z.boolean().nullable(),
    statisticallySignificant: z.boolean().nullable(),
    significancePValue: z.number().finite().nullable(),
    warningCount: z.number(),
  }),
  blockingIssues: z.array(z.string()),
  warnings: z.array(z.string()),
  recommendedNextAction: z.string(),
  evidence: z
    .object({
      validationEntryContentHash: z.string().nullable(),
      candidateDefinitionContentHash: z.string().nullable(),
      validationPasses: z.boolean().nullable(),
      promotionAccepted: z.boolean(),
    })
    .optional(),
});

const promotionReportSchema = z.object({
  generatedAt: z.string().trim().min(1),
  outputPath: z.string().trim().min(1),
  htmlOutputPath: z.string().trim().min(1),
  inputPaths: z.record(z.string(), z.string()),
  config: z.record(z.string(), z.unknown()),
  summary: z.record(z.string(), z.unknown()),
  promotions: z.array(promotionEntrySchema),
  evidenceAnalysisVersion: z.string().optional(),
  inputArtifactContentHashes: z
    .object({
      hypothesisValidation: z.string().nullable(),
      strategySynthesis: z.string().nullable(),
      harnessResults: z.string().nullable(),
      statisticalSignificance: z.string().nullable(),
    })
    .optional(),
});

function ineligible(
  partial: Omit<CandidatePreregistrationEligibilityResult, "analysisVersion" | "preregistrationEligible" | "status" | "promotionAccepted"> & {
    promotionAccepted?: boolean;
  },
): CandidatePreregistrationEligibilityResult {
  return {
    analysisVersion: CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
    status: "ineligible",
    preregistrationEligible: false,
    promotionAccepted: partial.promotionAccepted ?? false,
    ...partial,
  };
}

function parsePromotionReport(
  content: string,
): { ok: true; report: CandidatePromotionReport; contentHash: string }
  | { ok: false; reason: string; contentHash: string | null } {
  const contentHash = hashArtifactContent(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, reason: "Promotion artifact is not valid JSON", contentHash };
  }
  const result = promotionReportSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: `Malformed promotion artifact: ${result.error.message}`,
      contentHash,
    };
  }
  return {
    ok: true,
    report: result.data as unknown as CandidatePromotionReport,
    contentHash,
  };
}

/**
 * Fail-closed gate: a hypothesis is preregistration-eligible only when
 * promotion evidence exists, validation passes, promotion is accepted, and
 * artifact content hashes still match the evaluated evidence.
 */
export function evaluateCandidateEligibleForPreregistration(input: {
  hypothesisId: string;
  promotionArtifactContent: string | null;
  candidateArtifactContent: string | null;
  validationArtifactContent: string | null;
  /**
   * Optional explicit semantic hashes to bind against entry.evidence.
   * When omitted, hashes are derived from the provided artifact contents
   * by locating the hypothesis entry (fail closed if not found).
   */
  expectedCandidateDefinitionContentHash?: string | null;
  expectedValidationEntryContentHash?: string | null;
}): CandidatePreregistrationEligibilityResult {
  const hypothesisId = input.hypothesisId.trim();
  if (!hypothesisId) {
    return ineligible({
      hypothesisId: "",
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "promotion-evidence-incomplete",
      reasons: ["hypothesisId is required"],
      candidateArtifactContentHash: null,
      validationArtifactContentHash: null,
      promotionArtifactContentHash: null,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }

  if (input.candidateArtifactContent == null) {
    return ineligible({
      hypothesisId,
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "missing-candidate-artifact",
      reasons: ["Missing candidate/synthesis artifact for preregistration eligibility"],
      candidateArtifactContentHash: null,
      validationArtifactContentHash: null,
      promotionArtifactContentHash: null,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }

  if (input.validationArtifactContent == null) {
    return ineligible({
      hypothesisId,
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "missing-validation-artifact",
      reasons: ["Missing validation artifact for preregistration eligibility"],
      candidateArtifactContentHash: hashArtifactContent(input.candidateArtifactContent),
      validationArtifactContentHash: null,
      promotionArtifactContentHash: null,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }

  if (input.promotionArtifactContent == null) {
    return ineligible({
      hypothesisId,
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "missing-promotion-artifact",
      reasons: ["Missing candidate-promotions artifact for preregistration eligibility"],
      candidateArtifactContentHash: hashArtifactContent(input.candidateArtifactContent),
      validationArtifactContentHash: hashArtifactContent(input.validationArtifactContent),
      promotionArtifactContentHash: null,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }

  const candidateArtifactContentHash = hashArtifactContent(input.candidateArtifactContent);
  const validationArtifactContentHash = hashArtifactContent(input.validationArtifactContent);
  const parsedPromotion = parsePromotionReport(input.promotionArtifactContent);
  if (!parsedPromotion.ok) {
    return ineligible({
      hypothesisId,
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "malformed-promotion-artifact",
      reasons: [parsedPromotion.reason],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }

  const report = parsedPromotion.report;
  if (
    report.outputPath.includes("/latest")
    || report.inputPaths.hypothesisValidationPath?.includes("/latest")
    || report.inputPaths.strategySynthesisPath?.includes("/latest")
  ) {
    return ineligible({
      hypothesisId,
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "mtime-or-latest-forbidden",
      reasons: ["Promotion evidence must not use latest/mtime path aliases"],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }

  // Bind report-level input hashes when present (fail closed on mismatch).
  const reportValidationHash = report.inputArtifactContentHashes?.hypothesisValidation ?? null;
  const reportCandidateHash = report.inputArtifactContentHashes?.strategySynthesis ?? null;
  if (reportValidationHash && reportValidationHash !== validationArtifactContentHash) {
    return ineligible({
      hypothesisId,
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "validation-artifact-hash-mismatch",
      reasons: [
        `Promotion evidence was bound to validation hash ${reportValidationHash}, `
          + `but current validation artifact hashes to ${validationArtifactContentHash}`,
      ],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }
  if (reportCandidateHash && reportCandidateHash !== candidateArtifactContentHash) {
    return ineligible({
      hypothesisId,
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "candidate-artifact-hash-mismatch",
      reasons: [
        `Promotion evidence was bound to candidate/synthesis hash ${reportCandidateHash}, `
          + `but current candidate artifact hashes to ${candidateArtifactContentHash}`,
      ],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }

  const entry = selectPromotionEntryForHypothesis(report, hypothesisId);
  if (!entry) {
    return ineligible({
      hypothesisId,
      promotionDecision: null,
      validationPasses: null,
      reasonCode: "hypothesis-not-found-in-promotion",
      reasons: [`Hypothesis ${hypothesisId} not found in promotion evidence`],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    });
  }

  const validationPasses =
    entry.evidence?.validationPasses ?? entry.supportingMetrics.validationPasses;
  const promotionAccepted = computePromotionAccepted({
    decision: entry.decision,
    validationPasses,
  });

  const boundValidationEntryContentHash =
    entry.evidence?.validationEntryContentHash ?? null;
  const boundCandidateDefinitionContentHash =
    entry.evidence?.candidateDefinitionContentHash ?? null;

  // Derive current entry hashes from artifacts when possible.
  let currentValidationEntryHash: string | null =
    input.expectedValidationEntryContentHash ?? null;
  let currentCandidateDefinitionHash: string | null =
    input.expectedCandidateDefinitionContentHash ?? null;

  try {
    const validationDoc = JSON.parse(input.validationArtifactContent.replace(/^\uFEFF/, "")) as {
      validations?: unknown;
    };
    if (Array.isArray(validationDoc.validations)) {
      const match = validationDoc.validations.find(
        (row) =>
          row
          && typeof row === "object"
          && (row as { hypothesisId?: unknown }).hypothesisId === hypothesisId,
      );
      if (match) {
        currentValidationEntryHash = hashValidationEntryContent(
          match as Parameters<typeof hashValidationEntryContent>[0],
        );
      }
    }
  } catch {
    return ineligible({
      hypothesisId,
      promotionDecision: entry.decision,
      validationPasses,
      promotionAccepted: false,
      reasonCode: "malformed-promotion-artifact",
      reasons: ["Validation artifact is not valid JSON"],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash,
      boundValidationEntryContentHash,
    });
  }

  try {
    const synthesisDoc = JSON.parse(input.candidateArtifactContent.replace(/^\uFEFF/, "")) as {
      strategies?: unknown;
    };
    if (Array.isArray(synthesisDoc.strategies)) {
      const match = synthesisDoc.strategies.find(
        (row) =>
          row
          && typeof row === "object"
          && (row as { hypothesisId?: unknown }).hypothesisId === hypothesisId
          && (row as { strategyId?: unknown }).strategyId === entry.strategyId,
      );
      if (match) {
        currentCandidateDefinitionHash = hashCandidateDefinitionContent(
          match as Parameters<typeof hashCandidateDefinitionContent>[0],
        );
      }
    }
  } catch {
    return ineligible({
      hypothesisId,
      promotionDecision: entry.decision,
      validationPasses,
      promotionAccepted: false,
      reasonCode: "malformed-promotion-artifact",
      reasons: ["Candidate/synthesis artifact is not valid JSON"],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash,
      boundValidationEntryContentHash,
    });
  }

  if (!boundValidationEntryContentHash || !boundCandidateDefinitionContentHash) {
    return ineligible({
      hypothesisId,
      promotionDecision: entry.decision,
      validationPasses,
      promotionAccepted: false,
      reasonCode: "promotion-evidence-incomplete",
      reasons: [
        "Promotion entry is missing bound validation/candidate evidence hashes "
          + "(regenerate candidate-promotions with M12.7a evidence bindings)",
      ],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash,
      boundValidationEntryContentHash,
    });
  }

  if (
    currentValidationEntryHash
    && boundValidationEntryContentHash !== currentValidationEntryHash
  ) {
    return ineligible({
      hypothesisId,
      promotionDecision: entry.decision,
      validationPasses,
      promotionAccepted: false,
      reasonCode: "validation-artifact-hash-mismatch",
      reasons: [
        `Stale promotion: validation entry hash ${boundValidationEntryContentHash} `
          + `does not match current ${currentValidationEntryHash}`,
      ],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash,
      boundValidationEntryContentHash,
    });
  }

  if (
    currentCandidateDefinitionHash
    && boundCandidateDefinitionContentHash !== currentCandidateDefinitionHash
  ) {
    return ineligible({
      hypothesisId,
      promotionDecision: entry.decision,
      validationPasses,
      promotionAccepted: false,
      reasonCode: "candidate-artifact-hash-mismatch",
      reasons: [
        `Stale promotion: candidate definition hash ${boundCandidateDefinitionContentHash} `
          + `does not match current ${currentCandidateDefinitionHash}`,
      ],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash,
      boundValidationEntryContentHash,
    });
  }

  if (validationPasses !== true) {
    return ineligible({
      hypothesisId,
      promotionDecision: entry.decision,
      validationPasses,
      promotionAccepted: false,
      reasonCode: "validation-does-not-pass",
      reasons: ["Hypothesis validation did not pass; preregistration is forbidden"],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash,
      boundValidationEntryContentHash,
    });
  }

  if (!isAcceptedPromotionDecision(entry.decision)) {
    return ineligible({
      hypothesisId,
      promotionDecision: entry.decision,
      validationPasses,
      promotionAccepted: false,
      reasonCode:
        entry.decision === "rejected"
        || entry.decision === "exploratory"
        || entry.decision === "needs-more-data"
          ? "promotion-not-accepted"
          : "unknown-promotion-decision",
      reasons: [
        `Promotion decision ${JSON.stringify(entry.decision)} is not accepted for preregistration`,
      ],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash,
      boundValidationEntryContentHash,
    });
  }

  if (!promotionAccepted || entry.evidence?.promotionAccepted !== true) {
    return ineligible({
      hypothesisId,
      promotionDecision: entry.decision,
      validationPasses,
      promotionAccepted: false,
      reasonCode: "promotion-not-accepted",
      reasons: ["Promotion evidence does not mark this candidate as accepted"],
      candidateArtifactContentHash,
      validationArtifactContentHash,
      promotionArtifactContentHash: parsedPromotion.contentHash,
      boundCandidateDefinitionContentHash,
      boundValidationEntryContentHash,
    });
  }

  return {
    analysisVersion: CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
    hypothesisId,
    status: "eligible",
    preregistrationEligible: true,
    promotionDecision: entry.decision,
    validationPasses: true,
    promotionAccepted: true,
    reasonCode: "accepted-promotion-bound",
    reasons: ["Promotion evidence is accepted and bound to current candidate/validation artifacts"],
    candidateArtifactContentHash,
    validationArtifactContentHash,
    promotionArtifactContentHash: parsedPromotion.contentHash,
    boundCandidateDefinitionContentHash,
    boundValidationEntryContentHash,
  };
}

export function requireCandidateEligibleForPreregistration(input: {
  hypothesisId: string;
  promotionArtifactContent: string | null;
  candidateArtifactContent: string | null;
  validationArtifactContent: string | null;
  expectedCandidateDefinitionContentHash?: string | null;
  expectedValidationEntryContentHash?: string | null;
}): CandidatePreregistrationEligibilityResult {
  const result = evaluateCandidateEligibleForPreregistration(input);
  if (!result.preregistrationEligible) {
    throw new CandidatePreregistrationEligibilityError(
      `Preregistration eligibility failed for ${input.hypothesisId}: `
        + `${result.reasonCode} — ${result.reasons.join("; ")}`,
    );
  }
  return result;
}

export function loadArtifactContentOrNull(
  io: CandidatePreregistrationEligibilityIo,
  path: string | null | undefined,
): string | null {
  if (!path) {
    return null;
  }
  if (!io.fileExists(path)) {
    return null;
  }
  return io.readFile(path);
}
