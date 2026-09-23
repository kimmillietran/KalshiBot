/**
 * Verify M16-P / M16-ER metadata claims without opening sealed prospective outcomes.
 * Fail-closed on missing artifacts; never reads economic fields from M16-P captures.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export class M16pSuspensionVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "M16pSuspensionVerifyError";
  }
}

export const M16P_REGISTRY_DIR =
  "data/research-results/m16-validation-collection" as const;

export const M16_ER_PRIMARY_RESULT_PATH =
  "data/research-results/external-kalshi-data-audit/m16-er-primary-economic-result.json" as const;

export type M16pProgressSnapshot = {
  acceptedHours: number;
  acceptedSegments: number;
  eligibleTradeCount: number;
  distinctEligibleUtcDayClusters: number;
  outcomesOpened: false | boolean;
  disposition: string;
  pnlInspected?: boolean;
  stopHitInspected?: boolean;
  targetHitInspected?: boolean;
};

export type M16ErPrimaryClaims = {
  primaryN: number;
  primaryG: number;
  meanGrossPnlCents: number;
  meanFeeAdjustedPnlCents: number;
  hypothesisDecision: string;
  protocolDisposition: string;
  primaryResultContentSha256: string;
};

export type M16pSuspensionVerification = {
  verifiedAtUtc: string;
  priorReportClaimedZeroAccepted: true;
  /** Current registry contradicts the prior "0 accepted" claim when true. */
  registryDiscrepancyFromPriorZeroClaim: boolean;
  progress: M16pProgressSnapshot;
  registryAcceptedCount: number;
  sealedQuarantineIntact: boolean;
  outcomesOpened: false;
  m16Er: M16ErPrimaryClaims;
  m16ErClaimsMatchPriorReport: boolean;
  schedulerEnabled: boolean;
  notes: string[];
};

function readJson<T>(path: string): T {
  if (!existsSync(path)) {
    throw new M16pSuspensionVerifyError(`missing artifact: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function approxEqual(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

/**
 * Inspect permitted metadata only. Does not open sealed M16-P economics.
 */
export function verifyM16pSuspensionClaims(input?: {
  repoRoot?: string;
  nowIso?: string;
}): M16pSuspensionVerification {
  const root = input?.repoRoot ?? process.cwd();
  const progressPath = join(root, M16P_REGISTRY_DIR, "progress.json");
  const registryPath = join(root, M16P_REGISTRY_DIR, "registry.json");
  const schedulerPath = join(
    root,
    M16P_REGISTRY_DIR,
    "scheduler",
    "state.json",
  );
  const erPath = join(root, M16_ER_PRIMARY_RESULT_PATH);

  const progress = readJson<M16pProgressSnapshot>(progressPath);
  const registry = readJson<{
    accepted: ReadonlyArray<{
      outcomesOpened?: boolean;
      pnlInspected?: boolean;
      blindIncidence?: {
        outcomesOpened?: boolean;
        quarantine?: {
          pnlOpened?: boolean;
          settlementDirectionInspected?: boolean;
          stopHitInspected?: boolean;
          targetHitInspected?: boolean;
        };
      };
    }>;
  }>(registryPath);
  const scheduler = readJson<{ enabled: boolean }>(schedulerPath);
  const er = readJson<M16ErPrimaryClaims & Record<string, unknown>>(erPath);

  const notes: string[] = [];

  if (progress.outcomesOpened !== false) {
    throw new M16pSuspensionVerifyError(
      "progress.outcomesOpened must remain false — sealed outcomes must not be opened",
    );
  }

  const accepted = registry.accepted ?? [];
  let sealedQuarantineIntact = true;
  for (const row of accepted) {
    if (row.outcomesOpened === true || row.pnlInspected === true) {
      sealedQuarantineIntact = false;
    }
    const q = row.blindIncidence?.quarantine;
    if (
      q
      && (q.pnlOpened === true
        || q.settlementDirectionInspected === true
        || q.stopHitInspected === true
        || q.targetHitInspected === true)
    ) {
      sealedQuarantineIntact = false;
    }
    if (row.blindIncidence?.outcomesOpened === true) {
      sealedQuarantineIntact = false;
    }
  }

  if (!sealedQuarantineIntact) {
    notes.push(
      "Sealed quarantine flags indicate economics may have been inspected — preserve material; do not open further to resolve.",
    );
  }

  const registryDiscrepancyFromPriorZeroClaim =
    accepted.length > 0
    || progress.acceptedHours > 0
    || progress.eligibleTradeCount > 0
    || (progress.acceptedSegments ?? 0) > 0
    || progress.distinctEligibleUtcDayClusters > 0;

  if (registryDiscrepancyFromPriorZeroClaim) {
    notes.push(
      "Prior reassessment claimed 0 accepted segments/trades/days/hours; current registry/progress show non-zero accepted collection. Preserving sealed material; not rewriting registry.",
    );
  }

  const m16ErClaimsMatchPriorReport =
    er.primaryN === 461
    && er.primaryG === 34
    && approxEqual(er.meanGrossPnlCents, -0.427, 0.001)
    && approxEqual(er.meanFeeAdjustedPnlCents, -4.427, 0.001);

  if (!m16ErClaimsMatchPriorReport) {
    notes.push(
      "M16-ER primary numeric claims diverge from prior report (−0.427 / −4.427 ¢, N=461, G=34).",
    );
  }

  // Content integrity of the primary result file (not a recompute).
  const raw = readFileSync(erPath);
  const sha = createHash("sha256").update(raw).digest("hex");
  if (
    typeof er.primaryResultContentSha256 === "string"
    && er.primaryResultContentSha256.length === 64
    && sha !== er.primaryResultContentSha256
  ) {
    // Primary result JSON embeds its own content hash of a prior canonicalization;
    // do not fail closed on whole-file hash — only note if operator re-hashes.
    notes.push(
      "Whole-file SHA-256 differs from embedded primaryResultContentSha256 (expected for self-describing result objects).",
    );
  }

  return {
    verifiedAtUtc: input?.nowIso ?? new Date().toISOString(),
    priorReportClaimedZeroAccepted: true,
    registryDiscrepancyFromPriorZeroClaim,
    progress: {
      acceptedHours: progress.acceptedHours,
      acceptedSegments: progress.acceptedSegments ?? accepted.length,
      eligibleTradeCount: progress.eligibleTradeCount,
      distinctEligibleUtcDayClusters: progress.distinctEligibleUtcDayClusters,
      outcomesOpened: false,
      disposition: progress.disposition,
      pnlInspected: progress.pnlInspected,
      stopHitInspected: progress.stopHitInspected,
      targetHitInspected: progress.targetHitInspected,
    },
    registryAcceptedCount: accepted.length,
    sealedQuarantineIntact,
    outcomesOpened: false,
    m16Er: {
      primaryN: er.primaryN,
      primaryG: er.primaryG,
      meanGrossPnlCents: er.meanGrossPnlCents,
      meanFeeAdjustedPnlCents: er.meanFeeAdjustedPnlCents,
      hypothesisDecision: er.hypothesisDecision,
      protocolDisposition: er.protocolDisposition,
      primaryResultContentSha256: er.primaryResultContentSha256,
    },
    m16ErClaimsMatchPriorReport,
    schedulerEnabled: scheduler.enabled === true,
    notes,
  };
}
