import { join } from "node:path";

import {
  DEFAULT_MICROSTRUCTURE_DISCOVERY_JSON_ROOT,
  MICROSTRUCTURE_DISCOVERY_JSON_FILENAME,
} from "../spreadLiquidityMicrostructureDiscovery/microstructureDiscoveryTypes";

import {
  NextFamilyReadinessError,
  type CompletedTobImbalanceTrainLineageSummary,
  type MicrostructureContaminationReusePolicy,
  type NextFamilyReadinessIo,
  type TobImbalanceLineageBindingConfig,
} from "./nextFamilyReadinessTypes";

/** Default identity from the sealed M13.0b TRAIN discovery run (verify on load). */
export const DEFAULT_TOB_IMBALANCE_DISCOVERY_IDENTITY =
  "65249f284b98a785d7507b824b8b8ee8d8b95fde15d9c1bce9f323ebbef896f9";

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

function readRequiredLiteral<T extends string>(
  record: Record<string, unknown>,
  key: string,
  expected: T,
  context: string,
): T {
  const value = readRequiredString(record, key, context);
  if (value !== expected) {
    throw new NextFamilyReadinessError(
      `${context}.${key} must be ${expected}; got ${value}`,
    );
  }
  return expected;
}

export function resolveDefaultTobImbalanceDiscoveryPath(
  binding: TobImbalanceLineageBindingConfig,
): string {
  return (
    binding.discoveryReportPath
    ?? join(
      DEFAULT_MICROSTRUCTURE_DISCOVERY_JSON_ROOT,
      binding.discoveryIdentityHash,
      MICROSTRUCTURE_DISCOVERY_JSON_FILENAME,
    )
  );
}

/**
 * Load authoritative M13.0b TRAIN discovery artifact and summarize disposition.
 * Does not reopen VALIDATION/HOLDOUT or claim statistical reject.
 */
export function loadCompletedTobImbalanceTrainLineage(input: {
  io: NextFamilyReadinessIo;
  binding: TobImbalanceLineageBindingConfig;
}): CompletedTobImbalanceTrainLineageSummary {
  const path = resolveDefaultTobImbalanceDiscoveryPath(input.binding);
  if (!input.io.fileExists(path)) {
    throw new NextFamilyReadinessError(`Missing TOB-imbalance discovery artifact: ${path}`);
  }

  const discovery = JSON.parse(input.io.readFile(path)) as unknown;
  if (!isRecord(discovery)) {
    throw new NextFamilyReadinessError("TOB-imbalance discovery artifact must be a JSON object");
  }

  const discoveryIdentity = readRequiredString(discovery, "discoveryIdentity", "discovery");
  if (discoveryIdentity !== input.binding.discoveryIdentityHash) {
    throw new NextFamilyReadinessError(
      `Discovery identity mismatch: expected ${input.binding.discoveryIdentityHash}, got ${discoveryIdentity}`,
    );
  }

  readRequiredLiteral(discovery, "discoveryStatus", "no-candidates-eligible", "discovery");
  readRequiredLiteral(discovery, "discoveryIsolationStatus", "train-only-discovery", "discovery");

  const shortlist = discovery.shortlist;
  if (!Array.isArray(shortlist) || shortlist.length !== 0) {
    throw new NextFamilyReadinessError(
      "TOB-imbalance disposition requires shortlist length 0 (no-candidates-eligible)",
    );
  }

  const searchUniverse = discovery.searchUniverse;
  if (!isRecord(searchUniverse)) {
    throw new NextFamilyReadinessError("discovery.searchUniverse missing");
  }
  if (searchUniverse.hypothesisCount !== 12) {
    throw new NextFamilyReadinessError(
      `Expected discoveryHypothesisCount=12; got ${String(searchUniverse.hypothesisCount)}`,
    );
  }
  if (searchUniverse.directionCount !== 1) {
    throw new NextFamilyReadinessError(
      `Expected directionCount=1; got ${String(searchUniverse.directionCount)}`,
    );
  }

  const perCandidateResults = discovery.perCandidateResults;
  if (!Array.isArray(perCandidateResults) || perCandidateResults.length !== 12) {
    throw new NextFamilyReadinessError("All 12 lineage cells must be retained in the discovery artifact");
  }

  const quarantine = discovery.quarantine;
  if (!isRecord(quarantine)) {
    throw new NextFamilyReadinessError("discovery.quarantine missing");
  }
  if (quarantine.validationOutcomesRead !== false || quarantine.holdoutOutcomesRead !== false) {
    throw new NextFamilyReadinessError("Discovery artifact must not have read validation/holdout outcomes");
  }
  if (quarantine.directionFlipped !== false || quarantine.gridMutated !== false) {
    throw new NextFamilyReadinessError("Discovery artifact must not flip direction or mutate the grid");
  }

  const trainRunId = readRequiredString(discovery, "trainRunId", "discovery");

  return {
    family: "spread-liquidity-microstructure",
    subfamily: "tob-size-imbalance-short-horizon-repricing-v1",
    disposition: "stopped-after-train-no-eligible-candidates",
    familyDefinitionIdentity: readRequiredString(discovery, "familyDefinitionIdentity", "discovery"),
    evidenceContractIdentity: readRequiredString(discovery, "evidenceContractIdentity", "discovery"),
    splitManifestIdentity: readRequiredString(discovery, "splitManifestIdentity", "discovery"),
    discoveryIdentity,
    trainRunId,
    discoveryHypothesisCount: 12,
    directionCount: 1,
    shortlistCount: 0,
    discoveryStatus: "no-candidates-eligible",
    discoveryIsolationStatus: "train-only-discovery",
    reasonNoCandidateAdvanced:
      "All 12 predefined same-direction TOB-imbalance cells failed the pre-bound "
      + "median signed executable response > 0 direction-consistency requirement. "
      + "Failure was not sparse incidence or missing executable observability. "
      + "Zero shortlist ⇒ validation/holdout/promotion/freeze unauthorized. "
      + "This is not a statistical reject, holdout reject, or global disproof of microstructure.",
    validationAuthorized: false,
    holdoutAuthorized: false,
    promotionAuthorized: false,
    prospectiveFreezeAuthorized: false,
    statisticalRejectClaimed: false,
    broadFamilyGloballyDisproven: false,
    reverseDirectionResurrectionForbidden: true,
    gridMutationForbidden: true,
    lineageSummary:
      `TOB-imbalance-v1 TRAIN discovery (${discoveryIdentity}) on run ${trainRunId}: `
      + "12→0 shortlist; stopped-after-train-no-eligible-candidates.",
  };
}

export function buildMicrostructureContaminationReusePolicy(
  lineage: CompletedTobImbalanceTrainLineageSummary,
): MicrostructureContaminationReusePolicy {
  return {
    trainRunId: lineage.trainRunId,
    outcomeConsumedForSubfamily: "tob-size-imbalance-short-horizon-repricing-v1",
    schemaOrFieldAvailabilityReuse: "permitted",
    signFlippedImbalanceAsUntouchedTrain: "forbidden",
    relatedImbalanceDerivedAsUntouchedValidationOrHoldout: "forbidden",
    unrelatedFamilyReuse:
      "Permitted only under existing independent-family governance and only when prior "
      + "TOB-imbalance outcome access cannot inform that family's selection; fail conservative "
      + "when ambiguous.",
    failConservativeWhenAmbiguous: true,
    antiShoppingNote:
      "same-direction TRAIN failure must NOT justify reverse-direction, absolute-imbalance "
      + "with learned sign, neighboring thresholds, or horizon shopping on the same discovery data. "
      + "Any reverse imbalance thesis is a new lineage requiring independent definition and "
      + "uncontaminated outcome isolation.",
  };
}
