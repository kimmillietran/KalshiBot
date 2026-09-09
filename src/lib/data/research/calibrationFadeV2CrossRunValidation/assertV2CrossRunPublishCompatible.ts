import { isRecord, readString } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  CalibrationFadeV2CrossRunValidationError,
  type CalibrationFadeV2CrossRunValidationIo,
} from "./calibrationFadeV2CrossRunValidationTypes";

const NON_SEMANTIC_KEYS = new Set(["artifactGeneratedAt", "generatedAt"]);

function stripNonSemantic(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNonSemantic);
  }
  if (!isRecord(value)) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (NON_SEMANTIC_KEYS.has(key)) {
      continue;
    }
    next[key] = stripNonSemantic(entry);
  }
  return next;
}

function sameStringList(left: unknown, right: readonly string[]): boolean {
  if (!Array.isArray(left)) {
    return false;
  }
  const normalizedLeft = left.filter((entry): entry is string => typeof entry === "string").sort();
  const normalizedRight = [...right].sort();
  return stableStringify(normalizedLeft) === stableStringify(normalizedRight);
}

/**
 * Protects a content-addressed confirmatory settlement snapshot from semantic overwrite.
 * Identity is runSetHash + settlementSnapshotHash. Semantically equivalent republish
 * (generation timestamps only) is allowed.
 */
export function assertV2CrossRunPublishCompatible(input: {
  io: CalibrationFadeV2CrossRunValidationIo;
  outputPath: string;
  identity: {
    runSetHash: string;
    settlementSnapshotHash: string;
    evidenceMode: "confirmatory";
    configurationHash: string;
    freezeCommitSha: string;
    selectedRunIds: readonly string[];
  };
  semanticBody: unknown;
}): void {
  if (!input.io.fileExists(input.outputPath)) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.io.readFile(input.outputPath).replace(/^\uFEFF/, ""));
  } catch {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Refusing to overwrite unreadable existing aggregate ${input.outputPath}`,
    );
  }
  if (!isRecord(parsed)) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Refusing to overwrite non-object aggregate ${input.outputPath}`,
    );
  }

  const existingHash = readString(parsed.runSetHash);
  const existingSnapshot = readString(parsed.settlementSnapshotHash);
  const existingMode = readString(parsed.evidenceMode);
  const existingConfig =
    readString(parsed.configurationHash) ?? readString(parsed.hypothesisConfigurationHash);
  const existingFreeze = readString(parsed.freezeCommitSha);
  if (
    existingHash !== input.identity.runSetHash
    || existingSnapshot !== input.identity.settlementSnapshotHash
    || existingMode !== input.identity.evidenceMode
    || existingConfig !== input.identity.configurationHash
    || existingFreeze !== input.identity.freezeCommitSha
    || !sameStringList(parsed.selectedRunIds, input.identity.selectedRunIds)
  ) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Refusing to overwrite ${input.outputPath} with incompatible aggregate identity`,
    );
  }

  if (stableStringify(stripNonSemantic(parsed)) !== stableStringify(stripNonSemantic(input.semanticBody))) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Refusing to overwrite ${input.outputPath}: same runSetHash + settlementSnapshotHash `
        + "but different semantic body",
    );
  }
}
