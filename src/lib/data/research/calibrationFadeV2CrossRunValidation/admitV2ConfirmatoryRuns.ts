import {
  isRecord,
  readString,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import {
  validateCalibrationFadeMarketRecord,
} from "../calibrationFadeForwardValidation/parseCalibrationFadeMarketRecord";
import type { CalibrationFadeMarketRecord } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

export type SealedV2CandidateMarket = CalibrationFadeMarketRecord & {
  sealedTargetOutcomeSide?: "yes" | "no";
};
import {
  V2_CAPTURE_READINESS_JSON_FILENAME,
  V2_CAPTURE_READINESS_JSON_ROOT,
} from "../calibrationFadeV2CaptureReadiness";
import {
  CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION,
} from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import type { CalibrationFadeV2ForwardValidationReport } from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import {
  CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
  CALIBRATION_FADE_V2_HYPOTHESIS_ID,
  CALIBRATION_FADE_V2_HYPOTHESIS_VERSION,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
  isProspectiveConfirmatoryEvidenceEligible,
  type CalibrationFadeV2ProvenanceManifest,
} from "../calibrationFadeV2Preregistration";
import { RESEARCH_READY_CAPTURE_VERDICT } from "../selectedRunCaptureHealth";

import { hashArtifactContents } from "./hashArtifactContents";
import { identifyCaptureRunDir, type NormalizedCaptureRun } from "./normalizeCaptureRunDirs";
import {
  CalibrationFadeV2CrossRunValidationError,
  type CalibrationFadeV2CrossRunValidationIo,
  type V2CrossRunPerRunIdentity,
} from "./calibrationFadeV2CrossRunValidationTypes";

export type AdmittedV2ConfirmatoryRun = {
  captureRun: NormalizedCaptureRun;
  report: CalibrationFadeV2ForwardValidationReport;
  markets: SealedV2CandidateMarket[];
  confirmatoryReportPath: string;
  confirmatoryMarketsPath: string;
  readinessPath: string;
  confirmatoryReportSha: string;
  confirmatoryMarketsSha: string;
  identity: V2CrossRunPerRunIdentity;
};

function confirmatoryReportPath(runId: string): string {
  return `data/research-results/calibration-fade-v2/confirmatory/${runId}/calibration-fade-forward-validation.json`;
}

function confirmatoryMarketsPath(runId: string): string {
  return `data/research-results/calibration-fade-v2/confirmatory/${runId}/calibration-fade-forward-markets.jsonl`;
}

function readinessPath(runId: string): string {
  return `${V2_CAPTURE_READINESS_JSON_ROOT}/${runId}/${V2_CAPTURE_READINESS_JSON_FILENAME}`;
}

function requireExistingFile(
  io: CalibrationFadeV2CrossRunValidationIo,
  path: string,
  label: string,
): string {
  if (!io.fileExists(path)) {
    throw new CalibrationFadeV2CrossRunValidationError(`${label} missing: ${path}`);
  }
  const content = io.readFile(path);
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new CalibrationFadeV2CrossRunValidationError(`${label} is empty or unreadable: ${path}`);
  }
  return content;
}

function parseJsonObject(content: string, path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch {
    throw new CalibrationFadeV2CrossRunValidationError(`Malformed confirmatory JSON: ${path}`);
  }
  if (!isRecord(parsed)) {
    throw new CalibrationFadeV2CrossRunValidationError(`Confirmatory JSON root must be an object: ${path}`);
  }
  return parsed;
}

function requireExactString(
  record: Record<string, unknown>,
  key: string,
  expected: string,
  path: string,
): string {
  const value = readString(record[key]);
  if (value !== expected) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `${path} ${key} must be ${JSON.stringify(expected)}; received ${JSON.stringify(record[key])}`,
    );
  }
  return value;
}

function requireMatchingIdentityString(input: {
  field: string;
  topLevel: unknown;
  nested: unknown;
  runId: string;
  expected?: string;
}): string {
  const topLevel = readString(input.topLevel);
  const nested = readString(input.nested);
  if (!topLevel) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `sealed identity ${input.field} missing at top-level report for ${input.runId}`,
    );
  }
  if (!nested) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `sealed identity evidenceIdentity.${input.field} missing for ${input.runId}`,
    );
  }
  if (topLevel !== nested) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `sealed identity evidenceIdentity.${input.field} mismatch for ${input.runId}: `
        + `report.${input.field}=${JSON.stringify(topLevel)} `
        + `evidenceIdentity.${input.field}=${JSON.stringify(nested)}`,
    );
  }
  if (input.expected !== undefined && topLevel !== input.expected) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `sealed identity ${input.field} must equal explicit run-dir segment ${input.expected} `
        + `for ${input.runId}; received ${JSON.stringify(topLevel)}`,
    );
  }
  return topLevel;
}

function parseSealedMarkets(
  content: string,
  path: string,
  expected: {
    runId: string;
    configurationHash: string;
    hypothesisId: string;
  },
): SealedV2CandidateMarket[] {
  const markets: SealedV2CandidateMarket[] = [];
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim().length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new CalibrationFadeV2CrossRunValidationError(
        `Malformed confirmatory markets JSONL at ${path}:${index + 1}`,
      );
    }
    const validated = validateCalibrationFadeMarketRecord(parsed);
    if (!validated.record) {
      throw new CalibrationFadeV2CrossRunValidationError(
        `Malformed confirmatory markets JSONL at ${path}:${index + 1}: ${validated.errors.join("; ")}`,
      );
    }
    if (isRecord(parsed)) {
      const extras = [
        ["captureRunId", expected.runId],
        ["selectedRunId", expected.runId],
        ["hypothesisId", expected.hypothesisId],
        ["hypothesisVersion", CALIBRATION_FADE_V2_HYPOTHESIS_VERSION],
        ["hypothesisConfigurationHash", expected.configurationHash],
        ["configurationHash", expected.configurationHash],
        ["evidenceMode", "confirmatory"],
      ] as const;
      for (const [key, expectedValue] of extras) {
        if (key in parsed) {
          const actual = readString(parsed[key]);
          if (actual !== expectedValue) {
            throw new CalibrationFadeV2CrossRunValidationError(
              `Market row identity mismatch at ${path}:${index + 1}: ${key} `
                + `must be ${JSON.stringify(expectedValue)}; received ${JSON.stringify(parsed[key])}`,
            );
          }
        }
      }
    }
    const sealedTarget =
      isRecord(parsed) && (parsed.targetOutcomeSide === "yes" || parsed.targetOutcomeSide === "no")
        ? parsed.targetOutcomeSide
        : undefined;
    markets.push(
      sealedTarget
        ? { ...validated.record, sealedTargetOutcomeSide: sealedTarget }
        : validated.record,
    );
  }
  return markets;
}

export function admitV2ConfirmatoryRun(input: {
  io: CalibrationFadeV2CrossRunValidationIo;
  captureRun: NormalizedCaptureRun;
  configurationHash: string;
  provenance: CalibrationFadeV2ProvenanceManifest;
}): AdmittedV2ConfirmatoryRun {
  const { runId, captureRunDir } = input.captureRun;
  const reportPath = confirmatoryReportPath(runId);
  const marketsPath = confirmatoryMarketsPath(runId);
  const readyPath = readinessPath(runId);

  const reportContent = requireExistingFile(input.io, reportPath, "Sealed confirmatory validation JSON");
  const marketsContent = requireExistingFile(input.io, marketsPath, "Sealed confirmatory markets JSONL");
  const readinessContent = requireExistingFile(input.io, readyPath, "v2 readiness artifact");

  const report = parseJsonObject(reportContent, reportPath);
  const evidenceIdentity = isRecord(report.evidenceIdentity) ? report.evidenceIdentity : null;
  if (!evidenceIdentity) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Missing confirmatory evidence identity: ${reportPath}`,
    );
  }

  const analysisVersion = readString(report.analysisVersion);
  if (!analysisVersion) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `analysisVersion is required on confirmatory report ${reportPath}`,
    );
  }
  if (analysisVersion !== CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `v1 or unexpected confirmatory analysisVersion ${JSON.stringify(analysisVersion)} rejected for ${runId}`,
    );
  }

  requireExactString(report, "hypothesisVersion", CALIBRATION_FADE_V2_HYPOTHESIS_VERSION, reportPath);
  requireExactString(evidenceIdentity, "hypothesisVersion", CALIBRATION_FADE_V2_HYPOTHESIS_VERSION, reportPath);
  requireExactString(report, "hypothesisId", CALIBRATION_FADE_V2_HYPOTHESIS_ID, reportPath);
  requireExactString(evidenceIdentity, "hypothesisId", CALIBRATION_FADE_V2_HYPOTHESIS_ID, reportPath);

  const reportHash =
    readString(report.hypothesisConfigurationHash) ?? readString(report.configurationHash);
  const identityHash = readString(evidenceIdentity.configurationHash);
  if (reportHash !== input.configurationHash || identityHash !== input.configurationHash) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `configurationHash mismatch for ${runId}: expected ${input.configurationHash}`,
    );
  }

  requireExactString(report, "freezeCommitSha", CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA, reportPath);
  requireExactString(evidenceIdentity, "freezeCommitSha", CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA, reportPath);
  requireExactString(report, "sourceRecordType", V2_REQUIRED_SOURCE_RECORD_TYPE, reportPath);
  requireExactString(evidenceIdentity, "sourceRecordType", V2_REQUIRED_SOURCE_RECORD_TYPE, reportPath);
  requireExactString(report, "evidenceMode", "confirmatory", reportPath);
  requireExactString(evidenceIdentity, "evidenceMode", "confirmatory", reportPath);

  if (report.confirmatoryEligibility !== true || evidenceIdentity.confirmatoryEligibility !== true) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `confirmatoryEligibility must be true for ${runId}`,
    );
  }

  const selectedRunId = readString(report.selectedRunId);
  if (selectedRunId !== runId) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `selectedRunId must equal explicit run-dir segment ${runId}`,
    );
  }
  requireMatchingIdentityString({
    field: "captureRunId",
    topLevel: report.captureRunId,
    nested: evidenceIdentity.captureRunId,
    runId,
    expected: runId,
  });

  const captureStartedAt = requireMatchingIdentityString({
    field: "captureStartedAt",
    topLevel: report.captureStartedAt,
    nested: evidenceIdentity.captureStartedAt,
    runId,
  });
  if (
    !isProspectiveConfirmatoryEvidenceEligible({
      freezeBoundary: input.provenance,
      runStartIso: captureStartedAt,
      runId,
    })
  ) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `captureStartedAt is not prospectively eligible for confirmatory aggregation: ${runId}`,
    );
  }

  const featureCompatibility = isRecord(report.featureCompatibility) ? report.featureCompatibility : null;
  if (!featureCompatibility) {
    throw new CalibrationFadeV2CrossRunValidationError(`featureCompatibility missing for ${runId}`);
  }
  const incompatible = featureCompatibility.incompatibleFeatures;
  if (!Array.isArray(incompatible) || incompatible.length !== 0) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `featureCompatibility.incompatibleFeatures must be empty for ${runId}`,
    );
  }
  if (featureCompatibility.spotUsedForVolatility !== false) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `spotUsedForVolatility must be false for ${runId}`,
    );
  }

  const quality = isRecord(report.selectedRunQuality) ? report.selectedRunQuality : null;
  if (!quality) {
    throw new CalibrationFadeV2CrossRunValidationError(`selectedRunQuality missing for ${runId}`);
  }
  if (quality.captureVerdict !== RESEARCH_READY_CAPTURE_VERDICT) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `selectedRunQuality.captureVerdict must be ${RESEARCH_READY_CAPTURE_VERDICT} for ${runId}`,
    );
  }
  if (quality.researchReadyVerified !== true) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `selectedRunQuality.researchReadyVerified must be true for ${runId}`,
    );
  }

  const readiness = parseJsonObject(readinessContent, readyPath);
  if (readString(readiness.selectedRunId) !== runId) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Readiness artifact selectedRunId must match ${runId}`,
    );
  }
  if (readiness.verdict !== "v2-capture-ready") {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Readiness verdict must be v2-capture-ready for ${runId}; received ${JSON.stringify(readiness.verdict)}`,
    );
  }
  if (readiness.confirmatoryEligibility !== true) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Readiness confirmatoryEligibility must be true for ${runId}`,
    );
  }
  const readinessCaptureRunDir = readString(readiness.captureRunDir);
  if (!readinessCaptureRunDir) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Readiness captureRunDir missing for ${runId}`,
    );
  }
  const readinessRun = identifyCaptureRunDir(readinessCaptureRunDir);
  if (readinessRun.runId !== runId) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Readiness captureRunDir must identify explicit run ${runId}; resolved ${readinessRun.runId}`,
    );
  }

  const markets = parseSealedMarkets(marketsContent, marketsPath, {
    runId,
    configurationHash: input.configurationHash,
    hypothesisId: CALIBRATION_FADE_V2_HYPOTHESIS_ID,
  });
  const uniqueTickers = new Set(markets.map((market) => market.marketTicker));
  if (typeof report.candidateMarketCount !== "number" || report.candidateMarketCount !== uniqueTickers.size) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Sealed candidateMarketCount ${JSON.stringify(report.candidateMarketCount)} `
        + `does not match unique markets JSONL count ${uniqueTickers.size} for ${runId}`,
    );
  }

  const confirmatoryReportSha = hashArtifactContents(reportContent);
  const confirmatoryMarketsSha = hashArtifactContents(marketsContent);
  return {
    captureRun: { captureRunDir, runId },
    report: report as unknown as CalibrationFadeV2ForwardValidationReport,
    markets,
    confirmatoryReportPath: reportPath,
    confirmatoryMarketsPath: marketsPath,
    readinessPath: readyPath,
    confirmatoryReportSha,
    confirmatoryMarketsSha,
    identity: {
      runId,
      configurationHash: input.configurationHash,
      freezeCommitSha: CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
      evidenceMode: "confirmatory",
      sourceRecordType: V2_REQUIRED_SOURCE_RECORD_TYPE,
      analysisVersion,
      confirmatoryReportSha,
      confirmatoryMarketsSha,
      readinessVerdict: "v2-capture-ready",
    },
  };
}

export function admitAllV2ConfirmatoryRuns(input: {
  io: CalibrationFadeV2CrossRunValidationIo;
  captureRuns: readonly NormalizedCaptureRun[];
  configurationHash: string;
  provenance: CalibrationFadeV2ProvenanceManifest;
}): AdmittedV2ConfirmatoryRun[] {
  const admitted = input.captureRuns.map((captureRun) =>
    admitV2ConfirmatoryRun({
      io: input.io,
      captureRun,
      configurationHash: input.configurationHash,
      provenance: input.provenance,
    }),
  );
  const versions = new Set(admitted.map((entry) => entry.identity.analysisVersion));
  if (versions.size !== 1) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "All selected runs must share an identical single-run analysisVersion",
    );
  }
  return admitted;
}
