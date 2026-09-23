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
  buildLiveMcpInventory,
  buildOfflineRepoAuthorityInventory,
  type CryptostructMcpLiveCapture,
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

export const CRYPTOSTRUCT_MCP_LIVE_CAPTURE_ARTIFACT =
  "data/research-results/external-kalshi-data-audit/cryptostruct-reservoir-mcp-live-capture.json";

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

export function loadMcpLiveCapture(repoRoot: string): CryptostructMcpLiveCapture {
  const path = join(repoRoot, CRYPTOSTRUCT_MCP_LIVE_CAPTURE_ARTIFACT);
  if (!existsSync(path)) {
    throw new Error(`missing live MCP capture ${path}`);
  }
  const capture = JSON.parse(
    readFileSync(path, "utf8"),
  ) as CryptostructMcpLiveCapture;
  if (capture.schemaVersion !== "cryptostruct-kxbtc15m-mcp-live-capture-v1") {
    throw new Error(
      `unexpected live MCP capture schema ${String(capture.schemaVersion)}`,
    );
  }
  return capture;
}

function applyQualityAuditBurns(input: {
  ledger: CryptostructReservoirEventLedger;
  atUtc: string;
  inventoryIdentity: string;
  vendorCoveredSet: ReadonlySet<string>;
}): CryptostructReservoirEventLedger {
  let ledger = input.ledger;
  for (const utcDate of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
    if (!input.vendorCoveredSet.has(utcDate)) {
      throw new Error(
        `quality-audit date ${utcDate} missing from vendor coverage`,
      );
    }
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
      inventorySnapshotIdentity: input.inventoryIdentity,
      patch: {
        owned: true,
        vendorAvailable: true,
        byteSize: CRYPTOSTRUCT_QUALITY_AUDIT_BYTE_SIZE[utcDate],
        rawZipSha256: CRYPTOSTRUCT_QUALITY_AUDIT_ZIP_SHA256[utcDate],
        vendorFileId: `kalshi-btc-15m_${utcDate}.zip`,
        notes:
          "Never validation/HOLDOUT. Local research-store provenance; "
          + "may be absent from current get_my_files.",
      },
    });
  }
  return ledger;
}

function applyM16ErSpentValidation(input: {
  ledger: CryptostructReservoirEventLedger;
  atUtc: string;
  inventoryIdentity: string;
  primaryId: string;
  acqDays: readonly AcqDay[];
  cohortDates: readonly string[];
  auditSet: ReadonlySet<string>;
}): CryptostructReservoirEventLedger {
  let ledger = input.ledger;
  for (const utcDate of input.cohortDates) {
    if (input.auditSet.has(utcDate)) {
      throw new Error(`cohort date overlaps quality-audit: ${utcDate}`);
    }
    const acq = input.acqDays.find((d) => d.utcDate === utcDate);
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
      primaryResultIdentity: input.primaryId,
      sourceArtifactIdentities: [
        M16_ER_PRIMARY_RESULT_ARTIFACT,
        M16_ER_ACQUISITION_ARTIFACT,
        "data/research-results/external-kalshi-data-audit/m16-er-outcome-open-authorization.json",
      ],
      inventorySnapshotIdentity: input.inventoryIdentity,
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
      primaryResultIdentity: input.primaryId,
      sourceArtifactIdentities: [M16_ER_PRIMARY_RESULT_ARTIFACT],
      inventorySnapshotIdentity: input.inventoryIdentity,
      patch: {
        notes:
          "SPENT_VALIDATION with discovery reuse allowed; confirmatory reuse forbidden by default",
      },
    });
  }
  return ledger;
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

  ledger = applyQualityAuditBurns({
    ledger,
    atUtc: input.atUtc,
    inventoryIdentity: inventory.inventoryContentSha256,
    vendorCoveredSet: new Set(vendorCovered),
  });

  ledger = applyM16ErSpentValidation({
    ledger,
    atUtc: input.atUtc,
    inventoryIdentity: inventory.inventoryContentSha256,
    primaryId,
    acqDays,
    cohortDates: cohort.fixedUtcDates,
    auditSet,
  });

  const snapshot = materializeReservoirSnapshot({
    ledger,
    materializedAtUtc: input.atUtc,
    inventorySnapshotIdentity: inventory.inventoryContentSha256,
  });

  return { inventory, eventLedger: ledger, snapshot };
}

/**
 * Reconcile authenticated CryptoStruct MCP live capture with repo research history.
 *
 * Preserves:
 * - 34 M16-ER dates → SPENT_VALIDATION
 * - 5 source-equivalence dates → QUALITY_AUDIT_ONLY
 *
 * Additional MCP-owned dates:
 * - clearly untouched → OWNED_SEALED_UNASSIGNED
 * - clearly opened/used → OPEN_DISCOVERY / SPENT_* as applicable
 * - uncertain → UNKNOWN_QUARANTINED
 *
 * Never infers sealed merely from ownership.
 */
export function bootstrapReservoirFromLiveMcpCapture(input: {
  repoRoot: string;
  atUtc: string;
  capture?: CryptostructMcpLiveCapture;
  discoveredNamespaces?: readonly string[];
}): ReservoirBootstrapResult {
  const primaryId = loadPrimaryIdentity(input.repoRoot);
  const acqDays = loadAcquisitionDays(input.repoRoot);
  const cohort = buildM16ErFixedCohortPlan();
  const cohortSet = new Set(cohort.fixedUtcDates);
  const auditSet = new Set<string>(CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES);
  const capture = input.capture ?? loadMcpLiveCapture(input.repoRoot);

  const inventory = buildLiveMcpInventory({
    queriedAtUtc: input.atUtc,
    capture,
    discoveredNamespaces: input.discoveredNamespaces ?? [
      "cursor",
      "cryptostruct",
    ],
    readOnlyToolsCalled: capture.toolsCalled,
  });

  const vendorCovered = [...inventory.vendorCoveredUtcDates].sort();
  const vendorCoveredSet = new Set(vendorCovered);
  const mcpOwnedByDate = new Map(
    inventory.ownedDates.map((d) => [d.utcDate, d] as const),
  );
  const mcpOwnedSet = new Set(mcpOwnedByDate.keys());

  // Fail closed: every MCP-owned date must be classifiable.
  for (const utcDate of mcpOwnedSet) {
    if (!vendorCoveredSet.has(utcDate)) {
      throw new Error(
        `MCP-owned date ${utcDate} not in live vendor coverage — quarantine required`,
      );
    }
  }

  let ledger = createEmptyEventLedger();
  ledger = appendReservoirEvent(ledger, {
    eventType: "inventory-imported",
    utcDate: null,
    atUtc: input.atUtc,
    priorState: null,
    newState: null,
    reason: "m17-prep-authenticated-mcp-live-inventory",
    actor: "cryptostruct-research-reservoir",
    scientificProtocolIdentity: null,
    researchLineage: null,
    primaryResultIdentity: null,
    sourceArtifactIdentities: [
      CRYPTOSTRUCT_MCP_LIVE_CAPTURE_ARTIFACT,
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
      newState: "AVAILABLE_UNOWNED",
      reason: "cryptostruct-mcp-get_bundle_coverage",
      actor: "cryptostruct-research-reservoir",
      scientificProtocolIdentity: null,
      researchLineage: null,
      primaryResultIdentity: null,
      sourceArtifactIdentities: [CRYPTOSTRUCT_MCP_LIVE_CAPTURE_ARTIFACT],
      inventorySnapshotIdentity: inventory.inventoryContentSha256,
      patch: {
        vendorAvailable: true,
        owned: false,
      },
    });
  }

  // Quality-audit burns first (may not be listed in get_my_files).
  ledger = applyQualityAuditBurns({
    ledger,
    atUtc: input.atUtc,
    inventoryIdentity: inventory.inventoryContentSha256,
    vendorCoveredSet,
  });

  // M16-ER spent on the intersection of MCP ownership + fixed cohort.
  const spentDates = cohort.fixedUtcDates.filter((d) => mcpOwnedSet.has(d));
  if (spentDates.length !== cohort.fixedUtcDates.length) {
    const missing = cohort.fixedUtcDates.filter((d) => !mcpOwnedSet.has(d));
    throw new Error(
      `M16-ER cohort dates missing from MCP ownership: ${missing.join(",")}`,
    );
  }
  ledger = applyM16ErSpentValidation({
    ledger,
    atUtc: input.atUtc,
    inventoryIdentity: inventory.inventoryContentSha256,
    primaryId,
    acqDays,
    cohortDates: spentDates,
    auditSet,
  });

  // Additional MCP-owned dates beyond M16-ER / quality-audit authority.
  for (const utcDate of [...mcpOwnedSet].sort()) {
    if (cohortSet.has(utcDate) || auditSet.has(utcDate)) continue;
    const meta = mcpOwnedByDate.get(utcDate);
    if (!meta) continue;

    // No clear untouched provenance in repo → fail closed to quarantine.
    // (Never infer sealed merely because a file is owned.)
    assertAllowedStateTransition({
      utcDate,
      from: "AVAILABLE_UNOWNED",
      to: "UNKNOWN_QUARANTINED",
    });
    ledger = appendReservoirEvent(ledger, {
      eventType: "quarantine",
      utcDate,
      atUtc: input.atUtc,
      priorState: "AVAILABLE_UNOWNED",
      newState: "UNKNOWN_QUARANTINED",
      reason:
        "MCP-owned KXBTC15M date lacks clear untouched sealed provenance in repo",
      actor: "cryptostruct-research-reservoir",
      scientificProtocolIdentity: null,
      researchLineage: null,
      primaryResultIdentity: null,
      sourceArtifactIdentities: [CRYPTOSTRUCT_MCP_LIVE_CAPTURE_ARTIFACT],
      inventorySnapshotIdentity: inventory.inventoryContentSha256,
      patch: {
        owned: true,
        vendorAvailable: true,
        byteSize: meta.byteSize,
        rawZipSha256: meta.vendorChecksumSha256,
        vendorFileId: meta.vendorFileId,
        notes: "UNKNOWN_QUARANTINED until human provenance review",
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
