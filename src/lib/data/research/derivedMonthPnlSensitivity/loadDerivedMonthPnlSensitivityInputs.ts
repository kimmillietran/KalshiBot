import { z } from "zod";

import { discoverDerivedSettlementMarketKeys } from "@/lib/data/research/derivedSettlementSensitivity/discoverDerivedSettlementMarketKeys";
import {
  buildDefaultPnlForensicsGateInputPaths,
  extractFilledTradesForForensics,
  loadPnlForensicsGateInputs,
  PnlForensicsGateError,
  PnlForensicsGateErrorCode,
  type PnlForensicsFilledTrade,
  type PnlForensicsGateReport,
} from "@/lib/data/research/pnlForensicsGate";

import {
  DerivedMonthPnlSensitivityError,
  DerivedMonthPnlSensitivityErrorCode,
  type DerivedMonthPnlSensitivityInputPaths,
  type DerivedMonthPnlSensitivityInputStatus,
  type DerivedMonthPnlSensitivityIo,
} from "./derivedMonthPnlSensitivityTypes";

const pnlForensicsGateSchema = z.object({
  generatedAt: z.string(),
  summary: z.object({
    familyForensicsVerdict: z.string(),
    recommendedNextAction: z.string(),
    familyNetPnlCents: z.number(),
    filledTradeCount: z.number(),
  }),
});

export function buildDefaultDerivedMonthPnlSensitivityInputPaths(
  overrides?: Partial<DerivedMonthPnlSensitivityInputPaths>,
): DerivedMonthPnlSensitivityInputPaths {
  const researchResultsDir =
    overrides?.researchResultsDir ?? "data/research-results";
  const forensicsDefaults = buildDefaultPnlForensicsGateInputPaths({
    hypothesisTradeReplayPath:
      overrides?.hypothesisTradeReplayPath
      ?? `${researchResultsDir}/hypothesis-trade-replay.json`,
    hypothesisCandidatesPath:
      overrides?.hypothesisCandidatesPath
      ?? `${researchResultsDir}/hypothesis-candidates.json`,
    hypothesisValidationPath:
      overrides?.hypothesisValidationPath
      ?? `${researchResultsDir}/hypothesis-validation.json`,
    oosPowerCorrectionPath:
      overrides?.oosPowerCorrectionPath
      ?? `${researchResultsDir}/oos-power-correction.json`,
    calibrationFadeFamilyVerdictPath:
      overrides?.calibrationFadeFamilyVerdictPath
      ?? `${researchResultsDir}/calibration-fade-family-verdict.json`,
    regimeTagsPath:
      overrides?.regimeTagsPath ?? `${researchResultsDir}/regime-tags.json`,
    monthRegimeAnalysisPath:
      overrides?.monthRegimeAnalysisPath
      ?? `${researchResultsDir}/month-regime-analysis.json`,
  });

  return {
    hypothesisTradeReplayPath: forensicsDefaults.hypothesisTradeReplayPath,
    pnlForensicsGatePath:
      overrides?.pnlForensicsGatePath
      ?? `${researchResultsDir}/pnl-forensics-gate.json`,
    hypothesisCandidatesPath: forensicsDefaults.hypothesisCandidatesPath,
    hypothesisValidationPath: forensicsDefaults.hypothesisValidationPath,
    oosPowerCorrectionPath: forensicsDefaults.oosPowerCorrectionPath,
    calibrationFadeFamilyVerdictPath:
      forensicsDefaults.calibrationFadeFamilyVerdictPath,
    derivedSettlementSensitivityPath:
      overrides?.derivedSettlementSensitivityPath
      ?? `${researchResultsDir}/derived-settlement-sensitivity.json`,
    regimeTagsPath: forensicsDefaults.regimeTagsPath,
    researchResultsDir,
  };
}

export function resolveDerivedMonthPnlSensitivityInputStatus(
  io: DerivedMonthPnlSensitivityIo,
  inputPaths: DerivedMonthPnlSensitivityInputPaths,
  derivedMarketKeysCount: number,
  usesSensitiveMonthHeuristic: boolean,
): DerivedMonthPnlSensitivityInputStatus {
  return {
    hypothesisTradeReplayPresent: io.fileExists(inputPaths.hypothesisTradeReplayPath),
    pnlForensicsGatePresent: io.fileExists(inputPaths.pnlForensicsGatePath),
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    oosPowerCorrectionPresent: io.fileExists(inputPaths.oosPowerCorrectionPath),
    calibrationFadeFamilyVerdictPresent: io.fileExists(
      inputPaths.calibrationFadeFamilyVerdictPath,
    ),
    derivedSettlementSensitivityPresent: io.fileExists(
      inputPaths.derivedSettlementSensitivityPath,
    ),
    regimeTagsPresent: io.fileExists(inputPaths.regimeTagsPath),
    derivedMarketKeysDiscovered: derivedMarketKeysCount > 0,
    usesSensitiveMonthHeuristic,
  };
}

function loadPnlForensicsGateSummary(
  path: string,
  io: DerivedMonthPnlSensitivityIo,
): PnlForensicsGateReport["summary"] | null {
  if (!io.fileExists(path)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(path));
  } catch (error) {
    throw new DerivedMonthPnlSensitivityError(
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : "parse error"}`,
      DerivedMonthPnlSensitivityErrorCode.INVALID_JSON,
    );
  }

  const result = pnlForensicsGateSchema.safeParse(parsed);
  if (!result.success) {
    throw new DerivedMonthPnlSensitivityError(
      `Invalid pnl-forensics-gate document at ${path}.`,
      DerivedMonthPnlSensitivityErrorCode.INVALID_DOCUMENT,
    );
  }

  return result.data.summary as PnlForensicsGateReport["summary"];
}

export type LoadedDerivedMonthPnlSensitivityInputs = {
  trades: PnlForensicsFilledTrade[];
  derivedMarketKeys: Set<string>;
  usesSensitiveMonthHeuristic: boolean;
  m11Summary: PnlForensicsGateReport["summary"] | null;
};

export function loadDerivedMonthPnlSensitivityInputs(input: {
  inputPaths: DerivedMonthPnlSensitivityInputPaths;
  io: DerivedMonthPnlSensitivityIo;
}): LoadedDerivedMonthPnlSensitivityInputs {
  if (!input.io.fileExists(input.inputPaths.hypothesisTradeReplayPath)) {
    throw new DerivedMonthPnlSensitivityError(
      `Missing required input: ${input.inputPaths.hypothesisTradeReplayPath}`,
      DerivedMonthPnlSensitivityErrorCode.MISSING_INPUT,
    );
  }

  if (!input.io.fileExists(input.inputPaths.pnlForensicsGatePath)) {
    throw new DerivedMonthPnlSensitivityError(
      `Missing required input: ${input.inputPaths.pnlForensicsGatePath}`,
      DerivedMonthPnlSensitivityErrorCode.MISSING_INPUT,
    );
  }

  let loadedForensicsInputs;
  try {
    loadedForensicsInputs = loadPnlForensicsGateInputs({
      inputPaths: buildDefaultPnlForensicsGateInputPaths({
        hypothesisTradeReplayPath: input.inputPaths.hypothesisTradeReplayPath,
        hypothesisCandidatesPath: input.inputPaths.hypothesisCandidatesPath,
        hypothesisValidationPath: input.inputPaths.hypothesisValidationPath,
        oosPowerCorrectionPath: input.inputPaths.oosPowerCorrectionPath,
        calibrationFadeFamilyVerdictPath:
          input.inputPaths.calibrationFadeFamilyVerdictPath,
        regimeTagsPath: input.inputPaths.regimeTagsPath,
        monthRegimeAnalysisPath:
          `${input.inputPaths.researchResultsDir}/month-regime-analysis.json`,
      }),
      io: input.io,
      replayInputOverrides: {
        researchResultsDir: input.inputPaths.researchResultsDir,
        hypothesisCandidatesPath: input.inputPaths.hypothesisCandidatesPath,
        regimeTagsPath: input.inputPaths.regimeTagsPath,
      },
    });
  } catch (error) {
    if (error instanceof PnlForensicsGateError) {
      throw new DerivedMonthPnlSensitivityError(
        error.message,
        DerivedMonthPnlSensitivityErrorCode.MISSING_INPUT,
      );
    }

    throw error;
  }

  const positiveEntries = loadedForensicsInputs.tradeReplay.entries.filter(
    (entry) => entry.metrics.tradeCount > 0 && entry.metrics.netPnlCents > 0,
  );
  const trades = extractFilledTradesForForensics({
    entries: positiveEntries,
    candidates: loadedForensicsInputs.candidates,
    observations: loadedForensicsInputs.observations,
    regimeVolatilityByMarket: loadedForensicsInputs.regimeVolatilityByMarket,
    config: loadedForensicsInputs.tradeReplay.config,
    regimeTags: loadedForensicsInputs.regimeTags,
  });

  const derivedMarketKeys = input.io.fileExists(input.inputPaths.researchResultsDir)
    ? discoverDerivedSettlementMarketKeys({
      researchResultsDir: input.inputPaths.researchResultsDir,
      io: input.io,
    })
    : new Set<string>();
  const usesSensitiveMonthHeuristic = derivedMarketKeys.size === 0;
  const m11Summary = loadPnlForensicsGateSummary(
    input.inputPaths.pnlForensicsGatePath,
    input.io,
  );

  return {
    trades,
    derivedMarketKeys,
    usesSensitiveMonthHeuristic,
    m11Summary,
  };
}

export { PnlForensicsGateErrorCode };
