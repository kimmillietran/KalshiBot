#!/usr/bin/env tsx
/**
 * CryptoStruct research reservoir CLI (metadata only).
 *
 * npm run research:cryptostruct-reservoir -- --status
 * npm run research:cryptostruct-reservoir -- --audit
 * npm run research:cryptostruct-reservoir -- --write-artifacts
 * npm run research:cryptostruct-reservoir -- --write-artifacts --offline
 * npm run research:cryptostruct-reservoir -- --plan-allocation --validation 5 --holdout 5 --protocol <id>
 * npm run research:cryptostruct-reservoir -- --plan-acquisition --days 10
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  auditReservoirInvariants,
  bootstrapReservoirFromLiveMcpCapture,
  bootstrapReservoirFromRepoAuthority,
  groupDatesByState,
  planAcquisition,
  planDeterministicAllocation,
} from "@/lib/data/research/cryptostructResearchReservoir";

const ROOT = process.cwd();
const OUT = join(
  ROOT,
  "data/research-results/external-kalshi-data-audit",
);

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function bootstrap() {
  const useOffline = hasFlag("--offline");
  // Fixed timestamp for deterministic artifact hashes when writing; live status may use now.
  const atUtc = hasFlag("--write-artifacts")
    ? useOffline
      ? "2026-09-23T07:00:00.000Z"
      : "2026-09-23T21:50:00.000Z"
    : new Date().toISOString();

  if (useOffline) {
    return bootstrapReservoirFromRepoAuthority({
      repoRoot: ROOT,
      atUtc,
    });
  }
  return bootstrapReservoirFromLiveMcpCapture({
    repoRoot: ROOT,
    atUtc,
  });
}

function main(): void {
  const boot = bootstrap();

  if (hasFlag("--write-artifacts")) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, "cryptostruct-reservoir-mcp-inventory.json"),
      JSON.stringify(boot.inventory, null, 2) + "\n",
    );
    writeFileSync(
      join(OUT, "cryptostruct-reservoir-events.json"),
      JSON.stringify(boot.eventLedger, null, 2) + "\n",
    );
    writeFileSync(
      join(OUT, "cryptostruct-reservoir-snapshot.json"),
      JSON.stringify(boot.snapshot, null, 2) + "\n",
    );
    const byState = groupDatesByState(boot.snapshot);
    const acquisitionPlans = [10, 30, 60].map((days) =>
      planAcquisition({
        snapshot: boot.snapshot,
        inventory: boot.inventory,
        desiredNewSealedDays: days,
      }),
    );
    const report = {
      generatedAtUtc: boot.inventory.queriedAtUtc,
      counts: boot.snapshot.counts,
      datesByState: byState,
      inventoryContentSha256: boot.inventory.inventoryContentSha256,
      eventLedgerIdentity: boot.eventLedger.eventLedgerIdentity,
      snapshotIdentity: boot.snapshot.snapshotIdentity,
      mcpConnected: boot.inventory.mcp.cryptostructMcpConnected,
      mcpReadOnlyToolsCalled: boot.inventory.mcp.readOnlyToolsCalled,
      mcpMutatingToolsCalled: boot.inventory.mcp.mutatingToolsCalled,
      subscription: {
        tier: boot.inventory.subscription.tier,
        availableCredits: boot.inventory.subscription.availableCredits,
        autonomousPurchasePolicy:
          boot.inventory.subscription.autonomousPurchasePolicy,
        note: boot.inventory.subscription.note,
      },
      catalogDateRange: boot.inventory.product.availableDateRange,
      vendorCoveredDateCount: boot.inventory.vendorCoveredUtcDates.length,
      ownedDateCount: boot.inventory.ownedDates.length,
      availableUnownedDateCount: boot.inventory.availableUnownedUtcDates.length,
      untouchedOwnedSealedCount: boot.snapshot.counts.OWNED_SEALED_UNASSIGNED,
      informationalAcquisitionPlans: acquisitionPlans.map((p) => ({
        desiredNewSealedDays: p.desiredNewSealedDays,
        proposedPurchaseUtcDates: p.proposedPurchaseUtcDates,
        estimatedCreditsIfOnePerDay: p.estimatedCreditsIfOnePerDay,
        estimatedListPriceEurIfNoCredits: p.estimatedListPriceEurIfNoCredits,
        shortfallAfterAvailableUnowned: p.shortfallAfterAvailableUnowned,
        planContentSha256: p.planContentSha256,
        purchaseExecuted: p.purchaseExecuted,
        disposition: p.disposition,
      })),
      informationalPriceQuotes: {
        note:
          "Optional get_price_quote results (read-only; no checkout created). "
          + "Recorded separately in cryptostruct-reservoir-report.md when obtained.",
        quotes: null as null | unknown,
      },
      creditsSpentThisTask: 0,
      purchaseExecuted: false,
      filesDownloadedThisTask: 0,
      filesRestoredThisTask: 0,
      futureAcquisitionWorkflow: [
        "MCP coverage discovery",
        "reconcile ownership",
        "plan missing dates",
        "price preview (read-only if safe)",
        "HUMAN APPROVAL",
        "vendor purchase",
        "download",
        "SHA-256 verification",
        "raw store",
        "reservoir ownership event → OWNED_SEALED_UNASSIGNED",
        "deterministic protocol-bound allocation",
      ],
      note:
        "No purchase/download/restore/economic analysis performed in this task.",
    };
    writeFileSync(
      join(OUT, "cryptostruct-reservoir-status.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
    const md = `# CryptoStruct Research Data Reservoir

## MCP
- Connected: **${boot.inventory.mcp.cryptostructMcpConnected}**
- Read-only tools called: ${(boot.inventory.mcp.readOnlyToolsCalled as readonly string[]).join(", ") || "(none)"}
- Mutating tools called: none
- Credits spent this task: 0
- Purchases / downloads / restores this task: 0

## Subscription (sanitized)
- Tier: ${boot.inventory.subscription.tier ?? "n/a"}
- Available credits: ${boot.inventory.subscription.availableCredits ?? "n/a"}
- Autonomous purchase policy: ${boot.inventory.subscription.autonomousPurchasePolicy ?? "n/a"}
- Detail: ${boot.inventory.subscription.note}

## Catalog
- Bundle/product: \`${boot.inventory.product.bundleOrProductId}\`
- Range: ${boot.inventory.product.availableDateRange.startInclusive} … ${boot.inventory.product.availableDateRange.endInclusive}
- Vendor-covered dates: ${boot.inventory.vendorCoveredUtcDates.length}
- MCP-owned dates: ${boot.inventory.ownedDates.length}
- AVAILABLE_UNOWNED (inventory): ${boot.inventory.availableUnownedUtcDates.length}

## Reservoir counts
${Object.entries(boot.snapshot.counts)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Untouched capacity
- OWNED_SEALED_UNASSIGNED: ${boot.snapshot.counts.OWNED_SEALED_UNASSIGNED}
- AVAILABLE_UNOWNED (reservoir): ${boot.snapshot.counts.AVAILABLE_UNOWNED}

## Identities
- inventory: \`${boot.inventory.inventoryContentSha256}\`
- event ledger: \`${boot.eventLedger.eventLedgerIdentity}\`
- snapshot: \`${boot.snapshot.snapshotIdentity}\`

## Safety
No sealed outcomes opened. No purchase. No M16-P changes. No credits spent.
`;
    writeFileSync(join(OUT, "cryptostruct-reservoir-report.md"), md);
    console.log(
      JSON.stringify(
        {
          wrote: true,
          mcpConnected: boot.inventory.mcp.cryptostructMcpConnected,
          inventoryContentSha256: boot.inventory.inventoryContentSha256,
          snapshotIdentity: boot.snapshot.snapshotIdentity,
          eventLedgerIdentity: boot.eventLedger.eventLedgerIdentity,
          counts: boot.snapshot.counts,
          vendorCovered: boot.inventory.vendorCoveredUtcDates.length,
          owned: boot.inventory.ownedDates.length,
          availableUnownedInventory:
            boot.inventory.availableUnownedUtcDates.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (hasFlag("--audit")) {
    const audit = auditReservoirInvariants(boot.snapshot);
    console.log(JSON.stringify(audit, null, 2));
    if (!audit.ok) process.exit(1);
    return;
  }

  if (hasFlag("--plan-allocation")) {
    const protocol = argValue("--protocol");
    if (!protocol) {
      throw new Error("--protocol <scientificProtocolIdentity> required");
    }
    const validation = Number(argValue("--validation") ?? "0");
    const holdout = Number(argValue("--holdout") ?? "0");
    const plan = planDeterministicAllocation({
      snapshot: boot.snapshot,
      scientificProtocolIdentity: protocol,
      researchLineage: argValue("--lineage") ?? "unspecified",
      requiredValidationDays: validation,
      requiredHoldoutDays: holdout,
    });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (hasFlag("--plan-acquisition")) {
    const days = Number(argValue("--days") ?? "10");
    const plan = planAcquisition({
      snapshot: boot.snapshot,
      inventory: boot.inventory,
      desiredNewSealedDays: days,
    });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  // default --status
  console.log(
    JSON.stringify(
      {
        counts: boot.snapshot.counts,
        datesByState: groupDatesByState(boot.snapshot),
        inventoryContentSha256: boot.inventory.inventoryContentSha256,
        eventLedgerIdentity: boot.eventLedger.eventLedgerIdentity,
        snapshotIdentity: boot.snapshot.snapshotIdentity,
        mcp: boot.inventory.mcp,
        subscription: boot.inventory.subscription,
        untouchedOwnedSealed: boot.snapshot.counts.OWNED_SEALED_UNASSIGNED,
        availableUnowned: boot.inventory.availableUnownedUtcDates.length,
        vendorCovered: boot.inventory.vendorCoveredUtcDates.length,
        owned: boot.inventory.ownedDates.length,
      },
      null,
      2,
    ),
  );
}

main();
