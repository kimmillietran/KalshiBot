#!/usr/bin/env tsx
/**
 * CryptoStruct research reservoir CLI (metadata only).
 *
 * npm run research:cryptostruct-reservoir -- --status
 * npm run research:cryptostruct-reservoir -- --audit
 * npm run research:cryptostruct-reservoir -- --write-artifacts
 * npm run research:cryptostruct-reservoir -- --plan-allocation --validation 5 --holdout 5 --protocol <id>
 * npm run research:cryptostruct-reservoir -- --plan-acquisition --days 10
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  auditReservoirInvariants,
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

function main(): void {
  // Fixed timestamp for deterministic artifact hashes when writing; live status may use now.
  const atUtc = hasFlag("--write-artifacts")
    ? "2026-09-23T07:00:00.000Z"
    : new Date().toISOString();
  const boot = bootstrapReservoirFromRepoAuthority({
    repoRoot: ROOT,
    atUtc,
  });

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
    const report = {
      generatedAtUtc: atUtc,
      counts: boot.snapshot.counts,
      datesByState: byState,
      inventoryContentSha256: boot.inventory.inventoryContentSha256,
      eventLedgerIdentity: boot.eventLedger.eventLedgerIdentity,
      snapshotIdentity: boot.snapshot.snapshotIdentity,
      mcpConnected: boot.inventory.mcp.cryptostructMcpConnected,
      creditsSpentThisTask: 0,
      purchaseExecuted: false,
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
- Mutating tools called: none
- Credits spent: 0

## Counts
${Object.entries(boot.snapshot.counts)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join("\n")}

## Identities
- inventory: \`${boot.inventory.inventoryContentSha256}\`
- event ledger: \`${boot.eventLedger.eventLedgerIdentity}\`
- snapshot: \`${boot.snapshot.snapshotIdentity}\`

## Untouched capacity
- OWNED_SEALED_UNASSIGNED: ${boot.snapshot.counts.OWNED_SEALED_UNASSIGNED}
- AVAILABLE_UNOWNED (within catalog freeze): ${boot.snapshot.counts.AVAILABLE_UNOWNED}

## Safety
No sealed outcomes opened. No purchase. No M16-P changes.
`;
    writeFileSync(join(OUT, "cryptostruct-reservoir-report.md"), md);
    console.log(
      JSON.stringify(
        {
          wrote: true,
          inventoryContentSha256: boot.inventory.inventoryContentSha256,
          snapshotIdentity: boot.snapshot.snapshotIdentity,
          counts: boot.snapshot.counts,
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
        untouchedOwnedSealed: boot.snapshot.counts.OWNED_SEALED_UNASSIGNED,
        availableUnowned: boot.inventory.availableUnownedUtcDates.length,
      },
      null,
      2,
    ),
  );
}

main();
