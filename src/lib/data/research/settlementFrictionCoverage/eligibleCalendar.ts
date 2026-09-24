/**
 * Runtime eligible-calendar validation for the 34 SPENT M16-ER days.
 * Recomputes set equality; never trusts hand-authored flags or duplicate arrays.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CRYPTOSTRUCT_RESERVOIR_STATUS_RELATIVE_PATH,
  M16_ER_DAY_CLUSTERS_RELATIVE_PATH,
  SettlementFrictionCoverageError,
} from "./types";

export type EligibleCalendarAuthority = {
  m16ErUtcDays: string[];
  spentValidationUtcDays: string[];
  eligibleUtcDays: string[];
  m16ErDayClustersPath: string;
  reservoirStatusPath: string;
  m16ErDaysContentSha256: string;
  spentDaysContentSha256: string;
  duplicatesInM16Er: string[];
  duplicatesInSpent: string[];
  onlyInM16Er: string[];
  onlyInSpent: string[];
};

function sha256Json(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function assertUtcDayKey(day: string, context: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new SettlementFrictionCoverageError(
      `invalid UTC day key in ${context}: ${day}`,
    );
  }
}

function collectUniqueSorted(
  days: readonly string[],
  context: string,
): { unique: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const day of days) {
    assertUtcDayKey(day, context);
    if (seen.has(day)) {
      duplicates.push(day);
    } else {
      seen.add(day);
    }
  }
  return { unique: [...seen].sort(), duplicates: [...new Set(duplicates)].sort() };
}

export function loadEligibleCalendarAuthority(input: {
  repoRoot: string;
  dayClustersPath?: string;
  reservoirStatusPath?: string;
}): EligibleCalendarAuthority {
  const dayClustersPath =
    input.dayClustersPath
    ?? join(input.repoRoot, M16_ER_DAY_CLUSTERS_RELATIVE_PATH);
  const reservoirStatusPath =
    input.reservoirStatusPath
    ?? join(input.repoRoot, CRYPTOSTRUCT_RESERVOIR_STATUS_RELATIVE_PATH);

  const clusters = JSON.parse(readFileSync(dayClustersPath, "utf8")) as {
    days?: ReadonlyArray<{ utcDayKey?: string }>;
  };
  const reservoir = JSON.parse(readFileSync(reservoirStatusPath, "utf8")) as {
    datesByState?: { SPENT_VALIDATION?: readonly string[] };
  };

  if (!Array.isArray(clusters.days)) {
    throw new SettlementFrictionCoverageError(
      `m16-er-day-clusters missing days[] at ${dayClustersPath}`,
    );
  }
  const m16Raw = clusters.days.map((d, i) => {
    if (typeof d?.utcDayKey !== "string") {
      throw new SettlementFrictionCoverageError(
        `m16-er-day-clusters days[${i}].utcDayKey missing`,
      );
    }
    return d.utcDayKey;
  });
  const spentRaw = reservoir.datesByState?.SPENT_VALIDATION;
  if (!Array.isArray(spentRaw)) {
    throw new SettlementFrictionCoverageError(
      `reservoir SPENT_VALIDATION missing at ${reservoirStatusPath}`,
    );
  }

  const m16 = collectUniqueSorted(m16Raw, "m16-er-day-clusters");
  const spent = collectUniqueSorted([...spentRaw], "SPENT_VALIDATION");

  if (m16.duplicates.length > 0) {
    throw new SettlementFrictionCoverageError(
      `duplicate utcDayKey in m16-er-day-clusters: ${m16.duplicates.join(",")}`,
    );
  }
  if (spent.duplicates.length > 0) {
    throw new SettlementFrictionCoverageError(
      `duplicate SPENT_VALIDATION dates: ${spent.duplicates.join(",")}`,
    );
  }

  const m16Set = new Set(m16.unique);
  const spentSet = new Set(spent.unique);
  const onlyInM16Er = m16.unique.filter((d) => !spentSet.has(d));
  const onlyInSpent = spent.unique.filter((d) => !m16Set.has(d));

  if (onlyInM16Er.length > 0 || onlyInSpent.length > 0) {
    throw new SettlementFrictionCoverageError(
      "eligible calendar mismatch between m16-er-day-clusters and "
        + `SPENT_VALIDATION; onlyInM16Er=[${onlyInM16Er.join(",")}] `
        + `onlyInSpent=[${onlyInSpent.join(",")}]`,
    );
  }

  if (m16.unique.length !== 34) {
    throw new SettlementFrictionCoverageError(
      `expected exactly 34 eligible UTC days; got ${m16.unique.length}`,
    );
  }

  return {
    m16ErUtcDays: m16.unique,
    spentValidationUtcDays: spent.unique,
    eligibleUtcDays: m16.unique,
    m16ErDayClustersPath: dayClustersPath,
    reservoirStatusPath,
    m16ErDaysContentSha256: sha256Json(m16.unique),
    spentDaysContentSha256: sha256Json(spent.unique),
    duplicatesInM16Er: m16.duplicates,
    duplicatesInSpent: spent.duplicates,
    onlyInM16Er,
    onlyInSpent,
  };
}

export function assertDayEligible(
  utcDayKey: string,
  authority: EligibleCalendarAuthority,
): void {
  if (!authority.eligibleUtcDays.includes(utcDayKey)) {
    throw new SettlementFrictionCoverageError(
      `ineligible UTC day ${utcDayKey} (not in authoritative 34 SPENT days)`,
    );
  }
}
