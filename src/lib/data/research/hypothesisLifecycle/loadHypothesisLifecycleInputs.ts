import { z } from "zod";

import {
  HypothesisLifecycleError,
  type HypothesisLifecycleInputPaths,
  type HypothesisLifecycleIo,
  type ParsedHypothesisLifecycleInputs,
  type ParsedHarnessResult,
  type ParsedHypothesisCandidate,
  type ParsedHypothesisValidation,
  type ParsedSynthesizedStrategy,
} from "./hypothesisLifecycleTypes";

const hypothesisCandidateSchema = z.object({
  candidateId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string().trim().min(1)),
  suggestedStrategyFamily: z.string().trim().min(1),
});

const hypothesisCandidatesDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  candidates: z.array(hypothesisCandidateSchema),
});

const hypothesisValidationEntrySchema = z.object({
  hypothesisId: z.string().trim().min(1),
  hypothesis: z.string().trim().min(1),
  robustnessScore: z.number().finite(),
  passes: z.boolean(),
  reasons: z.array(z.string().trim().min(1)),
});

const hypothesisValidationDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  validations: z.array(hypothesisValidationEntrySchema),
});

const synthesizedStrategySchema = z.object({
  strategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  strategyFamily: z.string().trim().min(1),
  promotionStatus: z.enum(["experimental", "candidate", "rejected"]),
  validationSummary: z.object({
    robustnessScore: z.number().finite().nullable(),
    passes: z.boolean(),
  }),
  riskNotes: z.array(z.string().trim().min(1)),
});

const strategySynthesisDocumentSchema = z.object({
  generatedAt: z.string().trim().min(1),
  strategies: z.array(synthesizedStrategySchema),
});

const harnessResultSchema = z.object({
  synthesizedStrategyId: z.string().trim().min(1),
  hypothesisId: z.string().trim().min(1),
  status: z.enum(["success", "failed", "skipped"]),
  errorMessage: z.string().nullable(),
});

const harnessSummarySchema = z.object({
  completedAt: z.string().trim().min(1),
  results: z.array(harnessResultSchema),
});

function parseJson(path: string, json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new HypothesisLifecycleError(`Invalid JSON in ${path}`);
  }
}

function parseDocument<T>(
  path: string,
  json: string,
  schema: z.ZodType<T>,
): T {
  const parsed = parseJson(path, json);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new HypothesisLifecycleError(
      `Invalid document schema in ${path}: ${result.error.message}`,
    );
  }
  return result.data;
}

function tryReadDocument<T>(
  io: HypothesisLifecycleIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  return parseDocument(path, io.readFile(path), schema);
}

function countHarnessOutputsByHypothesisId(
  io: HypothesisLifecycleIo,
  harnessOutputDir: string,
  synthesisStrategies: readonly ParsedSynthesizedStrategy[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const strategyToHypothesis = new Map(
    synthesisStrategies.map((strategy) => [strategy.strategyId, strategy.hypothesisId]),
  );

  if (!io.fileExists(harnessOutputDir) || !io.isDirectory(harnessOutputDir)) {
    return counts;
  }

  const walk = (currentPath: string, strategyId: string | null): void => {
    for (const entry of [...io.readdir(currentPath)].sort()) {
      const entryPath = `${currentPath}/${entry}`.replace(/\/+/g, "/");
      if (!io.isDirectory(entryPath)) {
        if (entry === "research-output.json" && strategyId) {
          const hypothesisId = strategyToHypothesis.get(strategyId);
          if (hypothesisId) {
            counts.set(hypothesisId, (counts.get(hypothesisId) ?? 0) + 1);
          }
        }
        continue;
      }

      const nextStrategyId =
        currentPath === harnessOutputDir.replace(/\/+$/, "")
          ? entry
          : strategyId;
      walk(entryPath, nextStrategyId);
    }
  };

  walk(harnessOutputDir.replace(/\/+$/, ""), null);
  return counts;
}

function summarizeHarnessResults(
  results: readonly ParsedHarnessResult[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (result.status !== "success") {
      continue;
    }
    counts.set(result.hypothesisId, (counts.get(result.hypothesisId) ?? 0) + 1);
  }
  return counts;
}

/** Loads optional hypothesis lifecycle artifacts without mutating data. */
export function loadHypothesisLifecycleInputs(
  io: HypothesisLifecycleIo,
  inputPaths: HypothesisLifecycleInputPaths,
): ParsedHypothesisLifecycleInputs {
  const candidates = tryReadDocument(
    io,
    inputPaths.hypothesisCandidatesPath,
    hypothesisCandidatesDocumentSchema,
  );

  const evidenceHtmlPresent = io.fileExists(inputPaths.evidenceHtmlPath);
  const evidenceHtmlModifiedAt = evidenceHtmlPresent
    ? io.getLastModified(inputPaths.evidenceHtmlPath)
    : null;

  const validation = tryReadDocument(
    io,
    inputPaths.hypothesisValidationPath,
    hypothesisValidationDocumentSchema,
  );

  const synthesis = tryReadDocument(
    io,
    inputPaths.strategySynthesisPath,
    strategySynthesisDocumentSchema,
  );

  const harnessSummary = tryReadDocument(
    io,
    inputPaths.strategyHarnessSummaryPath,
    harnessSummarySchema,
  );

  const harnessOutputCountByHypothesisId = harnessSummary
    ? summarizeHarnessResults(harnessSummary.results)
    : countHarnessOutputsByHypothesisId(
        io,
        inputPaths.strategyHarnessOutputDir,
        synthesis?.strategies ?? [],
      );

  return {
    candidates,
    evidenceHtmlPresent,
    evidenceHtmlModifiedAt,
    validation,
    synthesis,
    harnessSummary,
    harnessOutputCountByHypothesisId,
  };
}

export function sortHypothesisCandidates(
  candidates: readonly ParsedHypothesisCandidate[],
): ParsedHypothesisCandidate[] {
  return [...candidates].sort((left, right) =>
    left.candidateId.localeCompare(right.candidateId),
  );
}

export function sortHypothesisValidations(
  validations: readonly ParsedHypothesisValidation[],
): ParsedHypothesisValidation[] {
  return [...validations].sort((left, right) =>
    left.hypothesisId.localeCompare(right.hypothesisId),
  );
}
