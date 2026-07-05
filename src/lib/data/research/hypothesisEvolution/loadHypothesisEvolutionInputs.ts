import { z } from "zod";

import type { CoverageAwareValidationEntry } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import { HypothesisEvolutionError } from "./hypothesisEvolutionTypes";
import type {
  HypothesisEvolutionInputPaths,
  HypothesisEvolutionIo,
  HypothesisEvolutionValidationEntry,
} from "./hypothesisEvolutionTypes";

const candidateSchema = z.object({
  candidateId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  bucketMetadata: z
    .object({
      calibrationError: z.number().finite(),
    })
    .nullable()
    .optional(),
});

const candidatesDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  candidates: z.array(candidateSchema),
});

const validationEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
  observationCount: z.number().finite().int().nonnegative(),
  timeStability: z.object({
    monthPeriods: z.array(
      z.object({
        observations: z.number().finite().int().nonnegative(),
      }),
    ),
    monthPersistenceRate: z.number().finite(),
  }),
  regimeStability: z.object({
    regimesWithData: z.number().finite().int().nonnegative(),
    regimesWithEdge: z.number().finite().int().nonnegative(),
  }),
  sampleConcentration: z.object({
    uniqueTradingDays: z.number().finite().int().nonnegative(),
  }),
  leaveOnePeriodOut: z.object({
    errorStdDev: z.number().finite(),
  }),
});

const validationDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  validations: z.array(validationEntrySchema),
});

const coverageEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  classification: z.enum([
    "rejected",
    "inconclusive-insufficient-coverage",
    "inconclusive-regime-sparse",
    "promising-needs-more-history",
    "robust-enough-to-test",
  ]),
});

const coverageDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  entries: z.array(coverageEntrySchema),
});

const atlasDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  sampleCounts: z.object({
    marketCount: z.number().finite().int().nonnegative(),
  }),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new HypothesisEvolutionError(`Invalid JSON in ${path}`);
  }
}

function readRequiredDocument<T>(
  io: HypothesisEvolutionIo,
  path: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  if (!io.fileExists(path)) {
    throw new HypothesisEvolutionError(`Missing required ${label}: ${path}`);
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisEvolutionError(
      `Invalid ${label} schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data;
}

function readOptionalDocument<T>(
  io: HypothesisEvolutionIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  const parsed = parseJson(path, io.readFile(path));
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisEvolutionError(
      `Invalid document schema in ${path}: ${result.error.message}`,
    );
  }

  return result.data;
}

export type LoadedHypothesisEvolutionInputs = {
  runTimestamp: string;
  marketCount: number;
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisEvolutionValidationEntry[];
  coverageEntries: readonly CoverageAwareValidationEntry[];
};

/** Loads current-run hypothesis artifacts for evolution tracking. */
export function loadHypothesisEvolutionInputs(
  io: HypothesisEvolutionIo,
  inputPaths: HypothesisEvolutionInputPaths,
): LoadedHypothesisEvolutionInputs {
  const candidatesDocument = readRequiredDocument(
    io,
    inputPaths.hypothesisCandidatesPath,
    candidatesDocumentSchema,
    "hypothesis candidates document",
  );
  const validationDocument = readRequiredDocument(
    io,
    inputPaths.hypothesisValidationPath,
    validationDocumentSchema,
    "hypothesis validation document",
  );
  const coverageDocument = readOptionalDocument(
    io,
    inputPaths.coverageValidationPath,
    coverageDocumentSchema,
  );
  const atlasDocument = readOptionalDocument(
    io,
    inputPaths.mispricingAtlasPath,
    atlasDocumentSchema,
  );

  const runTimestamp = validationDocument.generatedAt;
  const marketCount = atlasDocument?.sampleCounts.marketCount ?? 0;

  return {
    runTimestamp,
    marketCount,
    candidates: candidatesDocument.candidates as HypothesisCandidate[],
    validations: validationDocument.validations,
    coverageEntries: (coverageDocument?.entries ?? []) as CoverageAwareValidationEntry[],
  };
}
