import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  campaignLedgerPath,
  createFilesystemCampaignBudgetIo,
  loadOrCreateCampaignLedger,
  type CampaignBudgetIo,
} from "@/lib/data/research/kalshiBrtiAccessProbe/campaignBudget";

import { executeLiveOneClose, type LiveOneCloseDeps, type LiveOneCloseResult } from "./executeLiveOneClose";
import { freezeOneClosePlan, classifyMissedSlot } from "./freezeOneClose";
import {
  assertRetentionReady,
  createFilesystemRetentionIo,
  verifyRetentionReadiness,
  type RetentionIo,
  type RetentionReadiness,
} from "./retentionReadiness";
import {
  DEFAULT_ONE_CLOSE_OUT_DIR,
  DEFAULT_ONE_CLOSE_RAW_DIR,
  ONE_CLOSE_CAMPAIGN_ID,
  ONE_CLOSE_MAX_HTTP,
  ONE_CLOSE_STUDY_ID,
  QUARTER_HOUR_MEMBERSHIP,
  TRAILING_MEMBERSHIP,
  OneCloseFidelityError,
  type CaptureStatus,
  type OfficialStatus,
  type OneClosePlan,
  type RetentionMode,
  type RetentionStatus,
} from "./types";

export type OneCloseArgv = {
  authorizeLive: boolean;
  skipLive: boolean;
  closeMs: number | null;
  campaignId: string;
  outDir: string;
  rawDir: string;
  maxHttp: number;
  retentionMode: RetentionMode;
};

export type OneCloseIo = {
  writeFile: (path: string, contents: string) => void;
  readFile: (path: string) => string | null;
  mkdir: (path: string) => void;
  exists: (path: string) => boolean;
  nowMs: () => number;
  codeSha?: () => string;
};

export function createFilesystemOneCloseIo(): OneCloseIo {
  return {
    writeFile: (path, contents) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    },
    readFile: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
    mkdir: (path) => mkdirSync(path, { recursive: true }),
    exists: existsSync,
    nowMs: () => Date.now(),
  };
}

export function parseOneCloseArgv(argv: string[]): OneCloseArgv {
  const read = (flag: string): string | null => {
    const idx = argv.indexOf(flag);
    if (idx < 0) return null;
    return argv[idx + 1] ?? null;
  };
  const closeIso = read("--close-utc");
  let closeMs: number | null = null;
  if (closeIso) {
    const parsed = Date.parse(closeIso);
    if (!Number.isFinite(parsed)) {
      throw new OneCloseFidelityError(`invalid --close-utc: ${closeIso}`);
    }
    closeMs = parsed;
  }
  const maxHttpRaw = read("--max-http");
  const modeRaw = read("--retention-mode");
  const retentionMode: RetentionMode = modeRaw === "independent-archive"
    ? "independent-archive"
    : "local-persistent-only";
  return {
    authorizeLive: argv.includes("--authorize-live"),
    skipLive: argv.includes("--skip-live") || !argv.includes("--authorize-live"),
    closeMs,
    campaignId: read("--campaign-id") ?? ONE_CLOSE_CAMPAIGN_ID,
    outDir: read("--out-dir") ?? DEFAULT_ONE_CLOSE_OUT_DIR,
    rawDir: read("--raw-dir") ?? DEFAULT_ONE_CLOSE_RAW_DIR,
    maxHttp: maxHttpRaw ? Number(maxHttpRaw) : ONE_CLOSE_MAX_HTTP,
    retentionMode,
  };
}

export type OneCloseRunResult = {
  studyId: string;
  campaignId: string;
  plan: OneClosePlan;
  disposition: {
    captured: boolean;
    capture: CaptureStatus;
    official: OfficialStatus;
    retention: RetentionStatus;
    reason: string;
    rolledToLaterClose: false;
  };
  retentionReadiness: RetentionReadiness;
  httpBudget: { campaignId: string; consumed: number; limit: number };
  comparisonsFrozenBeforeCapture: {
    trailingMembership: typeof TRAILING_MEMBERSHIP;
    quarterHourMembership: typeof QUARTER_HOUR_MEMBERSHIP;
    noOffsetSearch: true;
    noOfficialFieldSelection: true;
  };
  liveExecution: "refused" | "not-attempted-skip-live" | "executed" | "skipped-past-readiness-cutoff";
  live: LiveOneCloseResult | null;
};

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function runOneCloseSettlementFidelity(input: {
  repoRoot: string;
  argv: OneCloseArgv;
  io?: OneCloseIo;
  retentionIo?: RetentionIo;
  campaignIo?: CampaignBudgetIo;
  liveDeps?: LiveOneCloseDeps;
}): Promise<OneCloseRunResult> {
  const io = input.io ?? createFilesystemOneCloseIo();
  const retentionIo = input.retentionIo ?? createFilesystemRetentionIo();
  const campaignIo = input.campaignIo ?? createFilesystemCampaignBudgetIo();
  const nowMs = io.nowMs();
  const outAbs = join(input.repoRoot, input.argv.outDir);
  const campaignDir = outAbs;
  io.mkdir(outAbs);

  if (input.argv.maxHttp > ONE_CLOSE_MAX_HTTP) {
    throw new OneCloseFidelityError(
      `max-http-exceeds-task-ceiling: ${input.argv.maxHttp}>${ONE_CLOSE_MAX_HTTP}`,
    );
  }

  const planPath = join(outAbs, "one-close-plan.json");
  const existingPlanRaw = io.readFile(planPath);
  let plan: OneClosePlan;
  if (existingPlanRaw) {
    const prior = JSON.parse(existingPlanRaw) as Partial<OneClosePlan> & {
      closeMs: number;
      closeUtc: string;
      campaignId: string;
    };
    if (input.argv.closeMs != null && prior.closeMs !== input.argv.closeMs) {
      throw new OneCloseFidelityError(
        `frozen-close-mismatch: plan=${prior.closeUtc} requested=${new Date(input.argv.closeMs).toISOString()}; substitution forbidden`,
      );
    }
    const retentionMode: RetentionMode = prior.retentionMode === "independent-archive"
      || prior.retentionMode === "local-persistent-only"
      ? prior.retentionMode
      : (input.argv.retentionMode ?? "local-persistent-only");
    plan = {
      ...(prior as OneClosePlan),
      retentionMode,
      independentBackup: retentionMode === "independent-archive",
      substitutionForbidden: true,
      includeOrderbook: false,
      indexSymbol: "BRTI",
    };
  } else {
    plan = freezeOneClosePlan({
      nowMs,
      closeMs: input.argv.closeMs ?? undefined,
      campaignId: input.argv.campaignId,
      retentionMode: input.argv.retentionMode,
      frozenAtUtc: new Date(nowMs).toISOString(),
    });
  }
  io.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);

  loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(campaignDir),
    campaignId: plan.campaignId,
    limit: input.argv.maxHttp,
    io: campaignIo,
  });

  const retentionReadiness = verifyRetentionReadiness({
    io: retentionIo,
    mode: plan.retentionMode,
    nowIso: new Date(nowMs).toISOString(),
    campaignId: plan.campaignId,
  });

  const missed = classifyMissedSlot(plan, nowMs);
  let capture: CaptureStatus = "not-attempted";
  let official: OfficialStatus = "not-attempted";
  let retention: RetentionStatus = retentionReadiness.ready ? "pending" : "blocked-prerequisite";
  let reason = "awaiting-authorization-and-readiness";
  let liveExecution: OneCloseRunResult["liveExecution"] = "not-attempted-skip-live";
  let captured = false;
  let live: LiveOneCloseResult | null = null;

  if (!retentionReadiness.ready) {
    capture = "refused-readiness";
    retention = "blocked-prerequisite";
    reason = retentionReadiness.blocker ?? "retention-not-ready";
    liveExecution = "refused";
  } else if (missed === "missed-slot") {
    capture = "missed-slot";
    reason = "now-at-or-after-frozen-close; substitution-forbidden";
    liveExecution = "refused";
  } else if (!input.argv.authorizeLive || input.argv.skipLive) {
    reason = "live-not-authorized: pass --authorize-live only when retention-ready and gates satisfied";
    liveExecution = "not-attempted-skip-live";
  } else if (nowMs > plan.readinessCutoffMs) {
    // Must start before readiness cutoff (−100s). Process then waits until connect (−75s).
    capture = "missed-slot";
    reason = "skipped-past-readiness-cutoff; substitution-forbidden";
    liveExecution = "skipped-past-readiness-cutoff";
  } else {
    // Before readiness cutoff with authorize-live: execute waits internally until connect.
    assertRetentionReady(retentionReadiness);
    const persistentRawDir = join(
      retentionReadiness.primaryRoot!,
      plan.campaignId,
      plan.closeUtc.replace(/[:.]/g, "-"),
      "raw",
    );
    live = await executeLiveOneClose({
      plan,
      campaignDir,
      persistentRawDir,
      retention: retentionReadiness,
      httpLimit: input.argv.maxHttp,
      deps: input.liveDeps,
    });
    capture = live.capture;
    official = live.official;
    retention = live.retention;
    captured = live.captured;
    reason = live.reason;
    liveExecution = "executed";
  }

  const ledger = loadOrCreateCampaignLedger({
    ledgerPath: campaignLedgerPath(campaignDir),
    campaignId: plan.campaignId,
    limit: input.argv.maxHttp,
    io: campaignIo,
    requireExisting: true,
  });

  const result: OneCloseRunResult = {
    studyId: ONE_CLOSE_STUDY_ID,
    campaignId: plan.campaignId,
    plan,
    disposition: {
      captured,
      capture,
      official,
      retention,
      reason,
      rolledToLaterClose: false,
    },
    retentionReadiness,
    httpBudget: {
      campaignId: ledger.campaignId,
      consumed: ledger.consumed,
      limit: ledger.limit,
    },
    comparisonsFrozenBeforeCapture: {
      trailingMembership: TRAILING_MEMBERSHIP,
      quarterHourMembership: QUARTER_HOUR_MEMBERSHIP,
      noOffsetSearch: true,
      noOfficialFieldSelection: true,
    },
    liveExecution,
    live,
  };

  const body = `${JSON.stringify({
    ...result,
    codeSha: io.codeSha?.() ?? null,
    generatedAtUtc: new Date(io.nowMs()).toISOString(),
  }, null, 2)}\n`;
  io.writeFile(join(outAbs, "one-close-disposition.json"), body);
  io.writeFile(join(outAbs, "one-close-disposition.sha256"), `${sha256Text(body)}\n`);
  return result;
}
