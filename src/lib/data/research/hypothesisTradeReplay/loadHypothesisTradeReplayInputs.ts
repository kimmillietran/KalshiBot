import { loadHypothesisCandidatesFromFile } from "@/lib/data/research/hypothesisRobustness/loadHypothesisValidationInputs";
import {
  DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
  DEFAULT_REGIME_TAGS_INPUT_PATH,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_CALIBRATION_INPUT_DIR } from "@/lib/data/research/calibration/calibrationTypes";

import {
  collectReplayableObservations,
  loadRegimeVolatilityByMarket,
} from "./collectReplayableObservations";
import type {
  HypothesisTradeReplayConfig,
  HypothesisTradeReplayInputPaths,
  HypothesisTradeReplayInputStatus,
  HypothesisTradeReplayIo,
} from "./hypothesisTradeReplayTypes";
import {
  DEFAULT_COST_AWARE_ATLAS_INPUT_PATH,
  HypothesisTradeReplayError,
  HypothesisTradeReplayErrorCode,
} from "./hypothesisTradeReplayTypes";

export function buildDefaultHypothesisTradeReplayInputPaths(
  overrides?: Partial<HypothesisTradeReplayInputPaths>,
): HypothesisTradeReplayInputPaths {
  return {
    hypothesisCandidatesPath:
      overrides?.hypothesisCandidatesPath ?? "data/research-results/hypothesis-candidates.json",
    mispricingAtlasPath:
      overrides?.mispricingAtlasPath ?? DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    costAwareAtlasPath:
      overrides?.costAwareAtlasPath ?? DEFAULT_COST_AWARE_ATLAS_INPUT_PATH,
    researchResultsDir:
      overrides?.researchResultsDir ?? DEFAULT_CALIBRATION_INPUT_DIR,
    regimeTagsPath: overrides?.regimeTagsPath ?? DEFAULT_REGIME_TAGS_INPUT_PATH,
  };
}

export function assertHypothesisTradeReplayInputFiles(
  io: HypothesisTradeReplayIo,
  inputPaths: Pick<HypothesisTradeReplayInputPaths, "hypothesisCandidatesPath">,
): void {
  if (!io.fileExists(inputPaths.hypothesisCandidatesPath)) {
    throw new HypothesisTradeReplayError(
      `Missing hypothesis candidates input: ${inputPaths.hypothesisCandidatesPath}`,
      HypothesisTradeReplayErrorCode.MISSING_INPUT,
    );
  }
}

export function resolveHypothesisTradeReplayInputStatus(
  io: HypothesisTradeReplayIo,
  inputPaths: HypothesisTradeReplayInputPaths,
): HypothesisTradeReplayInputStatus {
  return {
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    mispricingAtlasPresent: io.fileExists(inputPaths.mispricingAtlasPath),
    costAwareAtlasPresent: io.fileExists(inputPaths.costAwareAtlasPath),
  };
}

export function loadHypothesisTradeReplayInputs(input: {
  inputPaths: HypothesisTradeReplayInputPaths;
  config: HypothesisTradeReplayConfig;
  io: HypothesisTradeReplayIo;
}) {
  const candidates = loadHypothesisCandidatesFromFile(
    input.io,
    input.inputPaths.hypothesisCandidatesPath,
  );

  const calibrationIo = {
    readFile: input.io.readFile,
    fileExists: input.io.fileExists,
    readdir: input.io.readdir,
    isDirectory: input.io.isDirectory,
  };

  const observations = collectReplayableObservations({
    researchResultsDir: input.inputPaths.researchResultsDir,
    regimeTagsPath: input.inputPaths.regimeTagsPath,
    officialOnly: input.config.officialOnly,
    io: input.io,
  });

  const regimeVolatilityByMarket = loadRegimeVolatilityByMarket(
    calibrationIo,
    input.inputPaths.regimeTagsPath,
  );

  return {
    candidates,
    observations,
    regimeVolatilityByMarket,
  };
}
