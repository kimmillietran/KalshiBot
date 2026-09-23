/**
 * Finalize M16-ER ingestion artifacts from work outputs (NO ECONOMICS).
 *
 * Reads gitignored work SHA + blind-incidence JSON produced by Python ingest,
 * updates append-only ledger transitions, writes compact research-results
 * artifacts, and reports readiness for human outcome-open approval.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  assertQualityAuditDatesImmutable,
  buildFrozenCryptostructLedgerForM16Er,
  CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES,
  transitionCryptostructDayStatus,
  type CryptostructDatasetLedger,
} from "@/lib/data/research/cryptostructDatasetGovernance";
import {
  buildM16ErDependencePlan,
  buildM16ErFeeContract,
  buildM16ErFixedCohortPlan,
  buildM16ErScientificProtocol,
  buildM16ErSourceContract,
  evaluateM16ErOutcomeOpenAuthorization,
  M16_ER_ADAPTER_IDENTITY,
  M16_ER_MIN_UTC_DAY_CLUSTERS,
  M16_ER_REQUIRED_TRADE_N,
  M16_ER_ROLE,
} from "@/lib/data/research/m16ExternalReplication";

const ROOT = process.cwd();
const WORK = join(ROOT, "data/external-samples/cryptostruct/m16-er/work");
const OUT = join(ROOT, "data/research-results/external-kalshi-data-audit");

const FORBIDDEN_OUTCOME_KEYS = [
  "pnl",
  "realizedReturn",
  "targetHit",
  "stopHit",
  "settlement",
  "winRate",
  "mfe",
  "mae",
  "exitPrice",
  "pValue",
  "tStatistic",
  "cr2Result",
  "meanReturn",
] as const;

type AcqDay = {
  utcDate: string;
  sourceFilename: string;
  governedRelativePath: string;
  byteSize: number;
  sha256: string;
  shaMatch: boolean;
  zipOk: boolean;
  zipMemberCount: number;
  ingestionStartedUtc: string;
  ingestionFinishedUtc: string;
};

type BlindDay = {
  utcDate: string;
  admitted: boolean;
  exclusionReason: string | null;
  eligibleConfirmations: number;
  zeroSignal: boolean;
  governedHoursIfAdmitted: number;
  confirmations: Array<{
    ticker: string;
    side: string;
    confirmationTimestampMs: number;
    utcDayKey: string;
  }>;
  sha256?: string;
  byteSize?: number;
};

function assertNoOutcomeFields(obj: unknown, path = "$"): void {
  if (obj == null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) assertNoOutcomeFields(obj[i], `${path}[${i}]`);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if ((FORBIDDEN_OUTCOME_KEYS as readonly string[]).includes(k)) {
      throw new Error(`forbidden outcome field ${k} at ${path}`);
    }
    assertNoOutcomeFields(v, `${path}.${k}`);
  }
}

function writeJson(name: string, value: unknown): void {
  assertNoOutcomeFields(value);
  writeFileSync(join(OUT, name), JSON.stringify(value, null, 2) + "\n");
}

function admitLedger(
  acqDays: AcqDay[],
  blindDays: BlindDay[],
  cohortIdentity: string,
): CryptostructDatasetLedger {
  let ledger = buildFrozenCryptostructLedgerForM16Er();
  assertQualityAuditDatesImmutable(ledger);
  const blindByDate = new Map(blindDays.map((d) => [d.utcDate, d]));

  for (const acq of acqDays) {
    const at = acq.ingestionFinishedUtc;
    ledger = transitionCryptostructDayStatus({
      ledger,
      utcDate: acq.utcDate,
      toStatus: "ACQUIRED_UNOPENED",
      atUtc: at,
      reason: "m16-er-immutable-raw-ingest-sha-verified",
      patch: {
        rawZipFilename: acq.sourceFilename,
        rawZipSha256: acq.sha256,
        byteSize: acq.byteSize,
        acquisitionTimestampUtc: at,
        vendorCaptureQuality: "complete-recording-post-2026-08-14",
        notes: `governed:${acq.governedRelativePath}`,
      },
    });

    const blind = blindByDate.get(acq.utcDate);
    if (!blind) {
      throw new Error(`missing blind row for ${acq.utcDate}`);
    }
    if (blind.admitted) {
      ledger = transitionCryptostructDayStatus({
        ledger,
        utcDate: acq.utcDate,
        toStatus: "VALIDATION_RESERVED",
        atUtc: at,
        reason: "m16-er-quality-admitted-validation-reserved",
        patch: {
          hypothesisReservationIdentity: cohortIdentity,
          notes: `governed:${acq.governedRelativePath}; blind-admitted`,
        },
      });
    } else {
      ledger = transitionCryptostructDayStatus({
        ledger,
        utcDate: acq.utcDate,
        toStatus: "EXCLUDED_PREOPEN_QUALITY",
        atUtc: at,
        reason: blind.exclusionReason ?? "objective-quality-exclusion",
        patch: {
          hypothesisReservationIdentity: cohortIdentity,
          notes: `excluded:${blind.exclusionReason}`,
        },
      });
    }
  }

  // Ensure audit dates untouched
  for (const d of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
    if (ledger.days[d]?.status !== "QUALITY_AUDIT_ONLY") {
      throw new Error(`QUALITY_AUDIT_ONLY mutated: ${d}`);
    }
  }
  return ledger;
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const acq = JSON.parse(
    readFileSync(join(WORK, "acquisition-sha.json"), "utf8"),
  ) as { days: AcqDay[]; totalCompressedBytes: number };
  const blind = JSON.parse(
    readFileSync(join(WORK, "blind-incidence.json"), "utf8"),
  ) as {
    days: BlindDay[];
    totalN: number;
    totalG: number;
    totalGovernedHours: number;
    adapterIdentity: string;
    cohortReservationIdentity: string;
  };

  const protocol = buildM16ErScientificProtocol();
  const cohort = buildM16ErFixedCohortPlan();
  const source = buildM16ErSourceContract();
  const dependence = buildM16ErDependencePlan();
  const fee = buildM16ErFeeContract();

  if (blind.adapterIdentity !== M16_ER_ADAPTER_IDENTITY) {
    throw new Error("adapter identity drift in blind artifact");
  }
  if (blind.cohortReservationIdentity !== cohort.cohortReservationIdentity) {
    throw new Error("cohort identity drift in blind artifact");
  }

  const fixedDates = cohort.fixedUtcDates;
  if (acq.days.length !== 34 || blind.days.length !== 34) {
    throw new Error("expected 34 days in acquisition and blind artifacts");
  }
  for (const d of fixedDates) {
    if (!acq.days.some((x) => x.utcDate === d)) {
      throw new Error(`acquisition missing ${d}`);
    }
    if (!blind.days.some((x) => x.utcDate === d)) {
      throw new Error(`blind missing ${d}`);
    }
  }
  for (const d of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
    if (acq.days.some((x) => x.utcDate === d) || blind.days.some((x) => x.utcDate === d)) {
      throw new Error(`audit date leaked into M16-ER ingest: ${d}`);
    }
  }

  const ledger = admitLedger(acq.days, blind.days, cohort.cohortReservationIdentity);

  const N = blind.totalN;
  const G = blind.totalG;
  const H = blind.totalGovernedHours;
  const allAccounted = acq.days.length === 34 && blind.days.length === 34;
  const shaOk = acq.days.every((d) => d.shaMatch && d.zipOk);
  const qualityComplete = blind.days.every(
    (d) => d.admitted || (d.exclusionReason != null && d.exclusionReason.length > 0),
  );
  const nOk = N >= M16_ER_REQUIRED_TRADE_N;
  const gOk = G >= M16_ER_MIN_UTC_DAY_CLUSTERS;
  const identitiesOk =
    protocol.scientificProtocolIdentity
      === "3f4fdf157b3eb6eb775c8e2f4bab4272e23cfa22a7179fed29fb135012207c65"
    && cohort.cohortReservationIdentity
      === "afdacb697216ba385e8d4d9627deec6610d90fafeb52c83b474bace7d9ae15c0"
    && M16_ER_ADAPTER_IDENTITY
      === "3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d"
    && source.sourceContractIdentity
      === "63049f060df62092aee62e07fad1691ee5318424d09ebf97c6953cd9dd7149f4"
    && dependence.dependencePlanIdentity
      === "b81c49e9fe574f900c22099c0071cb4607ea1c059952757ef8c95cbc88928603"
    && fee.feeContractIdentity
      === "2c1059ecc142dd6ca9b82375e03fd84b42f55ce6d6f1435a667111eea2d0548f";

  const mechanicalReady =
    allAccounted
    && shaOk
    && qualityComplete
    && identitiesOk
    && nOk
    && gOk
    && !blind.days.some((d) => d.admitted === false && d.exclusionReason == null);

  const disposition = mechanicalReady
    ? "READY_FOR_HUMAN_OUTCOME_OPEN_APPROVAL"
    : "NOT_READY_UNDERPOWERED_OR_BLOCKED";

  // Gate exercise: supply identities + readiness flags for mechanical check,
  // but DO NOT feed authorization into any economic evaluator.
  const gateProbe = evaluateM16ErOutcomeOpenAuthorization({
    protocolIdentity: protocol.scientificProtocolIdentity,
    cohortReservationIdentity: cohort.cohortReservationIdentity,
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    sourceContractIdentity: source.sourceContractIdentity,
    dependencePlanIdentity: dependence.dependencePlanIdentity,
    feeContractIdentity: fee.feeContractIdentity,
    purchasedZipSha256Verified: shaOk,
    qualityAuditComplete: qualityComplete,
    fixedCohortAdmissionComplete: allAccounted,
    sampleAdequacyMet: nOk && gOk,
    pnlPreviouslyOpened: false,
  });

  const sealedDefault = evaluateM16ErOutcomeOpenAuthorization();

  writeJson("m16-er-acquisition-manifest.json", {
    role: M16_ER_ROLE,
    purchaseExecutedByAgent: false,
    downloadsOriginalsUntouched: true,
    rawStore: "data/external-samples/cryptostruct/m16-er/raw/",
    rawGitignored: true,
    totalCompressedBytes: acq.totalCompressedBytes,
    days: acq.days.map((d) => ({
      utcDate: d.utcDate,
      filename: d.sourceFilename,
      governedRelativePath: d.governedRelativePath,
      byteSize: d.byteSize,
      sha256: d.sha256,
      shaMatch: d.shaMatch,
      zipOk: d.zipOk,
      zipMemberCount: d.zipMemberCount,
      ingestionFinishedUtc: d.ingestionFinishedUtc,
    })),
  });

  writeJson("m16-er-raw-identities.json", {
    algorithm: "sha256",
    days: Object.fromEntries(acq.days.map((d) => [d.utcDate, d.sha256])),
    identityFingerprint: createHash("sha256")
      .update(
        JSON.stringify(
          acq.days.map((d) => ({ utcDate: d.utcDate, sha256: d.sha256 })),
        ),
      )
      .digest("hex"),
  });

  writeJson("m16-er-quality-admission.json", {
    qualityAuditOnlyExcluded: [...CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES],
    days: blind.days.map((d) => ({
      utcDate: d.utcDate,
      admitted: d.admitted,
      exclusionReason: d.exclusionReason,
      zeroSignal: d.zeroSignal,
      governedHoursIfAdmitted: d.governedHoursIfAdmitted,
    })),
    admittedCount: blind.days.filter((d) => d.admitted).length,
    excludedCount: blind.days.filter((d) => !d.admitted).length,
  });

  writeJson("m16-er-blind-incidence.json", {
    label: "M16-ER BLIND INCIDENCE — no economics",
    adapterIdentity: M16_ER_ADAPTER_IDENTITY,
    cohortReservationIdentity: cohort.cohortReservationIdentity,
    requiredN: M16_ER_REQUIRED_TRADE_N,
    requiredG: M16_ER_MIN_UTC_DAY_CLUSTERS,
    totalN: N,
    totalG: G,
    totalGovernedHours: H,
    earlyStoppingUsed: false,
    replacementDatesUsed: false,
    days: blind.days.map((d) => ({
      utcDate: d.utcDate,
      admitted: d.admitted,
      exclusionReason: d.exclusionReason,
      eligibleConfirmations: d.eligibleConfirmations,
      zeroSignal: d.zeroSignal,
      clusterEligible: d.admitted && d.eligibleConfirmations > 0,
      confirmationCount: d.confirmations.length,
      // retain compact confirmation keys only (no economics)
      confirmations: d.confirmations.map((c) => ({
        ticker: c.ticker,
        side: c.side,
        confirmationTimestampMs: c.confirmationTimestampMs,
        utcDayKey: c.utcDayKey,
      })),
    })),
  });

  writeJson("m16-er-dataset-ledger.json", ledger);

  writeJson("m16-er-readiness.json", {
    disposition,
    mechanicalReady,
    requiredN: M16_ER_REQUIRED_TRADE_N,
    requiredG: M16_ER_MIN_UTC_DAY_CLUSTERS,
    totalN: N,
    totalG: G,
    totalGovernedHours: H,
    all34DatesAccounted: allAccounted,
    shaIdentitiesFrozen: shaOk,
    qualityAuditComplete: qualityComplete,
    identitiesExact: identitiesOk,
    hardenedGateMerged: true,
    gateDefaultSealed: sealedDefault.sealed === true && sealedDefault.authorized === false,
    gateProbeWouldAuthorizeIfInvoked: gateProbe.authorized,
    economicEvaluatorInvoked: false,
    humanCheckpointRequired: true,
    note:
      "READY_FOR_HUMAN_OUTCOME_OPEN_APPROVAL does NOT open economics. "
      + "Do not feed gateProbe authorization into the evaluator in this task.",
    blockers: mechanicalReady
      ? []
      : [
          !allAccounted ? "dates-incomplete" : null,
          !shaOk ? "sha-unverified" : null,
          !qualityComplete ? "quality-incomplete" : null,
          !identitiesOk ? "identity-drift" : null,
          !nOk ? `N-short:${N}<${M16_ER_REQUIRED_TRADE_N}` : null,
          !gOk ? `G-short:${G}<${M16_ER_MIN_UTC_DAY_CLUSTERS}` : null,
        ].filter(Boolean),
  });

  const md = `# M16-ER Ingestion + Blind Admission

## Disposition
**${disposition}**

## Blind totals
- N = **${N}** (required ${M16_ER_REQUIRED_TRADE_N})
- G = **${G}** (required ${M16_ER_MIN_UTC_DAY_CLUSTERS})
- H = **${H}** governed hours

## Seal
- Economics unopened
- Evaluator not invoked with real outcomes
- Default gate sealed: ${sealedDefault.sealed}
- Human checkpoint required before any outcome open

## Note
Do NOT open M16-ER economics in this task.
`;
  writeFileSync(join(OUT, "m16-er-ingestion-report.md"), md);

  // sanity: work files exist; raw exists
  if (!existsSync(join(ROOT, "data/external-samples/cryptostruct/m16-er/raw"))) {
    throw new Error("raw store missing");
  }

  console.log(
    JSON.stringify(
      {
        disposition,
        N,
        G,
        H,
        gateDefaultAuthorized: sealedDefault.authorized,
        gateProbeAuthorized: gateProbe.authorized,
        economicEvaluatorInvoked: false,
      },
      null,
      2,
    ),
  );
}

main();
