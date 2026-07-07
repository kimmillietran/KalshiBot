export type SettlementOutcome = 0 | 1;

export type ResearchOutputSettlementResolution = {
  outcome: SettlementOutcome | null;
  snapshotIndex: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readQualityFlagsFromRecord(value: unknown): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }

  const rawFlags = value.qualityFlags ?? value.quality_flags;
  if (!Array.isArray(rawFlags)) {
    return [];
  }

  return rawFlags.filter((flag): flag is string => typeof flag === "string");
}

/** Reads settlement quality flags from a silver-normalized settlement record. */
export function readSettlementQualityFlagsFromRecord(value: unknown): readonly string[] {
  return readQualityFlagsFromRecord(value);
}

/** Returns true when settlement carries the derived-expiration-value quality flag. */
export function settlementHasDerivedExpirationValue(
  settlement: unknown,
  derivedFlag: string,
): boolean {
  return readQualityFlagsFromRecord(settlement).includes(derivedFlag);
}

/** Reads a binary settlement outcome from a silver-normalized settlement record. */
export function readSettlementOutcomeFromRecord(value: unknown): SettlementOutcome | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.result === "yes") {
    return 1;
  }

  if (value.result === "no") {
    return 0;
  }

  return null;
}

/**
 * Finds settlement on the last dataset snapshot that carries a yes/no result.
 * Candle-replay datasets attach settlement only to the final expanded snapshot.
 */
export function findSettlementInDatasetSnapshots(
  snapshots: readonly unknown[],
): ResearchOutputSettlementResolution {
  let resolution: ResearchOutputSettlementResolution = {
    outcome: null,
    snapshotIndex: null,
  };

  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    if (!isRecord(snapshot)) {
      continue;
    }

    const outcome = readSettlementOutcomeFromRecord(snapshot.settlement);
    if (outcome !== null) {
      resolution = {
        outcome,
        snapshotIndex: index,
      };
    }
  }

  return resolution;
}

/** Returns true when the resolved settlement snapshot carries derived expiration_value. */
export function findDerivedExpirationValueInDatasetSnapshots(
  snapshots: readonly unknown[],
  derivedFlag: string,
): boolean {
  const resolution = findSettlementInDatasetSnapshots(snapshots);
  if (resolution.snapshotIndex === null) {
    return false;
  }

  const snapshot = snapshots[resolution.snapshotIndex];
  if (!isRecord(snapshot)) {
    return false;
  }

  return settlementHasDerivedExpirationValue(snapshot.settlement, derivedFlag);
}

/** Returns the first plain-object snapshot in a dataset. */
export function findFirstDatasetSnapshot(
  snapshots: readonly unknown[],
): Record<string, unknown> | null {
  for (const snapshot of snapshots) {
    if (isRecord(snapshot)) {
      return snapshot;
    }
  }

  return null;
}

/** Returns the last plain-object snapshot in a dataset. */
export function findLastDatasetSnapshot(
  snapshots: readonly unknown[],
): Record<string, unknown> | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (isRecord(snapshot)) {
      return snapshot;
    }
  }

  return null;
}

/** Builds a diagnostic message when settlement is absent from research output. */
export function formatMissingSettlementDiagnostic(
  marketTicker: string,
  snapshotCount: number,
): string {
  return `Missing settlement for market ${marketTicker} (checked dataset.snapshots[0..${Math.max(snapshotCount - 1, 0)}].settlement.result)`;
}
