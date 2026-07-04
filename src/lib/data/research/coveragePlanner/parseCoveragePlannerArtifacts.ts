import type { DataHealthReport } from "@/lib/data/research/dataHealth/dataHealthTypes";
import type { HypothesisValidationReport } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { parseRegimeTagsReportJson } from "@/lib/data/research/volPremium/loadRegimeTagIndex";

import {
  CoveragePlannerError,
  CoveragePlannerErrorCode,
  type CoveragePlannerIo,
  type ParsedCoveragePlannerArtifacts,
} from "./coveragePlannerTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalJson(path: string, io: CoveragePlannerIo): unknown | null {
  if (!io.fileExists(path)) {
    return null;
  }

  try {
    return JSON.parse(io.readFile(path));
  } catch {
    throw new CoveragePlannerError(
      `Invalid JSON in ${path}`,
      CoveragePlannerErrorCode.INVALID_JSON,
    );
  }
}

function parseDataHealth(value: unknown, path: string): DataHealthReport | null {
  if (!isRecord(value) || typeof value.generatedAt !== "string") {
    throw new CoveragePlannerError(
      `data-health schema mismatch in ${path}`,
      CoveragePlannerErrorCode.INVALID_DOCUMENT,
    );
  }

  return value as unknown as DataHealthReport;
}

function parseMispricingAtlas(value: unknown, path: string): MispricingAtlas | null {
  if (!isRecord(value) || typeof value.generatedAt !== "string") {
    throw new CoveragePlannerError(
      `mispricing-atlas schema mismatch in ${path}`,
      CoveragePlannerErrorCode.INVALID_DOCUMENT,
    );
  }

  return value as unknown as MispricingAtlas;
}

function parseHypothesisValidation(
  value: unknown,
  path: string,
): HypothesisValidationReport | null {
  if (!isRecord(value) || !Array.isArray(value.validations)) {
    throw new CoveragePlannerError(
      `hypothesis-validation schema mismatch in ${path}`,
      CoveragePlannerErrorCode.INVALID_DOCUMENT,
    );
  }

  return value as unknown as HypothesisValidationReport;
}

/** Loads optional planner input artifacts without mutating source data. */
export function loadCoveragePlannerArtifacts(
  io: CoveragePlannerIo,
  paths: {
    dataHealthPath: string;
    mispricingAtlasPath: string;
    hypothesisValidationPath: string;
    regimeTagsPath: string;
  },
): ParsedCoveragePlannerArtifacts {
  const dataHealthRaw = readOptionalJson(paths.dataHealthPath, io);
  const atlasRaw = readOptionalJson(paths.mispricingAtlasPath, io);
  const validationRaw = readOptionalJson(paths.hypothesisValidationPath, io);
  const regimeTagsRaw = readOptionalJson(paths.regimeTagsPath, io);

  return {
    dataHealth:
      dataHealthRaw === null ? null : parseDataHealth(dataHealthRaw, paths.dataHealthPath),
    mispricingAtlas:
      atlasRaw === null ? null : parseMispricingAtlas(atlasRaw, paths.mispricingAtlasPath),
    hypothesisValidation:
      validationRaw === null
        ? null
        : parseHypothesisValidation(validationRaw, paths.hypothesisValidationPath),
    regimeTags:
      regimeTagsRaw === null
        ? null
        : parseRegimeTagsReportJson(io.readFile(paths.regimeTagsPath)),
  };
}
