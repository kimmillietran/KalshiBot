import { dirname, join } from "node:path";

import type {
  CalibrationFadeV2EvidenceStrengthIo,
  EvaluatedMarketInput,
} from "./calibrationFadeV2EvidenceStrengthTypes";
import { CalibrationFadeV2EvidenceStrengthError } from "./calibrationFadeV2EvidenceStrengthTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export type LoadedCrossRunReport = {
  runSetHash: string;
  settlementSnapshotHash: string;
  evidenceMode: string;
  selectedRunIds: readonly string[];
  selectedRunCount: number;
  uniqueCandidateMarketCount: number;
  evaluatedIndependentCandidateMarketCount: number;
  candidateEpisodeCount: number | null;
  settlementCoverageShare: number | null;
  interpretationClassification: string;
  recommendedNextAction: string | null;
  marketsOutputPath: string | null;
  minimumIndependentCandidateMarkets: number | null;
  minimumSettlementCoverageShare: number | null;
  perRunSummaries: readonly {
    runId: string;
    candidateEpisodeCount: number | null;
    candidateMarketCount: number | null;
    captureRunDir: string | null;
  }[];
  raw: Record<string, unknown>;
};

export type LoadedHypothesisThresholds = {
  minimumIndependentCandidateMarkets: number;
  materialRejectionCalibrationGap: number;
  materialSupportCalibrationGap: number;
  calibrationDirection: "over" | "under";
  minimumSettlementCoverageShare: number;
  hasExplicitFixedN: boolean;
  hasExplicitHorizon: boolean;
  hasSequentialCorrection: boolean;
  rawKeys: readonly string[];
};

export function loadCrossRunReport(
  io: CalibrationFadeV2EvidenceStrengthIo,
  path: string,
): LoadedCrossRunReport {
  if (!io.fileExists(path)) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      `Cross-run report not found: ${path}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(path).replace(/^\uFEFF/, ""));
  } catch {
    throw new CalibrationFadeV2EvidenceStrengthError(
      `Cross-run report is not valid JSON: ${path}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      `Cross-run report must be a JSON object: ${path}`,
    );
  }

  const runSetHash = readString(parsed.runSetHash);
  const settlementSnapshotHash = readString(parsed.settlementSnapshotHash);
  const evidenceMode = readString(parsed.evidenceMode);
  const interpretationClassification = readString(parsed.interpretationClassification);
  if (!runSetHash || !settlementSnapshotHash || !evidenceMode || !interpretationClassification) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      "Cross-run report is missing required identity fields "
        + "(runSetHash, settlementSnapshotHash, evidenceMode, interpretationClassification)",
    );
  }
  if (evidenceMode !== "confirmatory") {
    throw new CalibrationFadeV2EvidenceStrengthError(
      `Evidence-strength audit requires confirmatory evidenceMode; received ${JSON.stringify(evidenceMode)}`,
    );
  }

  const selectedRunIdsRaw = parsed.selectedRunIds;
  if (!Array.isArray(selectedRunIdsRaw) || selectedRunIdsRaw.length === 0) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      "Cross-run report selectedRunIds must be a non-empty array",
    );
  }
  const selectedRunIds = selectedRunIdsRaw.map((value, index) => {
    const id = readString(value);
    if (!id) {
      throw new CalibrationFadeV2EvidenceStrengthError(
        `Cross-run report selectedRunIds[${index}] must be a non-empty string`,
      );
    }
    return id;
  });

  const perRunSummaries = Array.isArray(parsed.perRunSummaries)
    ? parsed.perRunSummaries.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new CalibrationFadeV2EvidenceStrengthError(
          `perRunSummaries[${index}] must be an object`,
        );
      }
      const runId = readString(entry.runId) ?? readString(entry.selectedRunId);
      if (!runId) {
        throw new CalibrationFadeV2EvidenceStrengthError(
          `perRunSummaries[${index}] is missing runId`,
        );
      }
      return {
        runId,
        candidateEpisodeCount: readNumber(entry.candidateEpisodeCount),
        candidateMarketCount: readNumber(entry.candidateMarketCount),
        captureRunDir: readString(entry.captureRunDir),
      };
    })
    : [];

  return {
    runSetHash,
    settlementSnapshotHash,
    evidenceMode,
    selectedRunIds,
    selectedRunCount: readNumber(parsed.selectedRunCount) ?? selectedRunIds.length,
    uniqueCandidateMarketCount: readNumber(parsed.uniqueCandidateMarketCount) ?? 0,
    evaluatedIndependentCandidateMarketCount:
      readNumber(parsed.evaluatedIndependentCandidateMarketCount)
      ?? readNumber(parsed.uniqueCandidateMarketCount)
      ?? 0,
    candidateEpisodeCount: readNumber(parsed.candidateEpisodeCount),
    settlementCoverageShare: readNumber(parsed.settlementCoverageShare),
    interpretationClassification,
    recommendedNextAction: readString(parsed.recommendedNextAction),
    marketsOutputPath: readString(parsed.marketsOutputPath),
    minimumIndependentCandidateMarkets: readNumber(parsed.minimumIndependentCandidateMarkets),
    minimumSettlementCoverageShare: readNumber(parsed.minimumSettlementCoverageShare),
    perRunSummaries,
    raw: parsed,
  };
}

export function resolveMarketsPath(input: {
  io: CalibrationFadeV2EvidenceStrengthIo;
  crossRunReportPath: string;
  explicitMarketsPath: string | null;
  reportMarketsOutputPath: string | null;
}): string {
  if (input.explicitMarketsPath) {
    return input.explicitMarketsPath;
  }

  const sibling = join(
    dirname(input.crossRunReportPath),
    "calibration-fade-v2-cross-run-markets.jsonl",
  );
  const candidates: string[] = [];
  if (input.reportMarketsOutputPath) {
    candidates.push(input.reportMarketsOutputPath);
    const base = input.reportMarketsOutputPath.replace(/\\/g, "/").split("/").pop();
    if (base) {
      candidates.push(join(dirname(input.crossRunReportPath), base));
    }
  }
  candidates.push(sibling);

  for (const candidate of candidates) {
    if (input.io.fileExists(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? sibling;
}

export function loadEvaluatedMarketsFromJsonl(
  io: CalibrationFadeV2EvidenceStrengthIo,
  path: string,
): EvaluatedMarketInput[] {
  if (!io.fileExists(path)) {
    throw new CalibrationFadeV2EvidenceStrengthError(`Markets JSONL not found: ${path}`);
  }
  const text = io.readFile(path).replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const markets: EvaluatedMarketInput[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]!);
    } catch {
      throw new CalibrationFadeV2EvidenceStrengthError(
        `Malformed markets JSONL at line ${index + 1}: ${path}`,
      );
    }
    if (!isRecord(parsed)) {
      throw new CalibrationFadeV2EvidenceStrengthError(
        `Markets JSONL line ${index + 1} must be an object`,
      );
    }

    const evaluated = readBoolean(parsed.evaluated);
    if (evaluated === false) {
      continue;
    }

    const canonical = isRecord(parsed.selectedCanonicalEntry)
      ? parsed.selectedCanonicalEntry
      : parsed;
    const marketTicker = readString(canonical.marketTicker) ?? readString(parsed.marketTicker);
    const impliedYesProbability = readNumber(canonical.impliedYesProbability);
    const settledOutcomeRaw = readString(canonical.settledOutcome);
    const selectedRunId =
      readString(canonical.selectedRunId) ?? readString(parsed.selectedRunId);
    if (!marketTicker || impliedYesProbability === null || !selectedRunId) {
      throw new CalibrationFadeV2EvidenceStrengthError(
        `Markets JSONL line ${index + 1} missing marketTicker/impliedYesProbability/selectedRunId`,
      );
    }
    if (settledOutcomeRaw !== "yes" && settledOutcomeRaw !== "no") {
      // Unsettled markets are excluded from calibrated-null strength of settled evidence.
      continue;
    }

    markets.push({
      marketTicker,
      impliedYesProbability,
      settledOutcome: settledOutcomeRaw,
      entryTimestamp: readString(canonical.entryTimestamp),
      selectedRunId,
      calibrationGapSigned: readNumber(canonical.calibrationGapSigned),
    });
  }

  markets.sort((left, right) => left.marketTicker.localeCompare(right.marketTicker));
  return markets;
}

export function loadFrozenHypothesisThresholds(
  io: CalibrationFadeV2EvidenceStrengthIo,
  path: string,
): LoadedHypothesisThresholds {
  if (!io.fileExists(path)) {
    throw new CalibrationFadeV2EvidenceStrengthError(`Hypothesis config not found: ${path}`);
  }
  const parsed = JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as unknown;
  if (!isRecord(parsed)) {
    throw new CalibrationFadeV2EvidenceStrengthError("Hypothesis config must be a JSON object");
  }
  const minimumEvidence = isRecord(parsed.minimumEvidenceRequirements)
    ? parsed.minimumEvidenceRequirements
    : null;
  if (!minimumEvidence) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      "Hypothesis config missing minimumEvidenceRequirements",
    );
  }
  const minimumIndependentCandidateMarkets = readNumber(
    minimumEvidence.minimumIndependentCandidateMarkets,
  );
  const materialRejectionCalibrationGap = readNumber(
    minimumEvidence.materialRejectionCalibrationGap,
  );
  const materialSupportCalibrationGap = readNumber(
    minimumEvidence.materialSupportCalibrationGap,
  );
  const minimumSettlementCoverageShare = readNumber(
    minimumEvidence.minimumSettlementCoverageShare,
  );
  const calibrationDirection = readString(parsed.calibrationDirection);
  if (
    minimumIndependentCandidateMarkets === null
    || materialRejectionCalibrationGap === null
    || materialSupportCalibrationGap === null
    || minimumSettlementCoverageShare === null
    || (calibrationDirection !== "over" && calibrationDirection !== "under")
  ) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      "Hypothesis config is missing required frozen calibration thresholds",
    );
  }

  const rawKeys = Object.keys(parsed);
  const hasExplicitFixedN =
    rawKeys.includes("fixedFinalN")
    || rawKeys.includes("fixedSampleSize")
    || rawKeys.includes("stoppingN");
  const hasExplicitHorizon =
    rawKeys.includes("fixedCaptureHorizon")
    || rawKeys.includes("captureHorizonHours")
    || rawKeys.includes("stoppingHorizon");
  const hasSequentialCorrection =
    rawKeys.includes("sequentialTestingCorrection")
    || rawKeys.includes("alphaSpending")
    || rawKeys.includes("optionalStoppingCorrection");

  return {
    minimumIndependentCandidateMarkets,
    materialRejectionCalibrationGap,
    materialSupportCalibrationGap,
    calibrationDirection,
    minimumSettlementCoverageShare,
    hasExplicitFixedN,
    hasExplicitHorizon,
    hasSequentialCorrection,
    rawKeys,
  };
}

function confirmatoryIncidenceCandidatePaths(
  crossRunReportPath: string,
  runId: string,
): readonly string[] {
  const relative =
    `data/research-results/calibration-fade-v2/confirmatory/${runId}/calibration-fade-forward-validation.json`;
  const candidates = [relative];
  const normalized = crossRunReportPath.replace(/\\/g, "/");
  const marker = "/cross-run/confirmatory/";
  const index = normalized.lastIndexOf(marker);
  if (index >= 0) {
    const root = normalized.slice(0, index);
    candidates.push(
      `${root}/confirmatory/${runId}/calibration-fade-forward-validation.json`,
    );
  }
  return candidates;
}

export function loadOptionalConfirmatoryIncidence(
  io: CalibrationFadeV2EvidenceStrengthIo,
  runId: string,
  crossRunReportPath: string,
): {
  recordsScanned: number | null;
  qualifyingObservationCount: number | null;
  candidateEpisodeCount: number | null;
  runDurationSeconds: number | null;
} {
  const empty = {
    recordsScanned: null,
    qualifyingObservationCount: null,
    candidateEpisodeCount: null,
    runDurationSeconds: null,
  };
  const path = confirmatoryIncidenceCandidatePaths(crossRunReportPath, runId).find((candidate) =>
    io.fileExists(candidate),
  );
  if (!path) {
    return empty;
  }
  try {
    const parsed = JSON.parse(io.readFile(path).replace(/^\uFEFF/, "")) as unknown;
    if (!isRecord(parsed)) {
      return empty;
    }
    const captureRunId = readString(parsed.captureRunId) ?? readString(parsed.selectedRunId);
    if (captureRunId !== runId) {
      return empty;
    }
    const quality = isRecord(parsed.selectedRunQuality) ? parsed.selectedRunQuality : null;
    return {
      recordsScanned: readNumber(parsed.recordsScanned),
      qualifyingObservationCount: readNumber(parsed.qualifyingObservationCount),
      candidateEpisodeCount: readNumber(parsed.candidateEpisodeCount),
      runDurationSeconds: quality ? readNumber(quality.runDurationSeconds) : null,
    };
  } catch {
    return empty;
  }
}
