import { z } from "zod";

import {
  DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { loadHypothesisCandidatesFromFile } from "@/lib/data/research/hypothesisRobustness/loadHypothesisValidationInputs";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_REGIME_TAGS_INPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_MISPRICING_ATLAS_INPUT_DIR } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { validateCandidate } from "@/lib/data/research/hypothesisRobustness/buildHypothesisValidationReport";
import { collectEnrichedMispricingObservations } from "@/lib/data/research/hypothesisRobustness/collectEnrichedMispricingObservations";
import { computeSignedCalibrationError } from "@/lib/data/research/hypothesisRobustness/computeHypothesisRobustnessMetrics";
import { filterObservationsForAtlasBucket } from "@/lib/data/research/hypothesisRobustness/filterObservationsForAtlasBucket";
import { loadRegimeVolatilityByMarket } from "@/lib/data/research/mispricingAtlas/loadRegimeVolatilityByMarket";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import { DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HypothesisValidationConfig } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import { discoverDerivedSettlementMarketKeys, filterObservationsExcludingDerivedMarkets } from "./discoverDerivedSettlementMarketKeys";
import {
  DerivedSettlementSensitivityError,
  type DerivedSettlementSensitivityInputPaths,
  type DerivedSettlementSensitivityInputStatus,
  type DerivedSettlementSensitivityIo,
} from "./derivedSettlementSensitivityTypes";

const hypothesisValidationEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  sourceArtifact: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
  reasons: z.array(z.string()),
  observationCount: z.number().finite(),
});

const hypothesisValidationReportSchema = z.object({
  config: z
    .object({
      passScoreThreshold: z.number().finite().optional(),
      minCalibrationError: z.number().finite().optional(),
      singleDayConcentrationFlag: z.number().finite().optional(),
      minPeriodObservations: z.number().finite().optional(),
    })
    .optional(),
  validations: z.array(hypothesisValidationEntrySchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json.replace(/^\uFEFF/, ""));
  } catch {
    throw new DerivedSettlementSensitivityError(`Invalid JSON in ${path}`);
  }
}

export function buildDefaultDerivedSettlementSensitivityInputPaths(options?: {
  hypothesisCandidatesPath?: string;
  hypothesisValidationPath?: string;
  researchResultsDir?: string;
  regimeTagsPath?: string;
}): DerivedSettlementSensitivityInputPaths {
  return {
    hypothesisCandidatesPath:
      options?.hypothesisCandidatesPath ?? DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    hypothesisValidationPath:
      options?.hypothesisValidationPath ?? DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
    researchResultsDir:
      options?.researchResultsDir ?? DEFAULT_MISPRICING_ATLAS_INPUT_DIR,
    regimeTagsPath:
      options?.regimeTagsPath ?? DEFAULT_REGIME_TAGS_INPUT_PATH,
  };
}

function buildInputStatus(
  io: DerivedSettlementSensitivityIo,
  inputPaths: DerivedSettlementSensitivityInputPaths,
): DerivedSettlementSensitivityInputStatus {
  return {
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    researchResultsPresent: io.fileExists(inputPaths.researchResultsDir),
    regimeTagsPresent: io.fileExists(inputPaths.regimeTagsPath),
  };
}

function loadValidations(
  io: DerivedSettlementSensitivityIo,
  path: string,
): { validations: HypothesisValidationEntry[]; config: HypothesisValidationConfig } {
  if (!io.fileExists(path)) {
    return {
      validations: [],
      config: { passScoreThreshold: DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE, minCalibrationError: 0.05, singleDayConcentrationFlag: 0.5, minPeriodObservations: 3 },
    };
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = hypothesisValidationReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new DerivedSettlementSensitivityError(
      `Invalid hypothesis-validation.json schema in ${path}: ${result.error.message}`,
    );
  }

  return {
    validations: (parsed as { validations: HypothesisValidationEntry[] }).validations,
    config: {
      passScoreThreshold:
        result.data.config?.passScoreThreshold ?? DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE,
      minCalibrationError: result.data.config?.minCalibrationError ?? 0.05,
      singleDayConcentrationFlag: result.data.config?.singleDayConcentrationFlag ?? 0.5,
      minPeriodObservations: result.data.config?.minPeriodObservations ?? 3,
    },
  };
}

function loadCandidates(
  io: DerivedSettlementSensitivityIo,
  path: string,
): HypothesisCandidate[] {
  if (!io.fileExists(path)) {
    return [];
  }

  return loadHypothesisCandidatesFromFile(
    io as Parameters<typeof loadHypothesisCandidatesFromFile>[0],
    path,
  );
}

function calibrationForCandidate(
  candidate: HypothesisCandidate,
  observations: ReturnType<typeof collectEnrichedMispricingObservations>,
  regimeVolatilityByMarket: ReturnType<typeof loadRegimeVolatilityByMarket>,
): number | null {
  const atlasRef = parseAtlasHypothesisCandidateId(candidate.candidateId);
  if (!atlasRef) {
    return null;
  }

  const bucketObservations = filterObservationsForAtlasBucket(
    observations,
    atlasRef,
    regimeVolatilityByMarket,
  );

  return computeSignedCalibrationError(bucketObservations);
}

export function computeOfficialOnlyValidations(input: {
  candidates: readonly HypothesisCandidate[];
  observations: ReturnType<typeof collectEnrichedMispricingObservations>;
  derivedMarketKeys: ReadonlySet<string>;
  regimeVolatilityByMarket: ReturnType<typeof loadRegimeVolatilityByMarket>;
  config: HypothesisValidationConfig;
}): {
  validations: HypothesisValidationEntry[];
  calibrationByHypothesisId: Map<string, number | null>;
} {
  const officialObservations = filterObservationsExcludingDerivedMarkets(
    input.observations,
    input.derivedMarketKeys,
  );

  const validations = [...input.candidates]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((candidate) =>
      validateCandidate(
        candidate,
        officialObservations,
        input.regimeVolatilityByMarket,
        input.config,
      ),
    );

  const calibrationByHypothesisId = new Map<string, number | null>();
  for (const candidate of input.candidates) {
    calibrationByHypothesisId.set(
      candidate.candidateId,
      calibrationForCandidate(candidate, officialObservations, input.regimeVolatilityByMarket),
    );
  }

  return { validations, calibrationByHypothesisId };
}

export function loadDerivedSettlementSensitivityComputation(input: {
  io: DerivedSettlementSensitivityIo;
  inputPaths: DerivedSettlementSensitivityInputPaths;
}): {
  inputStatus: DerivedSettlementSensitivityInputStatus;
  passThreshold: number;
  config: HypothesisValidationConfig;
  candidates: HypothesisCandidate[];
  validations: HypothesisValidationEntry[];
  derivedMarketKeys: Set<string>;
  officialOnlyValidations: HypothesisValidationEntry[];
  allCalibrationByHypothesisId: Map<string, number | null>;
  officialOnlyCalibrationByHypothesisId: Map<string, number | null>;
} {
  const validationLoad = loadValidations(input.io, input.inputPaths.hypothesisValidationPath);
  const candidates = loadCandidates(input.io, input.inputPaths.hypothesisCandidatesPath);
  const derivedMarketKeys = input.io.fileExists(input.inputPaths.researchResultsDir)
    ? discoverDerivedSettlementMarketKeys({
      researchResultsDir: input.inputPaths.researchResultsDir,
      io: input.io,
    })
    : new Set<string>();

  const observations = input.io.fileExists(input.inputPaths.researchResultsDir)
    ? collectEnrichedMispricingObservations({
      researchResultsDir: input.inputPaths.researchResultsDir,
      regimeTagsPath: input.inputPaths.regimeTagsPath,
      io: input.io,
    })
    : [];
  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(
    input.io,
    input.inputPaths.regimeTagsPath,
  );

  const officialOnly = computeOfficialOnlyValidations({
    candidates,
    observations,
    derivedMarketKeys,
    regimeVolatilityByMarket,
    config: validationLoad.config,
  });

  const allCalibrationByHypothesisId = new Map<string, number | null>();
  for (const candidate of candidates) {
    allCalibrationByHypothesisId.set(
      candidate.candidateId,
      calibrationForCandidate(candidate, observations, regimeVolatilityByMarket),
    );
  }

  const validations = validationLoad.validations.length > 0
    ? validationLoad.validations
    : [...candidates]
      .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
      .map((candidate) =>
        validateCandidate(
          candidate,
          observations,
          regimeVolatilityByMarket,
          validationLoad.config,
        ),
      );

  return {
    inputStatus: buildInputStatus(input.io, input.inputPaths),
    passThreshold: validationLoad.config.passScoreThreshold,
    config: validationLoad.config,
    candidates,
    validations,
    derivedMarketKeys,
    officialOnlyValidations: officialOnly.validations,
    allCalibrationByHypothesisId,
    officialOnlyCalibrationByHypothesisId: officialOnly.calibrationByHypothesisId,
  };
}
