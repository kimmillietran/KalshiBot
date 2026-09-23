#!/usr/bin/env npx tsx
/**
 * Write compact M16-ER protocol freeze artifacts (no economics, no purchase).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertQualityAuditDatesImmutable,
  buildCryptostructCandidateUniverse,
  buildFrozenCryptostructLedgerForM16Er,
} from "@/lib/data/research/cryptostructDatasetGovernance";
import {
  buildM16ErIdentityBundle,
  buildM16ErPurchaseManifest,
  buildM16ErScientificProtocol,
  evaluateM16ErOutcomeOpenAuthorization,
} from "@/lib/data/research/m16ExternalReplication";
import {
  buildM16ScientificProtocolIdentity,
  M16_EXPECTED_COHORT_PLAN_IDENTITY,
  M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY,
  M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY,
  M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
  M16_EXPECTED_FEE_CONTRACT_IDENTITY,
} from "@/lib/data/research/kalshiKxbtc15mSideInvariantReversal/m16ValidationAuthority";

const OUT = join(
  process.cwd(),
  "data/research-results/external-kalshi-data-audit",
);

function write(name: string, value: unknown): void {
  writeFileSync(join(OUT, name), JSON.stringify(value, null, 2) + "\n");
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const ledger = buildFrozenCryptostructLedgerForM16Er();
  assertQualityAuditDatesImmutable(ledger);
  const universe = buildCryptostructCandidateUniverse();
  const bundle = buildM16ErIdentityBundle();
  const purchase = buildM16ErPurchaseManifest();
  const protocol = buildM16ErScientificProtocol();
  const gate = evaluateM16ErOutcomeOpenAuthorization();

  write("m16-er-dataset-ledger.json", {
    ...ledger,
    // keep compact: omit verbose notes duplication
  });
  write("m16-er-candidate-universe.json", universe);
  write("m16-er-identities.json", {
    ...bundle,
    prospectiveM16IdentitiesUnchanged: {
      familyDefinition: M16_EXPECTED_FAMILY_DEFINITION_IDENTITY,
      evidenceContract: M16_EXPECTED_EVIDENCE_CONTRACT_IDENTITY,
      dependencePlan: M16_EXPECTED_DEPENDENCE_PLAN_IDENTITY,
      feeContract: M16_EXPECTED_FEE_CONTRACT_IDENTITY,
      cohortPlan: M16_EXPECTED_COHORT_PLAN_IDENTITY,
      scientificProtocol: buildM16ScientificProtocolIdentity(),
    },
  });
  write("m16-er-purchase-manifest.json", purchase);
  write("m16-er-outcome-seal.json", gate);
  write("m16-er-scientific-protocol.json", protocol);

  const md = `# M16-ER Protocol Freeze

## Verdict
Protocol frozen. Economics sealed. Purchase NOT executed.

## Prospective M16-P
- Unchanged family \`${M16_EXPECTED_FAMILY_DEFINITION_IDENTITY}\`
- Unchanged protocol \`${buildM16ScientificProtocolIdentity()}\`
- Scheduler remains armed; outcomes sealed

## M16-ER
- Role: \`m16-external-historical-replication\`
- Adapter: RAW-BBO-CHANGE / \`${bundle.adapterIdentity}\`
- Scientific protocol: \`${bundle.scientificProtocolIdentity}\`
- Fixed cohort: **${bundle.cohort.fixedDateCount}** UTC dates (${bundle.cohort.fixedGovernedHours}h)
- Required N: **${bundle.dependence.requiredTradeN}**; min G: **${bundle.dependence.minimumUtcDayClusters}**
- Adequacy: **${bundle.cohort.adequacyVerdict}**
- Purchase credits required: **${purchase.creditsRequired}** (Premium 50 ${purchase.premiumAllowanceSufficient ? "SUFFICIENT" : "INSUFFICIENT"})
- Outcome gate authorized: **${gate.authorized}**

## Scientific interpretation
M16-P and M16-ER test the same substantive reversal family under different frozen observation sources. M16-ER is NOT a replacement retroactively relabeled as prospective.

STOP BEFORE PURCHASE AND BEFORE REAL OUTCOME OPEN.
`;
  writeFileSync(join(OUT, "m16-er-protocol-freeze.md"), md);
  console.log(
    JSON.stringify(
      {
        scientificProtocolIdentity: bundle.scientificProtocolIdentity,
        cohortDates: bundle.cohort.fixedDateCount,
        requiredN: bundle.dependence.requiredTradeN,
        minG: bundle.dependence.minimumUtcDayClusters,
        credits: purchase.creditsRequired,
        gateAuthorized: gate.authorized,
      },
      null,
      2,
    ),
  );
}

main();
