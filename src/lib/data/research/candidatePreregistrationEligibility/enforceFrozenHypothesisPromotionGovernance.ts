import {
  CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
  CandidatePreregistrationEligibilityError,
  DEFAULT_PROMOTION_ARTIFACT_PATH_FOR_ELIGIBILITY,
  DEFAULT_PREREGISTRATION_ELIGIBILITY_REPORT_PATH,
  HYPOTHESIS_CONFIG_ROOT,
  type CandidatePreregistrationEligibilityIo,
  type CandidatePreregistrationEligibilityResult,
  type VerifyPreregistrationEligibilityReport,
} from "./candidatePreregistrationEligibilityTypes";
import {
  findLegacyGrandfatheredFrozenHypothesis,
  normalizeRepoPath,
} from "./legacyGrandfatheredFrozenHypotheses";
import {
  evaluateCandidateEligibleForPreregistration,
  loadArtifactContentOrNull,
  requireCandidateEligibleForPreregistration,
} from "./requireCandidateEligibleForPreregistration";
import { DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS } from "@/lib/data/research/candidatePromotion/candidatePromotionTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Binding enforcement at freeze-load time.
 *
 * - Exact legacy freezes under config/research/hypotheses are grandfathered.
 * - Off-root config paths are diagnostic/test loads only (cannot authorize a
 *   repository-governed preregistration) and do not require promotion evidence.
 * - Any other config under config/research/hypotheses must present bound
 *   accepted promotion evidence (fail closed).
 */
export function enforceFrozenHypothesisPromotionGovernance(input: {
  io: CandidatePreregistrationEligibilityIo;
  configPath: string;
  freezeCommitSha?: string | null;
  hypothesisVersion: string;
  hypothesisId: string;
  promotionArtifactPath?: string;
  candidateArtifactPath?: string;
  validationArtifactPath?: string;
}): CandidatePreregistrationEligibilityResult {
  const configPath = normalizeRepoPath(input.configPath);
  const grandfathered = findLegacyGrandfatheredFrozenHypothesis({
    configPath,
    // Freeze-SHA integrity remains the provenance loader's job. Grandfathering
    // is path+identity based so pending/wrong-SHA cases still reach those checks.
    freezeCommitSha: null,
    hypothesisVersion: input.hypothesisVersion,
    hypothesisId: input.hypothesisId,
  });

  if (grandfathered) {
    return {
      analysisVersion: CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
      hypothesisId: input.hypothesisId,
      status: "legacy-frozen-grandfathered",
      preregistrationEligible: true,
      promotionDecision: null,
      validationPasses: null,
      promotionAccepted: false,
      reasonCode: "legacy-frozen-grandfathered",
      reasons: [
        "Historical frozen lineage predates M12.7a promotion binding and is explicitly grandfathered",
      ],
      candidateArtifactContentHash: null,
      validationArtifactContentHash: null,
      promotionArtifactContentHash: null,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    };
  }

  const underGovernedRoot =
    configPath.startsWith(`${HYPOTHESIS_CONFIG_ROOT}/`)
    && !configPath.includes("/provenance/");

  if (!underGovernedRoot) {
    return {
      analysisVersion: CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
      hypothesisId: input.hypothesisId,
      status: "ineligible",
      preregistrationEligible: false,
      promotionDecision: null,
      validationPasses: null,
      promotionAccepted: false,
      reasonCode: "promotion-evidence-incomplete",
      reasons: [
        "Config path is outside config/research/hypotheses; diagnostic loads are allowed "
          + "but cannot authorize repository-governed preregistration",
      ],
      candidateArtifactContentHash: null,
      validationArtifactContentHash: null,
      promotionArtifactContentHash: null,
      boundCandidateDefinitionContentHash: null,
      boundValidationEntryContentHash: null,
    };
  }

  const promotionPath =
    input.promotionArtifactPath ?? DEFAULT_PROMOTION_ARTIFACT_PATH_FOR_ELIGIBILITY;
  const candidatePath =
    input.candidateArtifactPath
    ?? DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS.strategySynthesisPath;
  const validationPath =
    input.validationArtifactPath
    ?? DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS.hypothesisValidationPath;

  return requireCandidateEligibleForPreregistration({
    hypothesisId: input.hypothesisId,
    promotionArtifactContent: loadArtifactContentOrNull(input.io, promotionPath),
    candidateArtifactContent: loadArtifactContentOrNull(input.io, candidatePath),
    validationArtifactContent: loadArtifactContentOrNull(input.io, validationPath),
  });
}

export function listHypothesisConfigPaths(
  io: CandidatePreregistrationEligibilityIo,
  root: string = HYPOTHESIS_CONFIG_ROOT,
): string[] {
  if (!io.readdir || !io.fileExists(root)) {
    return [];
  }
  return io
    .readdir(root)
    .filter((name) => name.endsWith(".json"))
    .map((name) => normalizeRepoPath(`${root}/${name}`))
    .sort((left, right) => left.localeCompare(right));
}

function resolveFreezeIdentityFromConfig(input: {
  io: CandidatePreregistrationEligibilityIo;
  configPath: string;
}): {
  hypothesisId: string;
  hypothesisVersion: string;
  freezeCommitSha: string;
  provenancePath: string;
} {
  const configPath = normalizeRepoPath(input.configPath);
  if (!input.io.fileExists(configPath)) {
    throw new CandidatePreregistrationEligibilityError(`Hypothesis config missing: ${configPath}`);
  }
  let configParsed: unknown;
  try {
    configParsed = JSON.parse(input.io.readFile(configPath).replace(/^\uFEFF/, ""));
  } catch {
    throw new CandidatePreregistrationEligibilityError(`Malformed hypothesis config: ${configPath}`);
  }
  if (!isRecord(configParsed)) {
    throw new CandidatePreregistrationEligibilityError(`Hypothesis config root must be an object: ${configPath}`);
  }
  const hypothesisId = readString(configParsed.hypothesisId);
  const hypothesisVersion = readString(configParsed.hypothesisVersion);
  if (!hypothesisId || !hypothesisVersion) {
    throw new CandidatePreregistrationEligibilityError(
      `Hypothesis config missing hypothesisId/hypothesisVersion: ${configPath}`,
    );
  }

  const fileName = configPath.split("/").pop()!;
  const provenancePath = normalizeRepoPath(
    `${HYPOTHESIS_CONFIG_ROOT}/provenance/${fileName}`,
  );
  if (!input.io.fileExists(provenancePath)) {
    throw new CandidatePreregistrationEligibilityError(
      `Provenance manifest missing for ${configPath}: ${provenancePath}`,
    );
  }
  let provenanceParsed: unknown;
  try {
    provenanceParsed = JSON.parse(input.io.readFile(provenancePath).replace(/^\uFEFF/, ""));
  } catch {
    throw new CandidatePreregistrationEligibilityError(`Malformed provenance: ${provenancePath}`);
  }
  if (!isRecord(provenanceParsed)) {
    throw new CandidatePreregistrationEligibilityError(`Provenance root must be an object: ${provenancePath}`);
  }

  const freezeCommitSha =
    readString(provenanceParsed.v2FreezeCommitSha)
    ?? readString(provenanceParsed.originalFreezeCommitSha)
    ?? readString(
      isRecord(provenanceParsed.prospectiveEvidenceBoundary)
        ? provenanceParsed.prospectiveEvidenceBoundary.freezeCommitSha
        : null,
    );

  if (!freezeCommitSha) {
    throw new CandidatePreregistrationEligibilityError(
      `Provenance missing freeze commit identity: ${provenancePath}`,
    );
  }

  return { hypothesisId, hypothesisVersion, freezeCommitSha, provenancePath };
}

/** Machine-verifiable scan of frozen hypothesis configs under config/research/hypotheses. */
export function verifyPreregistrationEligibilityForHypothesisConfigs(input: {
  io: CandidatePreregistrationEligibilityIo;
  generatedAt: string;
  hypothesesRoot?: string;
  promotionArtifactPath?: string;
  candidateArtifactPath?: string;
  validationArtifactPath?: string;
}): VerifyPreregistrationEligibilityReport {
  const hypothesesRoot = normalizeRepoPath(input.hypothesesRoot ?? HYPOTHESIS_CONFIG_ROOT);
  const configPaths = listHypothesisConfigPaths(input.io, hypothesesRoot);
  const results: CandidatePreregistrationEligibilityResult[] = [];

  for (const configPath of configPaths) {
    const identity = resolveFreezeIdentityFromConfig({ io: input.io, configPath });
    try {
      results.push(
        enforceFrozenHypothesisPromotionGovernance({
          io: input.io,
          configPath,
          freezeCommitSha: identity.freezeCommitSha,
          hypothesisVersion: identity.hypothesisVersion,
          hypothesisId: identity.hypothesisId,
          promotionArtifactPath: input.promotionArtifactPath,
          candidateArtifactPath: input.candidateArtifactPath,
          validationArtifactPath: input.validationArtifactPath,
        }),
      );
    } catch (error) {
      results.push({
        analysisVersion: CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
        hypothesisId: identity.hypothesisId,
        status: "ineligible",
        preregistrationEligible: false,
        promotionDecision: null,
        validationPasses: null,
        promotionAccepted: false,
        reasonCode: "promotion-evidence-incomplete",
        reasons: [
          error instanceof Error ? error.message : String(error),
        ],
        candidateArtifactContentHash: null,
        validationArtifactContentHash: null,
        promotionArtifactContentHash: null,
        boundCandidateDefinitionContentHash: null,
        boundValidationEntryContentHash: null,
      });
    }
  }

  const summary = {
    total: results.length,
    eligible: results.filter((row) => row.status === "eligible").length,
    ineligible: results.filter((row) => row.status === "ineligible").length,
    legacyGrandfathered: results.filter((row) => row.status === "legacy-frozen-grandfathered").length,
  };

  return {
    analysisVersion: CANDIDATE_PREREGISTRATION_ELIGIBILITY_ANALYSIS_VERSION,
    generatedAt: input.generatedAt,
    promotionArtifactPath:
      input.promotionArtifactPath ?? DEFAULT_PROMOTION_ARTIFACT_PATH_FOR_ELIGIBILITY,
    hypothesesRoot,
    results,
    summary,
  };
}

export function assertPreregistrationEligibilityReportPass(
  report: VerifyPreregistrationEligibilityReport,
): void {
  if (report.summary.ineligible > 0) {
    const failures = report.results
      .filter((row) => row.status === "ineligible")
      .map((row) => `${row.hypothesisId}: ${row.reasonCode}`)
      .join("; ");
    throw new CandidatePreregistrationEligibilityError(
      `Preregistration eligibility gate failed (${report.summary.ineligible} ineligible): ${failures}`,
    );
  }
}

export { evaluateCandidateEligibleForPreregistration };
export { DEFAULT_PREREGISTRATION_ELIGIBILITY_REPORT_PATH };
