import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  M16_ER_ADAPTER_IDENTITY,
  // dependency fence: reservoir must not need this for allocation
} from "@/lib/data/research/m16ExternalReplication";

import {
  CRYPTOSTRUCT_RESERVOIR_FORBIDDEN_FIELDS,
  M16_ER_PRIMARY_RESULT_CONTENT_SHA256,
  assertAllowedStateTransition,
  assertDateAllocatable,
  assertNoForbiddenReservoirFields,
  auditReservoirInvariants,
  bootstrapReservoirFromRepoAuthority,
  buildSanitizedInventory,
  createEmptyEventLedger,
  groupDatesByState,
  materializeReservoirSnapshot,
  planAcquisition,
  planDeterministicAllocation,
  CryptostructReservoirError,
  appendReservoirEvent,
} from "./index";

void M16_ER_ADAPTER_IDENTITY;

describe("cryptostructResearchReservoir", () => {
  const boot = bootstrapReservoirFromRepoAuthority({
    repoRoot: process.cwd(),
    atUtc: "2026-09-23T07:00:00.000Z",
  });

  it("bootstraps M16-ER spent + QUALITY_AUDIT_ONLY from repo authority", () => {
    expect(boot.snapshot.counts.SPENT_VALIDATION).toBe(34);
    expect(boot.snapshot.counts.QUALITY_AUDIT_ONLY).toBe(5);
    expect(boot.snapshot.counts.OWNED_SEALED_UNASSIGNED).toBe(0);
    expect(boot.inventory.creditsSpentThisTask).toBe(0);
    expect(boot.inventory.filesPurchasedThisTask).toBe(0);
    expect(boot.inventory.mcp.cryptostructMcpConnected).toBe(false);
    expect(boot.inventory.mcp.mutatingToolsCalled).toEqual([]);

    const byState = groupDatesByState(boot.snapshot);
    expect(byState.QUALITY_AUDIT_ONLY).toEqual([
      "2026-09-08",
      "2026-09-09",
      "2026-09-14",
      "2026-09-18",
      "2026-09-20",
    ]);
    expect(byState.SPENT_VALIDATION).toHaveLength(34);
    for (const d of byState.SPENT_VALIDATION!) {
      const day = boot.snapshot.days[d]!;
      expect(day.primaryResultIdentity).toBe(M16_ER_PRIMARY_RESULT_CONTENT_SHA256);
      expect(day.researchLineage).toBe("M16-ER");
    }
  });

  it("binds PR #110 primary identity exactly", () => {
    const primary = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "data/research-results/external-kalshi-data-audit/m16-er-primary-economic-result.json",
        ),
        "utf8",
      ),
    ) as { primaryResultContentSha256: string };
    expect(primary.primaryResultContentSha256).toBe(
      M16_ER_PRIMARY_RESULT_CONTENT_SHA256,
    );
  });

  it("rejects quality-audit → validation and spent → sealed", () => {
    expect(() =>
      assertAllowedStateTransition({
        utcDate: "2026-09-08",
        from: "QUALITY_AUDIT_ONLY",
        to: "RESERVED_VALIDATION",
      }),
    ).toThrow(/QUALITY_AUDIT_ONLY|forbidden/);
    expect(() =>
      assertAllowedStateTransition({
        utcDate: "2026-08-14",
        from: "SPENT_VALIDATION",
        to: "OWNED_SEALED_UNASSIGNED",
      }),
    ).toThrow(/reseal|forbidden/);
    expect(() =>
      assertAllowedStateTransition({
        utcDate: "2026-08-14",
        from: "OPEN_DISCOVERY",
        to: "OWNED_SEALED_UNASSIGNED",
      }),
    ).toThrow(/reseal|forbidden/);
  });

  it("rejects allocation of spent / audit / unknown / unowned", () => {
    const spent = boot.snapshot.days["2026-08-14"]!;
    expect(() => assertDateAllocatable(spent)).toThrow();
    const audit = boot.snapshot.days["2026-09-08"]!;
    expect(() => assertDateAllocatable(audit)).toThrow();

    let ledger = createEmptyEventLedger();
    ledger = appendReservoirEvent(ledger, {
      eventType: "quarantine",
      utcDate: "2026-07-01",
      atUtc: "2026-09-23T07:00:00.000Z",
      priorState: null,
      newState: "UNKNOWN_QUARANTINED",
      reason: "ambiguous",
      actor: "test",
      scientificProtocolIdentity: null,
      researchLineage: null,
      primaryResultIdentity: null,
      sourceArtifactIdentities: [],
      inventorySnapshotIdentity: null,
      patch: { owned: true, vendorAvailable: true },
    });
    const snap = materializeReservoirSnapshot({
      ledger,
      materializedAtUtc: "2026-09-23T07:00:00.000Z",
    });
    expect(() => assertDateAllocatable(snap.days["2026-07-01"]!)).toThrow(
      /quarantine|allocatable/,
    );
  });

  it("allocation is deterministic and protocol-sensitive", () => {
    // Seed sealed dates for allocation test only
    let ledger = createEmptyEventLedger();
    const sealed = [
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ];
    for (const d of sealed) {
      ledger = appendReservoirEvent(ledger, {
        eventType: "ownership-observed",
        utcDate: d,
        atUtc: "2026-09-23T07:00:00.000Z",
        priorState: null,
        newState: "OWNED_SEALED_UNASSIGNED",
        reason: "test-sealed",
        actor: "test",
        scientificProtocolIdentity: null,
        researchLineage: null,
        primaryResultIdentity: null,
        sourceArtifactIdentities: [],
        inventorySnapshotIdentity: null,
        patch: { owned: true, vendorAvailable: true },
      });
    }
    const snap = materializeReservoirSnapshot({
      ledger,
      materializedAtUtc: "2026-09-23T07:00:00.000Z",
    });
    const a = planDeterministicAllocation({
      snapshot: snap,
      scientificProtocolIdentity: "protocol-aaa",
      researchLineage: "test",
      requiredValidationDays: 2,
      requiredHoldoutDays: 2,
    });
    const b = planDeterministicAllocation({
      snapshot: snap,
      scientificProtocolIdentity: "protocol-aaa",
      researchLineage: "test",
      requiredValidationDays: 2,
      requiredHoldoutDays: 2,
    });
    expect(a.allocationContentSha256).toBe(b.allocationContentSha256);
    expect(a.validationUtcDates).toEqual(b.validationUtcDates);
    expect(a.holdoutUtcDates).toEqual(b.holdoutUtcDates);
    expect(
      a.validationUtcDates.some((d) => a.holdoutUtcDates.includes(d)),
    ).toBe(false);

    const c = planDeterministicAllocation({
      snapshot: snap,
      scientificProtocolIdentity: "protocol-bbb",
      researchLineage: "test",
      requiredValidationDays: 2,
      requiredHoldoutDays: 2,
    });
    expect(c.allocationContentSha256).not.toBe(a.allocationContentSha256);
  });

  it("boot snapshot has zero sealed capacity; acquisition plan is no-spend", () => {
    expect(() =>
      planDeterministicAllocation({
        snapshot: boot.snapshot,
        scientificProtocolIdentity: "proto",
        researchLineage: "x",
        requiredValidationDays: 1,
        requiredHoldoutDays: 0,
      }),
    ).toThrow(/insufficient/);

    const plan = planAcquisition({
      snapshot: boot.snapshot,
      inventory: boot.inventory,
      desiredNewSealedDays: 10,
    });
    expect(plan.purchaseExecuted).toBe(false);
    expect(plan.disposition).toBe("PURCHASE_PLAN_ONLY");
    expect(plan.proposedPurchaseUtcDates).toEqual([]);
    expect(plan.shortfallAfterAvailableUnowned).toBe(10);
  });

  it("rejects forbidden economic fields and duplicate owned dates", () => {
    expect(() =>
      assertNoForbiddenReservoirFields({ pnl: 1 }),
    ).toThrow(/forbidden/);
    for (const f of CRYPTOSTRUCT_RESERVOIR_FORBIDDEN_FIELDS.slice(0, 3)) {
      expect(() =>
        assertNoForbiddenReservoirFields({ [f]: true }),
      ).toThrow(/forbidden/);
    }
    expect(() =>
      buildSanitizedInventory({
        schemaVersion: "cryptostruct-kxbtc15m-sanitized-inventory-v1",
        provider: "CryptoStruct",
        series: "KXBTC15M",
        queriedAtUtc: "2026-09-23T07:00:00.000Z",
        mcp: {
          discoveredNamespaces: [],
          cryptostructMcpConnected: false,
          readOnlyToolsExpected: [],
          mutatingToolsProhibited: [],
          readOnlyToolsCalled: [],
          mutatingToolsCalled: [],
          note: "x",
        },
        product: {
          bundleOrProductId: null,
          series: "KXBTC15M",
          dataFormat: "zip",
          availableDateRange: { startInclusive: null, endInclusive: null },
          sourcePages: [],
        },
        vendorCoveredUtcDates: ["2026-08-14"],
        ownedDates: [
          {
            utcDate: "2026-08-14",
            vendorFileId: null,
            ownershipStatus: "owned",
            byteSize: 1,
            vendorChecksumSha256: null,
            formatVersion: null,
            availabilityStatus: null,
          },
          {
            utcDate: "2026-08-14",
            vendorFileId: null,
            ownershipStatus: "owned",
            byteSize: 2,
            vendorChecksumSha256: null,
            formatVersion: null,
            availabilityStatus: null,
          },
        ],
        availableUnownedUtcDates: [],
        subscription: {
          readable: false,
          tier: null,
          availableCredits: null,
          autonomousPurchasePolicy: null,
          note: "x",
        },
        creditsSpentThisTask: 0,
        filesPurchasedThisTask: 0,
        filesDownloadedThisTask: 0,
        filesRestoredThisTask: 0,
      }),
    ).toThrow(CryptostructReservoirError);
  });

  it("invariant audit passes on boot snapshot", () => {
    const audit = auditReservoirInvariants(boot.snapshot);
    expect(audit.ok).toBe(true);
  });

  it("inventory content hash is stable", () => {
    const again = bootstrapReservoirFromRepoAuthority({
      repoRoot: process.cwd(),
      atUtc: "2026-09-23T07:00:00.000Z",
    });
    expect(again.inventory.inventoryContentSha256).toBe(
      boot.inventory.inventoryContentSha256,
    );
    expect(again.inventory.inventoryContentSha256).toBe(
      "3bd4caddd04fe3700dc5ed7c28d2b243a1e29d710197490b570e27f6935da718",
    );
  });
});
