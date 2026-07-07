import { z } from "zod";

import type {
  ResearchDimensionExplorerInputPaths,
  ResearchDimensionExplorerInputStatus,
  ResearchDimensionExplorerIo,
} from "./researchDimensionExplorerTypes";

const bucketSummarySchema = z
  .object({
    bucketId: z.string(),
    bucketLabel: z.string().optional(),
    observations: z.number(),
    uniqueTradingDays: z.number().nullable().optional(),
  })
  .passthrough();

const mispricingAtlasSchema = z
  .object({
    probabilityBuckets: z.array(bucketSummarySchema).optional(),
    timeRemainingBuckets: z.array(bucketSummarySchema).optional(),
    moneynessBuckets: z.array(bucketSummarySchema).optional(),
    volatilityBuckets: z.array(bucketSummarySchema).optional(),
    coarseBuckets: z
      .object({
        probabilityOnly: z.array(bucketSummarySchema).optional(),
        probabilityTime: z.array(bucketSummarySchema).optional(),
        probabilityRegime: z.array(bucketSummarySchema).optional(),
        probabilityMoneyness: z.array(bucketSummarySchema).optional(),
        moneynessTime: z.array(bucketSummarySchema).optional(),
        volatilityMoneyness: z.array(bucketSummarySchema).optional(),
        volatilityProbabilityTime: z.array(bucketSummarySchema).optional(),
      })
      .optional(),
    sampleCounts: z
      .object({
        totalObservations: z.number().optional(),
        skippedMissingProbability: z.number().optional(),
        skippedMissingContext: z.number().optional(),
        skippedMissingSettlement: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

const hypothesisCandidatesSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            candidateId: z.string(),
            bucketMetadata: z
              .object({
                groupId: z.string(),
                bucketId: z.string(),
              })
              .nullable()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const hypothesisValidationSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            hypothesisId: z.string(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

function tryRead<T>(
  io: ResearchDimensionExplorerIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(io.readFile(path));
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type LoadedResearchDimensionExplorerInputs = {
  inputStatus: ResearchDimensionExplorerInputStatus;
  mispricingAtlas: z.infer<typeof mispricingAtlasSchema> | null;
  hypothesisCandidates: z.infer<typeof hypothesisCandidatesSchema> | null;
  hypothesisValidation: z.infer<typeof hypothesisValidationSchema> | null;
};

/** Loads optional dimension explorer inputs without failing when artifacts are absent. */
export function loadResearchDimensionExplorerInputs(
  io: ResearchDimensionExplorerIo,
  inputPaths: ResearchDimensionExplorerInputPaths,
): LoadedResearchDimensionExplorerInputs {
  const mispricingAtlas = tryRead(
    io,
    inputPaths.mispricingAtlasPath,
    mispricingAtlasSchema,
  );
  const hypothesisCandidates = tryRead(
    io,
    inputPaths.hypothesisCandidatesPath,
    hypothesisCandidatesSchema,
  );
  const hypothesisValidation = tryRead(
    io,
    inputPaths.hypothesisValidationPath,
    hypothesisValidationSchema,
  );

  return {
    inputStatus: {
      mispricingAtlasPresent: mispricingAtlas !== null,
      hypothesisCandidatesPresent: hypothesisCandidates !== null,
      hypothesisValidationPresent: hypothesisValidation !== null,
    },
    mispricingAtlas,
    hypothesisCandidates,
    hypothesisValidation,
  };
}

export type AtlasBucketSummary = z.infer<typeof bucketSummarySchema>;
