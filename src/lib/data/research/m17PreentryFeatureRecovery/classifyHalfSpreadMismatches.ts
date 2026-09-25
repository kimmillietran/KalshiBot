/**
 * Offline classifier for PR #131 half-spread mismatches.
 *
 * Class A — definition mismatch: executable NO ask (100 − YES bid) is stable
 * while the retained friction half-spread disagrees with regenerated
 * (YES ask − YES bid) / 2. Ask-side / mid definition differs; bid-implied NO
 * ask does not.
 *
 * Class B — recovery uncertainty: mismatch remains without a stable
 * bid-implied NO ask, or YES bid itself cannot be treated as confirmed.
 * Admission-time BBO reconstruction then needs retained RAW replay.
 */

export type HalfSpreadMismatchRow = {
  utcDayKey: string;
  marketTicker: string;
  entryTimestampMs: number;
  yesBidCents: number | null;
  yesAskCents: number | null;
  noAskCents: number | null;
  halfSpreadCents: number | null;
  retainedEntryHalfSpreadCents: number | null;
  retainedExecutableNoAskCents?: number | null;
  halfSpreadMismatch: {
    retainedHalfSpreadCents: number;
    regeneratedHalfSpreadCents: number;
  } | null;
};

export type HalfSpreadMismatchClass =
  | "class-a-definition"
  | "class-b-recovery-uncertainty";

export type ClassifiedHalfSpreadMismatch = {
  row: HalfSpreadMismatchRow;
  classification: HalfSpreadMismatchClass;
  regeneratedHalfSpreadCents: number | null;
  retainedHalfSpreadCents: number | null;
  regeneratedExecutableNoAskCents: number | null;
  retainedExecutableNoAskCents: number | null;
  executableNoAskStable: boolean;
  reason: string;
};

export type HalfSpreadMismatchClassificationSummary = {
  mismatchRows: number;
  classADefinition: number;
  classBRecoveryUncertainty: number;
  executableNoAskStableAmongClassA: number;
  classBRows: ClassifiedHalfSpreadMismatch[];
};

const EPS = 1e-9;

export function regeneratedHalfSpreadFromYesBbo(
  yesBidCents: number | null | undefined,
  yesAskCents: number | null | undefined,
): number | null {
  if (
    yesBidCents == null
    || yesAskCents == null
    || !Number.isFinite(yesBidCents)
    || !Number.isFinite(yesAskCents)
  ) {
    return null;
  }
  return (yesAskCents - yesBidCents) / 2;
}

export function regeneratedExecutableNoAskCents(
  yesBidCents: number | null | undefined,
): number | null {
  if (yesBidCents == null || !Number.isFinite(yesBidCents)) {
    return null;
  }
  return 100 - yesBidCents;
}

export function classifyHalfSpreadMismatchRow(
  row: HalfSpreadMismatchRow,
): ClassifiedHalfSpreadMismatch | null {
  if (row.halfSpreadMismatch == null) {
    return null;
  }
  const regeneratedHalf = row.halfSpreadCents
    ?? regeneratedHalfSpreadFromYesBbo(row.yesBidCents, row.yesAskCents);
  const regeneratedNoAsk = row.noAskCents
    ?? regeneratedExecutableNoAskCents(row.yesBidCents);
  const retainedNoAsk = row.retainedExecutableNoAskCents ?? null;

  const hasBid = row.yesBidCents != null && Number.isFinite(row.yesBidCents);
  const executableNoAskStable = hasBid && regeneratedNoAsk != null && (
    retainedNoAsk == null
      ? true
      : Math.abs(retainedNoAsk - regeneratedNoAsk) <= EPS
  );

  const halfSpreadDisagrees = Math.abs(
    row.halfSpreadMismatch.retainedHalfSpreadCents
      - row.halfSpreadMismatch.regeneratedHalfSpreadCents,
  ) > EPS;

  const classification: HalfSpreadMismatchClass =
    halfSpreadDisagrees && executableNoAskStable
      ? "class-a-definition"
      : "class-b-recovery-uncertainty";

  return {
    row,
    classification,
    regeneratedHalfSpreadCents: regeneratedHalf,
    retainedHalfSpreadCents: row.halfSpreadMismatch.retainedHalfSpreadCents,
    regeneratedExecutableNoAskCents: regeneratedNoAsk,
    retainedExecutableNoAskCents: retainedNoAsk,
    executableNoAskStable,
    reason: classification === "class-a-definition"
      ? "half-spread-differs-while-executable-no-ask-stable"
      : "admission-bbo-reconstruction-uncertain-or-no-ask-unstable",
  };
}

export function summarizeHalfSpreadMismatchClasses(
  rows: readonly HalfSpreadMismatchRow[],
): HalfSpreadMismatchClassificationSummary {
  const classified = rows
    .map((row) => classifyHalfSpreadMismatchRow(row))
    .filter((row): row is ClassifiedHalfSpreadMismatch => row != null);
  const classA = classified.filter((row) => row.classification === "class-a-definition");
  const classB = classified.filter(
    (row) => row.classification === "class-b-recovery-uncertainty",
  );
  return {
    mismatchRows: classified.length,
    classADefinition: classA.length,
    classBRecoveryUncertainty: classB.length,
    executableNoAskStableAmongClassA: classA.filter((row) => row.executableNoAskStable).length,
    classBRows: classB,
  };
}
