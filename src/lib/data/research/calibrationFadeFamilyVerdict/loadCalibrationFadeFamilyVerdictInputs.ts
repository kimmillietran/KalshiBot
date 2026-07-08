import { z } from "zod";

import type {
  CalibrationFadeFamilyVerdictInputPaths,
  CalibrationFadeFamilyVerdictInputStatus,
  CalibrationFadeFamilyVerdictIo,
  RequiredCalibrationFadeArtifactKey,
} from "./calibrationFadeFamilyVerdictTypes";
import { REQUIRED_CALIBRATION_FADE_FAMILY_ARTIFACT_KEYS } from "./calibrationFadeFamilyVerdictTypes";

const candidateSchema = z
  .object({
    candidateId: z.string(),
    hypothesis: z.string(),
    suggestedStrategyFamily: z.string(),
    bucketMetadata: z
      .object({
        groupId: z.string(),
        bucketId: z.string(),
        bucketLabel: z.string().optional(),
        calibrationDirection: z.enum(["over", "under"]).optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const hypothesisCandidatesSchema = z
  .object({
    candidates: z.array(candidateSchema).optional(),
  })
  .passthrough();

const hypothesisValidationSchema = z
  .object({
    validations: z
      .array(
        z
          .object({
            hypothesisId: z.string(),
            robustnessScore: z.number().optional(),
            passes: z.boolean().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const costAwareAtlasSchema = z
  .object({
    buckets: z
      .array(
        z
          .object({
            dimension: z.string(),
            bucketId: z.string(),
            primaryCohort: z
              .object({
                grossExpectedValueCents: z.number().nullable().optional(),
                spreadAdjustedExpectedValueCents: z.number().nullable().optional(),
                feeAdjustedExpectedValueCents: z.number().nullable().optional(),
                tradeability: z.string().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const tradeReplaySchema = z
  .object({
    disclaimer: z.string().optional(),
    entries: z
      .array(
        z
          .object({
            hypothesisId: z.string(),
            hypothesis: z.string(),
            warnings: z.array(z.string()).optional(),
            metrics: z
              .object({
                tradeCount: z.number(),
                skippedCount: z.number(),
                uniqueMarketCount: z.number(),
                uniqueTradingDayCount: z.number(),
                averageTradesPerMarket: z.number().nullable().optional(),
                maxTradesPerMarket: z.number(),
                grossPnlCents: z.number(),
                netPnlCents: z.number(),
                averagePnlCentsPerTrade: z.number().nullable().optional(),
                winRate: z.number().nullable().optional(),
                averageFeeCents: z.number().nullable().optional(),
                skipReasons: z.record(z.string(), z.number()).optional(),
              })
              .passthrough(),
            candidate: z
              .object({
                suggestedStrategyFamily: z.string().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const oosPowerCorrectionSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            hypothesisId: z.string(),
            passesCorrected: z.boolean(),
            clearsMde: z.boolean(),
            isUnderpowered: z.boolean(),
            correctedPValue: z.number().nullable().optional(),
            qValue: z.number().nullable().optional(),
            correctionMethod: z.string().optional(),
            finalStatisticalVerdict: z.string(),
            dependenceWarnings: z.array(z.string()).optional(),
            splitMetrics: z
              .object({
                holdout: z
                  .object({
                    rawObservationCount: z.number(),
                    independentMarketCount: z.number(),
                    marketDayCount: z.number(),
                    effectiveSampleSizeEstimate: z.number(),
                    observedNetEdge: z.number().nullable(),
                    minimumDetectableEffect: z.number().nullable().optional(),
                    confidenceInterval95: z
                      .object({
                        lower: z.number(),
                        upper: z.number(),
                      })
                      .nullable()
                      .optional(),
                    clearsMde: z.boolean(),
                    isUnderpowered: z.boolean(),
                    underpoweredReason: z.string().nullable().optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const derivedSensitivitySchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            hypothesisId: z.string(),
            recommendation: z.string(),
            deltaRobustness: z.number(),
            allObservations: z
              .object({
                derivedObservationShare: z.number(),
                passes: z.boolean(),
              })
              .passthrough(),
            officialOnlyObservations: z
              .object({
                passes: z.boolean(),
              })
              .passthrough(),
            notes: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

function isFamilyVerdictReport(parsed: unknown): boolean {
  return (
    typeof parsed === "object"
    && parsed !== null
    && "disclaimer" in parsed
    && "thresholds" in parsed
    && "hypotheses" in parsed
    && typeof (parsed as { summary?: unknown }).summary === "object"
    && (parsed as { summary?: { familyVerdict?: unknown } }).summary?.familyVerdict !== undefined
  );
}

function tryRead<T>(
  io: CalibrationFadeFamilyVerdictIo,
  path: string,
  schema: z.ZodType<T>,
): T | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    const parsed = JSON.parse(io.readFile(path));
    if (isFamilyVerdictReport(parsed)) {
      return null;
    }

    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type LoadedCalibrationFadeFamilyVerdictInputs = {
  inputStatus: CalibrationFadeFamilyVerdictInputStatus;
  missingRequiredArtifacts: RequiredCalibrationFadeArtifactKey[];
  hypothesisCandidates: z.infer<typeof hypothesisCandidatesSchema> | null;
  hypothesisValidation: z.infer<typeof hypothesisValidationSchema> | null;
  costAwareAtlas: z.infer<typeof costAwareAtlasSchema> | null;
  hypothesisTradeReplay: z.infer<typeof tradeReplaySchema> | null;
  oosPowerCorrection: z.infer<typeof oosPowerCorrectionSchema> | null;
  derivedSettlementSensitivity: z.infer<typeof derivedSensitivitySchema> | null;
};

/** Loads required and optional calibration-fade family verdict inputs. */
export function loadCalibrationFadeFamilyVerdictInputs(
  io: CalibrationFadeFamilyVerdictIo,
  inputPaths: CalibrationFadeFamilyVerdictInputPaths,
): LoadedCalibrationFadeFamilyVerdictInputs {
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
  const costAwareAtlas = tryRead(
    io,
    inputPaths.costAwareAtlasPath,
    costAwareAtlasSchema,
  );
  const hypothesisTradeReplay = tryRead(
    io,
    inputPaths.hypothesisTradeReplayPath,
    tradeReplaySchema,
  );
  const oosPowerCorrection = tryRead(
    io,
    inputPaths.oosPowerCorrectionPath,
    oosPowerCorrectionSchema,
  );
  const derivedSettlementSensitivity = tryRead(
    io,
    inputPaths.derivedSettlementSensitivityPath,
    derivedSensitivitySchema,
  );

  const inputStatus: CalibrationFadeFamilyVerdictInputStatus = {
    hypothesisCandidates: hypothesisCandidates !== null,
    hypothesisValidation: hypothesisValidation !== null,
    costAwareAtlas: costAwareAtlas !== null,
    hypothesisTradeReplay: hypothesisTradeReplay !== null,
    oosPowerCorrection: oosPowerCorrection !== null,
    derivedSettlementSensitivity: derivedSettlementSensitivity !== null,
  };

  const missingRequiredArtifacts = REQUIRED_CALIBRATION_FADE_FAMILY_ARTIFACT_KEYS.filter(
    (key) => !inputStatus[key],
  );

  return {
    inputStatus,
    missingRequiredArtifacts,
    hypothesisCandidates,
    hypothesisValidation,
    costAwareAtlas,
    hypothesisTradeReplay,
    oosPowerCorrection,
    derivedSettlementSensitivity,
  };
}
