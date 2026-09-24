import {
  closeSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { KalshiBrtiAccessProbeError } from "./types";

export const V0_CAMPAIGN_ID = "kalshi-kxbtc15m-brti-access-probe-v0" as const;
export const V1_CAMPAIGN_ID = "kalshi-kxbtc15m-brti-access-probe-v1" as const;

export type CampaignHttpPurpose =
  | "latest-cfb-values"
  | "historical-markets"
  | "rest-markets"
  | "historical-brti"
  | "official-settlement-metadata"
  | "live-market-discovery";

export type CampaignLedgerEntry = {
  id: string;
  purpose: CampaignHttpPurpose;
  reservedAtUtc: string;
  completedAtUtc: string | null;
  status: "reserved" | "completed" | "failed";
  httpStatus: number | null;
  category: string | null;
  urlHash: string | null;
};

export type CampaignLedger = {
  campaignId: string;
  limit: number;
  consumed: number;
  sealed: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
  note: string | null;
  entries: CampaignLedgerEntry[];
};

export type CampaignBudgetIo = {
  readFile: (path: string) => string | null;
  writeFile: (path: string, contents: string) => void;
  withExclusiveLock: <T>(lockPath: string, fn: () => T) => T;
  mkdir: (path: string) => void;
  nowIso?: () => string;
};

export type HttpReservation = {
  id: string;
  campaignId: string;
  purpose: CampaignHttpPurpose;
  consumed: number;
  limit: number;
};

const FORBIDDEN_LEDGER_KEYS = /BEGIN PRIVATE KEY|KALSHI-ACCESS|authorization/i;

export function createSealedV0Ledger(nowIso: string): CampaignLedger {
  return {
    campaignId: V0_CAMPAIGN_ID,
    limit: 10,
    consumed: 13,
    sealed: true,
    createdAtUtc: nowIso,
    updatedAtUtc: nowIso,
    note: "Original campaign recorded 13/10 HTTP attempts. Overrun is preserved; no further requests.",
    entries: [],
  };
}

export function parseCampaignLedger(raw: string): CampaignLedger {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new KalshiBrtiAccessProbeError("campaign-budget-corrupt");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new KalshiBrtiAccessProbeError("campaign-budget-corrupt");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.campaignId !== "string" || record.campaignId.trim() === "") {
    throw new KalshiBrtiAccessProbeError("campaign-budget-corrupt");
  }
  if (!Number.isInteger(record.limit) || Number(record.limit) < 0) {
    throw new KalshiBrtiAccessProbeError("campaign-budget-corrupt");
  }
  if (!Number.isInteger(record.consumed) || Number(record.consumed) < 0) {
    throw new KalshiBrtiAccessProbeError("campaign-budget-corrupt");
  }
  if (!Array.isArray(record.entries)) {
    throw new KalshiBrtiAccessProbeError("campaign-budget-corrupt");
  }
  return {
    campaignId: record.campaignId,
    limit: Number(record.limit),
    consumed: Number(record.consumed),
    sealed: record.sealed === true,
    createdAtUtc: typeof record.createdAtUtc === "string" ? record.createdAtUtc : "",
    updatedAtUtc: typeof record.updatedAtUtc === "string" ? record.updatedAtUtc : "",
    note: typeof record.note === "string" ? record.note : null,
    entries: record.entries as CampaignLedgerEntry[],
  };
}

function assertConsistent(ledger: CampaignLedger, campaignId: string, limit: number): void {
  if (ledger.campaignId !== campaignId) {
    throw new KalshiBrtiAccessProbeError(
      `campaign-budget-mismatch: ledger=${ledger.campaignId} requested=${campaignId}`,
    );
  }
  if (ledger.limit !== limit) {
    throw new KalshiBrtiAccessProbeError(
      `campaign-budget-mismatch: limit ledger=${ledger.limit} requested=${limit}`,
    );
  }
}

function persistLedger(io: CampaignBudgetIo, path: string, ledger: CampaignLedger): void {
  const serialized = `${JSON.stringify(ledger, null, 2)}\n`;
  if (FORBIDDEN_LEDGER_KEYS.test(serialized)) {
    throw new KalshiBrtiAccessProbeError("campaign-budget-refuses-secrets");
  }
  io.writeFile(path, serialized);
}

export function loadOrCreateCampaignLedger(input: {
  ledgerPath: string;
  campaignId: string;
  limit: number;
  io: CampaignBudgetIo;
  requireExisting?: boolean;
}): CampaignLedger {
  const raw = input.io.readFile(input.ledgerPath);
  if (raw == null) {
    if (input.requireExisting) {
      throw new KalshiBrtiAccessProbeError("campaign-budget-missing");
    }
    const now = (input.io.nowIso ?? (() => new Date().toISOString()))();
    const created: CampaignLedger = {
      campaignId: input.campaignId,
      limit: input.limit,
      consumed: 0,
      sealed: false,
      createdAtUtc: now,
      updatedAtUtc: now,
      note: null,
      entries: [],
    };
    input.io.mkdir(dirname(input.ledgerPath));
    persistLedger(input.io, input.ledgerPath, created);
    return created;
  }
  const ledger = parseCampaignLedger(raw);
  assertConsistent(ledger, input.campaignId, input.limit);
  return ledger;
}

export function reserveHttpAttempt(input: {
  ledgerPath: string;
  lockPath: string;
  campaignId: string;
  limit: number;
  purpose: CampaignHttpPurpose;
  urlHash?: string | null;
  io: CampaignBudgetIo;
}): HttpReservation {
  return input.io.withExclusiveLock(input.lockPath, () => {
    const raw = input.io.readFile(input.ledgerPath);
    if (raw == null) {
      throw new KalshiBrtiAccessProbeError("campaign-budget-missing");
    }
    const ledger = parseCampaignLedger(raw);
    assertConsistent(ledger, input.campaignId, input.limit);
    if (ledger.sealed || ledger.consumed >= ledger.limit) {
      throw new KalshiBrtiAccessProbeError(
        `campaign-budget-exhausted: ${ledger.consumed}/${ledger.limit}`,
      );
    }
    const now = (input.io.nowIso ?? (() => new Date().toISOString()))();
    const id = `${ledger.consumed + 1}:${input.purpose}`;
    ledger.consumed += 1;
    ledger.updatedAtUtc = now;
    ledger.entries.push({
      id,
      purpose: input.purpose,
      reservedAtUtc: now,
      completedAtUtc: null,
      status: "reserved",
      httpStatus: null,
      category: null,
      urlHash: input.urlHash ?? null,
    });
    persistLedger(input.io, input.ledgerPath, ledger);
    return {
      id,
      campaignId: ledger.campaignId,
      purpose: input.purpose,
      consumed: ledger.consumed,
      limit: ledger.limit,
    };
  });
}

export function completeHttpAttempt(input: {
  ledgerPath: string;
  lockPath: string;
  reservationId: string;
  httpStatus: number | null;
  category: string | null;
  failed?: boolean;
  io: CampaignBudgetIo;
}): void {
  input.io.withExclusiveLock(input.lockPath, () => {
    const raw = input.io.readFile(input.ledgerPath);
    if (raw == null) {
      throw new KalshiBrtiAccessProbeError("campaign-budget-missing");
    }
    const ledger = parseCampaignLedger(raw);
    const entry = ledger.entries.find((item) => item.id === input.reservationId);
    if (!entry) {
      throw new KalshiBrtiAccessProbeError("campaign-budget-reservation-missing");
    }
    entry.completedAtUtc = (input.io.nowIso ?? (() => new Date().toISOString()))();
    entry.status = input.failed ? "failed" : "completed";
    entry.httpStatus = input.httpStatus;
    entry.category = input.category;
    ledger.updatedAtUtc = entry.completedAtUtc;
    persistLedger(input.io, input.ledgerPath, ledger);
  });
}

export function createFilesystemCampaignBudgetIo(): CampaignBudgetIo {
  return {
    readFile: (path) => {
      if (!existsSync(path)) {
        return null;
      }
      return readFileSync(path, "utf8");
    },
    writeFile: (path, contents) => {
      const temp = `${path}.${process.pid}.tmp`;
      writeFileSync(temp, contents, "utf8");
      renameSync(temp, path);
    },
    mkdir: (path) => {
      mkdirSync(path, { recursive: true });
    },
    withExclusiveLock: (lockPath, fn) => {
      mkdirSync(dirname(lockPath), { recursive: true });
      let fd: number | null = null;
      const deadline = Date.now() + 5_000;
      while (fd == null) {
        try {
          fd = openSync(lockPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY);
        } catch (error) {
          if (Date.now() >= deadline) {
            throw new KalshiBrtiAccessProbeError(
              `campaign-budget-lock-timeout: ${error instanceof Error ? error.message : "locked"}`,
            );
          }
          const spinUntil = Date.now() + 10;
          while (Date.now() < spinUntil) {
            // exclusive lock retry; keep this short so tests stay hermetic
          }
        }
      }
      try {
        writeFileSync(fd, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`);
        return fn();
      } finally {
        closeSync(fd);
        try {
          unlinkSync(lockPath);
        } catch {
          // stale lock is visible; next acquire will time out rather than overspend
        }
      }
    },
  };
}

export function campaignLedgerPath(campaignDir: string): string {
  return join(campaignDir, "http-budget-ledger.json");
}

export function campaignLockPath(campaignDir: string): string {
  return join(campaignDir, "http-budget-ledger.lock");
}
