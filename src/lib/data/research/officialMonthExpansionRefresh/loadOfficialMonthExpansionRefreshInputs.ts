import type { HistoricalCoveragePlanReport } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";

import {
  OfficialMonthExpansionRefreshError,
  OfficialMonthExpansionRefreshErrorCode,
  type OfficialMonthExpansionRefreshInputPaths,
  type OfficialMonthExpansionRefreshInputStatus,
  type OfficialMonthExpansionRefreshIo,
} from "./officialMonthExpansionRefreshTypes";

function tryReadJson(path: string, io: OfficialMonthExpansionRefreshIo): unknown | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return JSON.parse(io.readFile(path));
  } catch (error) {
    throw new OfficialMonthExpansionRefreshError(
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : "parse error"}`,
      OfficialMonthExpansionRefreshErrorCode.INVALID_JSON,
    );
  }
}

export function buildDefaultOfficialMonthExpansionRefreshInputPaths(
  overrides?: Partial<OfficialMonthExpansionRefreshInputPaths>,
): OfficialMonthExpansionRefreshInputPaths {
  const researchResultsDir = overrides?.researchResultsDir ?? "data/research-results";

  return {
    researchResultsDir,
    historicalCoveragePlanPath:
      overrides?.historicalCoveragePlanPath
      ?? `${researchResultsDir}/historical-coverage-plan.json`,
    historicalExpansionConfigPath:
      overrides?.historicalExpansionConfigPath
      ?? "data/import-configs/historical-expansion-config.json",
    hypothesisCandidatesPath:
      overrides?.hypothesisCandidatesPath
      ?? `${researchResultsDir}/hypothesis-candidates.json`,
    hypothesisValidationPath:
      overrides?.hypothesisValidationPath
      ?? `${researchResultsDir}/hypothesis-validation.json`,
    hypothesisTradeReplayPath:
      overrides?.hypothesisTradeReplayPath
      ?? `${researchResultsDir}/hypothesis-trade-replay.json`,
    calibrationFadeFamilyVerdictPath:
      overrides?.calibrationFadeFamilyVerdictPath
      ?? `${researchResultsDir}/calibration-fade-family-verdict.json`,
    pnlForensicsGatePath:
      overrides?.pnlForensicsGatePath
      ?? `${researchResultsDir}/pnl-forensics-gate.json`,
    derivedMonthPnlSensitivityPath:
      overrides?.derivedMonthPnlSensitivityPath
      ?? `${researchResultsDir}/derived-month-pnl-sensitivity.json`,
    mispricingAtlasPath:
      overrides?.mispricingAtlasPath ?? `${researchResultsDir}/mispricing-atlas.json`,
    dataHealthPath: overrides?.dataHealthPath ?? `${researchResultsDir}/data-health.json`,
    regimeTagsPath: overrides?.regimeTagsPath ?? `${researchResultsDir}/regime-tags.json`,
  };
}

export function resolveOfficialMonthExpansionRefreshInputStatus(
  io: OfficialMonthExpansionRefreshIo,
  inputPaths: OfficialMonthExpansionRefreshInputPaths,
): OfficialMonthExpansionRefreshInputStatus {
  return {
    historicalCoveragePlanPresent: io.fileExists(inputPaths.historicalCoveragePlanPath),
    historicalExpansionConfigPresent: io.fileExists(inputPaths.historicalExpansionConfigPath),
    hypothesisCandidatesPresent: io.fileExists(inputPaths.hypothesisCandidatesPath),
    hypothesisValidationPresent: io.fileExists(inputPaths.hypothesisValidationPath),
    hypothesisTradeReplayPresent: io.fileExists(inputPaths.hypothesisTradeReplayPath),
    calibrationFadeFamilyVerdictPresent: io.fileExists(
      inputPaths.calibrationFadeFamilyVerdictPath,
    ),
    pnlForensicsGatePresent: io.fileExists(inputPaths.pnlForensicsGatePath),
    derivedMonthPnlSensitivityPresent: io.fileExists(
      inputPaths.derivedMonthPnlSensitivityPath,
    ),
  };
}

export type LoadedOfficialMonthExpansionRefreshArtifacts = {
  historicalCoveragePlan: HistoricalCoveragePlanReport | null;
  hypothesisCandidates: unknown | null;
  hypothesisValidation: unknown | null;
  hypothesisTradeReplay: unknown | null;
  calibrationFadeFamilyVerdict: unknown | null;
  pnlForensicsGate: unknown | null;
  derivedMonthPnlSensitivity: unknown | null;
  mispricingAtlas: unknown | null;
};

export function loadOfficialMonthExpansionRefreshArtifacts(input: {
  inputPaths: OfficialMonthExpansionRefreshInputPaths;
  io: OfficialMonthExpansionRefreshIo;
}): LoadedOfficialMonthExpansionRefreshArtifacts {
  return {
    historicalCoveragePlan: tryReadJson(
      input.inputPaths.historicalCoveragePlanPath,
      input.io,
    ) as HistoricalCoveragePlanReport | null,
    hypothesisCandidates: tryReadJson(
      input.inputPaths.hypothesisCandidatesPath,
      input.io,
    ),
    hypothesisValidation: tryReadJson(
      input.inputPaths.hypothesisValidationPath,
      input.io,
    ),
    hypothesisTradeReplay: tryReadJson(
      input.inputPaths.hypothesisTradeReplayPath,
      input.io,
    ),
    calibrationFadeFamilyVerdict: tryReadJson(
      input.inputPaths.calibrationFadeFamilyVerdictPath,
      input.io,
    ),
    pnlForensicsGate: tryReadJson(input.inputPaths.pnlForensicsGatePath, input.io),
    derivedMonthPnlSensitivity: tryReadJson(
      input.inputPaths.derivedMonthPnlSensitivityPath,
      input.io,
    ),
    mispricingAtlas: tryReadJson(input.inputPaths.mispricingAtlasPath, input.io),
  };
}
