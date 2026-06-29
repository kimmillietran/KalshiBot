import {
  buildHistoricalResearchFixture,
  serializeHistoricalResearchFixture,
} from "@/lib/data/fixtures";

import {
  ImportFixtureBridgeError,
  ImportFixtureBridgeErrorCode,
} from "./importFixtureBridgeTypes";
import type { BuildHistoricalResearchFixtureFromImportResultInput } from "./importFixtureBridgeTypes";

function validateBridgeInput(
  input: BuildHistoricalResearchFixtureFromImportResultInput,
): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ImportFixtureBridgeError(
      "input must be a plain object",
      ImportFixtureBridgeErrorCode.INVALID_INPUT,
    );
  }

  const importResult = input.importResult;
  if (
    importResult === null ||
    typeof importResult !== "object" ||
    Array.isArray(importResult)
  ) {
    throw new ImportFixtureBridgeError(
      "importResult must be a plain object",
      ImportFixtureBridgeErrorCode.INVALID_INPUT,
    );
  }

  if (
    importResult.validationResult === null ||
    typeof importResult.validationResult !== "object" ||
    Array.isArray(importResult.validationResult)
  ) {
    throw new ImportFixtureBridgeError(
      "importResult.validationResult must be a plain object",
      ImportFixtureBridgeErrorCode.INVALID_INPUT,
    );
  }
}

/**
 * Converts a historical bronze import job result into a CLI-ready research fixture.
 *
 * Requires `importResult.validationResult.valid === true`. Bronze records are
 * validated again through {@link buildHistoricalResearchFixture}.
 */
export function buildHistoricalResearchFixtureFromImportResult(
  input: BuildHistoricalResearchFixtureFromImportResultInput,
) {
  validateBridgeInput(input);

  if (!input.importResult.validationResult.valid) {
    throw new ImportFixtureBridgeError(
      "importResult.validationResult.valid must be true",
      ImportFixtureBridgeErrorCode.INVALID_IMPORT_RESULT,
    );
  }

  return buildHistoricalResearchFixture({
    bronzeRecords: input.importResult.bronzeRecords,
    strategyId: input.strategyId,
    runId: input.runId,
    durationMs: input.durationMs,
    initialCashCents: input.initialCashCents,
    engineConfig: input.engineConfig,
    fillConfig: input.fillConfig,
    metricsConfig: input.metricsConfig,
    exportConfig: input.exportConfig,
  });
}

export function serializeHistoricalResearchFixtureFromImportResult(
  input: BuildHistoricalResearchFixtureFromImportResultInput,
): string {
  return serializeHistoricalResearchFixture(
    buildHistoricalResearchFixtureFromImportResult(input),
  );
}

export type { BuildHistoricalResearchFixtureFromImportResultInput } from "./importFixtureBridgeTypes";
