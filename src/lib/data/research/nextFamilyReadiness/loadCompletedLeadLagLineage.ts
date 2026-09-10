import { join } from "node:path";

import {
  DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
  LEAD_LAG_DISCOVERY_JSON_FILENAME,
} from "../btcKalshiLeadLagDiscovery/leadLagDiscoveryTypes";
import {
  DEFAULT_LEAD_LAG_HOLDOUT_JSON_ROOT,
  LEAD_LAG_HOLDOUT_JSON_FILENAME,
} from "../btcKalshiLeadLagHoldout/leadLagHoldoutTypes";
import {
  DEFAULT_LEAD_LAG_REPLICATION_READINESS_JSON_ROOT,
  LEAD_LAG_REPLICATION_READINESS_JSON_FILENAME,
} from "../btcKalshiLeadLagReplicationReadiness/leadLagReplicationReadinessTypes";
import {
  DEFAULT_LEAD_LAG_VALIDATION_JSON_ROOT,
  LEAD_LAG_VALIDATION_JSON_FILENAME,
} from "../btcKalshiLeadLagValidation/leadLagValidationTypes";

import {
  NextFamilyReadinessError,
  type CompletedLeadLagLineageSummary,
  type LeadLagLineageBindingConfig,
  type NextFamilyReadinessIo,
} from "./nextFamilyReadinessTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new NextFamilyReadinessError(`${context} missing string field ${key}`);
  }
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveDefaultLeadLagLineagePaths(
  binding: LeadLagLineageBindingConfig,
): {
  discoveryReportPath: string;
  validationReportPath: string;
  holdoutReportPath: string;
  readinessReportPath: string;
} {
  return {
    discoveryReportPath:
      binding.discoveryReportPath
      ?? join(
        DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT,
        binding.discoveryIdentityHash,
        LEAD_LAG_DISCOVERY_JSON_FILENAME,
      ),
    validationReportPath:
      binding.validationReportPath
      ?? join(
        DEFAULT_LEAD_LAG_VALIDATION_JSON_ROOT,
        binding.validationIdentityHash,
        LEAD_LAG_VALIDATION_JSON_FILENAME,
      ),
    holdoutReportPath:
      binding.holdoutReportPath
      ?? join(
        DEFAULT_LEAD_LAG_HOLDOUT_JSON_ROOT,
        binding.holdoutIdentityHash,
        LEAD_LAG_HOLDOUT_JSON_FILENAME,
      ),
    readinessReportPath:
      binding.readinessReportPath
      ?? join(
        DEFAULT_LEAD_LAG_REPLICATION_READINESS_JSON_ROOT,
        binding.readinessIdentityHash,
        LEAD_LAG_REPLICATION_READINESS_JSON_FILENAME,
      ),
  };
}

/**
 * Load authoritative M12.8 lineage artifacts and summarize disposition inputs.
 * Does not rewrite historical holdout verdicts.
 */
export function loadCompletedLeadLagLineage(input: {
  io: NextFamilyReadinessIo;
  binding: LeadLagLineageBindingConfig;
}): CompletedLeadLagLineageSummary {
  const paths = resolveDefaultLeadLagLineagePaths(input.binding);

  for (const [label, path] of Object.entries(paths)) {
    if (!input.io.fileExists(path)) {
      throw new NextFamilyReadinessError(`Missing ${label} artifact: ${path}`);
    }
  }

  const discovery = JSON.parse(input.io.readFile(paths.discoveryReportPath)) as Record<string, unknown>;
  const validation = JSON.parse(input.io.readFile(paths.validationReportPath)) as Record<string, unknown>;
  const holdout = JSON.parse(input.io.readFile(paths.holdoutReportPath)) as Record<string, unknown>;
  const readiness = JSON.parse(input.io.readFile(paths.readinessReportPath)) as Record<string, unknown>;

  const discoveryIdentity = readRequiredString(discovery, "discoveryIdentityHash", "discovery");
  if (discoveryIdentity !== input.binding.discoveryIdentityHash) {
    throw new NextFamilyReadinessError(
      `Discovery identity mismatch: expected ${input.binding.discoveryIdentityHash}, got ${discoveryIdentity}`,
    );
  }

  const validationIdentity = readRequiredString(validation, "validationIdentityHash", "validation");
  if (validationIdentity !== input.binding.validationIdentityHash) {
    throw new NextFamilyReadinessError(
      `Validation identity mismatch: expected ${input.binding.validationIdentityHash}, got ${validationIdentity}`,
    );
  }

  const holdoutIdentity = readRequiredString(holdout, "holdoutIdentityHash", "holdout");
  if (holdoutIdentity !== input.binding.holdoutIdentityHash) {
    throw new NextFamilyReadinessError(
      `Holdout identity mismatch: expected ${input.binding.holdoutIdentityHash}, got ${holdoutIdentity}`,
    );
  }

  const readinessIdentity = readRequiredString(readiness, "readinessIdentityHash", "readiness");
  if (readinessIdentity !== input.binding.readinessIdentityHash) {
    throw new NextFamilyReadinessError(
      `Readiness identity mismatch: expected ${input.binding.readinessIdentityHash}, got ${readinessIdentity}`,
    );
  }

  const holdoutVerdict = readRequiredString(holdout, "holdoutStatisticalVerdict", "holdout");
  if (holdoutVerdict !== "underpowered") {
    throw new NextFamilyReadinessError(
      `M12.9 expects holdoutStatisticalVerdict=underpowered; got ${holdoutVerdict}`,
    );
  }
  const holdoutOverall = readRequiredString(holdout, "holdoutOverallStatus", "holdout");
  if (holdoutOverall !== "holdout-underpowered") {
    throw new NextFamilyReadinessError(
      `M12.9 expects holdoutOverallStatus=holdout-underpowered; got ${holdoutOverall}`,
    );
  }

  const locked = validation.lockedHoldoutCandidate;
  if (!isRecord(locked)) {
    throw new NextFamilyReadinessError("Validation artifact missing lockedHoldoutCandidate");
  }
  const candidateId = readRequiredString(locked, "candidateId", "lockedHoldoutCandidate");
  if (candidateId !== readRequiredString(holdout, "lockedCandidateId", "holdout")) {
    throw new NextFamilyReadinessError("Locked candidate mismatch between validation and holdout");
  }

  const candidateResults = Array.isArray(validation.candidateResults)
    ? validation.candidateResults
    : [];
  const survivors = candidateResults.filter(
    (row) => isRecord(row) && row.validationStatus === "validated",
  );
  const lockedValidation = survivors.find(
    (row) => isRecord(row) && row.candidateId === candidateId,
  );

  const candidateMetrics = isRecord(holdout.candidateMetrics) ? holdout.candidateMetrics : {};
  const holdoutEss = readOptionalNumber(candidateMetrics, "effectiveSampleSize");
  if (holdoutEss == null) {
    throw new NextFamilyReadinessError("Holdout candidateMetrics.effectiveSampleSize missing");
  }

  const exactDefinition = isRecord(locked.exactDefinition) ? locked.exactDefinition : {};
  const trainEffect = readOptionalNumber(exactDefinition, "trainMedianSignedMidResponseCents");
  const validationEffect = isRecord(lockedValidation)
    ? readOptionalNumber(lockedValidation, "midpointResponseCents")
    : null;
  const holdoutEffect = readOptionalNumber(candidateMetrics, "holdoutEffectCents");

  const requiredFresh =
    readOptionalNumber(readiness, "requiredFreshEffectiveN")
    ?? (isRecord(readiness.powerContract)
      ? readOptionalNumber(readiness.powerContract, "requiredEffectiveN")
      : null);
  if (requiredFresh == null) {
    throw new NextFamilyReadinessError("Readiness artifact missing requiredFreshEffectiveN");
  }

  const operationalBurden = isRecord(readiness.operationalBurden)
    ? readiness.operationalBurden
    : {};
  const projectedHours = readOptionalNumber(operationalBurden, "projectedCaptureHoursPooled");
  const projectedEightHourRuns = readOptionalNumber(
    operationalBurden,
    "projectedEightHourRunsPooled",
  );
  const projectedStorageGiB = readOptionalNumber(
    operationalBurden,
    "projectedStorageGiBPooled",
  );
  const burdenClass =
    typeof operationalBurden.burdenClass === "string"
      ? operationalBurden.burdenClass
      : "material-multi-session-capture";

  const evidenceContractIdentity = readRequiredString(
    holdout,
    "evidenceContractIdentity",
    "holdout",
  );
  if (
    isRecord(readiness.lineage)
    && typeof readiness.lineage.evidenceContractIdentity === "string"
    && readiness.lineage.evidenceContractIdentity !== evidenceContractIdentity
  ) {
    throw new NextFamilyReadinessError("Evidence contract identity mismatch across lineage artifacts");
  }

  return {
    family: "btc-kalshi-lead-lag",
    candidateId,
    discoveryIdentity,
    validationIdentity,
    evidenceContractIdentity,
    holdoutIdentity,
    readinessIdentity,
    discoveryHypothesisCount: 9600,
    validationShortlistSize: 5,
    validationSurvivorCount: survivors.length,
    lockedCandidateCount: 1,
    holdoutEffectiveSampleSize: holdoutEss,
    holdoutStatisticalVerdict: "underpowered",
    holdoutOverallStatus: "holdout-underpowered",
    holdoutRecommendedNextAction: "insufficient-holdout-evidence",
    trainLockedEffectCents: trainEffect,
    validationLockedEffectCents: validationEffect,
    holdoutLockedEffectCents: holdoutEffect,
    prospectiveRequiredFreshEss: requiredFresh,
    projectedCaptureHoursPooled: projectedHours,
    projectedEightHourRunsPooled: projectedEightHourRuns,
    projectedStorageGiBPooled: projectedStorageGiB,
    burdenClass,
    replicationReadiness:
      typeof readiness.replicationReadiness === "string"
        ? readiness.replicationReadiness
        : "unknown",
    decisionRequired:
      typeof readiness.decisionRequired === "string" ? readiness.decisionRequired : "unknown",
    lineageSummary:
      "9600 discovery hypotheses → 5 validation candidates → 3 validation survivors → "
      + `1 locked candidate → untouched holdout ESS=${holdoutEss} → holdout underpowered → `
      + `prospective required fresh ESS=${requiredFresh} → replication operationally costly → `
      + "no promotion / no freeze",
    descriptiveEffectsNote:
      "TRAIN/VALIDATION/HOLDOUT locked-candidate effects are descriptive lineage context only "
      + "and must not be aggregated into one significance estimate.",
  };
}
