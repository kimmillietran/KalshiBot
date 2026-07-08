import { z } from "zod";

import type { HypothesisTradeReplayReport } from "@/lib/data/research/hypothesisTradeReplay/hypothesisTradeReplayTypes";
import { loadHypothesisTradeReplayInputs } from "@/lib/data/research/hypothesisTradeReplay/loadHypothesisTradeReplayInputs";

import {
  buildRegimeTagLookupFromArtifact,
  type RegimeTagLookup,
} from "./extractFilledTrades";
import {
  PnlForensicsGateError,
  PnlForensicsGateErrorCode,
  type PnlForensicsGateInputPaths,
  type PnlForensicsGateInputStatus,
  type PnlForensicsGateIo,
} from "./pnlForensicsGateTypes";

const tradeReplaySchema = z.object({
  generatedAt: z.string(),
  outputPath: z.string(),
  htmlOutputPath: z.string(),
  disclaimer: z.string(),
  config: z.record(z.string(), z.unknown()),
  inputPaths: z.object({
    hypothesisCandidatesPath: z.string(),
    mispricingAtlasPath: z.string(),
    costAwareAtlasPath: z.string(),
    researchResultsDir: z.string(),
    regimeTagsPath: z.string(),
  }),
  inputStatus: z.record(z.string(), z.boolean()),
  summary: z.object({
    replayedHypothesisCount: z.number(),
    evaluatedTradeCount: z.number(),
    filledTradeCount: z.number(),
    skippedTradeCount: z.number(),
    positiveNetHypothesisCount: z.number(),
    killedByCostOrFillabilityCount: z.number(),
    untradeableHypothesisCount: z.number(),
    descriptiveButUnprofitableCount: z.number(),
  }),
  entries: z.array(z.record(z.string(), z.unknown())),
});

function tryReadJson(path: string, io: PnlForensicsGateIo): unknown | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return JSON.parse(io.readFile(path));
  } catch {
    return null;
  }
}

export function buildDefaultPnlForensicsGateInputPaths(
  overrides?: Partial<PnlForensicsGateInputPaths>,
): PnlForensicsGateInputPaths {
  return {
    hypothesisTradeReplayPath:
      overrides?.hypothesisTradeReplayPath
      ?? "data/research-results/hypothesis-trade-replay.json",
    hypothesisCandidatesPath:
      overrides?.hypothesisCandidatesPath
      ?? "data/research-results/hypothesis-candidates.json",
    hypothesisValidationPath:
      overrides?.hypothesisValidationPath
      ?? "data/research-results/hypothesis-validation.json",
    oosPowerCorrectionPath:
      overrides?.oosPowerCorrectionPath
      ?? "data/research-results/oos-power-correction.json",
    calibrationFadeFamilyVerdictPath:
      overrides?.calibrationFadeFamilyVerdictPath
      ?? "data/research-results/calibration-fade-family-verdict.json",
    regimeTagsPath:
      overrides?.regimeTagsPath ?? "data/research-results/regime-tags.json",
    monthRegimeAnalysisPath:
      overrides?.monthRegimeAnalysisPath
      ?? "data/research-results/month-regime-analysis.json",
  };
}

export function resolvePnlForensicsGateInputStatus(
  io: PnlForensicsGateIo,
  inputPaths: PnlForensicsGateInputPaths,
): PnlForensicsGateInputStatus {
  return {
    hypothesisTradeReplayPresent: io.fileExists(inputPaths.hypothesisTradeReplayPath),
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    oosPowerCorrectionPresent: io.fileExists(inputPaths.oosPowerCorrectionPath),
    calibrationFadeFamilyVerdictPresent: io.fileExists(
      inputPaths.calibrationFadeFamilyVerdictPath,
    ),
    regimeTagsPresent: io.fileExists(inputPaths.regimeTagsPath),
    monthRegimeAnalysisPresent: io.fileExists(inputPaths.monthRegimeAnalysisPath),
  };
}

export function loadHypothesisTradeReplayReport(
  io: PnlForensicsGateIo,
  path: string,
): HypothesisTradeReplayReport {
  if (!io.fileExists(path)) {
    throw new PnlForensicsGateError(
      `Missing required input: ${path}`,
      PnlForensicsGateErrorCode.MISSING_INPUT,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(path));
  } catch {
    throw new PnlForensicsGateError(
      `${path} contains invalid JSON`,
      PnlForensicsGateErrorCode.INVALID_JSON,
    );
  }

  const result = tradeReplaySchema.safeParse(parsed);
  if (!result.success) {
    throw new PnlForensicsGateError(
      `${path} is not a valid hypothesis trade replay report`,
      PnlForensicsGateErrorCode.INVALID_DOCUMENT,
    );
  }

  return parsed as HypothesisTradeReplayReport;
}

export type LoadedPnlForensicsGateInputs = {
  tradeReplay: HypothesisTradeReplayReport;
  candidates: ReturnType<typeof loadHypothesisTradeReplayInputs>["candidates"];
  observations: ReturnType<typeof loadHypothesisTradeReplayInputs>["observations"];
  regimeVolatilityByMarket: ReturnType<
    typeof loadHypothesisTradeReplayInputs
  >["regimeVolatilityByMarket"];
  regimeTags: RegimeTagLookup;
  optionalArtifacts: {
    hypothesisValidation: unknown | null;
    oosPowerCorrection: unknown | null;
    calibrationFadeFamilyVerdict: unknown | null;
    monthRegimeAnalysis: unknown | null;
  };
};

export function loadPnlForensicsGateInputs(input: {
  inputPaths: PnlForensicsGateInputPaths;
  io: PnlForensicsGateIo;
  replayInputOverrides?: Partial<
    import("@/lib/data/research/hypothesisTradeReplay/hypothesisTradeReplayTypes").HypothesisTradeReplayInputPaths
  >;
}): LoadedPnlForensicsGateInputs {
  const tradeReplay = loadHypothesisTradeReplayReport(
    input.io,
    input.inputPaths.hypothesisTradeReplayPath,
  );

  const replayInputPaths = {
    ...tradeReplay.inputPaths,
    hypothesisCandidatesPath: input.inputPaths.hypothesisCandidatesPath,
    regimeTagsPath: input.inputPaths.regimeTagsPath,
    ...input.replayInputOverrides,
  };

  const replayInputs = loadHypothesisTradeReplayInputs({
    inputPaths: replayInputPaths,
    config: tradeReplay.config,
    io: input.io,
  });

  const regimeArtifact =
    tryReadJson(input.inputPaths.regimeTagsPath, input.io)
    ?? tryReadJson(replayInputPaths.regimeTagsPath, input.io);

  return {
    tradeReplay,
    candidates: replayInputs.candidates,
    observations: replayInputs.observations,
    regimeVolatilityByMarket: replayInputs.regimeVolatilityByMarket,
    regimeTags: buildRegimeTagLookupFromArtifact(regimeArtifact),
    optionalArtifacts: {
      hypothesisValidation: tryReadJson(
        input.inputPaths.hypothesisValidationPath,
        input.io,
      ),
      oosPowerCorrection: tryReadJson(input.inputPaths.oosPowerCorrectionPath, input.io),
      calibrationFadeFamilyVerdict: tryReadJson(
        input.inputPaths.calibrationFadeFamilyVerdictPath,
        input.io,
      ),
      monthRegimeAnalysis: tryReadJson(
        input.inputPaths.monthRegimeAnalysisPath,
        input.io,
      ),
    },
  };
}
