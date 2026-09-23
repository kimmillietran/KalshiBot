/**
 * CryptoStruct KXBTC15M series-day dataset governance ledger.
 * Append-only status transitions; no mutable `latest` authority.
 * No economic outcomes.
 */

export const CRYPTOSTRUCT_PROVIDER = "CryptoStruct" as const;
export const CRYPTOSTRUCT_SERIES = "KXBTC15M" as const;

export const CRYPTOSTRUCT_DAY_STATUSES = [
  "UNACQUIRED",
  "ACQUIRED_UNOPENED",
  "QUALITY_AUDIT_ONLY",
  "EXPLORATORY_TRAIN",
  "DESIGN",
  "VALIDATION_RESERVED",
  "HOLDOUT_RESERVED",
  "OPENED_VALIDATION",
  "OPENED_HOLDOUT",
  "EXCLUDED_PREOPEN_QUALITY",
] as const;

export type CryptostructDayStatus = (typeof CRYPTOSTRUCT_DAY_STATUSES)[number];

export type CryptostructRawDayIdentity = {
  provider: typeof CRYPTOSTRUCT_PROVIDER;
  series: typeof CRYPTOSTRUCT_SERIES;
  utcDate: string; // YYYY-MM-DD
  rawZipFilename: string | null;
  rawZipSha256: string | null;
  byteSize: number | null;
  acquisitionTimestampUtc: string | null;
  vendorCaptureQuality: string | null;
  status: CryptostructDayStatus;
  hypothesisReservationIdentity: string | null;
  openedTimestampUtc: string | null;
  notes: string | null;
};

export type CryptostructLedgerTransition = {
  utcDate: string;
  fromStatus: CryptostructDayStatus | null;
  toStatus: CryptostructDayStatus;
  atUtc: string;
  reason: string;
  actor: string;
};

export type CryptostructDatasetLedger = {
  ledgerVersion: "cryptostruct-kxbtc15m-dataset-ledger-v1";
  provider: typeof CRYPTOSTRUCT_PROVIDER;
  series: typeof CRYPTOSTRUCT_SERIES;
  days: Record<string, CryptostructRawDayIdentity>;
  transitions: readonly CryptostructLedgerTransition[];
};

/** Permanently burned quality-audit dates — never untouched validation/HOLDOUT. */
export const CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES = [
  "2026-09-08",
  "2026-09-09",
  "2026-09-14",
  "2026-09-18",
  "2026-09-20",
] as const;

export const CRYPTOSTRUCT_QUALITY_AUDIT_ZIP_SHA256 = {
  "2026-09-08":
    "91d890acc77db122b4dbaf5dbf1cae4c8151506dfe52ae37639235c88001e27d",
  "2026-09-09":
    "f468b653c740a8c55058e8558cfceb61f1d4ffad5be3aff634fddd21d31b1e91",
  "2026-09-14":
    "fb65ac61071b2ec0a757701634a411e03fe7040ea939438a97afd62117d09d54",
  "2026-09-18":
    "4c713ef0d33dd892ddc9de0eb2a37372fd91990af67380b91cbb53f1ad0742dc",
  "2026-09-20":
    "52836856281fbc78e8c9593fbc0a35e5eb166792746924a28becde6c97baf2e4",
} as const;

export const CRYPTOSTRUCT_QUALITY_AUDIT_BYTE_SIZE = {
  "2026-09-08": 1190648632,
  "2026-09-09": 1197691318,
  "2026-09-14": 1350578112,
  "2026-09-18": 1526744808,
  "2026-09-20": 1172418621,
} as const;

export class CryptostructLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptostructLedgerError";
  }
}

const FORBIDDEN_ROLE_MUTATIONS: ReadonlyArray<readonly [CryptostructDayStatus, CryptostructDayStatus]> = [
  ["QUALITY_AUDIT_ONLY", "VALIDATION_RESERVED"],
  ["QUALITY_AUDIT_ONLY", "HOLDOUT_RESERVED"],
  ["QUALITY_AUDIT_ONLY", "ACQUIRED_UNOPENED"],
  ["QUALITY_AUDIT_ONLY", "OPENED_VALIDATION"],
  ["QUALITY_AUDIT_ONLY", "OPENED_HOLDOUT"],
  ["OPENED_VALIDATION", "VALIDATION_RESERVED"],
  ["OPENED_HOLDOUT", "HOLDOUT_RESERVED"],
  ["OPENED_VALIDATION", "ACQUIRED_UNOPENED"],
  ["OPENED_HOLDOUT", "ACQUIRED_UNOPENED"],
  ["EXCLUDED_PREOPEN_QUALITY", "VALIDATION_RESERVED"],
  ["EXCLUDED_PREOPEN_QUALITY", "HOLDOUT_RESERVED"],
];

const ALLOWED: ReadonlyMap<CryptostructDayStatus, ReadonlySet<CryptostructDayStatus>> = new Map([
  ["UNACQUIRED", new Set(["ACQUIRED_UNOPENED", "EXCLUDED_PREOPEN_QUALITY", "QUALITY_AUDIT_ONLY"])],
  [
    "ACQUIRED_UNOPENED",
    new Set([
      "VALIDATION_RESERVED",
      "HOLDOUT_RESERVED",
      "EXPLORATORY_TRAIN",
      "DESIGN",
      "QUALITY_AUDIT_ONLY",
      "EXCLUDED_PREOPEN_QUALITY",
    ]),
  ],
  ["QUALITY_AUDIT_ONLY", new Set()], // terminal for role purposes
  ["EXPLORATORY_TRAIN", new Set(["EXCLUDED_PREOPEN_QUALITY"])],
  ["DESIGN", new Set(["EXCLUDED_PREOPEN_QUALITY"])],
  ["VALIDATION_RESERVED", new Set(["OPENED_VALIDATION", "EXCLUDED_PREOPEN_QUALITY"])],
  ["HOLDOUT_RESERVED", new Set(["OPENED_HOLDOUT", "EXCLUDED_PREOPEN_QUALITY"])],
  ["OPENED_VALIDATION", new Set()],
  ["OPENED_HOLDOUT", new Set()],
  ["EXCLUDED_PREOPEN_QUALITY", new Set()],
]);

export function assertUtcDate(utcDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(utcDate)) {
    throw new CryptostructLedgerError(`invalid utcDate ${utcDate}`);
  }
}

export function createEmptyCryptostructDatasetLedger(): CryptostructDatasetLedger {
  return {
    ledgerVersion: "cryptostruct-kxbtc15m-dataset-ledger-v1",
    provider: CRYPTOSTRUCT_PROVIDER,
    series: CRYPTOSTRUCT_SERIES,
    days: {},
    transitions: [],
  };
}

export function rawZipFilenameForUtcDate(utcDate: string): string {
  assertUtcDate(utcDate);
  return `kalshi-btc-15m_${utcDate}.zip`;
}

export function registerUnacquiredDay(
  ledger: CryptostructDatasetLedger,
  utcDate: string,
  notes?: string,
): CryptostructDatasetLedger {
  assertUtcDate(utcDate);
  if (ledger.days[utcDate]) {
    throw new CryptostructLedgerError(`day ${utcDate} already registered`);
  }
  const day: CryptostructRawDayIdentity = {
    provider: CRYPTOSTRUCT_PROVIDER,
    series: CRYPTOSTRUCT_SERIES,
    utcDate,
    rawZipFilename: rawZipFilenameForUtcDate(utcDate),
    rawZipSha256: null,
    byteSize: null,
    acquisitionTimestampUtc: null,
    vendorCaptureQuality: null,
    status: "UNACQUIRED",
    hypothesisReservationIdentity: null,
    openedTimestampUtc: null,
    notes: notes ?? null,
  };
  return {
    ...ledger,
    days: { ...ledger.days, [utcDate]: day },
    transitions: [
      ...ledger.transitions,
      {
        utcDate,
        fromStatus: null,
        toStatus: "UNACQUIRED",
        atUtc: "1970-01-01T00:00:00.000Z",
        reason: "catalog-register",
        actor: "cryptostruct-dataset-governance",
      },
    ],
  };
}

export function transitionCryptostructDayStatus(input: {
  ledger: CryptostructDatasetLedger;
  utcDate: string;
  toStatus: CryptostructDayStatus;
  atUtc: string;
  reason: string;
  actor?: string;
  patch?: Partial<
    Pick<
      CryptostructRawDayIdentity,
      | "rawZipSha256"
      | "byteSize"
      | "acquisitionTimestampUtc"
      | "vendorCaptureQuality"
      | "hypothesisReservationIdentity"
      | "openedTimestampUtc"
      | "notes"
      | "rawZipFilename"
    >
  >;
}): CryptostructDatasetLedger {
  const { ledger, utcDate, toStatus, atUtc, reason } = input;
  assertUtcDate(utcDate);
  const existing = ledger.days[utcDate];
  if (!existing) {
    throw new CryptostructLedgerError(`day ${utcDate} not in ledger`);
  }
  const from = existing.status;
  for (const [a, b] of FORBIDDEN_ROLE_MUTATIONS) {
    if (from === a && toStatus === b) {
      throw new CryptostructLedgerError(
        `forbidden transition ${from} → ${toStatus} for ${utcDate}`,
      );
    }
  }
  if (from === "QUALITY_AUDIT_ONLY" && toStatus !== "QUALITY_AUDIT_ONLY") {
    throw new CryptostructLedgerError(
      `QUALITY_AUDIT_ONLY is terminal; cannot mutate ${utcDate} to ${toStatus}`,
    );
  }
  const allowed = ALLOWED.get(from);
  if (!allowed || !allowed.has(toStatus)) {
    throw new CryptostructLedgerError(
      `disallowed transition ${from} → ${toStatus} for ${utcDate}`,
    );
  }
  const nextDay: CryptostructRawDayIdentity = {
    ...existing,
    ...input.patch,
    status: toStatus,
  };
  return {
    ...ledger,
    days: { ...ledger.days, [utcDate]: nextDay },
    transitions: [
      ...ledger.transitions,
      {
        utcDate,
        fromStatus: from,
        toStatus,
        atUtc,
        reason,
        actor: input.actor ?? "cryptostruct-dataset-governance",
      },
    ],
  };
}

/** Seed the five burned QUALITY_AUDIT_ONLY dates with immutable hashes. */
export function seedQualityAuditOnlyDays(
  ledger: CryptostructDatasetLedger,
  acquisitionTimestampUtc: string,
): CryptostructDatasetLedger {
  let next = ledger;
  for (const utcDate of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
    if (!next.days[utcDate]) {
      next = registerUnacquiredDay(
        next,
        utcDate,
        "QUALITY_AUDIT_ONLY burned overlap fidelity / source-equivalence day",
      );
    }
    next = transitionCryptostructDayStatus({
      ledger: next,
      utcDate,
      toStatus: "QUALITY_AUDIT_ONLY",
      atUtc: acquisitionTimestampUtc,
      reason: "burned-as-quality-audit-only-never-untouched-validation",
      patch: {
        rawZipFilename: rawZipFilenameForUtcDate(utcDate),
        rawZipSha256: CRYPTOSTRUCT_QUALITY_AUDIT_ZIP_SHA256[utcDate],
        byteSize: CRYPTOSTRUCT_QUALITY_AUDIT_BYTE_SIZE[utcDate],
        acquisitionTimestampUtc,
        vendorCaptureQuality: "complete-recording-post-2026-08-14",
        notes:
          "Permanently QUALITY_AUDIT_ONLY; cannot become M16-ER VALIDATION/HOLDOUT",
      },
    });
  }
  return next;
}

export function assertQualityAuditDatesImmutable(
  ledger: CryptostructDatasetLedger,
): void {
  for (const utcDate of CRYPTOSTRUCT_QUALITY_AUDIT_ONLY_DATES) {
    const day = ledger.days[utcDate];
    if (!day) {
      throw new CryptostructLedgerError(
        `missing QUALITY_AUDIT_ONLY registration for ${utcDate}`,
      );
    }
    if (day.status !== "QUALITY_AUDIT_ONLY") {
      throw new CryptostructLedgerError(
        `${utcDate} status=${day.status}; required QUALITY_AUDIT_ONLY`,
      );
    }
  }
}
