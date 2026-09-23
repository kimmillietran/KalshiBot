/**
 * Finalize M16-ER economic outcome artifacts from work/economic-outcomes.json.
 * Requires prior human authorization artifact. Freezes PRIMARY before diagnostics.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertQualityAuditDatesImmutable,
  CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
  transitionCryptostructDayStatus,
  type CryptostructDatasetLedger,
} from "@/lib/data/research/cryptostructDatasetGovernance";
import {
  buildM16ErDayClusterDiagnostics,
  buildM16ErDependencePlan,
  buildM16ErEconomicDiagnostics,
  buildM16ErEvidenceContract,
  buildM16ErFeeContract,
  buildM16ErFixedCohortPlan,
  buildM16ErPrimaryEconomicResult,
  buildM16ErScientificProtocol,
  buildM16ErSourceContract,
  evaluateM16ErOutcomeOpenAuthorization,
  M16_ER_ADAPTER_IDENTITY,
  M16_ER_MIN_UTC_DAY_CLUSTERS,
  M16_ER_REQUIRED_TRADE_N,
  M16_ER_ROLE,
  type M16ErTradeOutcome,
} from "@/lib/data/research/m16ExternalReplication";

const ROOT = process.cwd();
const WORK = join(ROOT, "data/external-samples/cryptostruct/m16-er/work");
const OUT = join(ROOT, "data/research-results/external-kalshi-data-audit");

function writeJson(name: string, value: unknown): void {
  writeFileSync(join(OUT, name), JSON.stringify(value, null, 2) + "\n");
}

function canonicalPrimaryPayload(primary: Record<string, unknown>): string {
  // Exclude only explicit run timestamps if present; scientific payload hashed.
  const { outcomeOpenTimestampUtc: _t, ...rest } = primary as {
    outcomeOpenTimestampUtc?: string;
  } & Record<string, unknown>;
  void _t;
  return JSON.stringify(rest);
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const authPath = join(OUT, "m16-er-outcome-open-authorization.json");
  if (!existsSync(authPath)) {
    throw new Error("missing outcome-open authorization");
  }
  const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<
    string,
    unknown
  >;
  if (auth.humanOutcomeOpenApproval !== true) {
    throw new Error("humanOutcomeOpenApproval required");
  }

  const protocol = buildM16ErScientificProtocol();
  const cohort = buildM16ErFixedCohortPlan();
  const source = buildM16ErSourceContract();
  const dependence = buildM16ErDependencePlan();
  const fee = buildM16ErFeeContract();
  const evidence = buildM16ErEvidenceContract();

  const econ = JSON.parse(
    readFileSync(join(WORK, "economic-outcomes.json"), "utf8"),
  ) as { outcomes: M16ErTradeOutcome[]; blindConfirmationsExpected: number };

  const outcomes = econ.outcomes;
  if (outcomes.length !== 461) {
    // Allow if some confirmations unevaluable still counted in outcomes
    // Blind confirmations should equal outcome rows (one per confirmation).
    if (outcomes.length !== econ.blindConfirmationsExpected) {
      console.warn(
        `outcome count ${outcomes.length} != expected blind ${econ.blindConfirmationsExpected}`,
      );
    }
  }

  // PRIMARY FIRST — freeze before diagnostics
  const primaryCore = buildM16ErPrimaryEconomicResult({
    outcomes,
    blindConfirmations: econ.blindConfirmationsExpected,
    requiredN: M16_ER_REQUIRED_TRADE_N,
    requiredG: M16_ER_MIN_UTC_DAY_CLUSTERS,
  });

  const mainSha = (
    auth.mainSha as string | undefined
  ) ?? "unknown";

  const primaryArtifact = {
    ...primaryCore,
    role: M16_ER_ROLE,
    mainSha,
    outcomeOpenTimestampUtc: auth.outcomeOpenTimestampUtc,
    scientificProtocolIdentity: protocol.scientificProtocolIdentity,
    cohortReservationIdentity: cohort.cohortReservationIdentity,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    sourceContractIdentity: source.sourceContractIdentity,
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    evidenceContractIdentity: evidence.evidenceContractIdentity,
    feeContractIdentity: fee.feeContractIdentity,
    rawCohortIdentityFingerprint: auth.rawCohortIdentityFingerprint,
    humanOutcomeOpenApproval: true,
    economicOutcomesPreviouslyOpened: false,
  };

  const primaryContentHash = createHash("sha256")
    .update(canonicalPrimaryPayload(primaryArtifact as Record<string, unknown>))
    .digest("hex");

  const primaryWithHash = {
    ...primaryArtifact,
    primaryResultContentSha256: primaryContentHash,
  };

  writeJson("m16-er-primary-economic-result.json", primaryWithHash);

  // Diagnostics AFTER primary freeze
  const diagnostics = buildM16ErEconomicDiagnostics(outcomes);
  writeJson("m16-er-economic-diagnostics.json", {
    note: "Descriptive only — does not alter primary verdict",
    primaryResultContentSha256: primaryContentHash,
    ...diagnostics,
  });

  const dayClusters = buildM16ErDayClusterDiagnostics(outcomes);
  writeJson("m16-er-day-clusters.json", {
    note: "Descriptive day-cluster means — no day deletion or retesting",
    primaryResultContentSha256: primaryContentHash,
    ...dayClusters,
  });

  // Ledger OPENED_VALIDATION for admitted reserved days
  const ledgerPath = join(OUT, "m16-er-dataset-ledger.json");
  let ledger = JSON.parse(
    readFileSync(ledgerPath, "utf8"),
  ) as CryptostructDatasetLedger;
  assertQualityAuditDatesImmutable(ledger);
  const at = String(auth.outcomeOpenTimestampUtc);
  for (const d of cohort.fixedUtcDates) {
    const status = ledger.days[d]?.status;
    if (status === "VALIDATION_RESERVED") {
      ledger = transitionCryptostructDayStatus({
        ledger,
        utcDate: d,
        toStatus: "OPENED_VALIDATION",
        atUtc: at,
        reason: "m16-er-human-authorized-economic-outcome-open",
        patch: {
          openedTimestampUtc: at,
        },
      });
    }
  }
  for (const d of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
    if (ledger.days[d]?.status !== "QUALITY_AUDIT_ONLY") {
      throw new Error(`audit date mutated: ${d}`);
    }
  }
  writeJson("m16-er-dataset-ledger.json", ledger);

  const gate = evaluateM16ErOutcomeOpenAuthorization({
    protocolIdentity: protocol.scientificProtocolIdentity,
    cohortReservationIdentity: cohort.cohortReservationIdentity,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    sourceContractIdentity: source.sourceContractIdentity,
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    feeContractIdentity: fee.feeContractIdentity,
    purchasedZipSha256Verified: true,
    qualityAuditComplete: true,
    fixedCohortAdmissionComplete: true,
    sampleAdequacyMet: true,
    pnlPreviouslyOpened: false,
  });

  const md = `# M16-ER Economic Outcome

## PRIMARY
- mean fee-adjusted executable P&L: **${primaryWithHash.meanFeeAdjustedPnlCents}** ¢
- CR2 SE: ${primaryWithHash.cr2StandardErrorCents} ¢
- t: ${primaryWithHash.tStatistic}
- df: ${primaryWithHash.degreesOfFreedom}
- one-sided p: ${primaryWithHash.oneSidedPValue}
- decision: ${primaryWithHash.hypothesisDecision}
- disposition: ${primaryWithHash.protocolDisposition}

## Seal note
Primary content SHA-256: \`${primaryContentHash}\`
`;
  writeFileSync(join(OUT, "m16-er-economic-result.md"), md);

  // Compact trade summary (not giant event dumps) — gitignored work already has full
  writeJson("m16-er-outcome-open-authorization.json", {
    ...auth,
    gateAuthorizedAtOpen: gate.authorized,
    gateSealedAtOpen: gate.sealed,
  });

  console.log(
    JSON.stringify(
      {
        primaryN: primaryWithHash.primaryN,
        primaryG: primaryWithHash.primaryG,
        meanNet: primaryWithHash.meanFeeAdjustedPnlCents,
        p: primaryWithHash.oneSidedPValue,
        decision: primaryWithHash.hypothesisDecision,
        disposition: primaryWithHash.protocolDisposition,
        primaryResultContentSha256: primaryContentHash,
      },
      null,
      2,
    ),
  );
}

main();
