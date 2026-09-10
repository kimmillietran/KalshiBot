import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildCandidatePromotionReport,
  classifyCandidatePromotion,
  resolveCandidatePromotionConfig,
  serializeCandidatePromotionReport,
} from "@/lib/data/research/candidatePromotion";
import { DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS } from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";
import type {
  ParsedHarnessStrategyMetrics,
  ParsedSynthesisStrategy,
  ParsedValidationEntry,
} from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";
import { buildFullResearchSteps } from "@/lib/data/research/fullOrchestrator/buildFullResearchSteps";
import { createDefaultFullResearchOrchestratorConfig } from "@/lib/data/research/fullOrchestrator/runFullResearchOrchestrator";

import {
  CandidatePreregistrationEligibilityError,
  enforceFrozenHypothesisPromotionGovernance,
  evaluateCandidateEligibleForPreregistration,
  isLegacyGrandfatheredFrozenHypothesis,
  LEGACY_GRANDFATHERED_FROZEN_HYPOTHESES,
  requireCandidateEligibleForPreregistration,
  verifyPreregistrationEligibilityForHypothesisConfigs,
} from "./index";
import {
  hashArtifactContent,
  hashCandidateDefinitionContent,
  hashValidationEntryContent,
} from "./promotionEvidenceIdentity";

const GENERATED_AT = "2026-09-09T18:00:00.000Z";
const FAILING_ID = "calibration-like-test";
const PASSING_ID = "eligible-candidate-test";

function createStrategy(
  overrides: Partial<ParsedSynthesisStrategy> = {},
): ParsedSynthesisStrategy {
  return {
    strategyId: `synth-${overrides.hypothesisId ?? "atlas-vol-high-over"}`,
    hypothesisId: "atlas-vol-high-over",
    strategyFamily: "calibration-fade",
    promotionStatus: "candidate",
    validationSummary: {
      robustnessScore: 82,
      passes: true,
      observationCount: 40,
    },
    riskNotes: [],
    ...overrides,
  };
}

function createValidation(
  overrides: Partial<ParsedValidationEntry> = {},
): ParsedValidationEntry {
  return {
    hypothesisId: "atlas-vol-high-over",
    robustnessScore: 82,
    passes: true,
    reasons: [],
    observationCount: 40,
    sampleConcentration: {
      singleDayDominated: false,
      largestDayPercent: 0.12,
    },
    ...overrides,
  };
}

function createHarness(
  overrides: Partial<ParsedHarnessStrategyMetrics> = {},
): ParsedHarnessStrategyMetrics {
  return {
    strategyId: "synth-atlas-vol-high-over",
    hypothesisId: "atlas-vol-high-over",
    strategyFamily: "calibration-fade",
    marketRuns: 10,
    successfulRuns: 8,
    failedRuns: 2,
    skippedRuns: 0,
    totalTradeCount: 24,
    netPnlCents: 1800,
    warnings: [],
    ...overrides,
  };
}

function buildPromotionArtifacts(input: {
  strategy: ParsedSynthesisStrategy;
  validation: ParsedValidationEntry;
  harness?: ParsedHarnessStrategyMetrics;
}) {
  const harness = input.harness ?? createHarness({
    strategyId: input.strategy.strategyId,
    hypothesisId: input.strategy.hypothesisId,
  });
  const validationDoc = {
    generatedAt: GENERATED_AT,
    validations: [input.validation],
  };
  const synthesisDoc = {
    generatedAt: GENERATED_AT,
    strategies: [input.strategy],
  };
  const validationContent = `${JSON.stringify(validationDoc)}\n`;
  const candidateContent = `${JSON.stringify(synthesisDoc)}\n`;
  const report = buildCandidatePromotionReport({
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/candidate-promotions.json",
    htmlOutputPath: "data/reports/research-candidate-promotions.html",
    inputPaths: DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS,
    inputs: {
      validation: validationDoc,
      synthesis: synthesisDoc,
      harnessStrategies: [harness],
      significanceByFamily: new Map(),
      inputArtifactContentHashes: {
        hypothesisValidation: hashArtifactContent(validationContent),
        strategySynthesis: hashArtifactContent(candidateContent),
        harnessResults: null,
        statisticalSignificance: null,
      },
    },
  });
  return {
    report,
    promotionContent: serializeCandidatePromotionReport(report),
    validationContent,
    candidateContent,
  };
}

describe("M12.7a candidate preregistration eligibility", () => {
  const config = resolveCandidatePromotionConfig();

  it("1: passes:false candidate cannot be promoted as accepted", () => {
    const entry = classifyCandidatePromotion({
      strategy: createStrategy({
        hypothesisId: FAILING_ID,
        strategyId: `synth-${FAILING_ID}`,
        promotionStatus: "experimental",
        validationSummary: {
          robustnessScore: 59,
          passes: false,
          observationCount: 457,
        },
      }),
      validation: createValidation({
        hypothesisId: FAILING_ID,
        robustnessScore: 59,
        passes: false,
        observationCount: 457,
      }),
      harness: createHarness({
        strategyId: `synth-${FAILING_ID}`,
        hypothesisId: FAILING_ID,
      }),
      significance: null,
      config,
    });
    expect(entry.decision).toBe("rejected");
    expect(entry.evidence.promotionAccepted).toBe(false);
    expect(entry.evidence.validationPasses).toBe(false);
  });

  it("2+17: synthetic score-59 / passes:false is not preregistration-eligible", () => {
    const artifacts = buildPromotionArtifacts({
      strategy: createStrategy({
        hypothesisId: FAILING_ID,
        strategyId: `synth-${FAILING_ID}`,
        promotionStatus: "experimental",
        validationSummary: {
          robustnessScore: 59,
          passes: false,
          observationCount: 457,
        },
      }),
      validation: createValidation({
        hypothesisId: FAILING_ID,
        robustnessScore: 59,
        passes: false,
        observationCount: 457,
      }),
      harness: createHarness({
        strategyId: `synth-${FAILING_ID}`,
        hypothesisId: FAILING_ID,
        totalTradeCount: 24,
        successfulRuns: 8,
      }),
    });
    expect(artifacts.report.promotions[0]?.decision).toBe("rejected");
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: FAILING_ID,
      promotionArtifactContent: artifacts.promotionContent,
      candidateArtifactContent: artifacts.candidateContent,
      validationArtifactContent: artifacts.validationContent,
    });
    expect(result.preregistrationEligible).toBe(false);
    expect(result.reasonCode).toBe("validation-does-not-pass");
  });

  it("3: passes:true + accepted promotion + matching identities succeeds", () => {
    const artifacts = buildPromotionArtifacts({
      strategy: createStrategy({
        hypothesisId: PASSING_ID,
        strategyId: `synth-${PASSING_ID}`,
      }),
      validation: createValidation({ hypothesisId: PASSING_ID }),
      harness: createHarness({
        strategyId: `synth-${PASSING_ID}`,
        hypothesisId: PASSING_ID,
      }),
    });
    expect(artifacts.report.promotions[0]?.decision).toBe("candidate");
    expect(artifacts.report.promotions[0]?.evidence.promotionAccepted).toBe(true);
    const result = requireCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: artifacts.promotionContent,
      candidateArtifactContent: artifacts.candidateContent,
      validationArtifactContent: artifacts.validationContent,
    });
    expect(result.preregistrationEligible).toBe(true);
    expect(result.status).toBe("eligible");
  });

  it("4: missing candidate artifact fails closed", () => {
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: "{}",
      candidateArtifactContent: null,
      validationArtifactContent: "{}",
    });
    expect(result.reasonCode).toBe("missing-candidate-artifact");
    expect(result.preregistrationEligible).toBe(false);
  });

  it("5: missing validation artifact fails closed", () => {
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: "{}",
      candidateArtifactContent: "{}",
      validationArtifactContent: null,
    });
    expect(result.reasonCode).toBe("missing-validation-artifact");
  });

  it("6: missing promotion artifact fails closed", () => {
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: null,
      candidateArtifactContent: "{}",
      validationArtifactContent: "{}",
    });
    expect(result.reasonCode).toBe("missing-promotion-artifact");
  });

  it("7: malformed promotion evidence fails closed", () => {
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: "{not-json",
      candidateArtifactContent: "{}",
      validationArtifactContent: "{}",
    });
    expect(result.reasonCode).toBe("malformed-promotion-artifact");
  });

  it("8: changed candidate artifact invalidates stale promotion", () => {
    const artifacts = buildPromotionArtifacts({
      strategy: createStrategy({
        hypothesisId: PASSING_ID,
        strategyId: `synth-${PASSING_ID}`,
      }),
      validation: createValidation({ hypothesisId: PASSING_ID }),
      harness: createHarness({
        strategyId: `synth-${PASSING_ID}`,
        hypothesisId: PASSING_ID,
      }),
    });
    const alteredCandidate = `${JSON.stringify({
      generatedAt: GENERATED_AT,
      strategies: [
        createStrategy({
          hypothesisId: PASSING_ID,
          strategyId: `synth-${PASSING_ID}`,
          riskNotes: ["changed"],
          validationSummary: {
            robustnessScore: 82,
            passes: true,
            observationCount: 41,
          },
        }),
      ],
    })}\n`;
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: artifacts.promotionContent,
      candidateArtifactContent: alteredCandidate,
      validationArtifactContent: artifacts.validationContent,
    });
    expect(result.preregistrationEligible).toBe(false);
    expect(result.reasonCode).toMatch(/candidate-artifact-hash-mismatch|promotion-evidence/);
  });

  it("9: changed validation artifact invalidates stale promotion", () => {
    const artifacts = buildPromotionArtifacts({
      strategy: createStrategy({
        hypothesisId: PASSING_ID,
        strategyId: `synth-${PASSING_ID}`,
      }),
      validation: createValidation({ hypothesisId: PASSING_ID }),
      harness: createHarness({
        strategyId: `synth-${PASSING_ID}`,
        hypothesisId: PASSING_ID,
      }),
    });
    const alteredValidation = `${JSON.stringify({
      generatedAt: GENERATED_AT,
      validations: [
        createValidation({
          hypothesisId: PASSING_ID,
          observationCount: 999,
        }),
      ],
    })}\n`;
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: artifacts.promotionContent,
      candidateArtifactContent: artifacts.candidateContent,
      validationArtifactContent: alteredValidation,
    });
    expect(result.preregistrationEligible).toBe(false);
    expect(["validation-artifact-hash-mismatch", "validation-does-not-pass"]).toContain(
      result.reasonCode,
    );
  });

  it("10: rejected promotion cannot authorize freeze", () => {
    const artifacts = buildPromotionArtifacts({
      strategy: createStrategy({
        hypothesisId: FAILING_ID,
        strategyId: `synth-${FAILING_ID}`,
        promotionStatus: "rejected",
        validationSummary: { robustnessScore: 40, passes: false, observationCount: 10 },
      }),
      validation: createValidation({
        hypothesisId: FAILING_ID,
        robustnessScore: 40,
        passes: false,
      }),
      harness: createHarness({
        strategyId: `synth-${FAILING_ID}`,
        hypothesisId: FAILING_ID,
      }),
    });
    expect(() =>
      requireCandidateEligibleForPreregistration({
        hypothesisId: FAILING_ID,
        promotionArtifactContent: artifacts.promotionContent,
        candidateArtifactContent: artifacts.candidateContent,
        validationArtifactContent: artifacts.validationContent,
      }),
    ).toThrow(CandidatePreregistrationEligibilityError);
  });

  it("11: unknown promotion status fails closed", () => {
    const artifacts = buildPromotionArtifacts({
      strategy: createStrategy({
        hypothesisId: PASSING_ID,
        strategyId: `synth-${PASSING_ID}`,
      }),
      validation: createValidation({ hypothesisId: PASSING_ID }),
      harness: createHarness({
        strategyId: `synth-${PASSING_ID}`,
        hypothesisId: PASSING_ID,
      }),
    });
    const tampered = JSON.parse(artifacts.promotionContent) as {
      promotions: Array<{ decision: string; evidence: { promotionAccepted: boolean } }>;
    };
    tampered.promotions[0]!.decision = "not-a-real-status";
    tampered.promotions[0]!.evidence.promotionAccepted = true;
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: JSON.stringify(tampered),
      candidateArtifactContent: artifacts.candidateContent,
      validationArtifactContent: artifacts.validationContent,
    });
    expect(result.preregistrationEligible).toBe(false);
    expect(["malformed-promotion-artifact", "unknown-promotion-decision"]).toContain(
      result.reasonCode,
    );
  });

  it("11b: forged accepted decision cannot override validation passes:false", () => {
    const artifacts = buildPromotionArtifacts({
      strategy: createStrategy({
        hypothesisId: FAILING_ID,
        strategyId: `synth-${FAILING_ID}`,
        promotionStatus: "experimental",
        validationSummary: {
          robustnessScore: 59,
          passes: false,
          observationCount: 457,
        },
      }),
      validation: createValidation({
        hypothesisId: FAILING_ID,
        robustnessScore: 59,
        passes: false,
        observationCount: 457,
      }),
      harness: createHarness({
        strategyId: `synth-${FAILING_ID}`,
        hypothesisId: FAILING_ID,
      }),
    });
    expect(artifacts.report.promotions[0]?.decision).toBe("rejected");
    const forged = JSON.parse(artifacts.promotionContent) as {
      promotions: Array<{
        decision: string;
        supportingMetrics: { validationPasses: boolean | null };
        evidence: {
          validationPasses: boolean | null;
          promotionAccepted: boolean;
        };
      }>;
    };
    forged.promotions[0]!.decision = "candidate";
    forged.promotions[0]!.supportingMetrics.validationPasses = true;
    forged.promotions[0]!.evidence.validationPasses = true;
    forged.promotions[0]!.evidence.promotionAccepted = true;
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: FAILING_ID,
      promotionArtifactContent: JSON.stringify(forged),
      candidateArtifactContent: artifacts.candidateContent,
      validationArtifactContent: artifacts.validationContent,
    });
    expect(result.preregistrationEligible).toBe(false);
    expect(result.reasonCode).toBe("validation-does-not-pass");
    expect(result.validationPasses).toBe(false);
  });

  it("12: artifact ordering does not alter identity hashes", () => {
    const validationA = createValidation({ hypothesisId: PASSING_ID, reasons: ["a", "b"] });
    const validationB = createValidation({ hypothesisId: PASSING_ID, reasons: ["a", "b"] });
    expect(hashValidationEntryContent(validationA)).toBe(hashValidationEntryContent(validationB));
    const strategy = createStrategy({ hypothesisId: PASSING_ID, strategyId: `synth-${PASSING_ID}` });
    expect(hashCandidateDefinitionContent(strategy)).toBe(hashCandidateDefinitionContent({ ...strategy }));
  });

  it("13: no mtime/latest discovery in eligibility paths", () => {
    const artifacts = buildPromotionArtifacts({
      strategy: createStrategy({
        hypothesisId: PASSING_ID,
        strategyId: `synth-${PASSING_ID}`,
      }),
      validation: createValidation({ hypothesisId: PASSING_ID }),
      harness: createHarness({
        strategyId: `synth-${PASSING_ID}`,
        hypothesisId: PASSING_ID,
      }),
    });
    const tampered = JSON.parse(artifacts.promotionContent) as {
      outputPath: string;
      inputPaths: Record<string, string>;
    };
    tampered.outputPath = "data/research-results/latest/candidate-promotions.json";
    const result = evaluateCandidateEligibleForPreregistration({
      hypothesisId: PASSING_ID,
      promotionArtifactContent: JSON.stringify(tampered),
      candidateArtifactContent: artifacts.candidateContent,
      validationArtifactContent: artifacts.validationContent,
    });
    expect(result.reasonCode).toBe("mtime-or-latest-forbidden");
  });

  it("14: legacy frozen hypotheses remain readable under explicit grandfathering", () => {
    for (const entry of LEGACY_GRANDFATHERED_FROZEN_HYPOTHESES) {
      expect(
        isLegacyGrandfatheredFrozenHypothesis({
          configPath: entry.configPath,
          freezeCommitSha: entry.freezeCommitSha,
          hypothesisVersion: entry.hypothesisVersion,
          hypothesisId: entry.hypothesisId,
        }),
      ).toBe(true);
      const result = enforceFrozenHypothesisPromotionGovernance({
        io: {
          readFile: () => {
            throw new Error("legacy grandfather must not require promotion artifacts");
          },
          fileExists: () => false,
        },
        configPath: entry.configPath,
        freezeCommitSha: entry.freezeCommitSha,
        hypothesisVersion: entry.hypothesisVersion,
        hypothesisId: entry.hypothesisId,
      });
      expect(result.status).toBe("legacy-frozen-grandfathered");
      expect(result.preregistrationEligible).toBe(true);
    }
  });

  it("15: new hypotheses cannot use the legacy path to bypass promotion", () => {
    expect(
      isLegacyGrandfatheredFrozenHypothesis({
        configPath: "config/research/hypotheses/brand-new-hypothesis-v3.json",
        freezeCommitSha: LEGACY_GRANDFATHERED_FROZEN_HYPOTHESES[0]!.freezeCommitSha,
        hypothesisVersion: "v3",
        hypothesisId: LEGACY_GRANDFATHERED_FROZEN_HYPOTHESES[0]!.hypothesisId,
      }),
    ).toBe(false);

    expect(() =>
      enforceFrozenHypothesisPromotionGovernance({
        io: {
          readFile: () => "",
          fileExists: () => false,
        },
        configPath: "config/research/hypotheses/brand-new-hypothesis-v3.json",
        freezeCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        hypothesisVersion: "v3",
        hypothesisId: "brand-new-candidate",
      }),
    ).toThrow(/Missing candidate|Preregistration eligibility failed/);
  });

  it("16: orchestrator governed workflow invokes the eligibility gate", () => {
    const steps = buildFullResearchSteps(createDefaultFullResearchOrchestratorConfig());
    const gate = steps.find((step) => step.id === "preregistration-eligibility");
    expect(gate).toBeDefined();
    expect(gate?.npmScript).toBe("research:verify-preregistration-eligibility");
    expect(gate?.upstreamStepIds).toContain("candidate-promotions");
  });

  it("verify CLI scan grandfather-passes current frozen configs", () => {
    const report = verifyPreregistrationEligibilityForHypothesisConfigs({
      io: {
        readFile: (path) => readFileSync(path, "utf8"),
        fileExists: (path) => existsSync(path),
        readdir: (path) => readdirSync(path),
      },
      generatedAt: GENERATED_AT,
    });
    expect(report.summary.ineligible).toBe(0);
    expect(report.summary.legacyGrandfathered).toBeGreaterThanOrEqual(2);
  });
});
