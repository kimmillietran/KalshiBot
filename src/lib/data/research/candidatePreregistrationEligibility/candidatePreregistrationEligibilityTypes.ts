import {
  DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH,
  type CandidatePromotionDecision,
} from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";

/** Governed promotion-evidence analysis version for M12.7a+. */
export const CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION =
  "m12.7a-candidate-preregistration-eligibility-v1" as const;

export const CANDIDATE_PROMOTION_EVIDENCE_ANALYSIS_VERSION =
  "m12.7a-candidate-promotion-evidence-v1" as const;

export const DEFAULT_PREREGISTRATION_ELIGIBILITY_REPORT_PATH =
  "data/research-results/preregistration-eligibility.json";

export const HYPOTHESIS_CONFIG_ROOT = "config/research/hypotheses";

/** Decisions that authorize governed preregistration when validation also passes. */
export const ACCEPTED_PREREGISTRATION_PROMOTION_DECISIONS = [
  "candidate",
  "production-watchlist",
] as const satisfies readonly CandidatePromotionDecision[];

export type AcceptedPreregistrationPromotionDecision =
  (typeof ACCEPTED_PREREGISTRATION_PROMOTION_DECISIONS)[number];

export type CandidatePreregistrationEligibilityStatus =
  | "eligible"
  | "ineligible"
  | "legacy-frozen-grandfathered";

export type CandidatePreregistrationEligibilityReasonCode =
  | "accepted-promotion-bound"
  | "legacy-frozen-grandfathered"
  | "missing-candidate-artifact"
  | "missing-validation-artifact"
  | "missing-promotion-artifact"
  | "malformed-promotion-artifact"
  | "hypothesis-not-found-in-promotion"
  | "validation-does-not-pass"
  | "promotion-not-accepted"
  | "unknown-promotion-decision"
  | "candidate-artifact-hash-mismatch"
  | "validation-artifact-hash-mismatch"
  | "promotion-evidence-incomplete"
  | "mtime-or-latest-forbidden";

export type CandidatePreregistrationEligibilityResult = {
  analysisVersion: typeof CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION;
  hypothesisId: string;
  status: CandidatePreregistrationEligibilityStatus;
  preregistrationEligible: boolean;
  promotionDecision: CandidatePromotionDecision | null;
  validationPasses: boolean | null;
  promotionAccepted: boolean;
  reasonCode: CandidatePreregistrationEligibilityReasonCode;
  reasons: readonly string[];
  candidateArtifactContentHash: string | null;
  validationArtifactContentHash: string | null;
  promotionArtifactContentHash: string | null;
  boundCandidateDefinitionContentHash: string | null;
  boundValidationEntryContentHash: string | null;
};

export type LegacyGrandfatheredFrozenHypothesis = {
  kind: "legacy-frozen-lineage";
  configPath: string;
  provenancePath: string;
  freezeCommitSha: string;
  hypothesisVersion: "v1" | "v2";
  hypothesisId: string;
};

export type CandidatePreregistrationEligibilityIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir?: (path: string) => readonly string[];
};

export type VerifyPreregistrationEligibilityReport = {
  analysisVersion: typeof CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION;
  generatedAt: string;
  promotionArtifactPath: string;
  hypothesesRoot: string;
  results: readonly CandidatePreregistrationEligibilityResult[];
  summary: {
    total: number;
    eligible: number;
    ineligible: number;
    legacyGrandfathered: number;
  };
};

export const DEFAULT_PROMOTION_ARTIFACT_PATH_FOR_ELIGIBILITY =
  DEFAULT_CANDIDATE_PROMOTIONS_OUTPUT_PATH;

export class CandidatePreregistrationEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CandidatePreregistrationEligibilityError";
  }
}
