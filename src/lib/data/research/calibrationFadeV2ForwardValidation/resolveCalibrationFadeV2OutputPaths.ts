import { resolveSelectedRunId } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import { isRecord, readString } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  CalibrationFadeV2ForwardValidationError,
  V1_FORBIDDEN_OUTPUT_PATHS,
  type CalibrationFadeV2EvidenceIdentity,
  type CalibrationFadeV2EvidenceMode,
  type CalibrationFadeV2ForwardValidationIo,
  type CalibrationFadeV2OutputPaths,
} from "./calibrationFadeV2ForwardValidationTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/$/, "");
}

export function resolveCalibrationFadeV2OutputPaths(input: {
  evidenceMode: CalibrationFadeV2EvidenceMode;
  captureRunDir: string;
  outputPath?: string | null;
  htmlOutputPath?: string | null;
  eventsOutputPath?: string | null;
  marketsOutputPath?: string | null;
}): CalibrationFadeV2OutputPaths {
  const runId = resolveSelectedRunId(input.captureRunDir);
  const jsonRoot = `data/research-results/calibration-fade-v2/${input.evidenceMode}/${runId}`;
  const htmlRoot = `data/reports/calibration-fade-v2/${input.evidenceMode}/${runId}`;
  const resolved: CalibrationFadeV2OutputPaths = {
    outputPath: normalizePath(input.outputPath ?? `${jsonRoot}/calibration-fade-forward-validation.json`),
    htmlOutputPath: normalizePath(
      input.htmlOutputPath ?? `${htmlRoot}/calibration-fade-forward-validation.html`,
    ),
    eventsOutputPath: normalizePath(
      input.eventsOutputPath ?? `${jsonRoot}/calibration-fade-forward-events.jsonl`,
    ),
    marketsOutputPath: normalizePath(
      input.marketsOutputPath ?? `${jsonRoot}/calibration-fade-forward-markets.jsonl`,
    ),
  };

  for (const path of Object.values(resolved)) {
    assertV2OutputPathIsolation({
      path,
      evidenceMode: input.evidenceMode,
      runId,
    });
  }

  return resolved;
}

export function assertV2OutputPathIsolation(input: {
  path: string;
  evidenceMode: CalibrationFadeV2EvidenceMode;
  runId: string;
}): void {
  const path = normalizePath(input.path);
  if ((V1_FORBIDDEN_OUTPUT_PATHS as readonly string[]).includes(path)) {
    throw new CalibrationFadeV2ForwardValidationError(
      `v2 must not publish to v1 canonical path ${path}`,
    );
  }
  if (path.includes("/latest") || path.endsWith("/latest")) {
    throw new CalibrationFadeV2ForwardValidationError("v2 output paths must not use a latest fallback");
  }
  const expectedFragment = `/calibration-fade-v2/${input.evidenceMode}/${input.runId}/`;
  if (!path.includes(expectedFragment)) {
    throw new CalibrationFadeV2ForwardValidationError(
      `v2 output path must be run-scoped and mode-scoped (expected ${expectedFragment}): ${path}`,
    );
  }
  const otherMode = input.evidenceMode === "diagnostic" ? "confirmatory" : "diagnostic";
  if (path.includes(`/calibration-fade-v2/${otherMode}/`)) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Cannot publish ${input.evidenceMode} evaluation into ${otherMode} path ${path}`,
    );
  }
}

export function assertV2PublishIdentityCompatible(input: {
  io: CalibrationFadeV2ForwardValidationIo;
  path: string;
  identity: CalibrationFadeV2EvidenceIdentity;
}): void {
  if (!input.io.fileExists(input.path)) {
    return;
  }
  if (!input.path.endsWith(".json")) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.io.readFile(input.path).replace(/^\uFEFF/, ""));
  } catch {
    throw new CalibrationFadeV2ForwardValidationError(
      `Refusing to overwrite unreadable existing artifact ${input.path}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Refusing to overwrite non-object artifact ${input.path}`,
    );
  }
  const existingIdentity = isRecord(parsed.evidenceIdentity)
    ? parsed.evidenceIdentity
    : parsed;
  const existingMode = readString(existingIdentity.evidenceMode);
  const existingRunId = readString(existingIdentity.captureRunId) ?? readString(parsed.selectedRunId);
  const existingHash =
    readString(existingIdentity.configurationHash)
    ?? readString(parsed.hypothesisConfigurationHash);
  const existingSource =
    readString(existingIdentity.sourceRecordType)
    ?? readString(parsed.sourceRecordType);
  const existingVersion =
    readString(existingIdentity.hypothesisVersion)
    ?? readString(parsed.hypothesisVersion);

  if (
    (existingMode && existingMode !== input.identity.evidenceMode)
    || (existingRunId && existingRunId !== input.identity.captureRunId)
    || (existingHash && existingHash !== input.identity.configurationHash)
    || (existingSource && existingSource !== input.identity.sourceRecordType)
    || (existingVersion && existingVersion !== input.identity.hypothesisVersion)
  ) {
    throw new CalibrationFadeV2ForwardValidationError(
      `Refusing to overwrite ${input.path} with incompatible v2 identity `
        + `(existing mode=${existingMode} run=${existingRunId} hash=${existingHash} `
        + `version=${existingVersion} source=${existingSource})`,
    );
  }
}
