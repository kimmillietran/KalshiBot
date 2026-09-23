/**
 * Reconcile repository M16 / quality-audit authority into reservoir events.
 * Does not open or read economic paths — only ledger/artifact identities.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  CRYPTOSTRUCT_CATALOG_FREEZE,
  CRYPTOSTRUCT_QUALITY_AUDIT_BYTE_SIZE,
  CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
  CRYPTOSTRUCT_QUALITY_AUDIT_ZIP_SHA256,
  enumerateUtcDatesInclusive,
} from "@/lib/data/research/cryptostructDatasetGovernance";
import { buildM16ErFixedCohortPlan } from "@/lib/data/research/m16ExternalReplication";

import {
  appendReservoirEvent,
  createEmptyEventLedger,
  materializeReservoirSnapshot,
  type CryptostructReservoirEventLedger,
  type CryptostructReservoirSnapshot,
} from "./ledger";
import {
  buildOfflineRepoAuthorityInventory,
  type CryptostructOwnedDateMeta,
  type CryptostructSanitizedInventory,
} from "./inventory";
import { assertAllowedStateTransition } from "./invariants";
import {
  M16_ER_LINEAGE,
  M16_ER_PRIMARY_RESULT_CONTENT_SHA256,
} from "./types";

export const M16_ER_PRIMARY_RESULT_ARTIFACT =
  "data/research-results/external-kalshi-data-audit/m16-er-primary-economic-result.json";

export const M16_ER_ACQUISITION_ARTIFACT =
  "data/research-results/external-kalshi-data-audit/m16-er-acquisition-manifest.json";

export type ReservoirBootstrapResult = {
  inventory: CryptostructSanitizedInventory;
  eventLedger: CryptostructReservoirEventLedger;
  snapshot: CryptostructReservoirSnapshot;
};

type AcqDay = {
  utcDate: string;
  sha256: string;
  byteSize: number;
  sourceFilename: string;
};

function loadAcquisitionDays(repoRoot: string): AcqDay[] {
  const path = join(repoRoot, M16_ER_ACQUISITION_ARTIFACT);
  if (!existsSync(path)) {
    throw new Error(`missing acquisition artifact ${path}`);
  }
  const acq = JSON.parse(readFileSync(path, "utf8")) as { days: AcqDay[] };
  return acq.days;
}

function loadPrimaryIdentity(repoRoot: string): string {
  const path = join(repoRoot, M16_ER_PRIMARY_RESULT_ARTIFACT);
  if (!existsSync(path)) {
    throw new Error(`missing primary result ${path}`);
  }
  const primary = JSON.parse(readFileSync(path, "utf8")) as {
    primaryResultContentSha256: string;
  };
  if (
    primary.primaryResultContentSha256 !== M16_ER_PRIMARY_RESULT_CONTENT_SHA256
  ) {
    throw new Error(
      `primary result identity drift: expected ${M16_ER_PRIMARY_RESULT_CONTENT_SHA256} `
        + `got ${primary.primaryResultContentSha256}`,
    );
  }
  return primary.primaryResultContentSha256;
}

/**
 * Build initial reservoir from repo authority (MCP-offline path).
 */
export function bootstrapReservoirFromRepoAuthority(input: {
  repoRoot: string;
  atUtc: string;
  discoveredNamespaces?: readonly string[];
}): ReservoirBootstrapResult {
  const primaryId = loadPrimaryIdentity(input.repoRoot);
  const acqDays = loadAcquisitionDays(input.repoRoot);
  const cohort = buildM16ErFixedCohortPlan();
  const cohortSet = new Set(cohort.fixedUtcDates);
  const auditSet = new Set<string>(CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES);

  const vendorCovered = enumerateUtcDatesInclusive(
    CRYPTOSTRUCT_CATALOG_FREEZE.completeRecordingFromUtc,
    CRYPTOSTRUCT_CATALOG_FREEZE.catalogEndUtcInclusive,
  );

  const ownedMeta: CryptostructOwnedDateMeta[] = [];
  for (const d of acqDays) {
    ownedMeta.push({
      utcDate: d.utcDate,
      vendorFileId: d.sourceFilename,
      ownershipStatus: "owned",
      byteSize: d.byteSize,
      vendorChecksumSha256: d.sha256,
      formatVersion: "kalshi-btc-15m-day-zip-v1",
      availabilityStatus: "local-governed-raw",
    });
  }
  for (const utcDate of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
    ownedMeta.push({
      utcDate,
      vendorFileId: `kalshi-btc-15m_${utcDate}.zip`,
      ownershipStatus: "owned",
      byteSize: CRYPTOSTRUCT_QUALITY_AUDIT_BYTE_SIZE[utcDate],
      vendorChecksumSha256: CRYPTOSTRUCT_QUALITY_AUDIT_ZIP_SHA256[utcDate],
      formatVersion: "kalshi-btc-15m-day-zip-v1",
      availabilityStatus: "quality-audit-owned",
    });
  }

  const ownedSet = new Set(ownedMeta.map((d) => d.utcDate));
  const availableUnowned = vendorCovered.filter((d) => !ownedSet.has(d));

  const inventory = buildOfflineRepoAuthorityInventory({
    queriedAtUtc: input.atUtc,
    ownedDates: ownedMeta,
    vendorCoveredUtcDates: vendorCovered,
    availableUnownedUtcDates: availableUnowned,
    productDateRange: {
      startInclusive: CRYPTOSTRUCT_CATALOG_FREEZE.completeRecordingFromUtc,
      endInclusive: CRYPTOSTRUCT_CATALOG_FREEZE.catalogEndUtcInclusive,
    },
    discoveredNamespaces: input.discoveredNamespaces ?? [
      "cursor",
      "cursor-app-control",
      "cursor-ide-browser",
    ],
  });

  let ledger = createEmptyEventLedger();
  ledger = appendReservoirEvent(ledger, {
    eventType: "inventory-imported",
    utcDate: null,
    atUtc: input.atUtc,
    priorState: null,
    newState: null,
    reason: "m17-prep-offline-repo-authority-inventory",
    actor: "cryptostruct-research-reservoir",
    scientificProtocolIdentity: null,
    researchLineage: null,
    primaryResultIdentity: null,
    sourceArtifactIdentities: [
      M16_ER_ACQUISITION_ARTIFACT,
      M16_ER_PRIMARY_RESULT_ARTIFACT,
      inventory.inventoryContentSha256,
    ],
    inventorySnapshotIdentity: inventory.inventoryContentSha256,
    patch: null,
  });

  for (const d of vendorCovered) {
    ledger = appendReservoirEvent(ledger, {
      eventType: "vendor-availability-observed",
      utcDate: d,
      atUtc: input.atUtc,
      priorState: null,
      newState: ownedSet.has(d) ? null : "AVAILABLE_UNOWNED",
      reason: "catalog-freeze-complete-recording-coverage",
      actor: "cryptostruct-research-reservoir",
      scientificProtocolIdentity: null,
      researchLineage: null,
      primaryResultIdentity: null,
      sourceArtifactIdentities: [
        "src/lib/data/research/cryptostructDatasetGovernance/universe.ts",
      ],
      inventorySnapshotIdentity: inventory.inventoryContentSha256,
      patch: {
        vendorAvailable: true,
        owned: false,
      },
    });
  }

  // Quality-audit burns
  for (const utcDate of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
    assertAllowedStateTransition({
      utcDate,
      from: "AVAILABLE_UNOWNED",
      to: "QUALITY_AUDIT_ONLY",
    });
    ledger = appendReservoirEvent(ledger, {
      eventType: "quality-audit-burned",
      utcDate,
      atUtc: input.atUtc,
      priorState: "AVAILABLE_UNOWNED",
      newState: "QUALITY_AUDIT_ONLY",
      reason:
        "Permanently QUALITY_AUDIT_ONLY from CryptoStruct source-equivalence / fidelity audit",
      actor: "cryptostruct-research-reservoir",
      scientificProtocolIdentity: null,
      researchLineage: "cryptostruct-source-equivalence",
      primaryResultIdentity: null,
      sourceArtifactIdentities: [
        "src/lib/data/research/cryptostructDatasetGovernance/ledger.ts",
        "data/research-results/external-kalshi-data-audit/m16-source-equivalence-audit.md",
      ],
      inventorySnapshotIdentity: inventory.inventoryContentSha256,
      patch: {
        owned: true,
        vendorAvailable: true,
        byteSize: CRYPTOSTRUCT_QUALITY_AUDIT_BYTE_SIZE[utcDate],
        rawZipSha256: CRYPTOSTRUCT_QUALITY_AUDIT_ZIP_SHA256[utcDate],
        vendorFileId: `kalshi-btc-15m_${utcDate}.zip`,
        notes: "Never validation/HOLDOUT",
      },
    });
  }

  // M16-ER spent validation (economic outcomes opened PR #110)
  for (const utcDate of cohort.fixedUtcDates) {
    if (!cohortSet.has(utcDate)) continue;
    if (auditSet.has(utcDate)) {
      throw new Error(`cohort date overlaps quality-audit: ${utcDate}`);
    }
    const acq = acqDays.find((d) => d.utcDate === utcDate);
    if (!acq) {
      throw new Error(`missing acquisition for cohort date ${utcDate}`);
    }
    assertAllowedStateTransition({
      utcDate,
      from: "AVAILABLE_UNOWNED",
      to: "SPENT_VALIDATION",
    });
    ledger = appendReservoirEvent(ledger, {
      eventType: "validation-opened",
      utcDate,
      atUtc: input.atUtc,
      priorState: "AVAILABLE_UNOWNED",
      newState: "SPENT_VALIDATION",
      reason:
        "M16-ER economic outcomes opened under human authorization (PR #110); "
        + "not pristine for future confirmatory use",
      actor: "cryptostruct-research-reservoir",
      scientificProtocolIdentity:
        "3f4fdf157b3eb6eb775c8e2f4bab4272e23cfa22a7179fed29fb135012207c65",
      researchLineage: M16_ER_LINEAGE,
      primaryResultIdentity: primaryId,
      sourceArtifactIdentities: [
        M16_ER_PRIMARY_RESULT_ARTIFACT,
        M16_ER_ACQUISITION_ARTIFACT,
        "data/research-results/external-kalshi-data-audit/m16-er-outcome-open-authorization.json",
      ],
      inventorySnapshotIdentity: inventory.inventoryContentSha256,
      patch: {
        owned: true,
        vendorAvailable: true,
        byteSize: acq.byteSize,
        rawZipSha256: acq.sha256,
        vendorFileId: acq.sourceFilename,
        notes:
          "Also usable as OPEN_DISCOVERY for exploratory work; never resealable",
      },
    });
    // Also mark opened-for-discovery lineage availability without changing away from SPENT
    ledger = appendReservoirEvent(ledger, {
      eventType: "opened-for-discovery",
      utcDate,
      atUtc: input.atUtc,
      priorState: "SPENT_VALIDATION",
      newState: "SPENT_VALIDATION",
      reason:
        "M16-ER spent dates remain available for exploratory/discovery research",
      actor: "cryptostruct-research-reservoir",
      scientificProtocolIdentity:
        "3f4fdf157b3eb6eb775c8e2f4bab4272e23cfa22a7179fed29fb135012207c65",
      researchLineage: M16_ER_LINEAGE,
      primaryResultIdentity: primaryId,
      sourceArtifactIdentities: [M16_ER_PRIMARY_RESULT_ARTIFACT],
      inventorySnapshotIdentity: inventory.inventoryContentSha256,
      patch: {
        notes:
          "SPENT_VALIDATION with discovery reuse allowed; confirmatory reuse forbidden by default",
      },
    });
  }

  const snapshot = materializeReservoirSnapshot({
    ledger,
    materializedAtUtc: input.atUtc,
    inventorySnapshotIdentity: inventory.inventoryContentSha256,
  });

  return { inventory, eventLedger: ledger, snapshot };
}

export function groupDatesByState(
  snapshot: CryptostructReservoirSnapshot,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const day of Object.values(snapshot.days)) {
    const list = out[day.state] ?? [];
    list.push(day.utcDate);
    out[day.state] = list;
  }
  for (const k of Object.keys(out)) {
    out[k] = out[k]!.sort();
  }
  return out;
}
